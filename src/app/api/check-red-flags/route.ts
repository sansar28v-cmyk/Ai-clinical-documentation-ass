import { NextRequest, NextResponse } from "next/server";

// Curated Clinical Red-Flag Patterns in TypeScript for Next.js serverless execution
const RED_FLAG_PATTERNS = [
  {
    id: "cardiac_emergency",
    name: "Possible Cardiac Emergency",
    severity: "critical",
    message:
      "Potential acute coronary syndrome: chest pain reported with associated respiratory distress, diaphoresis, or radiating discomfort. Immediate ECG/troponin suggested.",
    disclaimer: "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
    cluster_groups: [
      [
        "chest pain", "chest tightness", "chest pressure", "crushing pain",
        "seene me dard", "chaati me dard", "seene me jalan",
        "nenju vali", "marbu vali", "nenjil vali", "nenju adaippu",
      ],
      [
        "shortness of breath", "difficulty breathing", "breathless", "dyspnea",
        "sweating", "cold sweat", "diaphoresis", "paseena", "sweat aaguthu",
        "pain in arm", "left arm pain", "radiating to jaw", "neck pain",
        "kai vali", "thozhupattai vali", "haath me dard", "jabde me dard",
      ],
    ],
  },
  {
    id: "stroke_fast",
    name: "Possible Acute Stroke (FAST Warning)",
    severity: "critical",
    message:
      "FAST stroke warning signs detected: unilateral motor deficit/numbness with speech impairment and altered sensorium. Check onset time and evaluate for emergency neuroimaging.",
    disclaimer: "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
    cluster_groups: [
      [
        "weakness on one side", "left side weakness", "right side weakness",
        "facial droop", "arm weakness", "numbness on one side", "paralysis",
        "ek taraf kamzori", "aadha shareer", "haath pair sunn",
        "oru pakkam balaveenam", "oru kai maruthupochu", "oru kaal balaveenam",
      ],
      [
        "slurred speech", "difficulty speaking", "unable to speak", "loss of speech",
        "bolne me dikkat", "awaz ladkhadana", "baat nahi kar pa raha",
        "pesa mudiyala", "vaarthai kollaru", "pesu thadumaruthu",
      ],
      [
        "confusion", "disorientation", "altered mental state", "acute confusion",
        "behosh", "chakkar", "samajh nahi aa raha",
        "kuzhapam", "ninaivu thari kettu", "mayakkam",
      ],
    ],
  },
  {
    id: "severe_allergic_reaction",
    name: "Possible Severe Allergic Reaction (Anaphylaxis)",
    severity: "critical",
    message:
      "Signs of multisystem anaphylaxis: airway/breathing compromise with angioedema and cutaneous reaction. Prepare emergency epinephrine and airway support.",
    disclaimer: "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
    cluster_groups: [
      [
        "difficulty breathing", "wheezing", "stridor", "shortness of breath",
        "throat closing", "saans lene me takleef", "saans phoolna", "gala bandh",
        "moochu vida mudiyala", "moochu thinaran", "thondai adaikirathu",
      ],
      [
        "swelling of lips", "lip swelling", "facial swelling", "tongue swelling",
        "throat swelling", "hoth sujan", "chehre par sujan", "gale me sujan",
        "udhadu veekam", "mugam veekam", "thondai veekam", "naaku veekam",
      ],
      [
        "rash", "hives", "urticaria", "itching all over", "skin redness",
        "khujli", "lal daane", "shareer par rashes",
        "dhadhidhu", "sivappu thadippu", "arippu",
      ],
    ],
  },
  {
    id: "sepsis_severe_infection",
    name: "Possible Sepsis / Severe Infection",
    severity: "high",
    message:
      "Sepsis alert criteria met: systemic febrile response with acute altered sensorium and tachycardia/tachypnea. Urgent vitals (BP/HR/lactate) and blood culture protocol advised.",
    disclaimer: "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
    cluster_groups: [
      [
        "high fever", "chills", "rigors", "very hot", "shivering with fever",
        "tez bukhar", "thandi lag ke bukhar", "kapkapi",
        "athi kaichal", "kulir kaichal", "nadukam",
      ],
      [
        "confusion", "lethargy", "drowsiness", "unresponsive", "disoriented",
        "behosh jaisa", "susti", "pehechan nahi raha",
        "kuzhapam", "mayakka nilai", "asathi",
      ],
      [
        "rapid breathing", "fast heartbeat", "racing heart", "tachycardia", "panting",
        "tez dhadkan", "saans tez chalna", "dil tez dhadakna",
        "vegamana moochu", "idhaya thudippu athigam", "moochu vaanguthu",
      ],
    ],
  },
  {
    id: "diabetic_emergency",
    name: "Possible Diabetic Emergency (DKA / Hypoglycemia)",
    severity: "high",
    message:
      "Acute diabetic complication warning: altered mentation/dizziness in a known diabetic with osmotic symptoms or sweating. Check capillary blood glucose (CBG) stat.",
    disclaimer: "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
    cluster_groups: [
      [
        "confusion", "dizziness", "dizzy", "lightheaded", "fainting", "fainted",
        "chakkar", "behosh", "sar ghumna", "chakkar aa raha",
        "thalai suttuthu", "mayakkam", "ninaivu ilanthu",
      ],
      [
        "diabetic", "diabetes", "sugar patient", "taking insulin", "on metformin",
        "sugar ki bimari", "diabetes hai", "sugar tablet",
        "sakkarai noi", "sugar irukku", "sakkarai viyathi",
      ],
      [
        "excessive thirst", "frequent urination", "sweating", "cold sweat", "fruity breath",
        "bahut pyas", "baar baar peshab", "paseena",
        "athiga thaagam", "adikadi siruneer", "verthu kottuthu",
      ],
    ],
  },
];

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json().catch(() => ({ text: "" }));
    const normalized = (text || "").toLowerCase();

    const triggered = [];

    for (const pattern of RED_FLAG_PATTERNS) {
      const matchedKeywords: string[] = [];
      let allClustersMatched = true;

      for (const cluster of pattern.cluster_groups) {
        let clusterFound = false;
        for (const kw of cluster) {
          if (normalized.includes(kw.toLowerCase())) {
            clusterFound = true;
            matchedKeywords.push(kw);
            break;
          }
        }
        if (!clusterFound) {
          allClustersMatched = false;
          break;
        }
      }

      if (allClustersMatched) {
        triggered.push({
          pattern_id: pattern.id,
          pattern_name: pattern.name,
          severity: pattern.severity,
          message: pattern.message,
          disclaimer: pattern.disclaimer,
          triggered_keywords: matchedKeywords,
        });
      }
    }

    return NextResponse.json({
      triggered_patterns: triggered,
      count: triggered.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err.message || "Failed to check red flags" },
      { status: 500 }
    );
  }
}
