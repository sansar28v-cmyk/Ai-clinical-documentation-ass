import { CLINICAL_NOTE_FIELDS, ClinicalNote } from "@/lib/clinical-note";

export function buildNoteText(note: ClinicalNote): string {
  const lines: string[] = [];
  lines.push("CLINICAL NOTE");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");
  for (const field of CLINICAL_NOTE_FIELDS) {
    lines.push(field.label.toUpperCase());
    if (field.isList) {
      if (note.medications.length === 0) {
        lines.push("  (none documented)");
      } else {
        note.medications.forEach((med) => lines.push(`  - ${med}`));
      }
    } else {
      const value = note[field.key] as string;
      lines.push(value ? `  ${value}` : "  (not documented)");
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadNoteAsText(note: ClinicalNote) {
  const blob = new Blob([buildNoteText(note)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `clinical-note-${timestamp()}.txt`);
}

export async function downloadNoteAsPdf(note: ClinicalNote) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 56;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Clinical Note", marginX, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
  doc.setTextColor(20);
  y += 24;

  for (const field of CLINICAL_NOTE_FIELDS) {
    ensureSpace(32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(field.label, marginX, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const bodyText = field.isList
      ? note.medications.length
        ? note.medications.map((m) => `• ${m}`).join("\n")
        : "(not documented)"
      : (note[field.key] as string) || "(not documented)";

    const wrapped = doc.splitTextToSize(bodyText, maxWidth);
    ensureSpace(wrapped.length * 14 + 10);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 14 + 14;
  }

  doc.save(`clinical-note-${timestamp()}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
