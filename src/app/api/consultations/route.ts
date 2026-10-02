import { NextRequest, NextResponse } from "next/server";
import {
  verifyToken,
  getConsultationsForDoctor,
  createConsultation,
} from "@/lib/server-store";

function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { detail: "Not authenticated or token expired." },
        { status: 401 }
      );
    }

    const doctorId = user.user_id || 1;
    const consultations = getConsultationsForDoctor(doctorId);
    return NextResponse.json(consultations);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Failed to retrieve consultations." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { detail: "Not authenticated or token expired." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { patient_name, transcript, speaker_turns, note, translated_plan } = body;

    const doctorId = user.user_id || 1;
    const doctorName = user.full_name || "Doctor";

    const newConsultation = createConsultation(
      doctorId,
      doctorName,
      patient_name || "Anita Roy",
      transcript || "",
      speaker_turns || [],
      note || {},
      translated_plan || null
    );

    return NextResponse.json(
      {
        message: "Consultation saved successfully",
        id: newConsultation.id,
        consultation: newConsultation,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Failed to save consultation." },
      { status: 500 }
    );
  }
}
