import sys
from red_flag_detector import RedFlagSessionDetector, RED_FLAG_PATTERNS

def run_tests():
    print("==================================================")
    print("RUNNING LIVE RED-FLAG DETECTION TEST SUITE")
    print("==================================================")

    # Test 1: Cardiac Emergency (English)
    detector = RedFlagSessionDetector()
    
    # Segment 1: Only chest pain (cluster 1 only) -> Should NOT fire yet
    alerts = detector.process_segment("Doctor, I have been having severe chest pain since morning.")
    assert len(alerts) == 0, f"Expected 0 alerts for partial symptom, got {len(alerts)}"
    print("[PASS] Partial symptom (chest pain alone) did not fire false alarm.")

    # Segment 2: Adds shortness of breath (cluster 2) -> Should fire Cardiac Emergency
    alerts = detector.process_segment("I am also having shortness of breath and sweating a lot.")
    assert len(alerts) == 1, f"Expected 1 alert, got {len(alerts)}"
    assert alerts[0]["pattern_id"] == "cardiac_emergency"
    print(f"[PASS] Complete cardiac pattern triggered: {alerts[0]['pattern_name']}")
    print(f"       Keywords matched: {alerts[0]['triggered_keywords']}")

    # Segment 3: More chest pain mentioned -> Should NOT duplicate alert
    alerts = detector.process_segment("Yes doctor, the chest pain is very bad.")
    assert len(alerts) == 0, f"Expected 0 alerts for duplicate pattern, got {len(alerts)}"
    print("[PASS] Duplicate alert prevented in same session.")

    # Test 2: Stroke (FAST) - Multilingual / Hinglish
    detector_stroke = RedFlagSessionDetector()
    alerts = detector_stroke.process_segment("Achanak se ek taraf kamzori aa gayi hai aur bolne me dikkat ho rahi hai. Bahut chakkar aur confusion hai.")
    assert len(alerts) == 1
    assert alerts[0]["pattern_id"] == "acute_stroke"
    print(f"[PASS] Stroke pattern (Hinglish) triggered: {alerts[0]['pattern_name']}")
    print(f"       Keywords matched: {alerts[0]['triggered_keywords']}")

    # Test 3: Severe Anaphylaxis - Tamil / Tanglish
    detector_allergy = RedFlagSessionDetector()
    alerts = detector_allergy.process_segment("Doctor, enaku thondai veekam aaiduchu, moochu vida mudiyala, udambu full-ah severe rash and arippu irukku.")
    assert len(alerts) == 1
    assert alerts[0]["pattern_id"] == "severe_anaphylaxis"
    print(f"[PASS] Anaphylaxis pattern (Tamil/Tanglish) triggered: {alerts[0]['pattern_name']}")
    print(f"       Keywords matched: {alerts[0]['triggered_keywords']}")

    # Test 4: Sepsis
    detector_sepsis = RedFlagSessionDetector()
    alerts = detector_sepsis.process_segment("Patient has high fever of 104 with violent chills, severe confusion, and fast heart rate with rapid breathing.")
    assert len(alerts) == 1
    assert alerts[0]["pattern_id"] == "severe_sepsis"
    print(f"[PASS] Sepsis pattern triggered: {alerts[0]['pattern_name']}")
    print(f"       Keywords matched: {alerts[0]['triggered_keywords']}")

    # Test 5: Diabetic Emergency
    detector_diabetes = RedFlagSessionDetector()
    alerts = detector_diabetes.process_segment("He is a known diabetic patient on insulin who is dizzy and experiencing excessive thirst with shaking tremors.")
    assert len(alerts) == 1
    assert alerts[0]["pattern_id"] == "diabetic_emergency"
    print(f"[PASS] Diabetic emergency pattern triggered: {alerts[0]['pattern_name']}")
    print(f"       Keywords matched: {alerts[0]['triggered_keywords']}")

    print("==================================================")
    print("ALL 5 CLINICAL RED-FLAG PATTERNS PASSED VERIFICATION!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
