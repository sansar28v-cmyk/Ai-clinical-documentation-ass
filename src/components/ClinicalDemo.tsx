"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLINICAL_NOTE_FIELDS,
  ClinicalNote,
  EMPTY_CLINICAL_NOTE,
} from "@/lib/clinical-note";
import { downloadNoteAsPdf, downloadNoteAsText } from "@/lib/export";
import { SpeakerTurn } from "@/lib/mock";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

type Stage = "idle" | "ready" | "processing" | "review" | "finalized";

const ACCEPTED = ".wav,.mp3,.m4a,.mp4,.mpeg,.mpga,.webm,.ogg";

const PROCESSING_STEPS = [
  { title: "Uploading audio", detail: "Sent in memory only — nothing is written to disk." },
  { title: "Transcribing with Sarvam AI", detail: "Converting the consultation to text (auto-detects Indian languages)." },
  { title: "Extracting note & labeling speakers with Sarvam-105B", detail: "Structuring clinical fields and inferring Doctor vs Patient turns." },
];

type InputMode = "live" | "upload";

export interface RedFlagAlert {
  pattern_id: string;
  pattern_name: string;
  severity: string;
  message: string;
  triggered_keywords: string[];
  disclaimer: string;
  timestamp?: string;
}

interface ClinicalDemoProps {
  onRequestLogin?: () => void;
  onNavigateToDashboard?: () => void;
}

