"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ConsultationItem } from "@/lib/api";
import { downloadNoteAsPdf, downloadNoteAsText } from "@/lib/export";
import { ClinicalNote } from "@/lib/clinical-note";
import { QRCodeSVG } from "qrcode.react";

interface ConsultationDetailProps {
  consultationId: number;
  onBack: () => void;
}

export default function ConsultationDetail({
  consultationId,
  onBack,
}: ConsultationDetailProps) {
  const { token, user } = useAuth();
  const [data, setData] = useState<ConsultationItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogueView, setDialogueView] = useState<"script" | "chat" | "raw">("script");
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchDetail() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const item = await apiRequest<ConsultationItem>(`/consultations/${consultationId}`, {
          token,
        });
        if (isMounted) {
          setData(item);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load consultation details.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [consultationId, token]);

  if (loading) {
    return (
      <div className="detail-view-container">
        <div className="detail-loading-box">
          <i className="fa-solid fa-circle-notch fa-spin detail-spinner" />
          <p>Loading consultation record #{consultationId}...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="detail-view-container">
        <div className="detail-error-box">
          <i className="fa-solid fa-triangle-exclamation" />
          <h3>Could not load consultation</h3>
          <p>{error || "Consultation record not found."}</p>
          <button type="button" onClick={onBack} className="btn-primary">
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const turns = data.turns || [];
  const note = data.note || {};
  const clinicalNoteObj: ClinicalNote = {
    chief_complaint: note.chief_complaint || "",
    hpi: note.hpi || "",
    pmh: note.pmh || "",
    medications: Array.isArray(note.medications)
      ? note.medications
      : typeof note.medications === "string"
      ? [note.medications]
      : [],
    exam_findings: note.exam_findings || "",
    plan: note.plan || "",
  };

  const formattedDate = new Date(data.created_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="detail-view-container">
      {/* Detail Top Navigation Bar */}
      <div className="detail-nav-bar">
        <button type="button" onClick={onBack} className="btn-back">
          <i className="fa-solid fa-arrow-left" />
          <span>Back to Doctor Dashboard</span>
        </button>
        <div className="detail-status-pill">
          <span className="detail-status-dot" />
          <span>Finalized Clinical Record #{data.id}</span>
        </div>
      </div>

      {/* Overview Banner */}
      <div className="detail-header-card">
        <div className="detail-header-main">
          <div className="detail-avatar">
            <i className="fa-solid fa-folder-open" />
          </div>
          <div>
            <h1 className="detail-patient-name">{data.patient_name}</h1>
            <div className="detail-meta-row">
              <span className="detail-meta-item">
                <i className="fa-regular fa-calendar" /> {formattedDate}
              </span>
              <span className="detail-meta-item">
                <i className="fa-solid fa-user-doctor" /> Conducted by {data.doctor_name || "Physician"}
              </span>
              <span className="detail-meta-item">
                <i className="fa-solid fa-lock" /> Read-Only Record
              </span>
            </div>
          </div>
        </div>

        <div className="detail-header-actions">
          <button
            type="button"
            onClick={() => downloadNoteAsText(clinicalNoteObj)}
            className="btn-ghost"
            title="Download text note"
          >
            <i className="fa-solid fa-file-lines" /> Text
          </button>
          <button
            type="button"
            onClick={() => downloadNoteAsPdf(clinicalNoteObj)}
            className="btn-ghost"
            title="Download PDF note"
          >
            <i className="fa-solid fa-file-pdf" /> PDF
          </button>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="btn-ghost"
            title="Share QR code with patient"
            style={{ borderColor: "rgba(59, 130, 246, 0.4)", color: "#93c5fd" }}
          >
            <i className="fa-solid fa-qrcode" /> Share QR
          </button>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(JSON.stringify(note, null, 2));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn-ghost"
            title="Copy Note JSON"
          >
            <i className="fa-solid fa-copy" /> {copied ? "Copied!" : "JSON"}
          </button>
        </div>
      </div>

      {/* Main 2-Column Content Layout: Left = Diarized Dialogue, Right = Finalized Structured Note */}
      <div className="detail-grid">
        {/* Left Column: Speaker-Labeled Transcript */}
        <div className="detail-panel dialogue-panel">
          <div className="detail-panel-head">
            <div className="panel-title-group">
              <i className="fa-solid fa-comments text-primary-accent" />
              <h3>Speaker-Labeled Dialogue</h3>
            </div>
            <div className="conversation-view-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={dialogueView === "script"}
                className={`conv-tab ${dialogueView === "script" ? "active" : ""}`}
                onClick={() => setDialogueView("script")}
              >
                Script ({turns.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dialogueView === "chat"}
                className={`conv-tab ${dialogueView === "chat" ? "active" : ""}`}
                onClick={() => setDialogueView("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dialogueView === "raw"}
                className={`conv-tab ${dialogueView === "raw" ? "active" : ""}`}
                onClick={() => setDialogueView("raw")}
              >
                Raw
              </button>
            </div>
          </div>

          <div className="detail-dialogue-content">
            {turns.length === 0 && (
              <p className="detail-raw-text">{data.transcript || "No transcript available."}</p>
            )}

            {turns.length > 0 && dialogueView === "script" && (
              <div className="dialogue-script-view">
                {turns.map((turn, idx) => {
                  const isDoc = turn.speaker.toLowerCase().includes("doctor") || turn.speaker.toLowerCase().includes("physician");
                  return (
                    <div key={idx} className="script-line">
                      <span className={`script-speaker ${isDoc ? "doc" : "pat"}`}>
                        {turn.speaker}:
                      </span>{" "}
                      <span className="script-text">{turn.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {turns.length > 0 && dialogueView === "chat" && (
              <div className="turns-chat-stream">
                {turns.map((turn, idx) => {
                  const isDoc = turn.speaker.toLowerCase().includes("doctor") || turn.speaker.toLowerCase().includes("physician");
                  return (
                    <div
                      key={idx}
                      className={`turn-bubble-wrapper ${isDoc ? "turn-doctor" : "turn-patient"}`}
                    >
                      <div className="turn-avatar">
                        <i className={`fa-solid ${isDoc ? "fa-user-doctor" : "fa-hospital-user"}`} />
                      </div>
                      <div className="turn-content">
                        <div className="turn-meta">
                          <span className="turn-speaker-label">{turn.speaker}</span>
                          <span className="turn-timestamp">Turn #{idx + 1}</span>
                        </div>
                        <p className="turn-text">{turn.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dialogueView === "raw" && (
              <div className="dialogue-raw-view">
                <pre>{data.transcript}</pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Finalized Structured Clinical Note */}
        <div className="detail-panel note-panel">
          <div className="detail-panel-head">
            <div className="panel-title-group">
              <i className="fa-solid fa-file-medical text-primary-accent" />
              <h3>Finalized Clinical Note</h3>
            </div>
            <span className="read-only-badge">
              <i className="fa-solid fa-shield-halved" /> Read-Only
            </span>
          </div>

          <div className="detail-note-cards">
            {/* Chief Complaint */}
            <div className="note-card-section">
              <div className="note-section-title">
                <i className="fa-solid fa-bullhorn" />
                <h4>Chief Complaint</h4>
              </div>
              <p className="note-section-body">
                {clinicalNoteObj.chief_complaint || <em className="text-muted">Not documented</em>}
              </p>
            </div>

            {/* History of Present Illness (HPI) */}
            <div className="note-card-section">
              <div className="note-section-title">
                <i className="fa-solid fa-clock-rotate-left" />
                <h4>History of Present Illness (HPI)</h4>
              </div>
              <p className="note-section-body">
                {clinicalNoteObj.hpi || <em className="text-muted">Not documented</em>}
              </p>
            </div>

            {/* Past Medical History (PMH) */}
            <div className="note-card-section">
              <div className="note-section-title">
                <i className="fa-solid fa-book-medical" />
                <h4>Past Medical History (PMH)</h4>
              </div>
              <p className="note-section-body">
                {clinicalNoteObj.pmh || <em className="text-muted">Not documented</em>}
              </p>
            </div>

            {/* Current Medications */}
            <div className="note-card-section">
              <div className="note-section-title">
                <i className="fa-solid fa-pills" />
                <h4>Current Medications</h4>
              </div>
              {clinicalNoteObj.medications && clinicalNoteObj.medications.length > 0 ? (
                <div className="medication-tags-list">
                  {clinicalNoteObj.medications.map((med, idx) => (
                    <span key={idx} className="medication-pill">
                      <i className="fa-solid fa-capsules" /> {med}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="note-section-body">
                  <em className="text-muted">No medications documented</em>
                </p>
              )}
            </div>

            {/* Objective Exam Findings */}
            <div className="note-card-section">
              <div className="note-section-title">
                <i className="fa-solid fa-heart-pulse" />
                <h4>Objective Exam Findings</h4>
              </div>
              <p className="note-section-body">
                {clinicalNoteObj.exam_findings || <em className="text-muted">Not documented</em>}
              </p>
            </div>

            {/* Assessment & Plan */}
            <div className="note-card-section plan-highlight">
              <div className="note-section-title">
                <i className="fa-solid fa-clipboard-check" />
                <h4>Assessment &amp; Plan</h4>
              </div>
              <p className="note-section-body">
                {clinicalNoteObj.plan || <em className="text-muted">Not documented</em>}
              </p>

              {/* Patient Translated Plan (if exists) */}
              {data.translated_plan && (
                <div className="translated-plan-box">
                  <div className="translated-plan-head">
                    <i className="fa-solid fa-language" />
                    <span>Patient Translated Plan</span>
                  </div>
                  <p className="translated-plan-body">{data.translated_plan}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showQrModal && data && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-head">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="fa-solid fa-qrcode text-primary-accent" />
                  Patient Report QR Code
                </h3>
                <p>Valid for 7 days • No patient login required</p>
              </div>
              <button onClick={() => setShowQrModal(false)} className="modal-close" aria-label="Close">
                ✕
              </button>
            </div>

            <div style={{ textAlign: "center", padding: "1.25rem 0" }}>
              <div className="qr-code-wrapper" style={{ display: "inline-flex", margin: "0 auto 1.25rem auto" }}>
                <QRCodeSVG
                  value={
                    typeof window !== "undefined" && data.share_token
                      ? `${window.location.origin}/public/report/${data.share_token}`
                      : ""
                  }
                  size={180}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
              </div>

              <div className="qr-patient-instruction" style={{ textAlign: "center", margin: "0 auto 1rem auto" }}>
                <strong>Patient:</strong> scan to view and download your report in your language
              </div>

              <div className="qr-link-row" style={{ maxWidth: 460, margin: "0 auto 1rem auto" }}>
                <input
                  type="text"
                  readOnly
                  value={
                    typeof window !== "undefined" && data.share_token
                      ? `${window.location.origin}/public/report/${data.share_token}`
                      : ""
                  }
                  className="qr-link-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof window !== "undefined" && data.share_token) {
                      const url = `${window.location.origin}/public/report/${data.share_token}`;
                      await navigator.clipboard.writeText(url);
                      setQrCopied(true);
                      setTimeout(() => setQrCopied(false), 2000);
                    }
                  }}
                  className="btn-qr-action"
                  title="Copy link to clipboard"
                >
                  <i className={qrCopied ? "fa-solid fa-check" : "fa-regular fa-copy"} />
                  <span>{qrCopied ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="modal-actions" style={{ justifyContent: "space-between" }}>
              {data.share_token && (
                <a
                  href={`/public/report/${data.share_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-qr-action primary"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" /> Open Patient View
                </a>
              )}
              <button onClick={() => setShowQrModal(false)} className="btn-ghost">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
