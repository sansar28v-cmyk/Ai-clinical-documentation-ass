"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, ConsultationItem } from "@/lib/api";

interface PatientDashboardProps {
  onViewConsultation: (id: number) => void;
}

export default function PatientDashboard({
  onViewConsultation,
}: PatientDashboardProps) {
  const { token, user } = useAuth();
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(err.message || "Failed to load your consultations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultations();
  }, [token]);

  return (
    <div className="dashboard-container">
      {/* Patient Header */}
      <div className="dashboard-header">
        <div className="dashboard-welcome">
          <div className="dashboard-role-badge patient">
            <i className="fa-solid fa-hospital-user" />
            <span>Patient Portal</span>
          </div>
          <h1 className="dashboard-title">
            Welcome, {user?.full_name || "Patient"}
          </h1>
          <p className="dashboard-subtitle">
            View your clinical consultation history, doctor notes, care plans, and transcripts.
          </p>
        </div>
      </div>

      {/* Info Notice */}
      <div className="patient-portal-notice">
        <i className="fa-solid fa-shield-halved" />
        <div>
          <strong>Confidential Health Records</strong>
          <p>
            Your clinical documentation is strictly confidential and protected. You have full read-only access to review discussions and doctor care plans.
          </p>
        </div>
      </div>

      {/* Table Card */}
      <div className="dashboard-table-card">
        <div className="dashboard-table-header">
          <div className="table-title-area">
            <h3>My Clinical Consultations</h3>
            <span className="table-counter-badge">{consultations.length} records</span>
          </div>
        </div>

        {loading ? (
          <div className="dashboard-loading-state">
            <i className="fa-solid fa-circle-notch fa-spin spinner" />
            <p>Fetching your health records...</p>
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
        ) : consultations.length === 0 ? (
          <div className="dashboard-empty-state">
            <div className="empty-icon-wrap">
              <i className="fa-regular fa-folder-closed" />
            </div>
            <h4>No consultation records found</h4>
            <p>
              When your doctor conducts a consultation session under your name, the finalized note and dialogue will be accessible here.
            </p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="consultations-table">
              <thead>
                <tr>
                  <th>Doctor / Clinician</th>
                  <th>Date &amp; Time</th>
                  <th>Chief Concern</th>
                  <th>Care Plan Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {consultations.map((item) => {
                  const dateStr = new Date(item.created_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  const complaint = item.note?.chief_complaint || "General Consultation";

                  return (
                    <tr key={item.id} className="consultation-row">
                      <td className="patient-cell">
                        <div className="patient-avatar-mini doctor-avatar-mini">
                          <i className="fa-solid fa-user-doctor" />
                        </div>
                        <div>
                          <span className="patient-name-text">{item.doctor_name || "Doctor"}</span>
                          <span className="consultation-id-sub">Record #{item.id}</span>
                        </div>
                      </td>
                      <td className="date-cell">
                        <i className="fa-regular fa-calendar-days" /> {dateStr}
                      </td>
                      <td className="complaint-cell">
                        <span className="complaint-text">{complaint}</span>
                      </td>
                      <td className="status-cell">
                        <span className="status-tag finalized">
                          <span className="status-dot" /> Available
                        </span>
                      </td>
                      <td className="action-cell">
                        <button
                          type="button"
                          onClick={() => onViewConsultation(item.id)}
                          className="btn-view-record"
                        >
                          <span>View Note</span>
                          <i className="fa-solid fa-chevron-right" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
