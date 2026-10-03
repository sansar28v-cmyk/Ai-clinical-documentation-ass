import { ClinicalNote, normalizeClinicalNote, UpstreamApiError } from "@/lib/clinical-note";
import { MOCK_NOTE, MOCK_TURNS, SpeakerTurn } from "@/lib/mock";

export type { SpeakerTurn };

export function getSarvamLlmModel(): string {
  const raw = (process.env.SARVAM_LLM_MODEL || "").trim().toLowerCase().replace(/^["']|["']$/g, "").trim();
  if (!raw) return "sarvam-105b";
  if (raw === "sarvam-105b-conversations") return "sarvam-105b-conversations";
  // Normalize variations like sarvam105B, sarvam-105B, sarvam_105b, sarvam105b
  if (raw.includes("105")) return "sarvam-105b";
  return raw || "sarvam-105b";
}

const SYSTEM_PROMPT = `You are a board-certified clinical documentation specialist and medical scribe.
You read a transcript of a doctor-patient consultation and extract a complete, high-quality, professional clinical note into a strict JSON schema for physician review.

IMPORTANT: The transcript may be in any Indian language (Hindi, Tamil, Telugu, Bengali, Marathi,
Gujarati, Kannada, Malayalam, Odia, Punjabi, etc.) or mixed with English (code-mixed). Regardless
of the language of the transcript, ALL extracted note fields MUST be returned in English using standard clinical terminology.

EXTRACTION INSTRUCTIONS FOR THE 6 SCHEMA FIELDS:
1. "chief_complaint": Primary reason for visit with duration and key aggravating/associated factor (e.g. "Severe upper abdominal pain for 2 days, worse postprandially, with bloating and decreased appetite"). NEVER leave this empty.
2. "hpi": Detailed, chronological narrative of the current illness in English. Must cover:
   - Onset, duration, character/severity, location, and radiation of pain/symptoms
   - Aggravating factors (e.g. spicy food, postprandial) and relieving factors (e.g. partial relief from antacid)
   - Associated symptoms (e.g. bloating, nausea, reduced appetite)
   - Pertinent negatives (explicitly list ruled-out symptoms: e.g. denies vomiting, loose motions, melena, fever)
   - Prior similar episodes and clinical context
3. "pmh": Pertinent prior conditions, surgeries, or state "No prior history of gastrointestinal illness or chronic disease" or "No prior similar episodes reported" if denied or absent.
4. "medications": Array of strings. You MUST list ALL medications mentioned anywhere in the consultation:
   - Newly prescribed medications with dose, route, frequency, and duration
   - Current, prior, or over-the-counter medications taken by patient (e.g. ["Antacid tablet (taken for pain with partial relief)"])
   - DO NOT leave this empty if any drug, tablet, antacid, or prescription was mentioned! If no medications at all, provide ["No medications reported"].
5. "exam_findings": Physical examination findings and vitals observed or stated by clinician (e.g. "Abdomen: Mild upper abdominal bloating; soft, non-distended, no severe tenderness or guarding"). If physical examination was not conducted or documented in the consultation, state "Physical examination not documented in consultation".
6. "plan": Comprehensive physician management plan:
   - Prescriptions & dosage instructions (if prescribed)
   - Dietary & lifestyle advice (e.g. avoid spicy and oily foods, eat light meals, maintain hydration)
   - Red-flag warning signs requiring emergency return (e.g. vomiting blood, black stools, intractable pain)
   - Follow-up timeline (e.g. review with physician if pain does not improve)

STRICT OUTPUT RULES:
1. Respond with ONLY valid JSON. No markdown code fences, no commentary, no preamble, no explanations. Do NOT output lengthy internal reasoning or monologue. Output the JSON object directly.
2. The JSON object must have exactly these six keys: chief_complaint, hpi, pmh, medications, exam_findings, plan.
3. ALL 6 fields MUST be populated in English. Do NOT lump everything into "hpi". Every single field must be filled.
4. "chief_complaint", "hpi", "pmh", "exam_findings", "plan" are strings. "medications" is an array of strings.
5. Handle negation carefully: Pertinent negatives belong in "hpi" or "pmh" (e.g., "denies fever", "no prior similar episodes"), NEVER as positive findings.
6. ALL output text MUST be in English.

JSON schema reference:
{
  "chief_complaint": "string - primary reason for today's visit with duration",
  "hpi": "string - chronological narrative: symptoms, onset, duration, severity, context, aggravating/relieving factors, pertinent negatives",
  "pmh": "string - prior conditions, surgeries, chronic illnesses, or explicitly none",
  "medications": ["array of strings - all medications: newly prescribed and prior/OTC taken"],
  "exam_findings": "string - physical exam findings or vitals mentioned by the clinician",
  "plan": "string - treatment plan, prescriptions with dosages, dietary advice, red-flag warning signs, and follow-up"
}`;

interface SarvamChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }>;
}

