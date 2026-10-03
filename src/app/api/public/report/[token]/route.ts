import { NextRequest, NextResponse } from "next/server";
import { getConsultationByShareToken } from "@/lib/server-store";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
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
        {
          error: "Consultation report not found.",
          detail: "The link you entered may be incorrect or no longer exists.",
        },
        { status: 404 }
      );
    }

    if (result.isExpired) {
      return NextResponse.json(
        {
          error: "Consultation report link expired.",
          detail: "This secure link was valid for 7 days and has expired for patient privacy. Please contact your healthcare provider if you need another copy.",
        },
        { status: 410 }
      );
    }

    const { consultation } = result;

    // Return sanitized data only — NEVER expose internal database IDs
    return NextResponse.json(
      {
        share_token: consultation.share_token,
        patient_name: consultation.patient_name,
        doctor_name: consultation.doctor_name || "Attending Physician",
        created_at: consultation.created_at,
        expires_at: consultation.share_token_expires_at,
        detected_language: consultation.detected_language || "en-IN",
        note: consultation.note || {},
        translated_plan: consultation.translated_plan || null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to retrieve public clinical report." },
      { status: 500 }
    );
  }
}
