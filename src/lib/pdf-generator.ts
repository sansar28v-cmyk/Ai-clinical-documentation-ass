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

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateReportPrintableHtml(
  note: Record<string, any>,
  options: GeneratePdfOptions
): string {
  const formattedDate = options.createdAt
    ? new Date(options.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const patientName = escapeHtml(options.patientName || "Anita Roy");
  const doctorName = escapeHtml(options.doctorName || "Attending Physician");
  const langDisplay = escapeHtml(options.languageName || options.languageCode || "English");

  const sections = [
    { key: "chief_complaint", label: "CHIEF COMPLAINT" },
    { key: "hpi", label: "HISTORY OF PRESENT ILLNESS (HPI)" },
    { key: "pmh", label: "PAST MEDICAL HISTORY (PMH)" },
    { key: "exam_findings", label: "PHYSICAL EXAMINATION FINDINGS" },
    { key: "medications", label: "CURRENT MEDICATIONS & PRESCRIPTIONS", isList: true },
    { key: "plan", label: "ASSESSMENT & TREATMENT PLAN" },
  ];

  let sectionsHtml = "";
  for (const sec of sections) {
    if (sec.isList) {
      const meds = Array.isArray(note.medications) ? note.medications : [];
      let listContent = "";
      if (meds.length === 0) {
        listContent = `<p class="empty-text">None documented</p>`;
      } else {
        listContent = `<ul class="med-list">` +
          meds.map((m: any) => `<li>${escapeHtml(m)}</li>`).join("") +
          `</ul>`;
      }

      sectionsHtml += `
        <div class="report-section">
          <div class="section-header">
            <span class="accent-bar"></span>
            <h3>${sec.label}</h3>
          </div>
          <div class="section-content">
            ${listContent}
          </div>
        </div>
      `;
    } else {
      const textVal = note[sec.key];
      const text = typeof textVal === "string" && textVal.trim() ? textVal.trim() : "Not documented";
      const isPlaceholder = text === "Not documented";

      sectionsHtml += `
        <div class="report-section">
          <div class="section-header">
            <span class="accent-bar"></span>
            <h3>${sec.label}</h3>
          </div>
          <div class="section-content">
            <p class="${isPlaceholder ? "empty-text" : "body-text"}">${escapeHtml(text)}</p>
          </div>
        </div>
      `;
    }
  }

  return `<!DOCTYPE html>
<html lang="${escapeHtml(options.languageCode || "en")}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clinical Consultation Report - ${patientName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Bengali:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Gujarati:wght@400;500;600;700&family=Noto+Sans+Gurmukhi:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;500;600;700&family=Noto+Sans+Malayalam:wght@400;500;600;700&family=Noto+Sans+Oriya:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #f1f5f9;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter",
        "Noto Sans Malayalam", "Noto Sans Tamil", "Noto Sans Devanagari",
        "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Bengali",
        "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Oriya", sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Floating Toolbar (screen only) */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    }

    .toolbar-info {
      font-size: 0.85rem;
      color: #94a3b8;
    }

    .toolbar-info strong {
      color: #38bdf8;
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .btn-print {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 18px;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s ease;
    }

    .btn-print:hover {
      background: #1d4ed8;
    }

    .btn-back {
      background: transparent;
      color: #cbd5e1;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: none;
    }

    .btn-back:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #ffffff;
    }

    /* Document Sheet (matches standard A4 proportions) */
    .sheet-wrapper {
      max-width: 800px;
      margin: 28px auto 60px auto;
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }

    /* Top Banner */
    .report-banner {
      background: #0f172a;
      color: #ffffff;
      padding: 24px 36px;
    }

    .report-banner h1 {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-bottom: 4px;
      color: #f8fafc;
    }

    .report-banner p {
      font-size: 0.82rem;
      color: #94a3b8;
    }

    .sheet-body {
      padding: 28px 36px 40px 36px;
    }

    /* Patient Meta Grid */
    .meta-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 16px 22px;
      margin-bottom: 26px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 24px;
    }

    .meta-row {
      display: flex;
      gap: 8px;
      font-size: 0.875rem;
    }

    .meta-label {
      font-weight: 700;
      color: #1e293b;
      min-width: 140px;
    }

    .meta-val {
      color: #475569;
      font-weight: 500;
    }

    /* Clinical Sections */
    .report-section {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .accent-bar {
      width: 4px;
      height: 17px;
      background: #2563eb;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .section-header h3 {
      font-size: 0.88rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .section-content {
      padding-left: 14px;
    }

    .body-text {
      font-size: 0.92rem;
      color: #334155;
      line-height: 1.65;
      white-space: pre-line;
      word-break: break-word;
    }

    .empty-text {
      font-size: 0.875rem;
      color: #94a3b8;
      font-style: italic;
    }

    .med-list {
      list-style-type: none;
      padding: 0;
      margin: 0;
    }

    .med-list li {
      position: relative;
      padding-left: 18px;
      font-size: 0.92rem;
      color: #334155;
      margin-bottom: 4px;
      line-height: 1.5;
    }

    .med-list li::before {
      content: "•";
      position: absolute;
      left: 4px;
      color: #2563eb;
      font-weight: bold;
    }

    /* Divider & Footer */
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 30px 0 16px 0;
    }

    .footer-disclaimer {
      font-size: 0.78rem;
      color: #94a3b8;
      font-style: italic;
      line-height: 1.5;
    }

    /* Print Specific Rules */
    @media print {
      body {
        background: #ffffff !important;
        color: #0f172a !important;
      }

      .no-print {
        display: none !important;
      }

      .sheet-wrapper {
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        max-width: 100% !important;
      }

      .sheet-body {
        padding: 20px 0 0 0 !important;
      }

      .report-banner {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        background: #0f172a !important;
        color: #ffffff !important;
        padding: 20px 24px !important;
      }

      .report-banner h1 {
        color: #ffffff !important;
      }

      .meta-card {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        background: #f8fafc !important;
        border-color: #cbd5e1 !important;
      }

      .accent-bar {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        background: #2563eb !important;
      }

      @page {
        size: A4 portrait;
        margin: 12mm 14mm 12mm 14mm;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div class="toolbar-info">
      <strong>Patient Report Preview</strong> • Language: <span>${langDisplay}</span> (Select "Save as PDF" in destination)
    </div>
    <div class="toolbar-actions">
      <button onclick="window.print()" class="btn-print">
        🖨️ Save as PDF / Print
      </button>
      <button onclick="window.close()" class="btn-back">
        ✕ Close
      </button>
    </div>
  </div>

  <div class="sheet-wrapper">
    <header class="report-banner">
      <h1>CLINICAL CONSULTATION REPORT</h1>
      <p>AI-Assisted Clinical Documentation • Patient Copy</p>
    </header>

    <div class="sheet-body">
      <div class="meta-card">
        <div class="meta-row">
          <span class="meta-label">Patient Name:</span>
          <span class="meta-val">${patientName}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Date:</span>
          <span class="meta-val">${formattedDate}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Attending Physician:</span>
          <span class="meta-val">${doctorName}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Language:</span>
          <span class="meta-val">${langDisplay}</span>
        </div>
      </div>

      <div class="report-sections">
        ${sectionsHtml}
      </div>

      <div class="divider"></div>
      <footer class="footer-disclaimer">
        Confidential Medical Record. This summary is intended for patient review. Valid for 7 days via secure QR link.
      </footer>
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      // Trigger native print dialog as soon as fonts are loaded
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() {
          setTimeout(function() {
            window.print();
          }, 350);
        });
      } else {
        setTimeout(function() {
          window.print();
        }, 500);
      }
    });
  </script>
</body>
</html>`;
}
