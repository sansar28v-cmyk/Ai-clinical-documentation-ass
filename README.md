# AI Clinical Documentation Assistant

A hackathon MVP that lets a doctor upload a consultation recording, automatically
transcribes it (Sarvam AI STT) and extracts a structured clinical note (Sarvam-105B
LLM), and presents an editable review UI so the doctor can correct fields before
finalizing and exporting the note.

## Why Sarvam AI?

This project uses [Sarvam AI](https://www.sarvam.ai/) as the sole AI provider for
both speech-to-text and structured note extraction. The decision was driven by three
factors:

1. **Data sovereignty & DPDP Act compliance** — Sarvam's infrastructure runs within
   India, so patient audio and transcripts never leave Indian data centres. This
   aligns with the Digital Personal Data Protection (DPDP) Act, 2023, which requires
   careful handling of health data.
2. **Native Indian-language support** — Sarvam's STT model auto-detects and transcribes
   22+ Indian languages (plus English) without requiring a separate translation layer.
   Consultations in Hindi, Tamil, Telugu, Bengali, Marathi, etc. are transcribed
   natively.
3. **Single-vendor simplicity** — One API key (`SARVAM_API_KEY`) powers both the STT
   and LLM pipeline, reducing configuration complexity and vendor management overhead.

## Architecture note

The brief described a separate FastAPI backend + React frontend. This sandbox is
provisioned as a single **Next.js (App Router)** application, so the same pipeline
is implemented as Next.js **Route Handlers** (server-side, Node runtime) serving a
React frontend from the same project — functionally identical to "FastAPI backend +
React frontend," but same-origin, so there's no CORS configuration to manage and only
one process to run. No database is used (per the spec); all note state lives in
React component state for the duration of the browser session only.

| Requirement | Implementation |
|---|---|
| `POST /transcribe` | `src/app/api/transcribe/route.ts` — accepts `multipart/form-data` with an `audio` file, calls Sarvam STT (`saaras:v3`), returns `{ transcript, language_code }` |
| `POST /extract` | `src/app/api/extract/route.ts` — accepts `{ transcript }` JSON, calls Sarvam-105B, returns `{ note }` |
| `POST /pipeline` | `src/app/api/pipeline/route.ts` — chains the two above, returns `{ transcript, language_code, note }` |
| React frontend | `src/app/page.tsx` + `src/components/*` |
| Schema / prompt logic | `src/lib/clinical-note.ts`, `src/lib/sarvam-stt.ts`, `src/lib/sarvam-llm.ts` |

## Clinical note schema

```json
{
  "chief_complaint": "string",
  "hpi": "string - symptoms and duration",
  "pmh": "string - past medical history",
  "medications": ["array of strings"],
  "exam_findings": "string",
  "plan": "string - treatment plan"
}
```

The Sarvam-105B system prompt (`src/lib/sarvam-llm.ts`) explicitly instructs the model to:
- Return **only** valid JSON matching this schema, no commentary or markdown fences.
- Leave a field as `""` / `[]` when the transcript has no supporting information —
  never invent or infer data.
- Respect **negation**: denied symptoms/conditions/medications (e.g. "no fever",
  "denies chest pain", "not on any medications") must never appear as positive
  findings.
- **Always return English** output, even when the transcript is in an Indian language
  or code-mixed (e.g. Hinglish).

If Sarvam-105B's response can't be parsed as valid JSON, the server **automatically
retries once** with a corrective instruction before returning a clear
`502`/error message to the frontend — the UI surfaces this instead of freezing.

## Project structure

```
server.py                 # FastAPI WebSocket streaming server proxy
src/
  app/
    api/
      transcribe/route.ts   # Sarvam STT REST endpoint
      extract/route.ts      # Sarvam-105B structured-extraction endpoint
      pipeline/route.ts     # transcribe + extract convenience endpoint
      health/route.ts       # platform health check
    page.tsx                # main React UI (live mic / upload -> review -> finalize)
    layout.tsx, globals.css
  components/
    ClinicalDemo.tsx        # full interactive demo component (with Live Mic + Upload tabs)
  lib/
    clinical-note.ts        # schema, types, field metadata, normalization
    sarvam-stt.ts           # Sarvam AI STT client (sync + batch) + validation
    sarvam-llm.ts           # Sarvam-105B chat completions client + retry logic
    export.ts               # client-side Text/PDF export helpers
    mock.ts                 # demo-mode sample data
```

## Real-Time Streaming Architecture

In addition to batch and file uploads, the assistant supports **live microphone streaming**:

```
Browser Microphone
  │ (Linear16 16kHz PCM audio chunks)
  ▼
FastAPI Backend (server.py)
  │ (Keeps SARVAM_API_KEY secure on server side)
  ▼
Sarvam Realtime WebSocket (wss://api.sarvam.ai/speech-to-text-realtime/ws)
  │ (model: saaras:v3-realtime, auto-detects Indian languages)
  ▼
Streaming Transcripts (transcript.partial & transcript.final)
  │ (Relayed back to browser over WebSocket)
  ▼
Live UI Display ──► Complete & Extract ──► Sarvam-105B Structured Note
```

## Environment variables

Copy `.env.example` to `.env` and fill in your key:

```
SARVAM_API_KEY=sk_...    # required — get one at https://dashboard.sarvam.ai/
```

Optional overrides:

```
SARVAM_STT_MODEL=saarika:v2      # default; can switch to saaras:v4 for latest
SARVAM_LLM_MODEL=sarvam-105b     # default
DATABASE_URL=...                  # provided by the platform; unused by this app
```

If the key is missing, the relevant API route falls back to **demo mode** with a
realistic sample transcript and note — the UI labels this clearly. No error is thrown.

## Running it

```bash
npm install
npm run dev     # local development
# or
npm run build && npm run start   # production
```

Then open the app, drag in a `.wav`/`.mp3`/`.m4a` consultation recording, click
**"Transcribe & Extract"**, review/edit the generated note, and click
**"Finalize Note"**. From there you can **Download as Text**, **Download as
PDF**, or open the **Export to EHR (mock)** panel to see the final JSON payload
that would be sent to a real EHR integration.

## User flow

1. **Upload** — drag-and-drop or click to choose an audio file of a consultation.
2. **Processing** — a 3-step animated indicator (Uploading → Transcribing →
   Extracting) keeps the doctor informed during the ~10–60s round trip to
   Sarvam AI, so a slow network never looks like a frozen page.
3. **Review** — the extracted note renders as an editable form, one input per
   schema field. Fields with no extracted information are flagged with a
   "no information found" badge instead of being silently blank. The raw
   transcript is available in a collapsible panel for cross-checking.
4. **Finalize** — clicking "Finalize Note" locks every field (greyed out,
   read-only) and switches the UI into a visually distinct "finalized" state.
   An "Unlock & Edit" button lets the doctor make further corrections if needed.
5. **Export** — once finalized, the doctor can download a plain-text note, a
   formatted PDF, or open a mock "Export to EHR" modal that displays the exact
   JSON payload (with a copy-to-clipboard button) that a real EHR integration
   would receive.

## Privacy-conscious design

- Audio files are streamed directly from the browser upload into the Sarvam
  API call and are **never written to disk** or any database.
- All processing happens on Sarvam's Indian infrastructure — data never
  leaves Indian data centres.
- Transcripts and extracted notes exist only in server request scope and
  client-side React state for the current browser session — closing/refreshing
  the tab clears everything. Nothing is logged or persisted.
- No database table is used for clinical content; the Postgres connection in
  this template is left untouched and unused by the clinical pipeline.

## Error handling & demo reliability

- Unsupported file types/sizes are rejected before ever calling Sarvam, with a
  clear `415`/`413` message.
- Upstream API failures (rate limits, network errors, auth errors) are caught
  and returned as readable error banners in the UI — never a silent hang.
- Malformed Sarvam-105B JSON output triggers one automatic retry with a corrective
  prompt before surfacing an error.
- The frontend never blocks indefinitely: every network call is wrapped in
  try/catch, and the processing screen clearly communicates that long
  recordings can take up to a minute.

## Live Red-Flag Danger Pattern Detection

The system includes a **real-time clinical safety monitor** that evaluates streaming transcripts during live consultations to alert the physician immediately if dangerous symptom combinations occur — **during the consultation, before the patient leaves the room**.

### ⚠️ Critical Safety Framing & Clinical Disclaimer

> **ADVISORY FLAG ONLY — NOT A DIAGNOSIS. Clinical judgment remains with the doctor.**
>
> This feature is a rule-based, deterministic pattern-matching advisory aid designed solely to surface potential symptom clusters for immediate physician attention. It is **not** a diagnostic tool, **not** an autonomous clinical decision-making system, and **never a substitute for clinical judgment**.
> 
> To prevent medical hallucinations or overconfident claims, **an LLM is NOT used for open-ended risk assessment**. Detection is strictly bounded to the curated clinical pattern library defined in `red_flag_detector.py`.

### How It Works

1. **Zero Added Latency**: As the WebSocket streams `transcript.final` segments from Sarvam STT, the backend runs a lightweight pattern-matcher against the accumulated session transcript.
2. **Session Deduplication**: An in-memory tracker per consultation session ensures a pattern triggers an alert at most once per consultation.
3. **Stacked Urgent UI**: When an alert fires, a prominent crimson alert banner visually interrupts at the top of the live screen with:
   - Pattern name and severity rating
   - Emergency action guidance
   - Highlighted triggered keyword clusters
   - An "Acknowledge" button (retains banner until physician explicitly dismisses it)
   - Persistent safety disclaimer
4. **Code-Mixed Multilingual Support**: Keyword clusters match symptoms across **English**, **Hindi / Hinglish**, and **Tamil / Tanglish** code-mixed phrasing.

### Curated Danger Patterns

| Pattern ID | Clinical Condition | Trigger Combination | Required Clusters |
|---|---|---|---|
| `cardiac_emergency` | **Possible Cardiac Emergency** | Chest pain + (SOB OR diaphoresis OR radiating pain) | 2 clusters: Cluster A (Chest Pain) + at least 1 from Cluster B (SOB, Sweating, Radiating) |
| `stroke_fast` | **Possible Acute Stroke (FAST)** | Unilateral weakness/numbness + slurred speech + confusion | 3 clusters: Cluster A (Weakness/Numbness) + Cluster B (Slurred Speech) + Cluster C (Altered Mental State) |
| `severe_allergic_reaction`| **Possible Severe Allergic Reaction (Anaphylaxis)** | Respiratory distress + angioedema + cutaneous rash | 3 clusters: Cluster A (Difficulty Breathing) + Cluster B (Swelling) + Cluster C (Rash / Hives) |
| `sepsis_severe_infection` | **Possible Sepsis / Severe Infection** | High fever + altered mental state + tachycardia / tachypnea | 3 clusters: Cluster A (Fever / Chills) + Cluster B (Confusion / Lethargy) + Cluster C (Tachycardia / Rapid Breathing) |
| `diabetic_emergency` | **Possible Diabetic Emergency (DKA / Hypoglycemia)** | Altered sensorium / dizziness + known diabetes + osmotic symptoms / diaphoresis | 3 clusters: Cluster A (Confusion / Dizziness) + Cluster B (Known Diabetic) + Cluster C (Extreme Thirst / Sweating) |

### Testing & Verification Guide

You can verify the detector live via microphone speech or using the built-in simulator chips in the UI:

- **Cardiac Alert**: `"Doctor, I have severe chest pain and crushing discomfort radiating to left arm with extreme shortness of breath and cold sweating."`
- **Stroke Alert**: `"Family noticed sudden weakness on left side of body, slurred speech, and acute disorientation and confusion."`
- **Anaphylaxis Alert**: `"Severe difficulty breathing with acute swelling of lips and face accompanied by generalized rash."`
- **Sepsis Alert**: `"High fever 103F, rapid heartbeat tachycardia, accompanied by severe acute confusion and disorientation."`
- **Diabetic Alert**: `"Known diabetic patient presenting with extreme dizziness, confusion, and excessive unquenchable thirst."`

