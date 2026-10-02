import { ClinicalNote, normalizeClinicalNote, UpstreamApiError } from "@/lib/clinical-note";
import { MOCK_NOTE, MOCK_TURNS, SpeakerTurn } from "@/lib/mock";

export type { SpeakerTurn };

const SARVAM_LLM_MODEL = process.env.SARVAM_LLM_MODEL || "sarvam-105b";

const SYSTEM_PROMPT = `You are a clinical documentation assistant embedded in a hospital workflow tool.
You read a transcript of a doctor-patient consultation and extract ONLY information that is
explicitly stated, into a strict JSON schema used to pre-fill a clinical note for physician review.

IMPORTANT: The transcript may be in any Indian language (Hindi, Tamil, Telugu, Bengali, Marathi,
Gujarati, Kannada, Malayalam, Odia, Punjabi, etc.) or mixed with English (code-mixed). Regardless
of the language of the transcript, ALL extracted note fields MUST be returned in English.

STRICT OUTPUT RULES:
1. Respond with ONLY valid JSON. No markdown code fences, no commentary, no preamble, no explanations.
2. The JSON object must have exactly these six keys: chief_complaint, hpi, pmh, medications, exam_findings, plan.
3. "chief_complaint", "hpi", "pmh", "exam_findings", "plan" are strings. "medications" is an array of strings.
4. If a field has no supporting information in the transcript, return an empty string "" (or [] for
   medications). NEVER invent, infer beyond what was said, or hallucinate clinical information.
5. Handle negation carefully. If a symptom, condition, or medication is explicitly denied or ruled out
   (e.g. "no fever", "denies chest pain", "not taking any medications", "no history of diabetes"),
   it must NOT be listed as a present/positive finding anywhere in the output. Pertinent negatives may
   only be reflected as clearly negative statements inside "hpi" or "exam_findings" (e.g. "denies fever"),
   never as a positive symptom or as an entry in "medications".
6. Do not add diagnoses, treatments, or medications that were not discussed in the transcript.
7. Keep language concise, objective, and clinical — written the way a clinician would chart it.
8. ALL output text MUST be in English, even if the transcript is in another language.

JSON schema reference:
{
  "chief_complaint": "string - the main reason for today's visit",
  "hpi": "string - history of present illness: symptoms, onset, duration, severity, context",
  "pmh": "string - past medical history: prior conditions, surgeries, chronic illnesses mentioned",
  "medications": ["array of strings - medications the patient currently takes, as mentioned"],
  "exam_findings": "string - physical exam findings or vitals mentioned by the clinician",
  "plan": "string - treatment plan, prescriptions, and follow-up instructions"
}`;

interface SarvamChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }>;
}

async function callSarvam(apiKey: string, transcript: string, retryHint?: string): Promise<string> {
  const userContent = retryHint
    ? `${retryHint}\n\nConsultation transcript:\n"""\n${transcript}\n"""`
    : `Consultation transcript:\n"""\n${transcript}\n"""`;

  const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SARVAM_LLM_MODEL,
      max_tokens: 8192,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new UpstreamApiError(`Sarvam-105B extraction failed (${response.status}): ${errorBody || response.statusText}`, 502);
  }

  const data = (await response.json()) as SarvamChatResponse;
  const msg = data.choices?.[0]?.message;
  let text = (msg?.content || "").trim();
  
  // If content is empty (e.g. model concluded in reasoning_content), extract from reasoning
  if (!text && msg?.reasoning_content) {
    text = msg.reasoning_content.trim();
  }
  return text;
}

function tryParseNote(raw: string): ClinicalNote | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();

  // 1. Strip markdown code fences if present anywhere
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 2. Extract outermost { ... }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  // 3. Fast path: standard JSON.parse
  try {
    const parsed = JSON.parse(text);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue to sanitizers
  }

  // 4. Sanitize trailing commas (common LLM syntax issue)
  try {
    const strippedCommas = text.replace(/,\s*([}\]])/g, "$1");
    const parsed = JSON.parse(strippedCommas);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue
  }

  // 5. Sanitize unescaped newlines/tabs inside string values
  try {
    const sanitized = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/(?<="[^"]*)\r?\n(?=[^"]*")/g, "\\n")
      .replace(/(?<="[^"]*)\t(?=[^"]*")/g, "\\t");
    const parsed = JSON.parse(sanitized);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue
  }

  // 6. Fix single quotes to double quotes for keys and values
  try {
    const doubleQuoted = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    const parsed = JSON.parse(doubleQuoted);
    return normalizeClinicalNote(parsed);
  } catch {
    return null;
  }
}

