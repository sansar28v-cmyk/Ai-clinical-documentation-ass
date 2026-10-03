"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthViewProps {
  onSuccess?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "634580477902-jedoe240vgl2mfetrs3rivq1uvppkn8u.apps.googleusercontent.com";

export default function AuthView({
  onSuccess,
  onClose,
  isModal = false,
}: AuthViewProps) {
  const { login, loginWithGoogle, signup, loading, error, clearError } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");

  // Form fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupSuccessMsg, setSignupSuccessMsg] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptReady, setGoogleScriptReady] = useState(false);

  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const handleModeSwitch = (newMode: "login" | "signup") => {
    setMode(newMode);
    clearError();
    setLocalError(null);
    setSignupSuccessMsg(null);
  };

  // Initialize Google Identity Services
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGoogleCredential = async (response: any) => {
      if (!response?.credential) return;
      try {
        setGoogleLoading(true);
        clearError();
        setLocalError(null);
        await loginWithGoogle(response.credential);
        if (onSuccess) {
          onSuccess();
        }
      } catch (err: any) {
        setLocalError(err.message || "Failed to sign in with Google.");
      } finally {
        setGoogleLoading(false);
      }
    };

    const mountGoogleBtn = () => {
      const g = (window as any).google?.accounts?.id;
      if (!g) return;

      try {
        g.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = "";
          g.renderButton(googleBtnContainerRef.current, {
            theme: "filled_blue",
            size: "large",
            type: "standard",
            shape: "pill",
            text: mode === "signup" ? "signup_with" : "continue_with",
            logo_alignment: "left",
            width: 320,
          });
        }
        setGoogleScriptReady(true);
      } catch (e) {
        console.warn("Google button init error:", e);
      }
    };

    if ((window as any).google?.accounts?.id) {
      mountGoogleBtn();
    } else {
      const existingScript = document.getElementById("google-gsi-script");
      if (!existingScript) {
        const script = document.createElement("script");
        script.id = "google-gsi-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = mountGoogleBtn;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", mountGoogleBtn);
      }
    }
  }, [mode]);

  const handleManualGoogleClick = () => {
    const g = (window as any).google?.accounts?.id;
    if (g) {
      g.prompt();
    } else {
      setLocalError("Google Sign-In is initializing. Please wait a moment or use username/password.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);
    setSignupSuccessMsg(null);

    if (mode === "login") {
      if (!username.trim() || !password) {
        setLocalError("Please enter both username and password");
        return;
      }
      try {
        await login(username, password);
        if (onSuccess) {
          onSuccess();
        }
      } catch (err: any) {
        setLocalError(err.message || "Invalid username or password");
      }
    } else {
      // Signup mode
      if (!fullName.trim() || !username.trim() || !password) {
        setLocalError("Please fill in all fields.");
        return;
      }
      if (password.length < 3) {
        setLocalError("Password must be at least 3 characters long.");
        return;
      }
      try {
        await signup(username, password, fullName);
        if (onSuccess) {
          onSuccess();
        }
      } catch (err: any) {
        setLocalError(err.message || "Failed to create account. Username may be taken.");
      }
    }
  };

  const setQuickDoctor = () => {
    setUsername("testdoc");
    setPassword("password123");
  };

  const displayError = localError || error;

  return (
    <div className={`auth-card-container ${isModal ? "auth-modal-wrapper" : ""}`}>
      <div className="auth-card">
        {onClose && (
          <button
            type="button"
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        )}

        <div className="auth-header">
          <div className="auth-icon-badge">
            <i className="fa-solid fa-user-doctor" />
          </div>
          <h2 className="auth-title">
            {mode === "login" ? "Doctor Clinical Portal" : "Register Doctor Account"}
          </h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in with your secure physician credentials"
              : "Create a doctor account to document and manage patient consultations"}
          </p>
        </div>

        <div className="auth-mode-tabs">
          <button
            type="button"
            className={`auth-mode-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => handleModeSwitch("login")}
          >
            <i className="fa-solid fa-right-to-bracket" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => handleModeSwitch("signup")}
          >
            <i className="fa-solid fa-user-plus" />
            <span>Register Account</span>
          </button>
        </div>

        {signupSuccessMsg && (
          <div className="auth-alert success">
            <i className="fa-solid fa-circle-check" />
            <span>{signupSuccessMsg}</span>
          </div>
        )}

        {displayError && (
          <div className="auth-alert error">
            <i className="fa-solid fa-circle-exclamation" />
            <span>{displayError}</span>
          </div>
        )}

        {/* ── Google One-Click Sign In ── */}
        <div className="google-auth-box">
          <div
            ref={googleBtnContainerRef}
            className="google-btn-wrapper"
            style={{ display: "flex", justifyContent: "center", minHeight: 44 }}
          />

          {!googleScriptReady && (
            <button
              type="button"
              onClick={handleManualGoogleClick}
              className="google-custom-btn"
              disabled={googleLoading}
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{googleLoading ? "Signing in with Google..." : "Continue with Google"}</span>
            </button>
          )}

          {googleLoading && (
            <div className="google-loading-badge">
              <i className="fa-solid fa-circle-notch fa-spin" />
              <span>Verifying physician Google account...</span>
            </div>
          )}

          <div className="auth-divider">
            <span>or sign in with credentials</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <div className="auth-field">
              <label htmlFor="auth-fullname">Full Name</label>
              <div className="auth-input-wrapper">
                <i className="fa-regular fa-user" />
                <input
                  id="auth-fullname"
                  type="text"
                  placeholder="e.g. Dr. Sarah Jenkins"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-username">Username</label>
            <div className="auth-input-wrapper">
              <i className="fa-solid fa-at" />
              <input
                id="auth-username"
                type="text"
                placeholder="e.g. dr_smith or testdoc"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <div className="auth-input-wrapper">
              <i className="fa-solid fa-lock" />
              <input
                id="auth-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-loading-spinner">
                <i className="fa-solid fa-circle-notch fa-spin" />
                <span>{mode === "login" ? "Verifying..." : "Creating Account..."}</span>
              </span>
            ) : mode === "login" ? (
              <span>Sign In to Doctor Portal</span>
            ) : (
              <span>Create Doctor Account</span>
            )}
          </button>
        </form>

        {/* Demo Fast-fill option */}
        <div className="auth-demo-chips">
          <span className="demo-chips-label">Demo One-Click Fill:</span>
          <button type="button" onClick={setQuickDoctor} className="demo-chip">
            <i className="fa-solid fa-user-doctor" /> Doctor: testdoc
          </button>
        </div>

        <div className="auth-footer-toggle">
          {mode === "login" ? (
            <p>
              Don&apos;t have an account yet?{" "}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeSwitch("signup")}
              >
                Sign up here
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => handleModeSwitch("login")}
              >
                Sign in here
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
