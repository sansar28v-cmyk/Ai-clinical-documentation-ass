import { NextRequest, NextResponse } from "next/server";
import { getConsultationByShareToken } from "@/lib/server-store";
import { generateReportPdf, generateReportPrintableHtml } from "@/lib/pdf-generator";
import { translateClinicalNote, SUPPORTED_LANGUAGES } from "@/lib/translate";

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
      return NextResponse.json({ error: "Share token is required." }, { status: 400 });
    }

    const result = getConsultationByShareToken(token);
    if (!result) {
      return NextResponse.json(
        { error: "Consultation report not found or link is invalid." },
        { status: 404 }
      );
    }

    if (result.isExpired) {
      return NextResponse.json(
        { error: "Consultation report link expired (7-day validity)." },
        { status: 410 }
      );
    }

    const { consultation } = result;
    const url = new URL(req.url);
    const langCode = url.searchParams.get("lang") || consultation.detected_language || "en-IN";

    // Translate note if a non-English language is requested
    let noteToExport = consultation.note || {};
    if (!langCode.toLowerCase().startsWith("en")) {
      noteToExport = await translateClinicalNote(noteToExport, langCode);
    }

    const langObj = SUPPORTED_LANGUAGES.find(
      (l) => l.code.toLowerCase() === langCode.toLowerCase()
    );
    const langName = langObj ? `${langObj.name} (${langObj.nativeName})` : langCode;

    // If caller specifically requested binary raw_pdf format, return jsPDF binary
    if (url.searchParams.get("format") === "raw_pdf") {
      const pdfBytes = generateReportPdf(noteToExport, {
        patientName: consultation.patient_name || "Patient",
        doctorName: consultation.doctor_name || "Attending Physician",
        createdAt: consultation.created_at,
        languageCode: langCode,
        languageName: langName,
      });

      const safePatient = (consultation.patient_name || "patient")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-");
      const filename = `clinical-report-${safePatient}-${langCode}.pdf`;

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Default: Return high-fidelity printable HTML document with full Google Fonts
    // and native Unicode Indic script layout (Malayalam, Tamil, Hindi, Telugu, etc.)
    const html = generateReportPrintableHtml(noteToExport, {
      patientName: consultation.patient_name || "Patient",
      doctorName: consultation.doctor_name || "Attending Physician",
      createdAt: consultation.created_at,
      languageCode: langCode,
      languageName: langName,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to generate report PDF: " + (err?.message || "Unknown error") },
      { status: 500 }
    );
  }
}
