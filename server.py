import asyncio
import base64
import json
import logging
import os
import urllib.error
import urllib.request
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import websockets

# Load environment variables
load_dotenv(override=True)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "").strip()
SARVAM_WS_URL = (
    "wss://api.sarvam.ai/speech-to-text-realtime/ws"
    "?model=saaras:v3-realtime&language_code=auto&encoding=linear16&sample_rate=16000"
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sarvam-ws-proxy")

SPEAKER_LABEL_PROMPT = """You are analyzing a doctor-patient medical conversation transcript. The transcript has NO speaker labels. Your job is to split it into individual conversational turns and label each turn as either 'Doctor' or 'Patient', based on conversational role (questions, instructions, prescriptions, exams = Doctor; symptom descriptions, answers, personal history = Patient).

Return ONLY a JSON array in this exact format, no extra text:
[
  {"speaker": "Doctor", "text": "..."},
  {"speaker": "Patient", "text": "..."}
]

Preserve the original wording exactly — do not paraphrase or summarize. Split the transcript into natural conversational turns in the order they occurred.

Transcript:
"""

import re

def _split_sentences(text: str) -> list[str]:
    raw = re.split(r'(?<=[.?!])\s+', text.strip())
    return [s.strip() for s in raw if s.strip()]

def _parse_dialogue_lines(raw_content: str) -> list[dict] | None:
    if not raw_content or not raw_content.strip():
        return None
    turns = []
    lines = raw_content.strip().splitlines()
    for line in lines:
        l = line.strip()
        if not l:
            continue
        l = re.sub(r'^\*\*(Doctor|Patient):\*\*', r'\1:', l)
        spk = None
        txt = ""
        doc_m = re.match(r'^(?:Doctor|Physician|Clinician)\s*:\s*(.*)', l, re.IGNORECASE)
        pat_m = re.match(r'^(?:Patient|Client)\s*:\s*(.*)', l, re.IGNORECASE)
        if doc_m:
            spk = "Doctor"
            txt = doc_m.group(1).strip()
        elif pat_m:
            spk = "Patient"
            txt = pat_m.group(1).strip()

        if spk and txt:
            if turns and turns[-1]["speaker"] == spk:
                turns[-1]["text"] += " " + txt
            else:
                turns.append({"speaker": spk, "text": txt})
    return turns if len(turns) > 1 else None

def _clinical_heuristic_label(sentences: list[str]) -> list[dict]:
    turns = []
    prev_spk = "Patient"
    for s in sentences:
        low = s.lower().strip()
        if any(p in low for p in ["hi doctor", "hello doctor", "thank you doctor", "thanks doctor", "okay doctor", "yes doctor"]):
            spk = "Patient"
        elif any(low.startswith(p) for p in ["i have", "i've", "i am", "i was", "it went", "no cough", "no trouble", "no chronic", "i just took", "i also have", "my throat", "my name"]):
            spk = "Patient"
        elif any(low.startswith(d) for d in ["what brings", "how high", "any cough", "any history", "let me check", "okay, i can see", "i can see", "your temperature", "lungs sounds", "i'm going to prescribe", "i am going to prescribe", "drink plenty", "if the fever", "come back"]):
            spk = "Doctor"
        elif s.strip().endswith("?"):
            spk = "Doctor"
        elif any(w in low for w in ["prescribe", "milligram", "temperature is", "blood pressure"]):
            spk = "Doctor"
        else:
            spk = "Doctor" if prev_spk == "Patient" else "Patient"

        prev_spk = spk
        if turns and turns[-1]["speaker"] == spk:
            turns[-1]["text"] += " " + s
        else:
            turns.append({"speaker": spk, "text": s})
    return turns

def _clean_and_parse_turns(raw_content: str) -> list[dict] | None:
    if not raw_content or not raw_content.strip():
        return None
    text = raw_content.strip()

    line_turns = _parse_dialogue_lines(text)
    if line_turns:
        return line_turns

    # Strip markdown code fences if present
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            p = part.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("[") and p.endswith("]"):
                text = p
                break

    # 1. Search for array [...]
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket != -1 and last_bracket > first_bracket:
        try:
            parsed = json.loads(text[first_bracket : last_bracket + 1])
            if isinstance(parsed, list) and len(parsed) > 0:
                return _sanitize_turns(parsed)
        except Exception:
            pass

    # 2. Search for object { "turns": [...] }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        try:
            parsed = json.loads(text[first_brace : last_brace + 1])
            for key in ["turns", "conversation", "transcript", "dialogue"]:
                candidate = parsed.get(key)
                if isinstance(candidate, list) and len(candidate) > 0:
                    return _sanitize_turns(candidate)
        except Exception:
            pass

    return line_turns

def _sanitize_turns(items: list) -> list[dict]:
    valid_turns = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text or text == "...":
            continue
        raw_speaker = str(item.get("speaker", "")).strip().lower()
        if "pat" in raw_speaker or "client" in raw_speaker:
            speaker = "Patient"
        else:
            speaker = "Doctor"
        
        if valid_turns and valid_turns[-1]["speaker"] == speaker:
            valid_turns[-1]["text"] += " " + text
        else:
            valid_turns.append({"speaker": speaker, "text": text})
    return valid_turns

async def _call_sarvam_llm(prompt: str) -> str:
    url = "https://api.sarvam.ai/v1/chat/completions"
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Authorization": f"Bearer {SARVAM_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": os.getenv("SARVAM_LLM_MODEL", "sarvam-105b"),
        "max_tokens": 8192,
        "temperature": 0,
        "messages": [{"role": "user", "content": prompt}],
    }

    def _sync_request():
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            msg = data.get("choices", [{}])[0].get("message", {})
            return msg.get("content") or msg.get("reasoning_content") or ""

    return await asyncio.to_thread(_sync_request)

async def label_speakers(transcript: str) -> list[dict]:
    clean = (transcript or "").strip()
    if not clean:
        return []

    sentences = _split_sentences(clean)
    if not sentences:
        return []

    if not SARVAM_API_KEY:
        return _clinical_heuristic_label(sentences)

    numbered = "\n".join([f"{i+1}. {s}" for i, s in enumerate(sentences)])
    prompt = (
        "You are an expert clinical conversation transcriptionist. Given numbered sentences from a doctor-patient consultation, assign each sentence to either 'Doctor' or 'Patient' based on conversational context.\n\n"
        "Rules:\n"
        "- Questions, clinical exams, findings, diagnoses, and prescriptions = Doctor\n"
        "- Describing symptoms, answering questions, giving history, and acknowledgements = Patient\n\n"
        "Output each sentence line-by-line in this exact format:\n"
        "Doctor: <sentence>\n"
        "Patient: <sentence>\n\n"
        "Do not add commentary, explanations, or numbers.\n\n"
        f"Consultation sentences:\n{numbered}"
    )

    # Attempt 1
    try:
        raw_1 = await _call_sarvam_llm(prompt)
        turns = _clean_and_parse_turns(raw_1)
        if turns and len(turns) > 0 and not all(t["speaker"] == "Unknown" for t in turns):
            return turns
        logger.warning("Attempt 1 speaker labeling returned empty, retrying...")
    except Exception as e:
        logger.warning(f"Attempt 1 speaker labeling failed with error: {e}, retrying...")

    # Attempt 2
    try:
        retry_prompt = f"CRITICAL: Output ONLY lines starting with 'Doctor:' or 'Patient:'. No preamble.\n\n{prompt}"
        raw_2 = await _call_sarvam_llm(retry_prompt)
        turns = _clean_and_parse_turns(raw_2)
        if turns and len(turns) > 0 and not all(t["speaker"] == "Unknown" for t in turns):
            return turns
        logger.warning("Attempt 2 speaker labeling failed to parse. Falling back to heuristic classifier.")
    except Exception as e:
        logger.error(f"Attempt 2 speaker labeling error: {e}. Falling back to heuristic classifier.")

    # Fallback to intelligent clinical classifier
    return _clinical_heuristic_label(sentences)

class LabelSpeakersRequest(BaseModel):
    transcript: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not SARVAM_API_KEY:
        logger.warning("SARVAM_API_KEY is not set! Real-time streaming will fail without a valid key.")
    else:
        logger.info("FastAPI WebSocket proxy initialized with Sarvam AI integration.")
    yield

app = FastAPI(title="Clinical Assistant Live STT WebSocket Proxy", lifespan=lifespan)

# Allow CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "sarvam_configured": bool(SARVAM_API_KEY),
        "sarvam_ws_endpoint": "saaras:v3-realtime (linear16, 16kHz, auto language detection)",
    }

