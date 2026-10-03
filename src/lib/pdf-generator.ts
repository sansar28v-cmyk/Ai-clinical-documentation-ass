import { jsPDF } from "jspdf";
import { CLINICAL_NOTE_FIELDS, ClinicalNote } from "@/lib/clinical-note";

export interface GeneratePdfOptions {
  patientName: string;
  doctorName?: string;
  createdAt: string;
  languageName?: string;
  languageCode?: string;
}

export function generateReportPdf(
  note: Record<string, any>,
  options: GeneratePdfOptions
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 44;
  let y = 44;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginX * 2;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 44;
    }
  };

  // Header Banner styling
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 74, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(248, 250, 252);
  doc.text("CLINICAL CONSULTATION REPORT", marginX, 36);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("AI-Assisted Clinical Documentation • Patient Copy", marginX, 54);

  y = 96;

  // Patient Meta Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, y, contentWidth, 54, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("Patient Name:", marginX + 14, y + 20);
  doc.text("Attending Physician:", marginX + 14, y + 40);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(options.patientName || "Anita Roy", marginX + 90, y + 20);
  doc.text(options.doctorName || "Attending Physician", marginX + 125, y + 40);

  const col2X = marginX + contentWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Date:", col2X, y + 20);
  doc.text("Language:", col2X, y + 40);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const formattedDate = options.createdAt
    ? new Date(options.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString();
  doc.text(formattedDate, col2X + 40, y + 20);
  doc.text(options.languageName || options.languageCode || "English", col2X + 65, y + 40);

  y += 74;

  // Section mapping
  const sections = [
    { key: "chief_complaint", label: "CHIEF COMPLAINT" },
    { key: "hpi", label: "HISTORY OF PRESENT ILLNESS (HPI)" },
    { key: "pmh", label: "PAST MEDICAL HISTORY (PMH)" },
    { key: "exam_findings", label: "PHYSICAL EXAMINATION FINDINGS" },
    { key: "medications", label: "CURRENT MEDICATIONS & PRESCRIPTIONS", isList: true },
    { key: "plan", label: "ASSESSMENT & TREATMENT PLAN" },
  ];

  for (const sec of sections) {
    ensureSpace(40);

    // Section Header with left accent indicator
    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(marginX, y, 4, 15, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(sec.label, marginX + 12, y + 12);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    if (sec.isList) {
      const meds = Array.isArray(note.medications) ? note.medications : [];
      if (meds.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        doc.text("None documented", marginX + 12, y);
        y += 18;
      } else {
        for (const med of meds) {
          const text = `•  ${med}`;
          const wrapped = doc.splitTextToSize(text, contentWidth - 20);
          ensureSpace(wrapped.length * 13 + 6);
          doc.text(wrapped, marginX + 12, y);
          y += wrapped.length * 13 + 4;
        }
        y += 6;
      }
    } else {
      const textVal = note[sec.key];
      const text =
        typeof textVal === "string" && textVal.trim()
          ? textVal.trim()
          : "Not documented";

      if (text === "Not documented") {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
      }

      const wrapped = doc.splitTextToSize(text, contentWidth - 16);
      ensureSpace(wrapped.length * 14 + 10);
      doc.text(wrapped, marginX + 12, y);
      y += wrapped.length * 14 + 14;
    }
  }

  // Footer Disclaimer
  ensureSpace(45);
  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 16;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Confidential Medical Record. This summary is intended for patient review. Valid for 7 days via secure QR link.",
    marginX,
    y
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
