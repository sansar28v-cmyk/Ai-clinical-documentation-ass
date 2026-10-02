import asyncio
import base64
import json
import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import websockets

# Load environment variables
load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_WS_URL = (
    "wss://api.sarvam.ai/speech-to-text-realtime/ws"
    "?model=saaras:v3-realtime&language_code=auto&encoding=linear16&sample_rate=16000"
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sarvam-ws-proxy")

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