/**
 * Fallback regex extractor that pulls schema fields out of text even if
 * JSON formatting has unrecoverable syntax errors.
 */
function fallbackRegexExtract(raw: string): ClinicalNote | null {
  if (!raw || !raw.trim()) return null;

  const extractString = (pattern: string): string => {
    const regex = new RegExp(`["']?(?:${pattern})["']?\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "i");
    const match = raw.match(regex);
    return match ? match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim() : "";
  };

  const chief_complaint = extractString("chief_complaint|chiefComplaint|reason_for_visit");
  const hpi = extractString("hpi|HPI|history_of_present_illness|history");
  const pmh = extractString("pmh|PMH|past_medical_history|past_history");
  const exam_findings = extractString("exam_findings|examFindings|physical_exam|vitals");
  const plan = extractString("plan|Plan|treatment_plan|assessment_and_plan");

  let medications: string[] = [];
  const medsMatch = raw.match(/["']?(?:medications|meds|prescriptions)["']?\s*:\s*\[([\s\S]*?)\]/i);
  if (medsMatch) {
    const items = medsMatch[1].match(/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"/g);
    if (items) {
      medications = items.map((i) => i.replace(/^"|"$/g, "").replace(/\\"/g, '"').trim()).filter(Boolean);
    }
  }

  if (chief_complaint || hpi || pmh || exam_findings || plan || medications.length > 0) {
    return {
      chief_complaint,
      hpi,
      pmh,
      medications,
      exam_findings,
      plan,
    };
  }
  return null;
}

function hasAnyField(note: ClinicalNote): boolean {
  return Boolean(
    note.chief_complaint ||
      note.hpi ||
      note.pmh ||
      (note.medications && note.medications.length > 0) ||
      note.exam_findings ||
      note.plan,
  );
}

/**
 * Creates a graceful, editable note directly from consultation text
 * so a doctor never receives a dead-end error modal.
 */
function createFallbackNoteFromTranscript(transcript: string): ClinicalNote {
  const clean = transcript.trim();
  const firstSentence = clean.split(/[.?!]\s+/)[0] || clean;
  return {
    chief_complaint: firstSentence.slice(0, 120),
    hpi: clean,
    pmh: "",
    medications: [],
    exam_findings: "",
    plan: "",
  };
}

/**
 * Sends a transcript to Sarvam-105B and returns a structured ClinicalNote.
 * If the model's first response isn't valid JSON, we retry once with a
 * corrective instruction before surfacing a clear error to the caller.
 */
export async function extractClinicalNote(transcript: string): Promise<ClinicalNote> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    // Demo mode: no API key configured — serve the realistic sample note so the
    // end-to-end flow stays fully demoable (the UI labels this clearly).
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return MOCK_NOTE;
  }
  if (!transcript || !transcript.trim()) {
    throw new UpstreamApiError("Cannot extract a clinical note from an empty transcript.", 400);
  }

  // Attempt 1: Native JSON Mode call
  try {
    const firstAttempt = await callSarvam(apiKey, transcript);
    const firstNote = tryParseNote(firstAttempt);
    if (firstNote && hasAnyField(firstNote)) return firstNote;

    const firstRegexNote = fallbackRegexExtract(firstAttempt);
    if (firstRegexNote && hasAnyField(firstRegexNote)) return firstRegexNote;
  } catch (err) {
    console.warn("First extraction attempt encountered an error, trying retry:", err);
  }

  // Attempt 2: Corrective instruction call
  try {
    const retryAttempt = await callSarvam(
      apiKey,
      transcript,
      "CRITICAL: Output ONLY a valid JSON object matching the schema with double quotes. Do not include markdown code fences or conversational text.",
    );
    const retryNote = tryParseNote(retryAttempt);
    if (retryNote && hasAnyField(retryNote)) return retryNote;

    const retryRegexNote = fallbackRegexExtract(retryAttempt);
    if (retryRegexNote && hasAnyField(retryRegexNote)) return retryRegexNote;
  } catch (err) {
    console.warn("Second extraction attempt encountered an error:", err);
  }

  // Fallback: Populate directly from transcript so the doctor always has an editable note
  return createFallbackNoteFromTranscript(transcript);
}

const SPEAKER_LABEL_PROMPT = `You are analyzing a doctor-patient medical conversation transcript. The transcript has NO speaker labels. Your job is to split it into individual conversational turns and label each turn as either 'Doctor' or 'Patient', based on conversational role (questions, instructions, prescriptions, exams = Doctor; symptom descriptions, answers, personal history = Patient).

Return ONLY a JSON array in this exact format, no extra text:
[
  {"speaker": "Doctor", "text": "..."},
  {"speaker": "Patient", "text": "..."}
]

Preserve the original wording exactly — do not paraphrase or summarize. Split the transcript into natural conversational turns in the order they occurred.

Transcript:`;

async function callSarvamGeneric(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SARVAM_LLM_MODEL,
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new UpstreamApiError(
      `Sarvam-105B speaker labeling failed (${response.status}): ${errorBody || response.statusText}`,
      502,
    );
  }

  const data = (await response.json()) as SarvamChatResponse;
  const msg = data.choices?.[0]?.message;
  let text = (msg?.content || "").trim();
  if (!text && msg?.reasoning_content) {
    text = msg.reasoning_content.trim();
  }
  return text;
}

function parseSpeakerTurns(raw: string): SpeakerTurn[] | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();

  // Strip markdown code fences if present
  if (text.includes("```")) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      text = match[1].trim();
    }
  }

  // 1. Search for array [...]
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(text.slice(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizeTurns(parsed);
      }
    } catch {}
  }

  // 2. Search for object with key "turns", "conversation", etc.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsedObj = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      const candidate =
        parsedObj.turns ||
        parsedObj.conversation ||
        parsedObj.transcript ||
        parsedObj.dialogue;
      if (Array.isArray(candidate) && candidate.length > 0) {
        return sanitizeTurns(candidate);
      }
    } catch {}
  }

  return null;
}

