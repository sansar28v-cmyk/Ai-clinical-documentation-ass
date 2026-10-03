import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface StoredUser {
  id: number;
  username: string;
  passwordHash: string;
  fullName: string;
  role: "doctor";
  createdAt: string;
}

export interface StoredConsultation {
  id: number;
  doctor_id: number;
  patient_name: string;
  doctor_name?: string;
  transcript: string;
  turns: Array<{ speaker: string; text: string }>;
  note: Record<string, any>;
  translated_plan?: string | null;
  created_at: string;
  share_token?: string;
  share_token_expires_at?: string;
  detected_language?: string;
}

const STORE_FILE = process.env.VERCEL
  ? "/tmp/clinical_store.json"
  : path.join(process.cwd(), "clinical_store.json");

// Global in-memory storage preserved across invocations in serverless runtime instance
const globalForStore = globalThis as unknown as {
  _users?: StoredUser[];
  _consultations?: StoredConsultation[];
  _userIdCounter?: number;
  _consultationIdCounter?: number;
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, originalHash] = stored.split(":");
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === originalHash;
  } catch {
    return false;
  }
}

function getDefaultUsers(): StoredUser[] {
  return [
    {
      id: 1,
      username: "doctor",
      passwordHash: hashPassword("doctor123"),
      fullName: "Dr. Sandeep V",
      role: "doctor",
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      username: "testdoc",
      passwordHash: hashPassword("password123"),
      fullName: "Dr. John Smith",
      role: "doctor",
      createdAt: new Date().toISOString(),
    },
    {
      id: 3,
      username: "dr_smith",
      passwordHash: hashPassword("password123"),
      fullName: "Dr. Sarah Jenkins",
      role: "doctor",
      createdAt: new Date().toISOString(),
    },
  ];
}

function saveStoreToFile() {
  try {
    const data = {
      users: globalForStore._users,
      consultations: globalForStore._consultations,
      userIdCounter: globalForStore._userIdCounter,
      consultationIdCounter: globalForStore._consultationIdCounter,
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Non-fatal if filesystem is restricted
  }
}

function initStore() {
  if (!globalForStore._users) {
    globalForStore._users = [];
  }
  if (!globalForStore._consultations) {
    globalForStore._consultations = [];
  }

  // Attempt to load from disk
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users) && parsed.users.length > 0) {
        globalForStore._users = parsed.users;
      }
      if (Array.isArray(parsed.consultations)) {
        globalForStore._consultations = parsed.consultations;
      }
      globalForStore._userIdCounter = parsed.userIdCounter || 10;
      globalForStore._consultationIdCounter = parsed.consultationIdCounter || 10;
    }
  } catch {
    // Fall back to defaults
  }

  // Ensure default seeded users are always present
  const currentUsers: StoredUser[] = globalForStore._users ?? [];
  globalForStore._users = currentUsers;
  const defaults = getDefaultUsers();
  for (const def of defaults) {
    const exists = currentUsers.some(
      (u) => u.username.toLowerCase() === def.username.toLowerCase()
    );
    if (!exists) {
      currentUsers.push(def);
    }
  }

  // Backfill share tokens for existing consultations if absent
  if (Array.isArray(globalForStore._consultations)) {
    for (const c of globalForStore._consultations) {
      if (!c.share_token) {
        c.share_token = crypto.randomUUID();
        c.share_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        c.detected_language = c.detected_language || "en-IN";
      }
    }
  }

  if (!globalForStore._userIdCounter || globalForStore._userIdCounter < 10) {
    globalForStore._userIdCounter = 10;
  }
  if (!globalForStore._consultationIdCounter) {
    globalForStore._consultationIdCounter = 1;
  }
  saveStoreToFile();
}

initStore();

export function createToken(payload: Record<string, any>): string {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", "ai-clinical-secret-2026").update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac("sha256", "ai-clinical-secret-2026").update(data).digest("base64url");
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf-8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getUserByUsername(username: string): StoredUser | undefined {
  initStore();
  const clean = username.trim().toLowerCase();
  return globalForStore._users?.find((u) => u.username.toLowerCase() === clean);
}

export function getUserById(id: number): StoredUser | undefined {
  initStore();
  return globalForStore._users?.find((u) => u.id === id);
}

export function createUser(username: string, password: string, fullName: string): StoredUser {
  initStore();
  const clean = username.trim();
  const newUser: StoredUser = {
    id: globalForStore._userIdCounter!++,
    username: clean,
    passwordHash: hashPassword(password),
    fullName: fullName.trim(),
    role: "doctor",
    createdAt: new Date().toISOString(),
  };
  globalForStore._users!.push(newUser);
  saveStoreToFile();
  return newUser;
}

export function createConsultation(
  doctorId: number,
  doctorName: string,
  patientName: string,
  transcript: string,
  turns: Array<{ speaker: string; text: string }>,
  note: Record<string, any>,
  translatedPlan?: string | null,
  detectedLanguage?: string
): StoredConsultation {
  initStore();
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const shareToken = crypto.randomUUID();

  const newConsultation: StoredConsultation = {
    id: globalForStore._consultationIdCounter!++,
    doctor_id: doctorId,
    doctor_name: doctorName,
    patient_name: patientName.trim() || "Anita Roy",
    transcript: transcript.trim(),
    turns: turns || [],
    note: note || {},
    translated_plan: translatedPlan || null,
    created_at: new Date(now).toISOString(),
    share_token: shareToken,
    share_token_expires_at: expiresAt,
    detected_language: detectedLanguage || "en-IN",
  };
  globalForStore._consultations!.unshift(newConsultation);
  saveStoreToFile();
  return newConsultation;
}

export function getConsultationsForDoctor(doctorId: number): StoredConsultation[] {
  initStore();
  // Ensure share tokens exist on any retrieved consultation
  return (globalForStore._consultations?.filter((c) => c.doctor_id === doctorId) || []).map((c) => {
    if (!c.share_token) {
      c.share_token = crypto.randomUUID();
      c.share_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      saveStoreToFile();
    }
    return c;
  });
}

export function getConsultationById(id: number): StoredConsultation | undefined {
  initStore();
  const c = globalForStore._consultations?.find((c) => c.id === id);
  if (c && !c.share_token) {
    c.share_token = crypto.randomUUID();
    c.share_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    saveStoreToFile();
  }
  return c;
}

export interface PublicReportResult {
  consultation: StoredConsultation;
  isExpired: boolean;
}

export function getConsultationByShareToken(shareToken: string): PublicReportResult | null {
  initStore();
  if (!shareToken || typeof shareToken !== "string") return null;
  const clean = shareToken.trim().toLowerCase();
  const found = globalForStore._consultations?.find(
    (c) => c.share_token && c.share_token.toLowerCase() === clean
  );
  if (!found) return null;

  const isExpired = found.share_token_expires_at
    ? new Date(found.share_token_expires_at).getTime() < Date.now()
    : false;

  return {
    consultation: found,
    isExpired,
  };
}

