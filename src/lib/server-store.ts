import crypto from "crypto";

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
}

// Global in-memory storage preserved across invocations in serverless runtime instance
const globalForStore = globalThis as unknown as {
  _users?: StoredUser[];
  _consultations?: StoredConsultation[];
  _userIdCounter?: number;
  _consultationIdCounter?: number;
};

if (!globalForStore._users) {
  globalForStore._users = [
    {
      id: 1,
      username: "doctor",
      passwordHash: hashPassword("doctor123"),
      fullName: "Dr. Sandeep V",
      role: "doctor",
      createdAt: new Date().toISOString(),
    },
  ];
  globalForStore._userIdCounter = 2;
}

if (!globalForStore._consultations) {
  globalForStore._consultations = [];
  globalForStore._consultationIdCounter = 1;
}

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
  const clean = username.trim().toLowerCase();
  return globalForStore._users!.find((u) => u.username.toLowerCase() === clean);
}

export function getUserById(id: number): StoredUser | undefined {
  return globalForStore._users!.find((u) => u.id === id);
}

export function createUser(username: string, password: string, fullName: string): StoredUser {
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
  return newUser;
}

export function createConsultation(
  doctorId: number,
  doctorName: string,
  patientName: string,
  transcript: string,
  turns: Array<{ speaker: string; text: string }>,
  note: Record<string, any>,
  translatedPlan?: string | null
): StoredConsultation {
  const newConsultation: StoredConsultation = {
    id: globalForStore._consultationIdCounter!++,
    doctor_id: doctorId,
    doctor_name: doctorName,
    patient_name: patientName.trim() || "Anita Roy",
    transcript: transcript.trim(),
    turns: turns || [],
    note: note || {},
    translated_plan: translatedPlan || null,
    created_at: new Date().toISOString(),
  };
  globalForStore._consultations!.unshift(newConsultation);
  return newConsultation;
}

export function getConsultationsForDoctor(doctorId: number): StoredConsultation[] {
  return globalForStore._consultations!.filter((c) => c.doctor_id === doctorId);
}

export function getConsultationById(id: number): StoredConsultation | undefined {
  return globalForStore._consultations!.find((c) => c.id === id);
}
