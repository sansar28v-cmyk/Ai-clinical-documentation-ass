"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLINICAL_NOTE_FIELDS,
  ClinicalNote,
  EMPTY_CLINICAL_NOTE,
} from "@/lib/clinical-note";
import { downloadNoteAsPdf, downloadNoteAsText } from "@/lib/export";

type Stage = "idle" | "ready" | "processing" | "review" | "finalized";

const ACCEPTED = ".wav,.mp3,.m4a,.mp4,.mpeg,.mpga,.webm,.ogg";

const PROCESSING_STEPS = [
  { title: "Uploading audio", detail: "Sent in memory only — nothing is written to disk." },
  { title: "Transcribing with Sarvam AI", detail: "Converting the consultation to text (auto-detects Indian languages)." },
  { title: "Extracting the clinical note with Sarvam-105B", detail: "Structuring chief complaint, HPI, meds, plan and more." },
];

type InputMode = "live" | "upload";

export default function ClinicalDemo() {
  const [stage, setStage] = useState<Stage>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("live");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transcript, setTranscript] = useState("");
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

  async function startLiveRecording() {
    setError(null);
    setLiveSegments([]);
    setLivePartial("");
    setDetectedLang(null);
    setRecordingDuration(0);

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
      const wsUrl = `${wsProtocol}//${window.location.hostname}:8000/ws/transcribe`;
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
          } else if (msg.type === "error") {
            setError(msg.message || "Streaming transcription error");
          }
        } catch (err) {
          console.error("Failed to parse WS message", err);
        }
      };

      ws.onerror = () => {
        setError(
          "Could not connect to live streaming WebSocket (ws://localhost:8000/ws/transcribe). Make sure python server.py is running.",
        );
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
    setLiveSegments([]);
    setLivePartial("");
    setDetectedLang(null);
    setRecordingDuration(0);
    setNote(EMPTY_CLINICAL_NOTE);
    setError(null);
    setMockMode(false);
    setStage("idle");
    setShowTranscript(false);
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
                {!isRecording ? (
                  <div className="live-idle-state">
                    <div className="live-mic-circle">
                      <span>🎙️</span>
                    </div>
                    <h3 className="live-idle-title">Real-Time Streaming Consultation</h3>
                    <p className="live-idle-desc">
                      Stream consultation audio live from your browser microphone to the FastAPI backend
                      and Sarvam AI (<code>saaras:v3-realtime</code>). Auto-detects 10–22 Indian languages and English.
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

            <div className="transcript-toggle">
              <button onClick={() => setShowTranscript((v) => !v)} className="transcript-toggle-btn">
                <span>View raw transcript</span>
                <span>{showTranscript ? "▲" : "▼"}</span>
              </button>
              {showTranscript && <div className="transcript-body">{transcript || "No transcript available."}</div>}
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
                <button onClick={() => setStage("finalized")} className="btn-finalize">
                  Finalize Note
                </button>
              ) : (
                <div className="export-actions">
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
