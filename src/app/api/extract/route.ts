import { extractClinicalNote, labelSpeakers } from "@/lib/sarvam-llm";
import { ApiConfigError, UpstreamApiError } from "@/lib/clinical-note";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const transcript = typeof body?.transcript === "string" ? body.transcript : "";

    if (!transcript.trim()) {
      return Response.json({ error: "Request body must include a non-empty 'transcript' string." }, { status: 400 });
    }

    const [note, turns] = await Promise.all([
      extractClinicalNote(transcript),
      labelSpeakers(transcript).catch((err) => {
        console.warn("Non-fatal speaker labeling error in /api/extract:", err);
        return [];
      }),
    ]);

    return Response.json({
      note,
      turns: turns && turns.length > 0 ? turns : [{ speaker: "Doctor", text: transcript }],
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
  const msg = error instanceof Error ? error.message : "Unexpected server error while extracting the clinical note.";
  console.error("Unexpected /api/extract error:", error);
  return Response.json({ error: msg }, { status: 500 });
}
