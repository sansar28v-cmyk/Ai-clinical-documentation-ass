export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en-IN", name: "English", nativeName: "English" },
  { code: "hi-IN", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ta-IN", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te-IN", name: "Telugu", nativeName: "తెలుగు" },
  { code: "kn-IN", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "ml-IN", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "bn-IN", name: "Bengali", nativeName: "বাংলা" },
  { code: "mr-IN", name: "Marathi", nativeName: "मराठी" },
  { code: "gu-IN", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "pa-IN", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "od-IN", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
];

/**
 * Translates a single string of text using Sarvam's Translate API (mayura:v1).
 */
export async function translateText(
  text: string,
  targetLanguageCode: string,
  sourceLanguageCode = "en-IN"
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Normalize language codes (e.g., 'ta' -> 'ta-IN')
  const targetCode = targetLanguageCode.includes("-")
    ? targetLanguageCode
    : `${targetLanguageCode}-IN`;
  const sourceCode = sourceLanguageCode.includes("-")
    ? sourceLanguageCode
    : `${sourceLanguageCode}-IN`;

  if (targetCode.toLowerCase().startsWith("en")) {
    return text;
  }

  const apiKey = process.env.SARVAM_API_KEY?.trim();
  if (!apiKey) {
    // If no key configured, return original text gracefully
    return text;
  }

  try {
    const res = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey,
      },
      body: JSON.stringify({
        input: trimmed,
        source_language_code: sourceCode,
        target_language_code: targetCode,
        mode: "formal",
        model: "mayura:v1",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Sarvam Translate] Failed (${res.status}): ${errText}`);
      return text;
    }

    const data = await res.json();
    return data.translated_text || text;
  } catch (err) {
    console.warn("[Sarvam Translate] Request error:", err);
    return text;
  }
}

/**
 * Translates all fields of a structured clinical note.
 */
export async function translateClinicalNote(
  note: Record<string, any>,
  targetLanguageCode: string
): Promise<Record<string, any>> {
  if (!note || typeof note !== "object") return {};

  const targetCode = targetLanguageCode.includes("-")
    ? targetLanguageCode
    : `${targetLanguageCode}-IN`;

  if (targetCode.toLowerCase().startsWith("en")) {
    return { ...note };
  }

  const translated: Record<string, any> = { ...note };

  // Translate single text fields in parallel
  const textFields = ["chief_complaint", "hpi", "pmh", "exam_findings", "plan"];
  await Promise.all(
    textFields.map(async (field) => {
      const val = note[field];
      if (typeof val === "string" && val.trim().length > 0) {
        translated[field] = await translateText(val, targetCode);
      }
    })
  );

  // Translate medications array if present
  if (Array.isArray(note.medications) && note.medications.length > 0) {
    translated.medications = await Promise.all(
      note.medications.map(async (med: string) => {
        if (typeof med === "string" && med.trim()) {
          return await translateText(med, targetCode);
        }
        return med;
      })
    );
  }

  return translated;
}
