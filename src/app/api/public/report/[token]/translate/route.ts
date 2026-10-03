import { NextRequest, NextResponse } from "next/server";
import { getConsultationByShareToken } from "@/lib/server-store";
import { translateClinicalNote } from "@/lib/translate";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json(
        { error: "Share token is required." },
        { status: 400 }
      );
    }

    const result = getConsultationByShareToken(token);
    if (!result) {
      return NextResponse.json(
        { error: "Consultation report not found." },
        { status: 404 }
      );
    }

    if (result.isExpired) {
      return NextResponse.json(
        { error: "Consultation report link expired." },
        { status: 410 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetLanguage = body.target_language || "en-IN";

    const { consultation } = result;
    const translatedNote = await translateClinicalNote(
      consultation.note || {},
      targetLanguage
    );

    return NextResponse.json({
      share_token: consultation.share_token,
      target_language: targetLanguage,
      note: translatedNote,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Translation failed: " + (err?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
