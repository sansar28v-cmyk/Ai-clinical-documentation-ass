import ClinicalDemo from "@/components/ClinicalDemo";

export const dynamic = "force-static";

export default function HomePage() {
  return (
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
          {/* ---------------- Header ---------------- */}
          <header className="site-header">
            <div className="header-row">
              <a className="logo-btn" href="#home" aria-label="AI Clinical Documentation Assistant — Home">
                <img src="/assets/logo.png" alt="" width={52} height={52} />
              </a>

              <nav aria-label="Primary">
                <ul className="nav-pill">
                  <li>
                    <a href="#home" className="nav-link active">
                      Home
                    </a>
                  </li>
                  <li>
                    <a href="#demo" className="nav-link">
                      Product
                    </a>
                  </li>
                  <li>
                    <a href="#how-it-works" className="nav-link">
                      How It Works
                    </a>
                  </li>
                  <li>
                    <a href="#contact" className="nav-link">
                      Contact
                    </a>
                  </li>
                </ul>
              </nav>

              <a className="sign-in-btn" href="#demo">
                Try the Demo
              </a>

              <button
                className="burger-btn"
                type="button"
                aria-label="Open menu"
                aria-expanded="false"
                aria-controls="mobile-menu"
              >
                <span className="bars">
                  <span className="bar" />
                  <span className="bar" />
                  <span className="bar" />
                </span>
              </button>
            </div>
          </header>

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
              <a href="#demo" className="cta-btn">
                Try the Demo
              </a>
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
              <p>Drop in a .wav/.mp3 recording of the doctor-patient consultation — nothing is saved to disk.</p>
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
      <ClinicalDemo />

      {/* ---------------- Footer / contact ---------------- */}
      <footer id="contact" className="site-footer">
        <div className="footer-inner">
          <p>
            🔒 Privacy by design — audio and transcripts are processed in memory for this session
            only and are never written to disk or a database.
          </p>
          <p>
            Questions? <a href="mailto:hello@clinicaldocassistant.ai">hello@clinicaldocassistant.ai</a>
          </p>
        </div>
      </footer>

      {/* ---------------- Mobile menu ---------------- */}
      <div className="mobile-overlay" hidden />
      <nav className="mobile-menu" id="mobile-menu" hidden aria-label="Mobile">
        <ul>
          <li>
            <a href="#home" className="mobile-link active">
              Home
            </a>
          </li>
          <li>
            <a href="#demo" className="mobile-link">
              Product
            </a>
          </li>
          <li>
            <a href="#how-it-works" className="mobile-link">
              How It Works
            </a>
          </li>
          <li>
            <a href="#contact" className="mobile-link">
              Contact
            </a>
          </li>
        </ul>
        <a className="mobile-sign-in" href="#demo">
          Try the Demo
        </a>
      </nav>
    </>
  );
}
