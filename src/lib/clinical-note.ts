// Shared schema + helpers for the AI Clinical Documentation Assistant.
// Kept dependency-free so it can be imported from both server (API routes)
// and client (React form) code.

export interface ClinicalNote {
  chief_complaint: string;
  hpi: string;
  pmh: string;
  medications: string[];
  exam_findings: string;
  plan: string;
}

export const EMPTY_CLINICAL_NOTE: ClinicalNote = {
  chief_complaint: "",
  hpi: "",
  pmh: "",
  medications: [],
  exam_findings: "",
  plan: "",
};

export interface ClinicalNoteFieldDef {
  key: keyof ClinicalNote;
  label: string;
  help: string;
  multiline: boolean;
  isList: boolean;
}

// Drives the editable form on the frontend — one entry per schema key.
export const CLINICAL_NOTE_FIELDS: ClinicalNoteFieldDef[] = [
  {
    key: "chief_complaint",
    label: "Chief Complaint",
    help: "The main reason the patient came in today.",
    multiline: false,
    isList: false,
  },
  {
    key: "hpi",
    label: "History of Present Illness (HPI)",
    help: "Symptoms, onset, duration, and context.",
    multiline: true,
    isList: false,
  },
  {
    key: "pmh",
    label: "Past Medical History (PMH)",
    help: "Prior conditions, surgeries, or chronic illnesses mentioned.",
    multiline: true,
    isList: false,
  },
  {
    key: "medications",
    label: "Medications",
    help: "One medication per line, as mentioned in the consultation.",
    multiline: true,
    isList: true,
  },
  {
    key: "exam_findings",
    label: "Exam Findings",
    help: "Physical exam findings or vitals mentioned by the clinician.",
    multiline: true,
    isList: false,
  },
  {
    key: "plan",
    label: "Plan",
    help: "Treatment plan, prescriptions, and follow-up instructions.",
    multiline: true,
    isList: false,
  },
];

/** Defensively coerces an arbitrary parsed JSON value into a well-formed ClinicalNote. */
/** Defensively coerces an arbitrary parsed JSON value into a well-formed ClinicalNote. */
export function normalizeClinicalNote(value: unknown): ClinicalNote {
  if (!value) return { ...EMPTY_CLINICAL_NOTE };

  let raw = value;
  if (Array.isArray(raw) && raw.length > 0) {
    raw = raw[0];
  }

  let record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Unwrap common wrapper keys (e.g. { note: { ... } }, { clinical_note: { ... } })
  const wrapperKeys = ["clinical_note", "note", "data", "result", "response", "output"];
  for (const k of wrapperKeys) {
    if (record[k] && typeof record[k] === "object" && !Array.isArray(record[k])) {
      record = record[k] as Record<string, unknown>;
      break;
    }
  }

  // Create a normalized lookup map with lowercase, stripped keys
  const lookup: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const normKey = k.toLowerCase().replace(/[\s_-]+/g, "");
    lookup[normKey] = v;
  }

  const findValue = (...aliases: string[]): unknown => {
    for (const a of aliases) {
      if (a in record && record[a] !== undefined && record[a] !== null) return record[a];
      const norm = a.toLowerCase().replace(/[\s_-]+/g, "");
      if (norm in lookup && lookup[norm] !== undefined && lookup[norm] !== null) return lookup[norm];
    }
    return "";
  };

  const toStr = (v: unknown): string => {
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return v.map(String).join(", ").trim();
    if (v && typeof v === "object") return JSON.stringify(v);
    return "";
  };

  const toList = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v.map((item) => (typeof item === "string" ? item.trim() : String(item))).filter(Boolean);
    }
    if (typeof v === "string" && v.trim()) {
      return v
        .split(/\r?\n|•|-|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  return {
    chief_complaint: toStr(findValue("chief_complaint", "chiefComplaint", "Chief Complaint", "chief_complaints", "reason_for_visit")),
    hpi: toStr(findValue("hpi", "HPI", "history_of_present_illness", "historyOfPresentIllness", "history")),
    pmh: toStr(findValue("pmh", "PMH", "past_medical_history", "pastMedicalHistory", "past_history")),
    medications: toList(findValue("medications", "Medications", "meds", "current_medications", "prescriptions")),
    exam_findings: toStr(findValue("exam_findings", "examFindings", "Exam Findings", "physical_exam", "vitals", "examination")),
    plan: toStr(findValue("plan", "Plan", "treatment_plan", "treatmentPlan", "assessment_and_plan", "assessment")),
  };
}

export class ApiConfigError extends Error {}
export class UpstreamApiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
