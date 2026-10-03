import { extractClinicalNote, labelSpeakers } from "@/lib/sarvam-llm";
import { ApiConfigError, UpstreamApiError } from "@/lib/clinical-note";
import { transcribeAudio } from "@/lib/sarvam-stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Convenience endpoint used by the frontend: chains transcribe + extract into
// a single request so the UI only has to track one network call per upload.
export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json(
        { error: "Request must be multipart/form-data with an 'audio' file field." },
        { status: 400 },
      );
    }
    const file = formData.get("audio");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "No audio file provided. Attach a file under the 'audio' field." }, { status: 400 });
    }

    const sttResult = await transcribeAudio(file);
    const [note, turns] = await Promise.all([
      extractClinicalNote(sttResult.transcript),
      labelSpeakers(sttResult.transcript).catch((err) => {
        console.warn("Non-fatal speaker labeling error in /api/pipeline:", err);
        return [];
      }),
    ]);

    const mock = !process.env.SARVAM_API_KEY;
    return Response.json({
      transcript: sttResult.transcript,
      language_code: sttResult.language_code,
      note,
      turns: turns && turns.length > 0 ? turns : [{ speaker: "Doctor", text: sttResult.transcript }],
      mock,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function toErrorResponse(error: unknown) {
  if (error instanceof ApiConfigError) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (error instanceof UpstreamApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const msg = error instanceof Error ? error.message : "Unexpected server error while processing the consultation.";
  console.error("Unexpected /api/pipeline error:", error);
  return Response.json({ error: msg }, { status: 500 });
}