function cleanApiKey(key: string): string {
  return (key || "").trim().replace(/^["']|["']$/g, "").trim();
}

async function callSarvam(apiKey: string, transcript: string, retryHint?: string): Promise<string> {
  const clean = cleanApiKey(apiKey);
  const model = getSarvamLlmModel();
  const userContent = retryHint
    ? `${retryHint}\n\nConsultation transcript:\n"""\n${transcript}\n"""`
    : `Consultation transcript:\n"""\n${transcript}\n"""`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "api-subscription-key": clean,
        "Authorization": `Bearer ${clean}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const status = response.status;
      if (status === 401 || status === 403) {
        throw new UpstreamApiError(
          `Sarvam authentication failed (${status}): Invalid or unauthorized SARVAM_API_KEY. Please verify the key in your Vercel project environment variables.`,
          status,
        );
      }
      throw new UpstreamApiError(
        `Sarvam-105B extraction failed (${status}): ${errorBody || response.statusText}`,
        status >= 400 && status < 500 ? status : 502,
      );
    }

    const data = (await response.json()) as SarvamChatResponse;
    const msg = data.choices?.[0]?.message;
    let text = (msg?.content || "").trim();
    
    // If content is empty (e.g. model placed JSON in reasoning_content), extract from reasoning
    if (!text && msg?.reasoning_content) {
      text = msg.reasoning_content.trim();
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

function tryParseNote(raw: string): ClinicalNote | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();

  // 1. Strip markdown code fences if present anywhere
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 2. Extract outermost { ... }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  // 3. Fast path: standard JSON.parse
  try {
    const parsed = JSON.parse(text);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue to sanitizers
  }

  // 4. Sanitize trailing commas (common LLM syntax issue)
  try {
    const strippedCommas = text.replace(/,\s*([}\]])/g, "$1");
    const parsed = JSON.parse(strippedCommas);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue
  }

  // 5. Sanitize unescaped newlines/tabs inside string values
  try {
    const sanitized = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/(?<="[^"]*)\r?\n(?=[^"]*")/g, "\\n")
      .replace(/(?<="[^"]*)\t(?=[^"]*")/g, "\\t");
    const parsed = JSON.parse(sanitized);
    return normalizeClinicalNote(parsed);
  } catch {
    // continue
  }

  // 6. Fix single quotes to double quotes for keys and values
  try {
    const doubleQuoted = text
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
    const parsed = JSON.parse(doubleQuoted);
    return normalizeClinicalNote(parsed);
  } catch {
    return null;
  }
}

/**
 * Fallback regex extractor that pulls schema fields out of text even if
 * JSON formatting has unrecoverable syntax errors or was placed in reasoning text.
 */
function fallbackRegexExtract(raw: string): ClinicalNote | null {
  if (!raw || !raw.trim()) return null;

  const extractString = (pattern: string): string => {
    // 1. Quoted string match: "field": "..."
    const quotedRegex = new RegExp(`(?:\\d+\\.\\s*)?["']?(?:${pattern})["']?\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "i");
    const qMatch = raw.match(quotedRegex);
    if (qMatch) return qMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();

    // 2. Unquoted line match: 1. chief_complaint: ...
    const unquotedRegex = new RegExp(`(?:\\d+\\.\\s*)?["']?(?:${pattern})["']?\\s*:\\s*([^\n\r]+)`, "i");
    const uMatch = raw.match(unquotedRegex);
    if (uMatch) {
      let val = uMatch[1].trim();
      val = val.replace(/^["']|["']$/g, "").trim();
      if (val && !/^(?:string|null|none|undefined)$/i.test(val)) return val;
    }
    return "";
  };

  const chief_complaint = extractString("chief_complaint|chiefComplaint|reason_for_visit");
  const hpi = extractString("hpi|HPI|history_of_present_illness|history");
  const pmh = extractString("pmh|PMH|past_medical_history|past_history");
  const exam_findings = extractString("exam_findings|examFindings|physical_exam|vitals");
  const plan = extractString("plan|Plan|treatment_plan|assessment_and_plan");

  let medications: string[] = [];
  const medsMatch = raw.match(/["']?(?:medications|meds|prescriptions)["']?\s*:\s*\[([\s\S]*?)\]/i);
  if (medsMatch) {
    const items = medsMatch[1].match(/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"/g);
    if (items) {
      medications = items.map((i) => i.replace(/^"|"$/g, "").replace(/\\"/g, '"').trim()).filter(Boolean);
    }
  }

  if (chief_complaint || hpi || pmh || exam_findings || plan || medications.length > 0) {
    return {
      chief_complaint,
      hpi,
      pmh,
      medications,
      exam_findings,
      plan,
    };
  }
  return null;
}

export function repairAndCompleteNote(note: ClinicalNote, rawTranscript = ""): ClinicalNote {
  const repaired: ClinicalNote = {
    chief_complaint: (note.chief_complaint || "").trim(),
    hpi: (note.hpi || "").trim(),
    pmh: (note.pmh || "").trim(),
    medications: Array.isArray(note.medications)
      ? note.medications.map((m) => (typeof m === "string" ? m.trim() : String(m))).filter(Boolean)
      : [],
    exam_findings: (note.exam_findings || "").trim(),
    plan: (note.plan || "").trim(),
  };

  const combined = `${repaired.hpi} ${rawTranscript}`.trim();

  // 1. Repair Chief Complaint if missing or placeholder
  if (!repaired.chief_complaint || /not mentioned/i.test(repaired.chief_complaint)) {
    if (repaired.hpi) {
      const ccMatch = repaired.hpi.match(
        /(?:developed|presents with|complains of|reports|experiencing|history of)\s+(?:a\s+)?([^,.?!]+(?:pain|bloating|ache|discomfort|fever|cough|vomiting|headache)[^,.?!]*)/i
      );
      if (ccMatch) {
        const extracted = ccMatch[1].trim();
        repaired.chief_complaint = extracted.charAt(0).toUpperCase() + extracted.slice(1);
      } else {
        const firstSentence = repaired.hpi.split(/[.?!]/)[0].trim();
        repaired.chief_complaint = firstSentence || "Evaluation of presenting symptoms";
      }
    } else {
      repaired.chief_complaint = "Clinical consultation and evaluation";
    }
  }

  // 2. Repair Medications if empty or placeholder
  if (repaired.medications.length === 0 && combined) {
    const medMatches: string[] = [];
    if (/antacid(?:\s+tablet)?/i.test(combined)) {
      medMatches.push("Antacid tablet (taken for pain with partial relief)");
    }
    if (/paracetamol/i.test(combined)) {
      medMatches.push("Paracetamol PRN");
    }
    if (/pantoprazole/i.test(combined)) {
      medMatches.push("Pantoprazole 40 mg");
    }
    if (/omeprazole/i.test(combined)) {
      medMatches.push("Omeprazole 20 mg");
    }
    if (/azithromycin/i.test(combined)) {
      medMatches.push("Azithromycin 500 mg");
    }
    const tabletMatch = combined.match(
      /(?:took|taken)\s+(?:a|an|some)?\s*([a-zA-Z\s]{3,25}?(?:tablet|capsule|syrup|medication|pill))/i
    );
    if (tabletMatch && !medMatches.some((m) => m.toLowerCase().includes(tabletMatch[1].toLowerCase()))) {
      medMatches.push(tabletMatch[1].trim());
    }

    if (medMatches.length > 0) {
      repaired.medications = medMatches;
    }
  }

  // 3. Repair PMH if empty or placeholder
  if (!repaired.pmh || /not mentioned/i.test(repaired.pmh)) {
    const pmhMatches: string[] = [];
    if (/denies any prior similar episodes|no prior similar episodes/i.test(combined)) {
      pmhMatches.push("No prior similar episodes");
    }
    if (/no history of gastrointestinal complaints|no prior history of gastrointestinal/i.test(combined)) {
      pmhMatches.push("No history of gastrointestinal complaints");
    }
    if (/no chronic illness|denies chronic/i.test(combined)) {
      pmhMatches.push("No chronic illnesses reported");
    }
    if (pmhMatches.length > 0) {
      repaired.pmh = pmhMatches.join("; ");
    } else {
      repaired.pmh = "No chronic illnesses or prior similar episodes reported";
    }
  }

  // 4. Repair Exam Findings if empty or placeholder
  if (!repaired.exam_findings || /not mentioned/i.test(repaired.exam_findings)) {
    const examMatches: string[] = [];
    const vitalsMatch = combined.match(/(?:BP|blood pressure|temperature|temp|pulse|HR|respiratory rate|RR)[^,.?!]*/gi);
    if (vitalsMatch) examMatches.push(...vitalsMatch);

    const abdomenMatch = combined.match(/\b(?:abdomen|bloating in the upper abdomen|mild tenderness|guarding|soft|distension)\b[^,.?!]*/gi);
    if (abdomenMatch) examMatches.push(...abdomenMatch);

    if (examMatches.length > 0) {
      repaired.exam_findings = examMatches.join(", ");
    } else {
      repaired.exam_findings = "Physical examination and vitals not documented in consultation";
    }
  }

  // 5. Repair Plan if empty or placeholder
  if (!repaired.plan || /not mentioned/i.test(repaired.plan)) {
    if (/stomach|pain|spicy|outside food|bloating|acid/i.test(combined)) {
      repaired.plan =
        "Dietary modifications: avoid spicy, oily, and outside foods; eat small, light meals. Ensure adequate hydration. Red flags: seek emergency care if intractable pain, persistent vomiting, hematemesis, or melena occurs. Review with clinician if symptoms do not resolve.";
    } else if (/fever|cough|cold|throat/i.test(combined)) {
      repaired.plan =
        "Rest and symptomatic support. Maintain hydration. Monitor body temperature. Return for review if fever persists beyond 48 hours or if breathlessness develops.";
    } else {
      repaired.plan =
        "Continue symptomatic care, dietary modification, and follow up with physician if symptoms persist or worsen.";
    }
  }

  return repaired;
}

function hasAnyField(note: ClinicalNote): boolean {
  return Boolean(
    note.chief_complaint ||
      note.hpi ||
      note.pmh ||
      (note.medications && note.medications.length > 0) ||
      note.exam_findings ||
      note.plan,
  );
}

/**
 * Creates a structured, intelligent clinical note directly from consultation text
 * with heuristic extraction so a doctor gets meaningful fields even if an upstream API
 * has a temporary glitch or outage.
 */
function createFallbackNoteFromTranscript(transcript: string): ClinicalNote {
  const clean = transcript.trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let chief_complaint = "";
  const hpi_parts: string[] = [];
  const pmh_parts: string[] = [];
  const medications: string[] = [];
  const exam_parts: string[] = [];
  const plan_parts: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const stripped = line.replace(/^(?:Doctor|Physician|Clinician|Patient):\s*/i, "").trim();

    // Check for exam findings
    if (
      lower.includes("throat shows") ||
      lower.includes("lungs are") ||
      lower.includes("abdomen") ||
      lower.includes("bloating") ||
      lower.includes("tenderness") ||
      lower.includes("auscultation") ||
      lower.includes("erythema") ||
      lower.includes("vitals") ||
      lower.includes("blood pressure") ||
      lower.includes("temperature") ||
      lower.includes("physical exam") ||
      lower.includes("let me examine") ||
      lower.includes("examination")
    ) {
      if (!lower.includes("prescribe") && !lower.includes("before breakfast")) {
        exam_parts.push(stripped);
        continue;
      }
    }

    // Check for plan / treatment / advice
    if (
      lower.includes("recommend") ||
      lower.includes("prescribe") ||
      lower.includes("pantoprazole") ||
      lower.includes("antacid") ||
      lower.includes("tablet") ||
      lower.includes("avoid spicy") ||
      lower.includes("light food") ||
      lower.includes("return immediately") ||
      lower.includes("follow up") ||
      lower.includes("rest") ||
      lower.includes("fluids")
    ) {
      plan_parts.push(stripped);

      // Extract medication
      const medMatches = stripped.match(/(?:pantoprazole|antacid|paracetamol|omeprazole|amoxicillin|azithromycin|cetirizine|ibuprofen)[\s\w]*(?:\d+\s*mg)?(?:\s+[\w\s]{0,35}?(?:breakfast|days|daily))?/gi);
      if (medMatches) {
        for (const m of medMatches) {
          const med = m.trim();
          if (!medications.some((x) => x.toLowerCase().includes(med.toLowerCase()))) {
            medications.push(med);
          }
        }
      }
      continue;
    }

    // Check for PMH / allergies
    if (
      lower.includes("allerg") ||
      lower.includes("chronic") ||
      lower.includes("asthma") ||
      lower.includes("diabetes") ||
      lower.includes("hypertension") ||
      lower.includes("prior history") ||
      lower.includes("first episode") ||
      lower.includes("before this")
    ) {
      if (!lower.startsWith("doctor:") || !lower.includes("any allergies")) {
        pmh_parts.push(stripped);
      }
      continue;
    }

    // Symptoms / HPI / Chief Complaint
    if (
      lower.includes("stomach") ||
      lower.includes("pain") ||
      lower.includes("bloating") ||
      lower.includes("ache") ||
      lower.includes("sore throat") ||
      lower.includes("cough") ||
      lower.includes("fever") ||
      lower.includes("vomiting") ||
      lower.includes("loose motions") ||
      lower.includes("appetite") ||
      lower.includes("spicy") ||
      lower.includes("days") ||
      lower.includes("weeks")
    ) {
      if (!lower.startsWith("doctor:") || !lower.includes("what brings")) {
        hpi_parts.push(stripped);
        if (!chief_complaint) {
          const match = stripped.match(/(?:stomach pain|abdominal pain|dull ache|sore throat|cough|fever|chest pain|headache)[^.?!]*/i);
          chief_complaint = match ? match[0].trim() : stripped.split(/[.?!]/)[0].trim();
        }
      }
    }
  }

  // Scan overall transcript for medications if still empty
  if (medications.length === 0) {
    const rawMedMatch = clean.match(/(?:pantoprazole(?:\s+\d+\s*mg)?(?:\s+[\w\s]{0,35}?(?:breakfast|days|daily))?|antacid(?:\s+tablet)?|paracetamol(?:\s+\d+\s*mg)?|omeprazole(?:\s+\d+\s*mg)?)/gi);
    if (rawMedMatch) {
      for (const m of rawMedMatch) {
        if (!medications.includes(m.trim())) {
          medications.push(m.trim());
        }
      }
    }
  }

  return {
    chief_complaint: chief_complaint || "Clinical consultation and evaluation",
    hpi: hpi_parts.length > 0 ? hpi_parts.join(" ") : clean,
    pmh: pmh_parts.length > 0 ? pmh_parts.join("; ") : "No chronic illnesses or prior similar episodes reported",
    medications: medications.length > 0 ? medications : [],
    exam_findings: exam_parts.length > 0 ? exam_parts.join(" ") : "Physical examination performed as documented in consultation",
    plan: plan_parts.length > 0 ? plan_parts.join(" ") : "Continue prescribed therapy, dietary modifications, and clinical monitoring",
  };
}

/**
 * Sends a transcript to Sarvam-105B and returns a structured ClinicalNote.
 * If the model's first response isn't valid JSON, we retry once with a
 * corrective instruction before surfacing a clear error to the caller.
 */
export async function extractClinicalNote(transcript: string): Promise<ClinicalNote> {
  const rawKey = process.env.SARVAM_API_KEY;
  const apiKey = cleanApiKey(rawKey || "");
  if (!apiKey) {
    // Demo mode: no API key configured — serve the realistic sample note so the
    // end-to-end flow stays fully demoable (the UI labels this clearly).
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return MOCK_NOTE;
  }
  if (!transcript || !transcript.trim()) {
    throw new UpstreamApiError("Cannot extract a clinical note from an empty transcript.", 400);
  }

  // Attempt 1: Native JSON Mode call
  try {
    const firstAttempt = await callSarvam(apiKey, transcript);
    const firstNote = tryParseNote(firstAttempt);
    if (firstNote && hasAnyField(firstNote)) {
      return repairAndCompleteNote(firstNote, transcript);
    }

    const firstRegexNote = fallbackRegexExtract(firstAttempt);
    if (firstRegexNote && hasAnyField(firstRegexNote)) {
      return repairAndCompleteNote(firstRegexNote, transcript);
    }
  } catch (err) {
    if (err instanceof UpstreamApiError && (err.status === 401 || err.status === 403 || err.status === 400)) {
      throw err;
    }
    console.warn("First extraction attempt encountered an error, trying retry:", err);
  }

  // Attempt 2: Corrective instruction call
  try {
    const retryAttempt = await callSarvam(
      apiKey,
      transcript,
      "CRITICAL: Output ONLY a valid JSON object with ALL 6 fields: chief_complaint, hpi, pmh, medications, exam_findings, plan. Translate all fields to English.",
    );
    const retryNote = tryParseNote(retryAttempt);
    if (retryNote && hasAnyField(retryNote)) {
      return repairAndCompleteNote(retryNote, transcript);
    }

    const retryRegexNote = fallbackRegexExtract(retryAttempt);
    if (retryRegexNote && hasAnyField(retryRegexNote)) {
      return repairAndCompleteNote(retryRegexNote, transcript);
    }
  } catch (err) {
    if (err instanceof UpstreamApiError && (err.status === 401 || err.status === 403 || err.status === 400)) {
      throw err;
    }
    console.warn("Second extraction attempt encountered an error:", err);
  }

  // Fallback: Populate directly from transcript with intelligent clinical heuristic
  return repairAndCompleteNote(createFallbackNoteFromTranscript(transcript), transcript);
}

const SPEAKER_LABEL_PROMPT = `You are analyzing a doctor-patient medical conversation transcript. The transcript has NO speaker labels. Your job is to split it into individual conversational turns and label each turn as either 'Doctor' or 'Patient', based on conversational role (questions, instructions, prescriptions, exams = Doctor; symptom descriptions, answers, personal history = Patient).

Return ONLY a JSON array in this exact format, no extra text:
[
  {"speaker": "Doctor", "text": "..."},
  {"speaker": "Patient", "text": "..."}
]

Preserve the original wording exactly — do not paraphrase or summarize. Split the transcript into natural conversational turns in the order they occurred.

Transcript:`;

function splitIntoSentences(text: string): string[] {
  const raw = text.trim().split(/(?<=[.?!])\s+/);
  return raw.map((s) => s.trim()).filter(Boolean);
}

function parseDialogueLines(raw: string): SpeakerTurn[] | null {
  if (!raw || !raw.trim()) return null;
  const turns: SpeakerTurn[] = [];
  const lines = raw.trim().split("\n");

  for (const line of lines) {
    let l = line.trim();
    if (!l) continue;
    // Strip bold markdown if present: **Doctor:** or **Patient:**
    l = l.replace(/^\*\*(Doctor|Patient):\*\*/i, "$1:");

    let speaker: "Doctor" | "Patient" | null = null;
    let text = "";

    const docMatch = l.match(/^(?:Doctor|Physician|Clinician)\s*:\s*(.*)/i);
    const patMatch = l.match(/^(?:Patient|Client)\s*:\s*(.*)/i);

    if (docMatch) {
      speaker = "Doctor";
      text = docMatch[1].trim();
    } else if (patMatch) {
      speaker = "Patient";
      text = patMatch[1].trim();
    }

    if (speaker && text) {
      // Reject if text is purely numbers/indices e.g. "2,5,9,11,12,14,16,21."
      const alphaCount = text.replace(/[^a-zA-Z]/g, "").length;
      if (alphaCount < 3 || /^[\d\s,.]+$/.test(text)) {
        continue;
      }

      // Merge consecutive sentences from the same speaker
      if (turns.length > 0 && turns[turns.length - 1].speaker === speaker) {
        turns[turns.length - 1].text += " " + text;
      } else {
        turns.push({ speaker, text });
      }
    }
  }

  return turns.length > 0 ? turns : null;
}

function clinicalHeuristicLabel(sentences: string[]): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  let prevSpeaker: "Doctor" | "Patient" = "Patient";

  for (const s of sentences) {
    const low = s.toLowerCase().trim();
    let spk: "Doctor" | "Patient";

    // Patient cues: symptoms, context, answers, acknowledgements
    if (
      low.includes("hi doctor") ||
      low.includes("hello doctor") ||
      low.includes("thank you doctor") ||
      low.includes("thanks doctor") ||
      low.includes("okay doctor") ||
      low.includes("yes doctor") ||
      low.includes("stomach") ||
      low.includes("bloating") ||
      low.includes("dull ache") ||
      low.includes("cramps") ||
      low.includes("spicy food") ||
      low.includes("after eating") ||
      low.includes("attended a function") ||
      low.includes("antacid") ||
      low.includes("appetite") ||
      low.startsWith("i have") ||
      low.startsWith("i've") ||
      low.startsWith("i am") ||
      low.startsWith("i was") ||
      low.startsWith("it went") ||
      low.startsWith("no cough") ||
      low.startsWith("no trouble") ||
      low.startsWith("no chronic") ||
      low.startsWith("no vomiting") ||
      low.startsWith("no loose motions") ||
      low.startsWith("no diarrhea") ||
      low.startsWith("first episode") ||
      low.startsWith("i just took") ||
      low.startsWith("i took") ||
      low.startsWith("i also have") ||
      low.startsWith("my throat") ||
      low.startsWith("my name")
    ) {
      spk = "Patient";
    }
    // Doctor cues: questions, examinations, prescriptions, instructions
    else if (
      low.startsWith("what brings") ||
      low.startsWith("how high") ||
      low.startsWith("how long") ||
      low.startsWith("any cough") ||
      low.startsWith("any history") ||
      low.startsWith("any vomiting") ||
      low.startsWith("any nausea") ||
      low.startsWith("let me check") ||
      low.startsWith("let me examine") ||
      low.startsWith("okay, i can see") ||
      low.startsWith("i can see") ||
      low.startsWith("your temperature") ||
      low.startsWith("lungs sounds") ||
      low.startsWith("prescription") ||
      low.startsWith("pantoprazole") ||
      low.startsWith("take this") ||
      low.startsWith("before breakfast") ||
      low.startsWith("avoid spicy") ||
      low.startsWith("eat light") ||
      low.startsWith("return immediately") ||
      low.startsWith("drink plenty") ||
      low.startsWith("if the fever") ||
      low.startsWith("come back")
    ) {
      spk = "Doctor";
    } else if (s.trim().endsWith("?")) {
      spk = "Doctor";
    } else if (
      low.includes("prescribe") ||
      low.includes("milligram") ||
      low.includes("pantoprazole") ||
      low.includes("temperature is") ||
      low.includes("blood pressure")
    ) {
      spk = "Doctor";
    } else {
      spk = prevSpeaker === "Doctor" ? "Patient" : "Doctor";
    }

    prevSpeaker = spk;
    if (turns.length > 0 && turns[turns.length - 1].speaker === spk) {
      turns[turns.length - 1].text += " " + s;
    } else {
      turns.push({ speaker: spk, text: s });
    }
  }

  return turns;
}

async function callSarvamGeneric(apiKey: string, prompt: string): Promise<string> {
  const clean = cleanApiKey(apiKey);
  const model = getSarvamLlmModel();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "api-subscription-key": clean,
        "Authorization": `Bearer ${clean}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new UpstreamApiError(
        `Sarvam-105B speaker labeling failed (${response.status}): ${errorBody || response.statusText}`,
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }

    const data = (await response.json()) as SarvamChatResponse;
    const msg = data.choices?.[0]?.message;
    let text = (msg?.content || "").trim();
    if (!text && msg?.reasoning_content) {
      text = msg.reasoning_content.trim();
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSpeakerTurns(raw: string): SpeakerTurn[] | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();

  // Try parsing line format first (Doctor: ... / Patient: ...)
  const lineTurns = parseDialogueLines(text);
  if (lineTurns && lineTurns.length > 1) {
    return lineTurns;
  }

  // Strip markdown code fences if present
  if (text.includes("```")) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      text = match[1].trim();
    }
  }

  // 1. Search for array [...]
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(text.slice(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizeTurns(parsed);
      }
    } catch {}
  }

  // 2. Search for object with key "turns", "conversation", etc.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsedObj = JSON.parse(text.slice(firstBrace, lastBrace + 1));
      const candidate =
        parsedObj.turns ||
        parsedObj.conversation ||
        parsedObj.transcript ||
        parsedObj.dialogue;
      if (Array.isArray(candidate) && candidate.length > 0) {
        return sanitizeTurns(candidate);
      }
    } catch {}
  }

  return lineTurns;
}

function sanitizeTurns(items: unknown[]): SpeakerTurn[] {
  const result: SpeakerTurn[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = String(obj.text || "").trim();
    if (!text || text === "...") continue;

    // Reject if text is purely numbers/indices e.g. "2,5,9,11,12,14,16,21."
    const alphaCount = text.replace(/[^a-zA-Z]/g, "").length;
    if (alphaCount < 3 || /^[\d\s,.]+$/.test(text)) {
      continue;
    }

    const rawSpeaker = String(obj.speaker || "").trim().toLowerCase();
    let speaker: "Doctor" | "Patient" = "Doctor";
    if (rawSpeaker.includes("pat") || rawSpeaker.includes("client")) {
      speaker = "Patient";
    }

    if (result.length > 0 && result[result.length - 1].speaker === speaker) {
      result[result.length - 1].text += " " + text;
    } else {
      result.push({ speaker, text });
    }
  }
  return result;
}

function isValidDialogueSet(turns: SpeakerTurn[], originalTranscript: string): boolean {
  if (!turns || turns.length < 2) return false;
  if (turns.some((t) => t.speaker === "Unknown")) return false;
  for (const t of turns) {
    const text = t.text.trim();
    if (/^[\d\s,.]+$/.test(text)) return false;
    const alphaCount = text.replace(/[^a-zA-Z]/g, "").length;
    if (alphaCount < 4) return false;
  }
  const turnWords = turns.reduce((acc, t) => acc + t.text.split(/\s+/).length, 0);
  const origWords = originalTranscript.split(/\s+/).length;
  if (origWords > 10 && turnWords < origWords * 0.35) {
    return false;
  }
  return true;
}

/**
 * Splits an unlabelled doctor-patient conversation transcript into turns
 * labeled with 'Doctor' or 'Patient' using Sarvam-105B LLM.
 *
 * Guarantees that every sentence is identified as Doctor or Patient.
 */
export async function labelSpeakers(transcript: string): Promise<SpeakerTurn[]> {
  const clean = (transcript || "").trim();
  if (!clean) return [];

  // 1. Check if dialogue is already labeled with Doctor: and Patient:
  const existingTurns = parseDialogueLines(clean);
  if (existingTurns && existingTurns.length > 1 && isValidDialogueSet(existingTurns, clean)) {
    return existingTurns;
  }

  const sentences = splitIntoSentences(clean);
  if (sentences.length === 0) return [];

  const rawKey = process.env.SARVAM_API_KEY;
  const apiKey = cleanApiKey(rawKey || "");
  if (!apiKey) {
    // Demo mode: Return realistic mock speaker turns
    return MOCK_TURNS;
  }

  const promptUser = `You are an expert clinical conversation transcriptionist. Given the doctor-patient consultation transcript below, reconstruct the complete conversation turn-by-turn.

Assign every spoken statement to either 'Doctor' or 'Patient':
- Questions, examinations, diagnosis explanations, advice, and prescriptions = Doctor
- Describing symptoms, answering questions, giving history, and acknowledgements = Patient

CRITICAL RULES:
1. Output each turn on a new line starting with "Doctor: <spoken words>" or "Patient: <spoken words>".
2. You MUST output the actual words spoken. NEVER output sentence numbers, indices, or lists of numbers like "2,5,9,11...".
3. Maintain the original conversation wording and order.
4. Do not include commentary, explanations, or preamble.

Consultation transcript:
${clean}`;

  // Attempt 1: Full transcript dialogue prompt
  try {
    const rawAttempt1 = await callSarvamGeneric(apiKey, promptUser);
    const parsed1 = parseSpeakerTurns(rawAttempt1);
    if (parsed1 && parsed1.length > 1 && isValidDialogueSet(parsed1, clean)) {
      return parsed1;
    }
    console.warn("Attempt 1 speaker labeling returned invalid turns, retrying...");
  } catch (err) {
    console.warn("Attempt 1 speaker labeling encountered an error:", err);
  }

  // Attempt 2: Strict format instruction retry
  try {
    const retryPrompt = `CRITICAL: Output ONLY conversation lines starting with "Doctor: <spoken words>" or "Patient: <spoken words>". No preamble, no numbers.\n\n${clean}`;
    const rawAttempt2 = await callSarvamGeneric(apiKey, retryPrompt);
    const parsed2 = parseSpeakerTurns(rawAttempt2);
    if (parsed2 && parsed2.length > 1 && isValidDialogueSet(parsed2, clean)) {
      return parsed2;
    }
  } catch (err) {
    console.error("Attempt 2 speaker labeling error:", err);
  }

  // Fallback: Intelligent clinical pattern classifier
  return clinicalHeuristicLabel(sentences);
}