export default function ClinicalDemo({
  onRequestLogin,
  onNavigateToDashboard,
}: ClinicalDemoProps) {
  const { token, user } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [patientName, setPatientName] = useState("Anita Roy");
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("live");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [turns, setTurns] = useState<SpeakerTurn[]>([]);
  const [dialogueView, setDialogueView] = useState<"script" | "chat" | "raw">("script");
  const [showDialogue, setShowDialogue] = useState(true);
  const [note, setNote] = useState<ClinicalNote>(EMPTY_CLINICAL_NOTE);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Live microphone & streaming states
  const [isRecording, setIsRecording] = useState(false);
  const [liveSegments, setLiveSegments] = useState<string[]>([]);
  const [livePartial, setLivePartial] = useState("");
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Live Red-Flag Danger Alerts state
  const [redFlags, setRedFlags] = useState<RedFlagAlert[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (stage !== "processing") return;
    setStepIndex(0);
    const t1 = setTimeout(() => setStepIndex(1), 1100);
    const t2 = setTimeout(() => setStepIndex(2), 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stage]);

  // Clean up audio & socket when unmounting
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  function cleanupAudio() {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function acknowledgeAlert(patternId: string) {
    setRedFlags((prev) => prev.filter((a) => a.pattern_id !== patternId));
  }

  useEffect(() => {
    // Hidden developer/eval helper for browser console testing: window.__testRedFlag("chest pain shortness of breath")
    (window as unknown as { __testRedFlag?: (text: string) => void }).__testRedFlag = async (testText: string) => {
      try {
        const res = await fetch("/api/check-red-flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: testText }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.triggered_patterns) {
            data.triggered_patterns.forEach((alert: any) => {
              const alertData: RedFlagAlert = {
                pattern_id: alert.pattern_id,
                pattern_name: alert.pattern_name,
                severity: alert.severity || "critical",
                message: alert.message,
                triggered_keywords: alert.triggered_keywords || [],
                disclaimer:
                  alert.disclaimer ||
                  "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              };
              setRedFlags((prev) => {
                if (prev.some((a) => a.pattern_id === alertData.pattern_id)) return prev;
                return [...prev, alertData];
              });
            });
          }
        }
      } catch (e) {
        console.error("Console test red flag error:", e);
      }
    };
  }, []);


  async function startLiveRecording() {
    setError(null);
    setLiveSegments([]);
    setLivePartial("");
    setDetectedLang(null);
    setRecordingDuration(0);
    setRedFlags([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const defaultWsUrl = isLocal
        ? `${wsProtocol}//${window.location.hostname}:8000/ws/transcribe`
        : `${wsProtocol}//${window.location.host}/ws/transcribe`;
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || defaultWsUrl;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsRecording(true);
        timerRef.current = setInterval(() => {
          setRecordingDuration((d) => d + 1);
        }, 1000);

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            ws.send(pcm16.buffer);
          }
        };

        const muteNode = audioCtx.createGain();
        muteNode.gain.value = 0;
        source.connect(processor);
        processor.connect(muteNode);
        muteNode.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "partial") {
            setLivePartial(msg.text || "");
            if (msg.language) setDetectedLang(msg.language);
          } else if (msg.type === "final") {
            if (msg.text) {
              setLiveSegments((prev) => [...prev, msg.text]);
            }
            setLivePartial("");
            if (msg.language) setDetectedLang(msg.language);
          } else if (msg.type === "red_flag_alert") {
            const alertData: RedFlagAlert = {
              pattern_id: msg.pattern_id || `flag-${Date.now()}`,
              pattern_name: msg.pattern_name || "Emergency Warning",
              severity: msg.severity || "critical",
              message: msg.message || "Potential emergency symptom combination detected in live conversation.",
              triggered_keywords: Array.isArray(msg.triggered_keywords) ? msg.triggered_keywords : [],
              disclaimer:
                msg.disclaimer ||
                "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            };
            setRedFlags((prev) => {
              if (prev.some((a) => a.pattern_id === alertData.pattern_id)) return prev;
              return [...prev, alertData];
            });
          } else if (msg.type === "error") {
            setError(msg.message || "Streaming transcription error");
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onerror = () => {
        const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocalHost) {
          setError(
            "Could not connect to live streaming WebSocket (ws://localhost:8000/ws/transcribe). Make sure python server.py is running."
          );
        } else {
          setError(
            "Live microphone streaming requires a persistent WebSocket server (server.py). On Vercel, please switch to the 'Upload Audio File' tab for 100% cloud-hosted transcription, note extraction, and diarization!"
          );
        }
        cleanupAudio();
      };

      ws.onclose = () => {
        cleanupAudio();
      };
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to access microphone. Please ensure microphone permissions are granted.",
      );
      cleanupAudio();
    }
  }

  async function stopLiveRecordingAndExtract() {
    if (timerRef.current) clearInterval(timerRef.current);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
    }

    const allFinal = liveSegments.join(" ").trim();
    const fullTranscript = (allFinal + (livePartial ? " " + livePartial : "")).trim();

    cleanupAudio();

    if (!fullTranscript) {
      setError("No speech was detected during the live session. Please try speaking into the microphone again.");
      return;
    }

    setTranscript(fullTranscript);
    setStage("processing");
    setError(null);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: fullTranscript }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to extract clinical note.");
      }
      setNote({ ...EMPTY_CLINICAL_NOTE, ...data.note });
      setTurns(Array.isArray(data.turns) ? data.turns : []);
      setMockMode(Boolean(data.mock));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error during clinical note extraction.");
      setStage("idle");
    }
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFile(files[0]);
    setError(null);
    setStage("ready");
  }, []);

  function reset() {
    cleanupAudio();
    setFile(null);
    setTranscript("");
    setTurns([]);
    setLiveSegments([]);
    setLivePartial("");
    setDetectedLang(null);
    setRecordingDuration(0);
    setNote(EMPTY_CLINICAL_NOTE);
    setError(null);
    setMockMode(false);
    setStage("idle");
    setShowTranscript(false);
    setSavedId(null);
    setSaveError(null);
  }

  async function handleFinalize() {
    setStage("finalized");
    if (token) {
      setIsSaving(true);
      setSaveError(null);
      try {
        const res = await apiRequest<{ id: number }>("/consultations", {
          method: "POST",
          token,
          body: {
            patient_name: patientName.trim() || "Consultation Patient",
            transcript,
            speaker_turns: turns,
            note,
          },
        });
        setSavedId(res.id);
      } catch (err: any) {
        setSaveError(err.message || "Failed to save consultation to database.");
      } finally {
        setIsSaving(false);
      }
    }
  }

  async function handleProcess() {
    if (!file) return;
    setStage("processing");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch("/api/pipeline", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong while processing the recording.");
      }
      setTranscript(data.transcript ?? "");
      setNote({ ...EMPTY_CLINICAL_NOTE, ...data.note });
      setTurns(Array.isArray(data.turns) ? data.turns : []);
      setMockMode(Boolean(data.mock));
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error while processing the recording.");
      setStage("ready");
    }
  }

  function updateField(key: keyof ClinicalNote, rawValue: string) {
    if (key === "medications") {
      const medications = rawValue
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      setNote((prev) => ({ ...prev, medications }));
      return;
    }
    setNote((prev) => ({ ...prev, [key]: rawValue }));
  }

  const locked = stage === "finalized";

  return (
    <section id="demo" className="demo-section">
      <div className="demo-inner">
        <p className="demo-kicker">Live Demo</p>
        <h2 className="demo-title">See It In Action</h2>
        <p className="demo-subtitle">
          Capture live doctor-patient consultations in real time or upload existing recordings. Sarvam AI
          transcribes and extracts a structured clinical note for instant review.
        </p>

        {error && (
          <div className="demo-error">
            <p className="demo-error-title">We hit a snag</p>
            <p>{error}</p>
          </div>
        )}

        {!token ? (
          <div className="doctor-gate-card">
            <div className="gate-icon-badge">
              <i className="fa-solid fa-user-doctor" />
            </div>
            <h3 className="gate-title">Doctor Portal Access Required</h3>
            <p className="gate-desc">
              Live consultation recording, speaker-labeled transcription, and structured clinical note generation are restricted to authenticated physicians.
            </p>
            <div className="gate-actions">
              <button
                type="button"
                onClick={() => (onRequestLogin ? onRequestLogin() : null)}
                className="btn-start-consultation"
              >
                <i className="fa-solid fa-arrow-right-to-bracket" /> Sign In as Doctor
              </button>
            </div>
          </div>
        ) : (
          <>
            {(stage === "idle" || stage === "ready") && (
              <div className="demo-upload">
            {/* Mode selection tabs */}
            <div className="demo-mode-tabs">
              <button
                type="button"
                className={`demo-mode-tab ${inputMode === "live" ? "active" : ""}`}
                onClick={() => {
                  cleanupAudio();
                  setInputMode("live");
                }}
              >
                <span>🎙️</span> Live Consultation (Mic)
              </button>
              <button
                type="button"
                className={`demo-mode-tab ${inputMode === "upload" ? "active" : ""}`}
                onClick={() => {
                  cleanupAudio();
                  setInputMode("upload");
                }}
              >
                <span>📁</span> Upload Audio File
              </button>
            </div>

            {inputMode === "live" ? (
              <div className="live-recorder-card">
                {/* PROMINENT LIVE RED-FLAG ALERT BANNER STACK (TOP OF LIVE CONSULTATION) */}
                {redFlags.length > 0 && (
                  <div
                    className="red-flag-alert-stack"
                    role="alert"
                    aria-live="assertive"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      width: "100%",
                      marginBottom: "28px",
                      textAlign: "left",
                    }}
                  >
                    {redFlags.map((flag) => (
                      <div
                        key={flag.pattern_id}
                        className="red-flag-card"
                        style={{
                          position: "relative",
                          background: "linear-gradient(135deg, rgba(75, 12, 12, 0.98) 0%, rgba(127, 29, 29, 0.94) 50%, rgba(153, 27, 27, 0.92) 100%)",
                          border: "2px solid #ef4444",
                          borderRadius: "16px",
                          padding: "20px 24px",
                          color: "#ffffff",
                          textAlign: "left",
                          boxShadow: "0 0 28px rgba(239, 68, 68, 0.4)",
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          className="red-flag-header"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "14px",
                            marginBottom: "14px",
                            textAlign: "left",
                          }}
                        >
                          <div
                            className="red-flag-title-wrap"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              flex: "1 1 auto",
                              textAlign: "left",
                            }}
                          >
                            <span
                              className="red-flag-beacon"
                              style={{
                                fontSize: "28px",
                                lineHeight: "1",
                                display: "inline-block",
                              }}
                            >
                              🚨
                            </span>
                            <div style={{ textAlign: "left" }}>
                              <div
                                className="red-flag-meta-row"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  marginBottom: "4px",
                                  textAlign: "left",
                                }}
                              >
                                <span
                                  className="red-flag-badge-pill"
                                  style={{
                                    display: "inline-block",
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                    background: "#ef4444",
                                    color: "#ffffff",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                  }}
                                >
                                  CRITICAL RED FLAG
                                </span>
                                {flag.timestamp && (
                                  <span
                                    className="red-flag-time"
                                    style={{
                                      fontSize: "12px",
                                      color: "#fca5a5",
                                      fontWeight: 500,
                                    }}
                                  >
                                    🕒 {flag.timestamp}
                                  </span>
                                )}
                              </div>
                              <h4
                                className="red-flag-pattern-title"
                                style={{
                                  margin: 0,
                                  fontSize: "18px",
                                  fontWeight: 800,
                                  color: "#ffffff",
                                  letterSpacing: "-0.01em",
                                  textAlign: "left",
                                }}
                              >
                                {flag.pattern_name}
                              </h4>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="red-flag-ack-btn"
                            onClick={() => acknowledgeAlert(flag.pattern_id)}
                            title="Dismiss alert after physician review"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "8px 18px",
                              background: "#ffffff",
                              color: "#991b1b",
                              border: "none",
                              borderRadius: "999px",
                              fontSize: "13px",
                              fontWeight: 700,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                              marginLeft: "auto",
                            }}
                          >
                            ✓ Acknowledge
                          </button>
                        </div>

                        <p
                          className="red-flag-body-message"
                          style={{
                            margin: "0 0 14px 0",
                            fontSize: "14px",
                            lineHeight: "1.55",
                            color: "#fee2e2",
                            textAlign: "left",
                          }}
                        >
                          {flag.message}
                        </p>

                        <div
                          className="red-flag-trigger-box"
                          style={{
                            background: "rgba(0, 0, 0, 0.45)",
                            border: "1px solid rgba(239, 68, 68, 0.35)",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            marginBottom: "14px",
                            textAlign: "left",
                          }}
                        >
                          <span
                            className="red-flag-trigger-label"
                            style={{
                              display: "block",
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#fca5a5",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              marginBottom: "8px",
                              textAlign: "left",
                            }}
                          >
                            ⚠️ Triggered Keyword Clusters:
                          </span>
                          <div
                            className="red-flag-keywords-list"
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px",
                              textAlign: "left",
                            }}
                          >
                            {flag.triggered_keywords.map((kw, i) => (
                              <span
                                key={i}
                                className="red-flag-keyword-pill"
                                style={{
                                  display: "inline-block",
                                  background: "rgba(239, 68, 68, 0.35)",
                                  border: "1px solid rgba(248, 113, 113, 0.6)",
                                  color: "#ffffff",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                }}
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Mandatory Safety Disclaimer */}
                        <div
                          className="red-flag-disclaimer-row"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: "12px",
                            color: "#fecaca",
                            opacity: 0.9,
                            fontStyle: "italic",
                            borderTop: "1px solid rgba(239, 68, 68, 0.3)",
                            paddingTop: "10px",
                            textAlign: "left",
                          }}
                        >
                          <span>🛡️</span>
                          <span>{flag.disclaimer}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isRecording ? (
                  <div className="live-idle-state">
                    <div className="live-mic-circle">
                      <span>🎙️</span>
                    </div>
                    <h3 className="live-idle-title">Real-Time Streaming Consultation</h3>
                    <p className="live-idle-desc">
                      Stream consultation audio live from your browser microphone to the FastAPI backend
                      and Sarvam AI (<code>saaras:v3-realtime</code>). Auto-detects 10–22 Indian languages and English,
                      with <strong>live real-time red-flag danger pattern detection</strong> running during the consultation.
                    </p>
                    <button
                      type="button"
                      onClick={startLiveRecording}
                      className="btn-primary live-start-btn"
                    >
                      <span>🔴</span> Start Live Consultation
                    </button>
                  </div>
                ) : (
                  <div className="live-active-state">
                    <div className="live-header-bar">
                      <div className="live-status-indicator">
                        <span className="live-pulsing-dot" />
                        <span className="live-status-text">Recording Live</span>
                        <span className="live-timer-badge">{formatDuration(recordingDuration)}</span>
                      </div>
                      {detectedLang && (
                        <div className="live-lang-badge">
                          <span>🌐</span> Language: <strong>{detectedLang}</strong>
                        </div>
                      )}
                    </div>

                    <div className="live-transcript-container">
                      <div className="live-transcript-header">
                        <span>Live Streaming Transcript</span>
                        <span className="live-pulse-text">Listening…</span>
                      </div>
                      <div className="live-transcript-content">
                        {liveSegments.length === 0 && !livePartial ? (
                          <p className="live-transcript-placeholder">
                            Waiting for speech… Speak naturally in English, Hindi, Tamil, Telugu, or any Indian language.
                          </p>
                        ) : (
                          <>
                            {liveSegments.map((seg, i) => (
                              <span key={i} className="live-segment-final">
                                {seg}{" "}
                              </span>
                            ))}
                            {livePartial && (
                              <span className="live-segment-partial">
                                {livePartial}
                                <span className="live-typing-cursor">|</span>
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="live-actions-bar">
                      <button
                        type="button"
                        onClick={stopLiveRecordingAndExtract}
                        className="btn-primary live-finish-btn"
                      >
                        ✨ Complete Consultation &amp; Extract Note
                      </button>
                      <button
                        type="button"
                        onClick={cleanupAudio}
                        className="btn-secondary live-cancel-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <p className="demo-privacy">
                  🔒 Audio streams in memory only over secure WebSocket — your Sarvam API key remains server-side.
                </p>
              </div>
            ) : (
              <div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                  className={`dropzone${isDragging ? " dragging" : ""}`}
                >
                  <div className="dropzone-icon">🎙️</div>
                  <p className="dropzone-title">Drag &amp; drop a consultation recording here</p>
                  <p className="dropzone-help">or click to browse — .wav / .mp3 / .m4a supported</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED}
                    className="sr-only"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>

                {file && (
                  <div className="file-preview">
                    <div className="file-preview-info">
                      <span className="file-preview-icon">🎧</span>
                      <div>
                        <p className="file-preview-name">{file.name}</p>
                        <p className="file-preview-size">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button onClick={handleProcess} className="btn-primary">
                      Transcribe &amp; Extract
                    </button>
                  </div>
                )}

                <p className="demo-privacy">
                  🔒 Audio and transcripts are processed in memory for this session only — never written
                  to disk or a database.
                </p>
              </div>
            )}
          </div>
        )}

        {stage === "processing" && (
          <div className="processing-card">
            <div className="processing-head">
              <span className="pulse-dot" />
              <h3>Processing consultation…</h3>
            </div>
            <ol className="processing-steps">
              {PROCESSING_STEPS.map((step, idx) => {
                const state = idx < stepIndex ? "done" : idx === stepIndex ? "active" : "pending";
                return (
                  <li key={step.title} className={`processing-step ${state}`}>
                    <span className="processing-step-badge">{state === "done" ? "✓" : idx + 1}</span>
                    <span>
                      <p className="processing-step-title">
                        {step.title}
                        {state === "active" && <span className="processing-step-active"> ●●●</span>}
                      </p>
                      <p className="processing-step-detail">{step.detail}</p>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="processing-note">This can take up to a minute for longer recordings.</p>
          </div>
        )}

        {(stage === "review" || stage === "finalized") && (
          <div className="review-wrap">
            {mockMode && (
              <div className="demo-mode-banner">
                <p>
                  <strong>Demo mode.</strong> No AI API keys are configured on this server, so this
                  is a sample extraction to show the full flow. Set <code>SARVAM_API_KEY</code>{" "}
                  to process real recordings with Sarvam AI.
                </p>
              </div>
            )}
            <div className={`review-banner ${stage}`}>
              <p>
                {stage === "finalized"
                  ? "✅ Note finalized and locked for export."
                  : "📝 Draft extracted — review and correct any fields before finalizing."}
              </p>
              {stage === "finalized" ? (
                <button onClick={() => setStage("review")} className="btn-ghost">
                  Unlock &amp; Edit
                </button>
              ) : (
                <button onClick={reset} className="btn-ghost">
                  Start Over
                </button>
              )}
            </div>

            {/* ---------------- Conversation View (Speaker Diarization) ---------------- */}
            <div className="conversation-panel">
              <div className="conversation-panel-head">
                <div className="conversation-head-left">
                  <span className="conversation-panel-title">
                    <i className="fa-solid fa-comments" aria-hidden="true" />
                    Consultation Dialogue
                  </span>
                  <div
                    className="ai-inferred-badge"
                    title="Speaker roles are inferred by Sarvam-105B based on conversational patterns (questions/instructions = Doctor, symptoms/answers = Patient). Not an acoustic hardware diarization."
                  >
                    <span className="badge-pulse-dot" />
                    <span>AI-inferred speaker labels</span>
                    <i className="fa-solid fa-circle-info" aria-hidden="true" />
                  </div>
                </div>

                <div className="conversation-head-right">
                  <div className="conversation-view-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dialogueView === "script"}
                      className={`conv-tab ${dialogueView === "script" ? "active" : ""}`}
                      onClick={() => setDialogueView("script")}
                    >
                      Dialogue Script {turns.length > 0 && `(${turns.length})`}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dialogueView === "chat"}
                      className={`conv-tab ${dialogueView === "chat" ? "active" : ""}`}
                      onClick={() => setDialogueView("chat")}
                    >
                      Chat Cards
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dialogueView === "raw"}
                      className={`conv-tab ${dialogueView === "raw" ? "active" : ""}`}
                      onClick={() => setDialogueView("raw")}
                    >
                      Raw Transcript
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDialogue((v) => !v)}
                    className="conv-collapse-btn"
                    title={showDialogue ? "Collapse dialogue" : "Expand dialogue"}
                  >
                    <span>{showDialogue ? "Hide" : "Show"}</span>
                    <span>{showDialogue ? "▲" : "▼"}</span>
                  </button>
                </div>
              </div>

              {showDialogue && (
                <div className="conversation-panel-body">
                  {dialogueView === "script" && (
                    <div className="dialogue-script-view">
                      {turns.length > 0 ? (
                        turns.map((turn, idx) => {
                          const isDoctor = turn.speaker === "Doctor";
                          return (
                            <div key={idx} className="dialogue-script-line">
                              <span className={`script-speaker ${isDoctor ? "doc" : "pat"}`}>
                                {turn.speaker}:
                              </span>{" "}
                              <span className="script-text">{turn.text}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="turns-empty">
                          <p>No separated turns available. Switching to raw transcript view below.</p>
                          <p className="turns-empty-raw">{transcript || "No transcript available."}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {dialogueView === "chat" && (
                    <div className="turns-chat-stream">
                      {turns.length > 0 ? (
                        turns.map((turn, idx) => {
                          const isDoctor = turn.speaker === "Doctor";
                          const isPatient = turn.speaker === "Patient";
                          const speakerRole = isDoctor ? "doctor" : isPatient ? "patient" : "unknown";

                          return (
                            <div key={idx} className={`turn-bubble-wrapper turn-${speakerRole}`}>
                              <div className="turn-avatar">
                                <i
                                  className={
                                    isDoctor
                                      ? "fa-solid fa-user-doctor"
                                      : isPatient
                                      ? "fa-solid fa-user"
                                      : "fa-solid fa-circle-question"
                                  }
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="turn-content">
                                <div className="turn-meta">
                                  <span className={`turn-speaker-label label-${speakerRole}`}>
                                    {turn.speaker}
                                  </span>
                                  <span className="turn-timestamp">Turn {idx + 1}</span>
                                </div>
                                <p className="turn-text">{turn.text}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="turns-empty">
                          <p>No separated turns available. Switching to raw transcript view below.</p>
                          <p className="turns-empty-raw">{transcript || "No transcript available."}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {dialogueView === "raw" && (
                    <div className="transcript-raw-view">
                      <p>{transcript || "No transcript available."}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="note-form">
              {CLINICAL_NOTE_FIELDS.map((field) => {
                const value = field.isList ? note.medications.join("\n") : (note[field.key] as string);
                const isEmpty = field.isList ? note.medications.length === 0 : !value;
                return (
                  <div key={field.key} className="note-field">
                    <div className="note-field-head">
                      <label htmlFor={field.key}>{field.label}</label>
                      {isEmpty && <span className="note-field-flag">no information found</span>}
                    </div>
                    <p className="note-field-help">{field.help}</p>
                    {field.multiline ? (
                      <textarea
                        id={field.key}
                        value={value}
                        disabled={locked}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        rows={field.isList ? 3 : 4}
                        placeholder={field.isList ? "e.g. Lisinopril 10mg daily" : "Not mentioned in transcript"}
                      />
                    ) : (
                      <input
                        id={field.key}
                        type="text"
                        value={value}
                        disabled={locked}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder="Not mentioned in transcript"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="review-actions">
              {stage === "review" ? (
                <div className="finalize-controls-group">
                  <div className="patient-name-field-wrap">
                    <label htmlFor="patient-name-input">
                      <i className="fa-solid fa-hospital-user" /> Patient Name for Clinical Record:
                    </label>
                    <input
                      id="patient-name-input"
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="e.g. Anita Roy"
                      className="patient-name-input"
                    />
                  </div>
                  <button onClick={handleFinalize} className="btn-finalize" disabled={isSaving}>
                    {isSaving ? "Saving to Database..." : "Finalize & Save Note"}
                  </button>
                </div>
              ) : (
                <div className="export-actions">
                  {savedId && (
                    <div className="saved-badge-wrap">
                      <span className="saved-badge">
                        <i className="fa-solid fa-circle-check" /> Consultation saved to records as <strong>Record #{savedId}</strong>
                      </span>
                      {onNavigateToDashboard && (
                        <button
                          type="button"
                          onClick={onNavigateToDashboard}
                          className="btn-dashboard-jump"
                        >
                          <i className="fa-solid fa-table-columns" /> View in Doctor Dashboard
                        </button>
                      )}
                    </div>
                  )}
                  {saveError && (
                    <div className="save-error-badge">
                      <i className="fa-solid fa-triangle-exclamation" /> {saveError}
                    </div>
                  )}
                  <button onClick={() => downloadNoteAsText(note)} className="btn-ghost">
                    Download as Text
                  </button>
                  <button onClick={() => downloadNoteAsPdf(note)} className="btn-ghost">
                    Download as PDF
                  </button>
                  <button onClick={() => setShowExportModal(true)} className="btn-primary">
                    Export to EHR (mock)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Mock Export to EHR</h3>
                <p>No real EHR is connected — this simulates the payload a FHIR/HL7 integration would receive.</p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="modal-close" aria-label="Close">
                ✕
              </button>
            </div>
            <pre className="modal-json">{JSON.stringify(note, null, 2)}</pre>
            <div className="modal-actions">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(JSON.stringify(note, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="btn-ghost"
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
              <button onClick={() => setShowExportModal(false)} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
