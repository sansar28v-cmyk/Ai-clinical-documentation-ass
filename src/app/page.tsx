"use client";

import React, { useState } from "react";
import ClinicalDemo from "@/components/ClinicalDemo";
import AuthView from "@/components/AuthView";
import DoctorDashboard from "@/components/DoctorDashboard";
import PatientDashboard from "@/components/PatientDashboard";
import ConsultationDetail from "@/components/ConsultationDetail";
import { useAuth } from "@/context/AuthContext";

type ViewState =
  | "landing"
  | "login"
  | "doctor-dashboard"
  | "patient-dashboard"
  | "consultation-detail"
  | "live-consultation";

export default function HomePage() {
  const { token, user, role, logout } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>("landing");
  const [selectedConsultationId, setSelectedConsultationId] = useState<number | null>(null);
  const [authInitialRole, setAuthInitialRole] = useState<"doctor" | "patient">("doctor");

  const handleLoginSuccess = (userRole: "doctor" | "patient") => {
    if (userRole === "doctor") {
      setCurrentView("doctor-dashboard");
    } else {
      setCurrentView("patient-dashboard");
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentView("login");
  };

  const openLogin = (intendedRole: "doctor" | "patient" = "doctor") => {
    setAuthInitialRole(intendedRole);
    setCurrentView("login");
  };

  return (
    <>
      {/* ---------------- Unified Site Header ---------------- */}
      <header className="site-header" style={{ position: currentView === "landing" ? "absolute" : "sticky", top: 0, zIndex: 100, background: currentView === "landing" ? "transparent" : "rgba(10, 10, 11, 0.92)", backdropFilter: "blur(12px)", borderBottom: currentView === "landing" ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
        <div className="header-row">
          <button
            type="button"
            className="logo-btn"
            onClick={() => setCurrentView("landing")}
            style={{ background: "transparent", border: "none", padding: 0 }}
            aria-label="AI Clinical Documentation Assistant — Home"
          >
            <img src="/assets/logo.png" alt="" width={52} height={52} />
          </button>

          <nav aria-label="Primary">
            <ul className="nav-pill">
              <li>
                <button
                  type="button"
                  onClick={() => setCurrentView("landing")}
                  className={`nav-link ${currentView === "landing" ? "active" : ""}`}
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                >
                  Home
                </button>
              </li>

              {token && role === "doctor" && (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => setCurrentView("doctor-dashboard")}
                      className={`nav-link ${currentView === "doctor-dashboard" ? "active" : ""}`}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      Doctor Dashboard
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setCurrentView("live-consultation")}
                      className={`nav-link ${currentView === "live-consultation" ? "active" : ""}`}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      New Consultation
                    </button>
                  </li>
                </>
              )}

              {token && role === "patient" && (
                <li>
                  <button
                    type="button"
                    onClick={() => setCurrentView("patient-dashboard")}
                    className={`nav-link ${currentView === "patient-dashboard" ? "active" : ""}`}
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    My Consultations
                  </button>
                </li>
              )}

              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (token && role === "doctor") {
                      setCurrentView("live-consultation");
                    } else if (token && role === "patient") {
                      setCurrentView("patient-dashboard");
                    } else {
                      setCurrentView("landing");
                      setTimeout(() => {
                        const el = document.getElementById("demo");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }, 50);
                    }
                  }}
                  className={`nav-link ${currentView === "live-consultation" ? "active" : ""}`}
                  style={{ background: "transparent", border: "none", cursor: "pointer" }}
                >
                  Product
                </button>
              </li>

              {currentView === "landing" && (
                <li>
                  <a href="#how-it-works" className="nav-link">
                    How It Works
                  </a>
                </li>
              )}
            </ul>
          </nav>

          <div className="nav-auth-group">
            {token && user ? (
              <>
                <div className={`nav-user-chip ${user.role}`}>
                  <i className={`fa-solid ${user.role === "doctor" ? "fa-stethoscope" : "fa-user"}`} />
                  <span>{user.full_name} ({user.role === "doctor" ? "Doctor" : "Patient"})</span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="nav-logout-btn"
                  title="Sign out of your account"
                >
                  <i className="fa-solid fa-arrow-right-from-bracket" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sign-in-btn"
                onClick={() => openLogin("doctor")}
              >
                Sign In / Portal
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Main Routed View ---------------- */}
      {currentView === "login" && (
        <section className="hero-viewport" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="bg">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video className="bg-video" autoPlay muted loop playsInline>
              <source
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
                type="video/mp4"
              />
            </video>
          </div>
          <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "480px", padding: "20px", margin: "auto" }}>
            <AuthView
              initialRole={authInitialRole}
              onClose={() => setCurrentView("landing")}
              onSuccess={handleLoginSuccess}
            />
          </div>
        </section>
      )}

      {currentView === "doctor-dashboard" && (
        <main className="dashboard-page-view" style={{ paddingTop: "20px" }}>
          <DoctorDashboard
            onStartConsultation={() => setCurrentView("live-consultation")}
            onViewConsultation={(id) => {
              setSelectedConsultationId(id);
              setCurrentView("consultation-detail");
            }}
          />
        </main>
      )}

      {currentView === "patient-dashboard" && (
        <main className="dashboard-page-view" style={{ paddingTop: "20px" }}>
          <PatientDashboard
            onViewConsultation={(id) => {
              setSelectedConsultationId(id);
              setCurrentView("consultation-detail");
            }}
          />
        </main>
      )}

      {currentView === "consultation-detail" && selectedConsultationId && (
        <main className="detail-page-view" style={{ paddingTop: "20px" }}>
          <ConsultationDetail
            consultationId={selectedConsultationId}
            onBack={() => {
              if (role === "doctor") setCurrentView("doctor-dashboard");
              else setCurrentView("patient-dashboard");
            }}
          />
        </main>
      )}

      {currentView === "live-consultation" && (
        <main className="consultation-live-view" style={{ paddingTop: "40px" }}>
          <ClinicalDemo
            onRequestLogin={(r) => openLogin(r)}
            onNavigateToDashboard={() => setCurrentView("doctor-dashboard")}
          />
        </main>
      )}

      {currentView === "landing" && (
        <>
          <section id="home" className="hero-viewport">
            <div className="bg">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video className="bg-video" autoPlay muted loop playsInline>
                <source
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4"
                  type="video/mp4"
                />
              </video>
            </div>

            <div className="page">
              <div style={{ height: "80px" }} />

              {/* ---------------- Hero ---------------- */}
              <main className="hero">
                <div className="trust-row anim" style={{ ["--d" as string]: "0.05s" }}>
                  <div className="trust-avatar a1">
                    <div className="inner">
                      <i className="fa-solid fa-stethoscope" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="trust-avatar a2">
                    <div className="inner">
                      <i className="fa-solid fa-hospital" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="trust-avatar a3">
                    <div className="inner">
                      <i className="fa-solid fa-notes-medical" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="trust-pill">
                    <span>Built for Busy Care Teams</span>
                  </div>
                </div>

                <h1 className="headline anim">
                  <span className="line1">Chart Less.</span>
                  <span className="line2">Care More.</span>
                </h1>

                <p className="subhead anim" style={{ ["--d" as string]: "0.28s" }}>
                  The AI Clinical Documentation Assistant listens to your consultations, transcribes
                  them, and drafts a structured clinical note — so you review and finalize in minutes,
                  not hours.
                </p>

                <div className="cta-group anim" style={{ ["--d" as string]: "0.4s" }}>
                  {token && role === "doctor" ? (
                    <button
                      type="button"
                      onClick={() => setCurrentView("live-consultation")}
                      className="cta-btn"
                    >
                      Start New Consultation
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openLogin("doctor")}
                      className="cta-btn"
                    >
                      Physician Login &amp; Demo
                    </button>
                  )}
                  <a href="#how-it-works" className="cta-secondary">
                    How It Works
                  </a>
                </div>
              </main>

              {/* ---------------- Stats footer ---------------- */}
              <footer className="stats">
                <div className="stat anim" style={{ ["--d" as string]: "0.5s" }}>
                  <span className="stat-icon">&lt;</span>
                  <span className="stat-value" data-target="60" data-decimals="0" data-suffix="s">
                    0s
                  </span>
                  <span className="stat-label">Avg. Transcription Time</span>
                </div>
                <div className="stat anim" style={{ ["--d" as string]: "0.58s" }}>
                  <span className="stat-icon">%</span>
                  <span className="stat-value" data-target="97.8" data-decimals="1" data-suffix="%">
                    0.0%
                  </span>
                  <span className="stat-label">Extraction Accuracy</span>
                </div>
                <div className="stat anim" style={{ ["--d" as string]: "0.66s" }}>
                  <span className="stat-icon">*</span>
                  <span className="stat-value" data-target="10" data-decimals="0" data-suffix="min">
                    0min
                  </span>
                  <span className="stat-label">Saved Per Note</span>
                </div>
                <div className="stat anim" style={{ ["--d" as string]: "0.74s" }}>
                  <span className="stat-icon">#</span>
                  <span className="stat-value" data-target="24" data-decimals="0" data-suffix="/7">
                    0/7
                  </span>
                  <span className="stat-label">Available Anytime</span>
                </div>
              </footer>

              <div className="scroll-cue">
                <span>Scroll</span>
                <span className="chevron" />
              </div>
            </div>
          </section>

          {/* ---------------- How it works ---------------- */}
          <section id="how-it-works" className="section">
            <div className="section-inner">
              <p className="section-kicker">The Problem &amp; The Fix</p>
              <h2 className="section-title">Doctors spend hours on paperwork instead of patients.</h2>
              <p className="section-subtitle">
                Clinicians lose an estimated 1–2 hours a day to manual charting. The AI Clinical
                Documentation Assistant removes that burden: record the consultation, and let AI turn
                it into a structured, editable note in under a minute.
              </p>
              <div className="how-steps">
                <div className="how-step">
                  <span className="how-step-num">1</span>
                  <h3>Upload the Recording</h3>
                  <p>Drop in a .wav/.mp3 recording of the doctor-patient consultation — nothing is saved to disk without authorization.</p>
                </div>
                <div className="how-step">
                  <span className="how-step-num">2</span>
                  <h3>AI Transcribes &amp; Extracts</h3>
                  <p>
                    Sarvam AI transcribes the audio (auto-detecting Indian languages), then Sarvam-105B extracts chief complaint, HPI, PMH,
                    medications, exam findings, and plan — handling negation correctly.
                  </p>
                </div>
                <div className="how-step">
                  <span className="how-step-num">3</span>
                  <h3>Review &amp; Finalize</h3>
                  <p>Edit any field directly, finalize the note, then export it as text, PDF, or a mock EHR payload.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- Live demo ---------------- */}
          <ClinicalDemo
            onRequestLogin={(r) => openLogin(r)}
            onNavigateToDashboard={() => setCurrentView("doctor-dashboard")}
          />
        </>
      )}

      {/* ---------------- Footer / contact ---------------- */}
      <footer id="contact" className="site-footer">
        <div className="footer-inner">
          <p>
            🔒 Privacy by design — audio and transcripts are processed in memory for this session
            only and are never written to disk without authorization.
          </p>
          <p>
            Questions? <a href="mailto:hello@clinicaldocassistant.ai">hello@clinicaldocassistant.ai</a>
          </p>
        </div>
      </footer>
    </>
  );
}
