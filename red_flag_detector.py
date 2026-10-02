"""
=============================================================================
LIVE RED-FLAG DETECTION SYSTEM (CLINICAL ADVISORY MODULE)
=============================================================================
CRITICAL SAFETY & REGULATORY DISCLAIMER:
-----------------------------------------------------------------------------
This module provides automated pattern-matching advisory flags based strictly
on curated keyword clusters. It is NOT a diagnostic tool, medical device,
or clinical decision-making system. It does NOT diagnose diseases, triage
patients, or mandate medical interventions. All clinical judgment, patient
assessment, and management decisions remain solely with the licensed physician.
Detection is intentionally scoped to deterministic curated danger patterns
to prevent LLM hallucination or unwarranted medical claims.
=============================================================================
"""

import re
from typing import Any, Dict, List, Set, Tuple

# Curated Clinical Red-Flag Patterns
# Each pattern requires ALL its keyword clusters to match in the accumulated dialogue.
# Inside each cluster, ANY synonym/phrasing (English, Hindi/Hinglish, Tamil/Tanglish) satisfies the cluster.
RED_FLAG_PATTERNS: List[Dict[str, Any]] = [
    {
        "id": "cardiac_emergency",
        "name": "Possible Cardiac Emergency",
        "severity": "CRITICAL",
        "message": "High-risk indicators for Acute Coronary Syndrome (ACS) / Myocardial Infarction. Urgent 12-lead ECG, vitals check, and emergency cardiac protocol recommended.",
        "required_clusters": [
            # Cluster 1: Chest pain / pressure / tightness
            [
                "chest pain",
                "chest tightness",
                "heavy chest",
                "pain in chest",
                "pressure in chest",
                "tightness in chest",
                "angina",
                "crushing chest",
                "seene me dard",
                "seene mein dard",
                "chhati me dard",
                "chhati mein dard",
                "seene me dabav",
                "nenju vali",
                "nenjil vali",
                "nenju baram",
                "nenju adaikara",
                "nenjula vali",
                "nenjula baram",
            ],
            # Cluster 2: Secondary cardiac signs (Radiation, Dyspnea, or Diaphoresis)
            [
                # Dyspnea / breathlessness
                "shortness of breath",
                "difficulty breathing",
                "breathless",
                "cant breathe",
                "cannot breathe",
                "trouble breathing",
                "struggling to breathe",
                "saans lene me dikkat",
                "saans phool",
                "dum ghut",
                "moochu vida mudiyala",
                "moochu thinaral",
                "swasam",
                # Diaphoresis / cold sweats
                "sweating",
                "cold sweat",
                "profuse sweat",
                "sweating heavily",
                "paseena",
                "pasina",
                "viyarkudhu",
                "viyarkithu",
                "verthu kottuthu",
                "verthukottudhu",
                # Radiating pain to arm or jaw
                "radiating to arm",
                "left arm pain",
                "pain in left arm",
                "radiating to jaw",
                "jaw pain",
                "pain radiating",
                "haath me dard",
                "baaye haath me dard",
                "jabde me dard",
                "kai vali",
                "idathu kai vali",
                "thaadai vali",
            ],
        ],
    },
    {
        "id": "acute_stroke",
        "name": "Possible Acute Stroke (FAST Warning)",
        "severity": "CRITICAL",
        "message": "Critical neurological warning signs suggestive of Acute Ischemic Stroke / TIA (FAST protocol). Immediate neurovascular assessment (non-contrast head CT/MRI) indicated.",
        "required_clusters": [
            # Cluster 1: Unilateral weakness or numbness
            [
                "weakness on one side",
                "one sided weakness",
                "numbness on one side",
                "cant move left arm",
                "cant move right arm",
                "cant move leg",
                "cannot move arm",
                "face drooping",
                "facial droop",
                "arm weakness",
                "leg weakness",
                "ek taraf kamzori",
                "ek side sunn",
                "ek hath kaam nahi",
                "oru pakkam thimiru",
                "oru pakkam asaiya mudiyala",
                "oru kai kaal paralise",
                "oru pakkam paralise",
            ],
            # Cluster 2: Speech impairment / Dysarthria
            [
                "slurred speech",
                "slurring words",
                "difficulty speaking",
                "unclear speech",
                "cant speak clearly",
                "unable to speak",
                "words are not coming",
                "bolne me dikkat",
                "zubaan ladkhada",
                "pesa mudiyala",
                "vaai kolaru",
                "vaarthai vara mattudhu",
            ],
            # Cluster 3: Acute confusion / altered sensorium
            [
                "confusion",
                "confused",
                "disoriented",
                "not recognizing",
                "not making sense",
                "memory loss",
                "behosh",
                "chakkar",
                "kuzhappam",
                "en puriyala",
                "suthama theriyala",
            ],
        ],
    },
    {
        "id": "severe_anaphylaxis",
        "name": "Possible Severe Allergic Reaction (Anaphylaxis)",
        "severity": "CRITICAL",
        "message": "Indicators of severe acute allergic reaction / anaphylaxis with airway compromise. Prepare intramuscular epinephrine (1:1000) and assess airway immediately.",
        "required_clusters": [
            # Cluster 1: Respiratory distress / airway compromise
            [
                "difficulty breathing",
                "shortness of breath",
                "wheezing",
                "stridor",
                "throat closing",
                "trouble breathing",
                "cant breathe",
                "saans lene me dikkat",
                "dum ghut",
                "gala band",
                "moochu vida mudiyala",
                "moochu thinaral",
                "thondai adaikuthu",
            ],
            # Cluster 2: Angioedema / facial/throat/lip swelling
            [
                "swelling",
                "swollen lips",
                "swollen tongue",
                "swollen throat",
                "facial swelling",
                "swollen face",
                "swelling in throat",
                "angioedema",
                "chehra sooj",
                "hoth sooj",
                "gala sooj",
                "muga veekam",
                "uthatu veekam",
                "thondai veekam",
                "naaku veekam",
            ],
            # Cluster 3: Cutaneous symptoms (rash, hives, pruritus)
            [
                "rash",
                "hives",
                "urticaria",
                "skin breakout",
                "itching all over",
                "red spots",
                "severe itching",
                "chakte",
                "khujli",
                "dhinavu",
                "arippu",
                "thadipu",
            ],
        ],
    },
    {
        "id": "severe_sepsis",
        "name": "Possible Sepsis / Severe Infection",
        "severity": "HIGH",
        "message": "Red-flag criteria for systemic inflammatory response / severe sepsis (qSOFA). Evaluate vitals, obtain IV access, serum lactate, and blood cultures stat.",
        "required_clusters": [
            # Cluster 1: High fever or severe rigors
            [
                "high fever",
                "severe fever",
                "very high temperature",
                "fever of 103",
                "fever of 104",
                "fever 103",
                "fever 104",
                "shivering violently",
                "chills and rigors",
                "tez bukhar",
                "bahut tez bukhar",
                "adhiga kaichal",
                "periya jwaram",
                "kaichal nillama",
            ],
            # Cluster 2: Altered mental status / extreme lethargy
            [
                "confusion",
                "confused",
                "disoriented",
                "drowsy",
                "lethargic",
                "unresponsive",
                "altered state",
                "behosh",
                "chakkar aana",
                "kuzhappam",
                "mayakkam",
                "asathiya irukku",
            ],
            # Cluster 3: Tachycardia or tachypnea
            [
                "rapid breathing",
                "fast heart rate",
                "fast breathing",
                "tachycardia",
                "heart racing",
                "rapid pulse",
                "hyperventilating",
                "racing heart",
                "tez dhadkan",
                "tez saans",
                "idhayath thudippu",
                "nenju padapadappu",
                "vegama moochu",
            ],
        ],
    },
    {
        "id": "diabetic_emergency",
        "name": "Possible Diabetic Emergency (DKA / Hypoglycemia)",
        "severity": "HIGH",
        "message": "Potential acute metabolic crisis (diabetic ketoacidosis or severe hypoglycemia). Check immediate capillary blood glucose (CBG) stat.",
        "required_clusters": [
            # Cluster 1: Altered sensorium / dizziness / lightheadedness
            [
                "confusion",
                "confused",
                "dizziness",
                "dizzy",
                "lightheaded",
                "feeling faint",
                "passing out",
                "blacking out",
                "chakkar",
                "behosh",
                "mayakkam",
                "thala sutruthu",
                "kuzhappam",
            ],
            # Cluster 2: Known diabetic history or medication
            [
                "diabetic",
                "diabetes",
                "blood sugar",
                "sugar patient",
                "sugar level",
                "high sugar",
                "low sugar",
                "insulin",
                "metformin",
                "hba1c",
                "madhumeh",
                "sugar noyaali",
                "sugar irukku",
            ],
            # Cluster 3: Osmotic symptoms (extreme thirst) or autonomic signs (profuse sweating/tremors)
            [
                "excessive thirst",
                "very thirsty",
                "extreme thirst",
                "drinking water constantly",
                "intense thirst",
                "profuse sweating",
                "sweating heavily",
                "cold sweats",
                "shaking",
                "tremors",
                "bahut pyaas",
                "gala sookh",
                "paseena choot",
                "kaamp raha",
                "athiga thagam",
                "viyarkudhu",
                "nadukkam",
            ],
        ],
    },
]


