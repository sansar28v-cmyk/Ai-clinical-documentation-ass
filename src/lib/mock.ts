import { ClinicalNote } from "@/lib/clinical-note";

// Demo-mode data. When SARVAM_API_KEY is not configured, the pipeline serves
// this realistic sample (clearly labeled "Demo mode" in the UI) so the full
// flow is always demoable. With the key configured, the real Sarvam AI STT +
// Sarvam-105B pipeline is used instead.

export const MOCK_TRANSCRIPT = `Doctor: Good morning, Sarah. What brings you in today?
Patient: I've had a sore throat and a mild cough for about four days, mostly in the evenings.
Doctor: Any fever, or body aches?
Patient: No fever at all, and no body aches. I just felt a bit run down.
Doctor: Any allergies, asthma, or other medical history I should know about?
Patient: No allergies. No asthma. I did quit smoking two years ago.
Doctor: What medications are you currently taking?
Patient: Just ibuprofen sometimes for headaches, and a vitamin D supplement every day.
Doctor: Okay, let's take a look. Your throat is red and swollen, and I can see a few white patches on the tonsils. Your temperature is 98.9, blood pressure 118 over 76, heart rate 72, and your lungs are clear to listen.
Doctor: This looks like acute pharyngitis, most likely viral. I'd recommend acetaminophen for any discomfort, honey and warm fluids, and plenty of rest. I'll order a rapid strep test today just to be safe. If you develop a fever or your symptoms worsen after five days, call us back.
Patient: That makes sense. Thank you.
Doctor: You're welcome — take care.`;

export const MOCK_NOTE: ClinicalNote = {
  chief_complaint: "Sore throat and mild cough x4 days",
  hpi: "Sore throat with mild evening-predominant cough for ~4 days; feels run down. Denies fever, denies body aches, denies allergies. Quit smoking 2 years ago.",
  pmh: "None documented. Ex-smoker (quit 2 years ago).",
  medications: ["Ibuprofen (as needed)", "Vitamin D supplement (daily)"],
  exam_findings: "Throat erythematous and swollen with a few white patches on tonsils; T 98.9°F, BP 118/76, HR 72; lungs clear to auscultation.",
  plan: "Supportive care: acetaminophen for discomfort, honey/warm fluids, rest. Rapid strep test today; return if fever develops or symptoms worsen after 5 days.",
};
