import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getConsultationById } from "@/lib/server-store";

function getAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  return verifyToken(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { detail: "Not authenticated or token expired." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const consultationId = parseInt(id, 10);
    if (isNaN(consultationId)) {
      return NextResponse.json({ detail: "Invalid consultation ID" }, { status: 400 });
    }

    const consultation = getConsultationById(consultationId);
    if (!consultation) {
      return NextResponse.json({ detail: "Consultation not found" }, { status: 404 });
    }

    return NextResponse.json(consultation);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Failed to retrieve consultation." },
      { status: 500 }
    );
  }
}