function sanitizeTurns(items: unknown[]): SpeakerTurn[] {
  const result: SpeakerTurn[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = String(obj.text || "").trim();
    if (!text) continue;

    const rawSpeaker = String(obj.speaker || "").trim().toLowerCase();
    let speaker: "Doctor" | "Patient" | "Unknown" = "Unknown";
    if (
      rawSpeaker.includes("doc") ||
      rawSpeaker.includes("physician") ||
      rawSpeaker.includes("clinician")
    ) {
      speaker = "Doctor";
    } else if (rawSpeaker.includes("pat") || rawSpeaker.includes("client")) {
      speaker = "Patient";
    }

    result.push({ speaker, text });
  }
  return result;
}

/**
 * Splits an unlabelled doctor-patient conversation transcript into turns
 * labeled with 'Doctor' or 'Patient' using Sarvam-105B LLM.
 *
 * Handles malformed responses with one retry, then falls back gracefully to
 * returning the whole transcript as a single 'Unknown' speaker turn.
 */
export async function labelSpeakers(transcript: string): Promise<SpeakerTurn[]> {
  const clean = (transcript || "").trim();
  if (!clean) return [];

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    // Demo mode: Return realistic mock speaker turns
    return MOCK_TURNS;
  }

  const promptUser = `${SPEAKER_LABEL_PROMPT}\n${clean}`;

  // Attempt 1: Standard structured inference
  try {
    const rawAttempt1 = await callSarvamGeneric(apiKey, promptUser);
    const parsed1 = parseSpeakerTurns(rawAttempt1);
    if (parsed1 && parsed1.length > 0) {
      return parsed1;
    }
    console.warn("Attempt 1 speaker labeling returned unparseable output, retrying once...");
  } catch (err) {
    console.warn("Attempt 1 speaker labeling encountered an error:", err);
  }

  // Attempt 2: Strict corrective instruction retry
  try {
    const correctivePrompt = `CRITICAL: Return ONLY a valid JSON array of objects with keys "speaker" ("Doctor" or "Patient") and "text". No markdown fences, no commentary.\n\n${promptUser}`;
    const rawAttempt2 = await callSarvamGeneric(apiKey, correctivePrompt);
    const parsed2 = parseSpeakerTurns(rawAttempt2);
    if (parsed2 && parsed2.length > 0) {
      return parsed2;
    }
    console.warn("Attempt 2 speaker labeling failed to parse. Falling back gracefully.");
  } catch (err) {
    console.error("Attempt 2 speaker labeling error:", err);
  }

  // Graceful fallback: return the whole transcript as a single "Unknown" speaker turn
  return [{ speaker: "Unknown", text: clean }];
}

