/**
 * API client helper to interact with FastAPI backend on port 8000
 */

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:8000`;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
};

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: "doctor" | "patient";
}

export interface ConsultationItem {
  id: number;
  doctor_id: number;
  patient_id?: number | null;
  patient_name: string;
  doctor_name?: string;
  transcript: string;
  turns: Array<{ speaker: string; text: string }>;
  note: {
    chief_complaint?: string;
    hpi?: string;
    pmh?: string;
    medications?: string[];
    exam_findings?: string;
    plan?: string;
    [key: string]: any;
  };
  translated_plan?: string | null;
  created_at: string;
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    token?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.detail || data.message || `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}
