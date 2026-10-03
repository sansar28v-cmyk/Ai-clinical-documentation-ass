"use client";

import { useEffect, useState, use } from "react";
import "./patient-report.css";
import { SUPPORTED_LANGUAGES } from "@/lib/translate";

interface PatientReportData {
  share_token: string;
  patient_name: string;
  doctor_name: string;
  created_at: string;
  expires_at: string;
  detected_language: string;
  note: Record<string, any>;
  translated_plan?: string | null;
}

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export default function PatientReportPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PatientReportData | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-IN");
  const [currentNote, setCurrentNote] = useState<Record<string, any>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Cache translations by language code to make language switching instantaneous
  const [translationCache, setTranslationCache] = useState<Record<string, Record<string, any>>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      try {
        setLoading(true);
        setErrorStatus(null);
        const res = await fetch(`/api/public/report/${token}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          setErrorStatus(res.status);
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(errData.detail || errData.error || "Unable to load consultation report.");
          setLoading(false);
          return;
        }

        const data: PatientReportData = await res.json();
        if (!isMounted) return;

        setReport(data);
        const initialNote = data.note || {};
        setCurrentNote(initialNote);
        setTranslationCache({ "en-IN": initialNote, en: initialNote });

        // Default to detected consultation language if available and supported
        const detected = data.detected_language || "en-IN";
        const isValidLang = SUPPORTED_LANGUAGES.some(
          (l) => l.code.toLowerCase() === detected.toLowerCase()
        );
        const initialLang = isValidLang ? detected : "en-IN";
        setSelectedLanguage(initialLang);

        if (initialLang !== "en-IN" && initialLang !== "en") {
          translateTo(initialLang, initialNote);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setErrorStatus(500);
        setErrorMessage("Network error occurred while fetching your medical report.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadReport();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function translateTo(langCode: string, baseNote?: Record<string, any>) {
    if (langCode === "en-IN" || langCode === "en") {
      if (report?.note) setCurrentNote(report.note);
      return;
    }

    // Check memory cache first
    if (translationCache[langCode]) {
      setCurrentNote(translationCache[langCode]);
      return;
    }

    setIsTranslating(true);
    try {
      const res = await fetch(`/api/public/report/${token}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_language: langCode }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.note) {
          setCurrentNote(data.note);
          setTranslationCache((prev) => ({ ...prev, [langCode]: data.note }));
        }
      } else {
        console.warn("Translation request returned status", res.status);
      }
    } catch (err) {
      console.warn("Translation failed:", err);
    } finally {
      setIsTranslating(false);
    }
  }

  function handleLanguageChange(newLang: string) {
    setSelectedLanguage(newLang);
    translateTo(newLang);
  }


  // 1. Loading State
  if (loading) {
    return (
      <div className="patient-report-page">
        <div className="patient-container loading-box">
          <div className="loading-spinner" />
          <h2 style={{ fontSize: "1.15rem", color: "#e2e8f0" }}>Loading your consultation summary...</h2>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>Securing connection and decrypting report</p>
        </div>
      </div>
    );
  }

  // 2. Expired State (410)
  if (errorStatus === 410) {
    return (
      <div className="patient-report-page">
        <div className="patient-container">
          <div className="error-state-card expired">
            <div className="error-icon-wrap">
              <i className="fa-solid fa-clock-rotate-left" />
            </div>
            <h2>Consultation Link Expired</h2>
            <p>
              {errorMessage ||
                "For your medical privacy and security, patient report links are valid for 7 days after the consultation."}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Please reach out directly to your doctor or healthcare clinic if you need an updated link or duplicate copy of your records.
            </p>
            <div className="error-state-pill">
              <i className="fa-solid fa-shield-halved" /> 7-Day Privacy Policy Enforced
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Not Found / Invalid Token State (404 / other error)
  if (errorStatus || !report) {
    return (
      <div className="patient-report-page">
        <div className="patient-container">
          <div className="error-state-card not-found">
            <div className="error-icon-wrap">
              <i className="fa-solid fa-file-circle-xmark" />
            </div>
            <h2>Report Not Found</h2>
            <p>
              {errorMessage ||
                "We could not locate a consultation report matching this QR link. The link may be incomplete or invalid."}
            </p>
            <div className="error-state-pill">
              <i className="fa-solid fa-circle-exclamation" /> Invalid Share Token
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Format consultation date
  const formattedDate = report.created_at
    ? new Date(report.created_at).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Recent Consultation";

  return (
    <div className="patient-report-page">
      <div className="patient-container">
        {/* Header Card */}
        <header className="patient-header">
          <div className="patient-header-top">
            <div className="patient-branding">
              <div className="brand-icon-wrap">
                <i className="fa-solid fa-notes-medical" />
              </div>
              <div className="patient-title-group">
                <h1>Patient Health Summary</h1>
                <p>AI Clinical Documentation Assistant • Patient Copy</p>
              </div>
            </div>
            <div className="privacy-badge">
              <span className="dot" />
              <span>Valid 7 Days</span>
            </div>
          </div>

          <div className="patient-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Patient</span>
              <span className="meta-value">{report.patient_name || "Patient"}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Consultation Date</span>
              <span className="meta-value">{formattedDate}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Attending Doctor</span>
              <span className="meta-value">{report.doctor_name || "Physician"}</span>
            </div>
          </div>
        </header>

        {/* Action Controls Bar: Language Selector */}
        <section className="action-controls-card">
          <div className="lang-selector-group">
            <label htmlFor="patient-lang-select" className="lang-label">
              <i className="fa-solid fa-language" />
              <span>Select Language / மொழி / भाषा:</span>
            </label>
            <div className="lang-select-wrap">
              <select
                id="patient-lang-select"
                value={selectedLanguage}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="lang-select"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </div>
            {isTranslating && (
              <div className="translating-status">
                <i className="fa-solid fa-circle-notch spin-icon" />
                <span>Translating note with Sarvam AI...</span>
              </div>
            )}
          </div>
        </section>

        {/* Clinical Note Sections */}
        <main className="report-sections-list">
          {/* Chief Complaint */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-stethoscope" />
              <h2 className="report-card-title">Chief Complaint</h2>
            </div>
            <div className="report-card-body">
              {currentNote.chief_complaint?.trim() || (
                <span className="empty-state-text">No chief complaint documented.</span>
              )}
            </div>
          </article>

          {/* History of Present Illness */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-clipboard-question" />
              <h2 className="report-card-title">History of Present Illness (HPI)</h2>
            </div>
            <div className="report-card-body">
              {currentNote.hpi?.trim() || (
                <span className="empty-state-text">No HPI documented.</span>
              )}
            </div>
          </article>

          {/* Past Medical History */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-clock-rotate-left" />
              <h2 className="report-card-title">Past Medical History (PMH)</h2>
            </div>
            <div className="report-card-body">
              {currentNote.pmh?.trim() || (
                <span className="empty-state-text">No past medical history noted.</span>
              )}
            </div>
          </article>

          {/* Exam Findings */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-heart-pulse" />
              <h2 className="report-card-title">Physical Exam Findings</h2>
            </div>
            <div className="report-card-body">
              {currentNote.exam_findings?.trim() || (
                <span className="empty-state-text">No exam findings documented.</span>
              )}
            </div>
          </article>

          {/* Medications */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-pills" />
              <h2 className="report-card-title">Prescribed Medications</h2>
            </div>
            <div className="report-card-body">
              {Array.isArray(currentNote.medications) && currentNote.medications.length > 0 ? (
                <ul className="medications-pills-list">
                  {currentNote.medications.map((med: string, i: number) => (
                    <li key={i} className="medication-pill">
                      <i className="fa-solid fa-tablets" />
                      <span>{med}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="empty-state-text">No medications documented.</span>
              )}
            </div>
          </article>

          {/* Assessment & Plan */}
          <article className="report-card">
            <div className="report-card-head">
              <i className="fa-solid fa-list-check" />
              <h2 className="report-card-title">Assessment &amp; Care Plan</h2>
            </div>
            <div className="report-card-body">
              {currentNote.plan?.trim() || (
                <span className="empty-state-text">No plan documented.</span>
              )}
            </div>
          </article>

          {/* Consultation Translated Advice if originally present */}
          {report.translated_plan && selectedLanguage === "en-IN" && (
            <article className="report-card card-highlight">
              <div className="report-card-head">
                <i className="fa-solid fa-comments-dollar" />
                <h2 className="report-card-title">Patient Advice (Original Translation)</h2>
              </div>
              <div className="report-card-body">{report.translated_plan}</div>
            </article>
          )}
        </main>

        {/* Footer */}
        <footer className="patient-footer">
          <div className="patient-footer-lock">
            <i className="fa-solid fa-lock" />
            <span>Secure Patient Portal • No Login Required</span>
          </div>
          <p>
            This clinical report was finalized by your attending physician. It is intended for your personal medical reference. If you experience an emergency, please call your local emergency services or visit the nearest emergency department immediately.
          </p>
        </footer>
      </div>
    </div>
  );
}
