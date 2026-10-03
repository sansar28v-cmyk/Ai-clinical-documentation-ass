"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ConsultationItem } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

interface DoctorDashboardProps {
  onStartConsultation: () => void;
  onViewConsultation: (id: number) => void;
}

export default function DoctorDashboard({
  onStartConsultation,
  onViewConsultation,
}: DoctorDashboardProps) {
  const { token, user, logout } = useAuth();
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQrConsultation, setActiveQrConsultation] = useState<ConsultationItem | null>(null);
  const [qrCopied, setQrCopied] = useState(false);

  const fetchConsultations = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ConsultationItem[]>("/consultations", {
        token,
      });
      setConsultations(data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load consultations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultations();
  }, [token]);

  const filteredConsultations = consultations.filter((c) => {
    const q = searchTerm.toLowerCase();
    const patName = (c.patient_name || "").toLowerCase();
    const complaint = (c.note?.chief_complaint || "").toLowerCase();
    return patName.includes(q) || complaint.includes(q);
  });

  return (
    <div className="dashboard-container">
      {/* Dashboard Top Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <div className="dashboard-role-badge doctor">
            <i className="fa-solid fa-user-doctor" />
            <span>Physician Portal</span>
          </div>
          <h1 className="dashboard-title">
            Welcome, {user?.full_name || "Doctor"}
          </h1>
          <p className="dashboard-subtitle">
            Manage your patient consultations, live AI documentation, and clinical notes.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            onClick={onStartConsultation}
            className="btn-start-consultation"
          >
            <i className="fa-solid fa-microphone-lines" />
            <span>Start New Consultation</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="dashboard-metrics-row">
        <div className="dashboard-metric-card">
          <div className="metric-icon blue">
            <i className="fa-solid fa-clipboard-list" />
          </div>
          <div className="metric-info">
            <span className="metric-value">{consultations.length}</span>
            <span className="metric-label">Completed Consultations</span>
          </div>
        </div>

        <div className="dashboard-metric-card">
          <div className="metric-icon emerald">
            <i className="fa-solid fa-wand-magic-sparkles" />
          </div>
          <div className="metric-info">
            <span className="metric-value">Sarvam AI</span>
            <span className="metric-label">STT &amp; Speaker Diarization</span>
          </div>
        </div>

        <div className="dashboard-metric-card">
          <div className="metric-icon purple">
            <i className="fa-solid fa-clock-rotate-left" />
          </div>
          <div className="metric-info">
            <span className="metric-value">Instant</span>
            <span className="metric-label">Structured Note Generation</span>
          </div>
        </div>
      </div>

      {/* Consultations Table Card */}
      <div className="dashboard-table-card">
        <div className="dashboard-table-header">
          <div className="table-title-area">
            <h3>Recent Patient Consultations</h3>
            <span className="table-counter-badge">{filteredConsultations.length} records</span>
          </div>

          <div className="dashboard-search-box">
            <i className="fa-solid fa-magnifying-glass" />
            <input
              type="text"
              placeholder="Search by patient name or complaint..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="dashboard-loading-state">
            <i className="fa-solid fa-circle-notch fa-spin spinner" />
            <p>Fetching clinical records from database...</p>
          </div>
        ) : error ? (
          <div className="dashboard-error-state">
            <i className="fa-solid fa-triangle-exclamation" />
            <p>{error}</p>
            <button
              type="button"
              onClick={fetchConsultations}
              className="btn-ghost"
            >
              <i className="fa-solid fa-rotate" /> Retry
            </button>
          </div>
        ) : filteredConsultations.length === 0 ? (
          <div className="dashboard-empty-state">
            <div className="empty-icon-wrap">
              <i className="fa-solid fa-folder-open" />
            </div>
            <h4>{searchTerm ? "No matching consultations found" : "No consultations recorded yet"}</h4>
            <p>
              {searchTerm
                ? "Try searching for a different patient name or clear your search query."
                : "Begin your first live consultation session. Audio is transcribed and structured notes are automatically generated."}
            </p>
            {!searchTerm && (
              <button
                type="button"
                onClick={onStartConsultation}
                className="btn-start-consultation empty-cta"
              >
                <i className="fa-solid fa-plus" /> Start First Consultation
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="consultations-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Date &amp; Time</th>
                  <th>Chief Complaint</th>
                  <th>Dialogue Turns</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsultations.map((item) => {
                  const dateStr = new Date(item.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  const turnsCount = (item.turns || []).length;
                  const complaint = item.note?.chief_complaint || "Routine Consultation";

                  return (
                    <tr key={item.id} className="consultation-row">
                      <td className="patient-cell">
                        <div className="patient-avatar-mini">
                          <i className="fa-regular fa-user" />
                        </div>
                        <div>
                          <span className="patient-name-text">{item.patient_name}</span>
                          <span className="consultation-id-sub">Record #{item.id}</span>
                        </div>
                      </td>
                      <td className="date-cell">
                        <i className="fa-regular fa-calendar-days" /> {dateStr}
                      </td>
                      <td className="complaint-cell">
                        <span className="complaint-text" title={complaint}>
                          {complaint}
                        </span>
                      </td>
                      <td className="turns-cell">
                        <span className="turns-pill">
                          <i className="fa-solid fa-comments" /> {turnsCount} turns
                        </span>
                      </td>
                      <td className="status-cell">
                        <span className="status-tag finalized">
                          <span className="status-dot" /> Finalized
                        </span>
                      </td>
                      <td className="action-cell">
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => setActiveQrConsultation(item)}
                            className="btn-view-record"
                            style={{
                              background: "rgba(59, 130, 246, 0.15)",
                              borderColor: "rgba(59, 130, 246, 0.35)",
                              color: "#93c5fd",
                            }}
                            title="Share Patient QR Code"
                          >
                            <i className="fa-solid fa-qrcode" style={{ marginRight: "4px" }} />
                            <span>QR</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onViewConsultation(item.id)}
                            className="btn-view-record"
                          >
                            <span>View</span>
                            <i className="fa-solid fa-chevron-right" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Patient QR Code Modal */}
      {activeQrConsultation && (
        <div className="modal-overlay" onClick={() => setActiveQrConsultation(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-head">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <i className="fa-solid fa-qrcode text-primary-accent" />
                  Patient Report QR Code
                </h3>
                <p>
                  {activeQrConsultation.patient_name} • 7-Day Secure Access • No Patient Login Required
                </p>
              </div>
              <button
                onClick={() => setActiveQrConsultation(null)}
                className="modal-close"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ textAlign: "center", padding: "1.25rem 0" }}>
              <div
                className="qr-code-wrapper"
                style={{
                  display: "inline-flex",
                  padding: "16px",
                  background: "#ffffff",
                  borderRadius: "16px",
                  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
                  margin: "0 auto 1.25rem auto",
                }}
              >
                <QRCodeSVG
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/public/report/${activeQrConsultation.share_token || "demo"}`
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
                <strong>Patient:</strong> scan with mobile phone camera to view and download report in your language
              </div>

              <div className="qr-link-row" style={{ maxWidth: 460, margin: "0 auto 1rem auto", display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/public/report/${activeQrConsultation.share_token || "demo"}`
                      : ""
                  }
                  className="qr-link-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof window !== "undefined") {
                      const url = `${window.location.origin}/public/report/${activeQrConsultation.share_token || "demo"}`;
                      await navigator.clipboard.writeText(url);
                      setQrCopied(true);
                      setTimeout(() => setQrCopied(false), 2000);
                    }
                  }}
                  className="btn-qr-action"
                >
                  <i className={qrCopied ? "fa-solid fa-check" : "fa-regular fa-copy"} />{" "}
                  {qrCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "14px" }}>
                <a
                  href={`/public/report/${activeQrConsultation.share_token || "demo"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ textDecoration: "none", fontSize: "0.88rem", padding: "8px 18px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" /> Open Patient Report
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
