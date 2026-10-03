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

  const chief_complaint = toStr(findValue("chief_complaint", "chiefComplaint", "Chief Complaint", "chief_complaints", "reason_for_visit"));
  const hpi = toStr(findValue("hpi", "HPI", "history_of_present_illness", "historyOfPresentIllness", "history"));
  const pmh = toStr(findValue("pmh", "PMH", "past_medical_history", "pastMedicalHistory", "past_history"));
  let medications = toList(findValue("medications", "Medications", "meds", "current_medications", "prescriptions", "drugs"));
  const exam_findings = toStr(findValue("exam_findings", "examFindings", "Exam Findings", "physical_exam", "vitals", "examination"));
  const plan = toStr(findValue("plan", "Plan", "treatment_plan", "treatmentPlan", "assessment_and_plan", "assessment"));

  // If the model left medications empty, extract any mentioned in plan or hpi
  if (medications.length === 0) {
    medications = extractMedicationsFromClinicalText(plan, hpi);
  }

  return {
    chief_complaint,
    hpi,
    pmh,
    medications,
    exam_findings,
    plan,
  };
}

function extractMedicationsFromClinicalText(...texts: string[]): string[] {
  const combined = texts.filter(Boolean).join(". ");
  if (!combined.trim()) return [];

  const found: string[] = [];

  // 1. Explicit prescriptions (e.g. "Prescription of Pantoprazole 40 mg before breakfast for 5 days")
  const presRegex = /(?:prescription of|prescrib(?:ed|e|ing)|start|take|ordered)\s+([A-Za-z0-9\s-]{3,60}?(?:\d+\s*(?:mg|g|ml))?[\w\s]{0,40}?(?:for\s+\d+\s+days|before breakfast|after food|daily|twice daily|od|bd|tid)?)(?=[,.;]|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = presRegex.exec(combined)) !== null) {
    const item = match[1].trim();
    if (item.length > 3 && !found.some((f) => f.toLowerCase().includes(item.toLowerCase()))) {
      found.push(item);
    }
  }

  // 2. Common clinical medications & OTCs
  const commonMeds = [
    /(?:pantoprazole(?:\s+\d+\s*mg)?(?:\s+[\w\s]{0,35}?(?:breakfast|days|daily))?)/i,
    /(?:antacid(?:\s+tablet)?)/i,
    /(?:omeprazole(?:\s+\d+\s*mg)?)/i,
    /(?:paracetamol(?:\s+\d+\s*mg)?)/i,
    /(?:amoxicillin(?:\s+\d+\s*mg)?)/i,
    /(?:azithromycin(?:\s+\d+\s*mg)?)/i,
    /(?:ibuprofen(?:\s+\d+\s*mg)?)/i,
    /(?:cetirizine(?:\s+\d+\s*mg)?)/i,
    /(?:metformin(?:\s+\d+\s*mg)?)/i,
    /(?:lisinopril(?:\s+\d+\s*mg)?)/i,
    /(?:aspirin(?:\s+\d+\s*mg)?)/i,
    /(?:dicyclomine(?:\s+\d+\s*mg)?)/i,
    /(?:ranitidine(?:\s+\d+\s*mg)?)/i,
  ];

  for (const regex of commonMeds) {
    const m = combined.match(regex);
    if (m) {
      const drug = m[0].trim();
      if (!found.some((f) => f.toLowerCase().includes(drug.toLowerCase()))) {
        found.push(drug);
      }
    }
  }

  return found;
}

export class ApiConfigError extends Error {}
export class UpstreamApiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
