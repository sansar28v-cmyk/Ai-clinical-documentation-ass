import { UpstreamApiError } from "@/lib/clinical-note";
import { MOCK_TRANSCRIPT } from "@/lib/mock";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // practical upload limit
const ALLOWED_EXTENSIONS = [".wav", ".mp3", ".m4a", ".mp4", ".mpeg", ".mpga", ".webm", ".ogg"];

/**
 * Sarvam STT model to use for transcription.
 * "saaras:v3" is the current recommended model (saarika:v2 is deprecated).
 */
const SARVAM_STT_MODEL = process.env.SARVAM_STT_MODEL || "saaras:v3";

const SARVAM_API_BASE = "https://api.sarvam.ai";

/** Max poll attempts for batch job status (with 3s intervals ≈ ~5 minutes). */
const BATCH_MAX_POLLS = 100;
const BATCH_POLL_INTERVAL_MS = 3000;

export interface SarvamTranscriptionResult {
  transcript: string;
  /** ISO 639-1 language code auto-detected by Sarvam (e.g. "hi", "ta", "en"). */
  language_code: string | null;
}

export function assertSupportedAudioFile(file: File): void {
  const name = file.name?.toLowerCase() ?? "";
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasAllowedExtension) {
    throw new UpstreamApiError(
      `Unsupported file type. Please upload one of: ${ALLOWED_EXTENSIONS.join(", ")}`,
      415,
    );
  }
  if (file.size === 0) {
    throw new UpstreamApiError("The uploaded audio file is empty.", 400);
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new UpstreamApiError("Audio file is too large. Maximum size is 25MB.", 413);
  }
}

