import { extractClinicalNote } from "@/lib/sarvam-llm";
import { ApiConfigError, UpstreamApiError } from "@/lib/clinical-note";
import { transcribeAudio } from "@/lib/sarvam-stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const note = await extractClinicalNote(sttResult.transcript);

    const mock = !process.env.SARVAM_API_KEY;
    return Response.json({
      transcript: sttResult.transcript,
      language_code: sttResult.language_code,
      note,
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
  console.error("Unexpected /api/pipeline error:", error);
  return Response.json({ error: "Unexpected server error while processing the consultation." }, { status: 500 });
}
