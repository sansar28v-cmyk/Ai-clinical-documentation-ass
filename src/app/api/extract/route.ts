import { extractClinicalNote } from "@/lib/sarvam-llm";
import { ApiConfigError, UpstreamApiError } from "@/lib/clinical-note";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const transcript = typeof body?.transcript === "string" ? body.transcript : "";

    if (!transcript.trim()) {
      return Response.json({ error: "Request body must include a non-empty 'transcript' string." }, { status: 400 });
    }

    const note = await extractClinicalNote(transcript);
    return Response.json({ note, mock: !process.env.SARVAM_API_KEY });
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
  console.error("Unexpected /api/extract error:", error);
  return Response.json({ error: "Unexpected server error while extracting the clinical note." }, { status: 500 });
}