// ---------------------------------------------------------------------------
// Helper: standard headers for Sarvam REST calls
// ---------------------------------------------------------------------------
function sarvamHeaders(apiKey: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "api-subscription-key": apiKey };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ---------------------------------------------------------------------------
// Sync STT — for audio ≤ 30 seconds
// ---------------------------------------------------------------------------
async function transcribeSync(apiKey: string, file: File): Promise<SarvamTranscriptionResult> {
  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "audio");
  upstreamForm.append("model", SARVAM_STT_MODEL);

  const response = await fetch(`${SARVAM_API_BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: upstreamForm,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    // If the API tells us audio is too long, fall through to batch
    if (
      response.status === 400 &&
      (errorBody.includes("exceeds the maximum limit") ||
        errorBody.includes("batch API") ||
        errorBody.includes("30 seconds"))
    ) {
      return transcribeBatch(apiKey, file);
    }
    throw new UpstreamApiError(
      `Sarvam STT transcription failed (${response.status}): ${errorBody || response.statusText}`,
      502,
    );
  }

  const data = (await response.json()) as { transcript?: string; language_code?: string };
  const transcript = (data.transcript ?? "").trim();
  if (!transcript) {
    throw new UpstreamApiError("Sarvam STT returned an empty transcript for this audio file.", 502);
  }
  return { transcript, language_code: data.language_code ?? null };
}

// ---------------------------------------------------------------------------
// Batch STT — for audio > 30 seconds (async job-based workflow)
// ---------------------------------------------------------------------------

/** Guess a MIME type from the file extension. */
function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    mpeg: "audio/mpeg",
    mpga: "audio/mpeg",
    webm: "audio/webm",
    ogg: "audio/ogg",
  };
  return map[ext] || "application/octet-stream";
}

interface BatchJobResponse {
  job_id?: string;
  id?: string;
  status?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

async function transcribeBatch(apiKey: string, file: File): Promise<SarvamTranscriptionResult> {
  const headers = sarvamHeaders(apiKey, true);
  const fileName = (file.name || "audio.wav").replace(/[^a-zA-Z0-9._-]/g, "_");

  // ── Step 1: Create a batch job ──────────────────────────────────────────
  const createRes = await fetch(`${SARVAM_API_BASE}/speech-to-text/job/v1`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      job_parameters: {
        model: SARVAM_STT_MODEL,
        mode: "transcribe",
        with_diarization: false,
        with_timestamps: false,
      },
    }),
  });

  if (!createRes.ok) {
    const errorBody = await createRes.text().catch(() => "");
    throw new UpstreamApiError(
      `Sarvam Batch STT: failed to create job (${createRes.status}): ${errorBody || createRes.statusText}`,
      502,
    );
  }

  const createData = (await createRes.json()) as { job_id?: string; id?: string };
  const jobId = createData.job_id || createData.id;
  if (!jobId) {
    throw new UpstreamApiError("Sarvam Batch STT: no job_id returned from create-job endpoint.", 502);
  }

  // ── Step 2: Get presigned upload URL ──────────────────────────────────
  const uploadUrlRes = await fetch(`${SARVAM_API_BASE}/speech-to-text/job/v1/upload-files`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!uploadUrlRes.ok) {
    const errorBody = await uploadUrlRes.text().catch(() => "");
    throw new UpstreamApiError(
      `Sarvam Batch STT: failed to get upload URL (${uploadUrlRes.status}): ${errorBody || uploadUrlRes.statusText}`,
      502,
    );
  }

  const uploadUrlData = (await uploadUrlRes.json()) as {
    upload_urls?: Record<string, { file_url?: string }>;
  };
  const presignedUrl = uploadUrlData.upload_urls?.[fileName]?.file_url;
  if (!presignedUrl) {
    throw new UpstreamApiError("Sarvam Batch STT: no presigned upload URL returned.", 502);
  }

  // ── Step 3: Upload the audio file to Azure Blob storage ─────────────────
  const mime = guessMime(fileName);
  const fileBuffer = await file.arrayBuffer();

  const putRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": mime,
    },
    body: fileBuffer,
  });

  if (!putRes.ok) {
    throw new UpstreamApiError(
      `Sarvam Batch STT: file upload to storage failed (${putRes.status}).`,
      502,
    );
  }

  // ── Step 4: Start the batch job ─────────────────────────────────────────
  const startRes = await fetch(`${SARVAM_API_BASE}/speech-to-text/job/v1/${jobId}/start`, {
    method: "POST",
    headers: sarvamHeaders(apiKey),
  });

  if (!startRes.ok) {
    const errorBody = await startRes.text().catch(() => "");
    throw new UpstreamApiError(
      `Sarvam Batch STT: failed to start job (${startRes.status}): ${errorBody || startRes.statusText}`,
      502,
    );
  }

  // ── Step 5: Poll status until completion ────────────────────────────────
  interface JobStatus {
    job_state?: string;
    status?: string;
    job_details?: Array<{
      state?: string;
      inputs?: Array<{ file_name?: string }>;
      outputs?: Array<{ file_name?: string }>;
      error_message?: string;
    }>;
    error_message?: string;
  }

  let finalJob: JobStatus | null = null;
  for (let i = 0; i < BATCH_MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, BATCH_POLL_INTERVAL_MS));

    const statusRes = await fetch(`${SARVAM_API_BASE}/speech-to-text/job/v1/${jobId}/status`, {
      method: "GET",
      headers: sarvamHeaders(apiKey),
    });

    if (!statusRes.ok) continue; // retry on transient HTTP error

    const statusData = (await statusRes.json()) as JobStatus;
    const state = (statusData.job_state || statusData.status || "").toLowerCase();

    if (state === "completed" || state === "partiallycompleted") {
      finalJob = statusData;
      break;
    }
    if (state === "failed" || state === "error") {
      throw new UpstreamApiError(
        `Sarvam Batch STT: job failed. ${statusData.error_message || JSON.stringify(statusData)}`,
        502,
      );
    }
  }

  if (!finalJob) {
    throw new UpstreamApiError("Sarvam Batch STT: job timed out waiting for completion.", 504);
  }

  // ── Step 6: Request presigned download URL for results ──────────────────
  const outputFileName =
    finalJob.job_details?.[0]?.outputs?.[0]?.file_name || "0.json";

  const downloadRes = await fetch(`${SARVAM_API_BASE}/speech-to-text/job/v1/download-files`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      job_id: jobId,
      files: [outputFileName],
    }),
  });

  if (!downloadRes.ok) {
    const errorBody = await downloadRes.text().catch(() => "");
    throw new UpstreamApiError(
      `Sarvam Batch STT: failed to get download URLs (${downloadRes.status}): ${errorBody || downloadRes.statusText}`,
      502,
    );
  }

  const downloadData = (await downloadRes.json()) as {
    download_urls?: Record<string, { file_url?: string }>;
  };
  const downloadUrl = downloadData.download_urls?.[outputFileName]?.file_url;
  if (!downloadUrl) {
    throw new UpstreamApiError("Sarvam Batch STT: no download URL returned for results.", 502);
  }

  // ── Step 7: Fetch and parse the transcription result ────────────────────
  const resultRes = await fetch(downloadUrl);
  if (!resultRes.ok) {
    throw new UpstreamApiError(
      `Sarvam Batch STT: failed to download result file (${resultRes.status}).`,
      502,
    );
  }

  const resultData = (await resultRes.json()) as {
    transcript?: string;
    language_code?: string;
    chunks?: Array<{ text?: string }>;
  };

  let transcript = (resultData.transcript ?? "").trim();
  if (!transcript && Array.isArray(resultData.chunks)) {
    transcript = resultData.chunks.map((c) => c.text ?? "").join(" ").trim();
  }

  if (!transcript) {
    throw new UpstreamApiError(
      "Sarvam Batch STT completed but returned an empty transcript. Please ensure the recording contains clear spoken audio.",
      502,
    );
  }

  return {
    transcript,
    language_code: resultData.language_code ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends an audio file to Sarvam AI's Speech-to-Text API and returns the
 * raw transcript text along with the detected language code.
 *
 * For short audio (≤ 30s) the synchronous endpoint is used. For longer
 * audio the batch job API is used automatically (supports up to 2 hours).
 *
 * No audio or transcript is ever written to disk — it is streamed straight
 * through to the upstream API and held only in memory for the duration of
 * this request (privacy-conscious by design).
 *
 * Sarvam auto-detects the spoken language across 10-22 Indian languages
 * and English — no separate translation layer is needed.
 */
export async function transcribeAudio(file: File): Promise<SarvamTranscriptionResult> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    // Demo mode: no API key configured — serve a realistic sample transcript so
    // the end-to-end flow stays fully demoable (the UI labels this clearly).
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return { transcript: MOCK_TRANSCRIPT, language_code: "en" };
  }

  assertSupportedAudioFile(file);

  // Try sync first — it's faster for short clips. If the API rejects due
  // to duration, the sync function automatically falls through to batch.
  return transcribeSync(apiKey, file);
}
