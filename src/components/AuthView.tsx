"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthViewProps {
  onSuccess?: (role: "doctor" | "patient") => void;
  onClose?: () => void;
  initialRole?: "doctor" | "patient";
  isModal?: boolean;
}

export default function AuthView({
  onSuccess,
  onClose,
  initialRole = "doctor",
  isModal = false,
}: AuthViewProps) {
  const { login, signup, loading, error, clearError } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [selectedRole, setSelectedRole] = useState<"doctor" | "patient">(initialRole);

  // Form fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupSuccessMsg, setSignupSuccessMsg] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRoleChange = (role: "doctor" | "patient") => {
    setSelectedRole(role);
    clearError();
    setLocalError(null);
  };

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
        const user = await login(username, password, selectedRole);
        if (onSuccess) {
          onSuccess(user.role);
        }
      } catch (err: any) {
        // error is handled in context, but fallback:
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
        await signup(username, password, fullName, selectedRole);
        setSignupSuccessMsg(`Account created for ${fullName}! Please sign in now.`);
        setMode("login");
      } catch (err: any) {
        setLocalError(err.message || "Failed to create account. Username may be taken.");
      }
    }
  };

  const setQuickDoctor = () => {
    setSelectedRole("doctor");
    setUsername("testdoc");
    setPassword("password123");
  };

  const setQuickPatient = () => {
    setSelectedRole("patient");
    setUsername("anita");
    setPassword("patient123");
    setFullName("Anita Roy");
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
            {selectedRole === "doctor" ? (
              <i className="fa-solid fa-user-doctor" />
            ) : (
              <i className="fa-solid fa-hospital-user" />
            )}
          </div>
          <h2 className="auth-title">
            {mode === "login"
              ? selectedRole === "doctor"
                ? "Doctor Clinical Portal"
                : "Patient Health Portal"
              : selectedRole === "doctor"
              ? "Register Doctor Account"
              : "Register Patient Account"}
          </h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in with your secure credentials"
              : "Create a new clinical account to get started"}
          </p>
        </div>

        {/* Role Toggle Tabs */}
        <div className="auth-role-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={selectedRole === "doctor"}
            className={`auth-role-tab ${selectedRole === "doctor" ? "active" : ""}`}
            onClick={() => handleRoleChange("doctor")}
          >
            <i className="fa-solid fa-stethoscope" />
            <span>Doctor</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedRole === "patient"}
            className={`auth-role-tab ${selectedRole === "patient" ? "active" : ""}`}
            onClick={() => handleRoleChange("patient")}
          >
            <i className="fa-solid fa-user-injured" />
            <span>Patient</span>
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

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "signup" && (
            <div className="auth-field">
              <label htmlFor="auth-fullname">Full Name</label>
              <div className="auth-input-wrapper">
                <i className="fa-regular fa-user" />
                <input
                  id="auth-fullname"
                  type="text"
                  placeholder={selectedRole === "doctor" ? "e.g. Dr. Sarah Jenkins" : "e.g. Anita Roy"}
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
                placeholder={selectedRole === "doctor" ? "e.g. dr_smith or testdoc" : "e.g. anita_roy"}
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
              <span>Sign In as {selectedRole === "doctor" ? "Doctor" : "Patient"}</span>
            ) : (
              <span>Register as {selectedRole === "doctor" ? "Doctor" : "Patient"}</span>
            )}
          </button>
        </form>

        {/* Demo Fast-fill options */}
        <div className="auth-demo-chips">
          <span className="demo-chips-label">Demo One-Click Fill:</span>
          <button type="button" onClick={setQuickDoctor} className="demo-chip">
            <i className="fa-solid fa-user-doctor" /> Doctor: testdoc
          </button>
          <button type="button" onClick={setQuickPatient} className="demo-chip">
            <i className="fa-solid fa-hospital-user" /> Patient: anita
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