def _normalize_text(text: str) -> str:
    """Normalize text for consistent keyword substring matching."""
    text = text.lower()
    # Normalize punctuation and repeated whitespace
    text = re.sub(r"[^\w\s]", " ", text)
    return " ".join(text.split())


class RedFlagSessionDetector:
    """
    Lightweight, stateful detector for a single consultation session.
    Accumulates transcript segments and triggers alerts only once per pattern.
    """

    def __init__(self, patterns: List[Dict[str, Any]] = None):
        self.patterns = patterns or RED_FLAG_PATTERNS
        self.accumulated_text: str = ""
        self.alerted_patterns: Set[str] = set()

    def process_segment(self, segment: str) -> List[Dict[str, Any]]:
        """
        Process a new transcript segment.
        Returns a list of newly triggered red flag alert dicts.
        """
        if not segment or not segment.strip():
            return []

        self.accumulated_text += " " + segment.strip()
        norm_text = _normalize_text(self.accumulated_text)

        new_alerts: List[Dict[str, Any]] = []

        for pattern in self.patterns:
            pid = pattern["id"]
            if pid in self.alerted_patterns:
                continue

            matched_keywords: List[str] = []
            all_clusters_matched = True

            for cluster in pattern["required_clusters"]:
                cluster_matched = False
                for phrase in cluster:
                    norm_phrase = _normalize_text(phrase)
                    # Check substring match
                    if f" {norm_phrase} " in f" {norm_text} " or norm_phrase in norm_text:
                        matched_keywords.append(phrase)
                        cluster_matched = True
                        break

                if not cluster_matched:
                    all_clusters_matched = False
                    break

            if all_clusters_matched:
                self.alerted_patterns.add(pid)
                new_alerts.append({
                    "type": "red_flag_alert",
                    "pattern_id": pid,
                    "pattern_name": pattern["name"],
                    "severity": pattern.get("severity", "CRITICAL"),
                    "message": pattern["message"],
                    "triggered_keywords": matched_keywords,
                    "disclaimer": "Advisory flag only — not a diagnosis. Clinical judgment remains with the doctor.",
                })

        return new_alerts

    def reset(self):
        """Reset accumulated session state."""
        self.accumulated_text = ""
        self.alerted_patterns.clear()
