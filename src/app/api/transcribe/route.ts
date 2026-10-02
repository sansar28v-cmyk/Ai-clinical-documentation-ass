import { ApiConfigError, UpstreamApiError } from "@/lib/clinical-note";
import { transcribeAudio } from "@/lib/sarvam-stt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

    const result = await transcribeAudio(file);
    return Response.json({
      transcript: result.transcript,
      language_code: result.language_code,
      mock: !process.env.SARVAM_API_KEY,
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
  console.error("Unexpected /api/transcribe error:", error);
  return Response.json({ error: "Unexpected server error while transcribing audio." }, { status: 500 });
}
