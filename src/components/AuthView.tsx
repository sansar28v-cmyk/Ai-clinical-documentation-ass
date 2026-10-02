"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthViewProps {
  onSuccess?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export default function AuthView({
  onSuccess,
  onClose,
  isModal = false,
}: AuthViewProps) {
  const { login, signup, loading, error, clearError } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");

  // Form fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupSuccessMsg, setSignupSuccessMsg] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleModeSwitch = (newMode: "login" | "signup") => {
    setMode(newMode);
    clearError();
    setLocalError(null);
    setSignupSuccessMsg(null);
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
        setSignupSuccessMsg(`Account created for ${fullName}! Please sign in now.`);
        setMode("login");
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