@app.post("/api/label-speakers")
async def api_label_speakers(req: LabelSpeakersRequest):
    turns = await label_speakers(req.transcript)
    return {"turns": turns}

@app.websocket("/ws/transcribe")
async def websocket_transcribe(client_ws: WebSocket):
    """
    WebSocket endpoint connecting browser microphone stream to Sarvam AI realtime STT.
    
    Data Flow:
      Browser mic (PCM 16-bit 16kHz)
        ──> FastAPI (/ws/transcribe)
        ──> Sarvam Realtime WebSocket (wss://api.sarvam.ai/speech-to-text-realtime/ws)
        ──> Sarvam returns partial/final transcripts
        ──> FastAPI relays segments back to Browser
    """
    await client_ws.accept()
    logger.info("Browser client connected to /ws/transcribe")

    if not SARVAM_API_KEY:
        await client_ws.send_json({
            "type": "error",
            "message": "SARVAM_API_KEY is not configured on the server. Please check your .env file.",
        })
        await client_ws.close()
        return

    headers = {"Api-Subscription-Key": SARVAM_API_KEY}

    try:
        async with websockets.connect(SARVAM_WS_URL, additional_headers=headers) as sarvam_ws:
            logger.info("Connected upstream to Sarvam Realtime WebSocket")

            # Task 1: Relay Sarvam messages back to the browser
            async def sarvam_to_client():
                try:
                    async for raw_message in sarvam_ws:
                        try:
                            msg = json.loads(raw_message)
                        except json.JSONDecodeError:
                            continue

                        event = msg.get("event")
                        if event == "transcript.partial":
                            await client_ws.send_json({
                                "type": "partial",
                                "text": msg.get("text", ""),
                                "language": msg.get("language"),
                                "utterance_idx": msg.get("utterance_idx"),
                            })
                        elif event == "transcript.final":
                            await client_ws.send_json({
                                "type": "final",
                                "text": msg.get("text", ""),
                                "language": msg.get("language"),
                                "utterance_idx": msg.get("utterance_idx"),
                            })
                        elif event == "session.begin":
                            await client_ws.send_json({
                                "type": "session_begin",
                                "config": msg.get("config"),
                            })
                        elif event == "session.end":
                            await client_ws.send_json({
                                "type": "session_end",
                            })
                            break
                        elif event == "error":
                            logger.error(f"Sarvam upstream error: {msg}")
                            await client_ws.send_json({
                                "type": "error",
                                "message": msg.get("message", "Upstream STT error from Sarvam AI"),
                            })
                except websockets.exceptions.ConnectionClosed:
                    logger.info("Sarvam upstream connection closed")
                except Exception as e:
                    logger.error(f"Error in sarvam_to_client: {e}")

            # Task 2: Relay Browser client audio to Sarvam
            async def client_to_sarvam():
                try:
                    while True:
                        message = await client_ws.receive()

                        if "bytes" in message and message["bytes"]:
                            # Raw binary PCM 16-bit 16kHz
                            pcm_data = message["bytes"]
                            b64_audio = base64.b64encode(pcm_data).decode("utf-8")
                            await sarvam_ws.send(json.dumps({
                                "event": "audio_input",
                                "audio": b64_audio,
                            }))

                        elif "text" in message and message["text"]:
                            try:
                                payload = json.loads(message["text"])
                                action = payload.get("action") or payload.get("event")

                                if action == "audio":
                                    b64_audio = payload.get("data")
                                    if b64_audio:
                                        await sarvam_ws.send(json.dumps({
                                            "event": "audio_input",
                                            "audio": b64_audio,
                                        }))
                                elif action in ["flush", "pause"]:
                                    await sarvam_ws.send(json.dumps({"event": "flush"}))
                                elif action in ["stop", "end"]:
                                    await sarvam_ws.send(json.dumps({"event": "flush"}))
                                    await asyncio.sleep(0.5)
                                    await sarvam_ws.send(json.dumps({"event": "end"}))
                                    break
                            except json.JSONDecodeError:
                                pass

                except WebSocketDisconnect:
                    logger.info("Client disconnected normally")
                except Exception as e:
                    logger.error(f"Error in client_to_sarvam: {e}")

            # Run both relay directions concurrently
            c2s_task = asyncio.create_task(client_to_sarvam())
            s2c_task = asyncio.create_task(sarvam_to_client())

            done, pending = await asyncio.wait(
                [c2s_task, s2c_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()

    except Exception as e:
        logger.error(f"WebSocket session failed: {e}")
        try:
            await client_ws.send_json({
                "type": "error",
                "message": f"Failed to connect to Sarvam AI streaming STT: {str(e)}",
            })
        except Exception:
            pass
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass
        logger.info("Transcribe WebSocket session terminated")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting FastAPI server on http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
