"""
Test examples for Triage Engine
Shows how to use the system programmatically
"""

import requests
import json
from triage import IntelligentTriageEngine, VitalSigns, PatientContext
from queue import ClinicQueueSystem, QueuedPatient, PatientType


# ═══════════════════════════════════════════════════════════════
# EXAMPLE 1: Direct Python Usage (No HTTP)
# ═══════════════════════════════════════════════════════════════

def test_triage_directly():
    """Test triage engine directly without API"""
    
    engine = IntelligentTriageEngine()
    
    # Phase 1: Critical Assessment
    print("="*50)
    print("PHASE 1: Critical Assessment")
    print("="*50)
    critical_score, red_flags = engine.assess_critical_factors(
        is_conscious=True,
        can_speak=True,
        can_ambulate=True,
        breathing_difficulty="moderate",
        red_flag_text="chest pain and sweating"
    )
    print(f"Critical Score: {critical_score}")
    print(f"Red Flags: {red_flags}\n")
    
    # Phase 2: Symptom Assessment
    print("="*50)
    print("PHASE 2: Symptom Assessment")
    print("="*50)
    symptom_score, category, questions = engine.assess_symptoms(
        symptom_description="Severe chest pain radiating to left arm",
        symptom_severity="severe",
        symptom_duration="sudden onset 30 minutes ago",
        associated_symptoms=["sweating", "nausea"]
    )
    print(f"Symptom Score: {symptom_score}")
    print(f"Category: {category.value}")
    print(f"Adaptive Questions: {questions}\n")
    
    # Phase 3: Context Assessment
    print("="*50)
    print("PHASE 3: Context Assessment")
    print("="*50)
    context = PatientContext(
        age=55,
        gender="M",
        has_diabetes=True,
        has_heart_disease=True,
        on_blood_thinners=True
    )
    context_score = engine.assess_context(context)
    print(f"Context Score: {context_score}\n")
    
    # Phase 4: Vitals Assessment
    print("="*50)
    print("PHASE 4: Vitals Assessment")
    print("="*50)
    vitals = VitalSigns(
        heart_rate=110,
        blood_pressure_systolic=150,
        blood_pressure_diastolic=95,
        temperature=37.2,
        respiratory_rate=22,
        oxygen_saturation=96.0,
        pain_level=9
    )
    vital_score, alerts = engine.assess_vitals(vitals)
    print(f"Vital Score: {vital_score}")
    print(f"Alerts: {alerts}\n")
    
    # Phase 5: Timeline Assessment
    print("="*50)
    print("PHASE 5: Timeline Assessment")
    print("="*50)
    timeline_score = engine.assess_timeline(
        onset_type="sudden",
        duration_hours=0.5,
        is_recurring=False,
        recent_surgery=False,
        recent_trauma=False
    )
    print(f"Timeline Score: {timeline_score}\n")
    
    # Final Calculation
    print("="*50)
    print("FINAL CALCULATION")
    print("="*50)
    total_risk, priority_level = engine.calculate_total_risk(
        critical_score=critical_score,
        symptom_score=symptom_score,
        context_score=context_score,
        vital_score=vital_score,
        timeline_score=timeline_score,
        red_flags=red_flags
    )
    
    print(f"TOTAL RISK SCORE: {total_risk:.1f}/100")
    print(f"PRIORITY LEVEL: {priority_level.value}")
    print(f"ESTIMATED WAIT: {engine.get_wait_estimate(priority_level)} minutes")
    print(f"\n{'='*50}")
    print("SUMMARY")
    print(f"{'='*50}")
    print(f"Patient: 55-year-old male")
    print(f"Chief Complaint: {category.value.title()} - Severe chest pain")
    print(f"Risk Factors: Diabetes, Heart Disease, On Blood Thinners")
    print(f"Critical Findings: {', '.join(red_flags)}")
    print(f"Vital Alerts: {', '.join(alerts)}")
    print(f"\n⚠️  RECOMMENDATION: {priority_level.value} Priority")
    print(f"   → See doctor within {engine.get_wait_estimate(priority_level)} minutes")
    print(f"   → Consider ECG and cardiac workup")


# ═══════════════════════════════════════════════════════════════
# EXAMPLE 2: Queue Management
# ═══════════════════════════════════════════════════════════════

def test_clinic_queue():
    """Test clinic queue with multiple patients"""
    
    clinic = ClinicQueueSystem(doctor_id="DR001")
    
    print("\n" + "="*50)
    print("CLINIC QUEUE SYSTEM TEST")
    print("="*50)
    
    # Add patients with different priorities
    patients_data = [
        {
            "name": "John Doe",
            "age": 55,
            "risk_score": 85.0,
            "priority": "HIGH",
            "complaint": "Chest pain"
        },
        {
            "name": "Jane Smith",
            "age": 32,
            "risk_score": 45.0,
            "priority": "MODERATE",
            "complaint": "Cough and fever"
        },
        {
            "name": "Bob Johnson",
            "age": 68,
            "risk_score": 95.0,
            "priority": "CRITICAL",
            "complaint": "Severe breathing difficulty"
        },
        {
            "name": "Alice Wilson",
            "age": 28,
            "risk_score": 25.0,
            "priority": "LOW",
            "complaint": "Routine checkup"
        },
    ]
    
    print("\nAdding patients to queue...\n")
    patient_ids = []
    
    for p_data in patients_data:
        patient = QueuedPatient(
            name=p_data["name"],
            age=p_data["age"],
            risk_score=p_data["risk_score"],
            priority_level=p_data["priority"],
            chief_complaint=p_data["complaint"],
            patient_type=PatientType.WALK_IN
        )
        
        patient_id = clinic.add_walkin(patient)
        patient_ids.append(patient_id)
        
        position = clinic.queue.get_patient_position(patient_id)
        print(f"✓ Added {p_data['name']:15} | Priority: {p_data['priority']:10} | Score: {p_data['risk_score']:5.1f} | Position: {position}")
    
    # Display current queue
    print("\n" + "="*50)
    print("CURRENT QUEUE")
    print("="*50)
    queue = clinic.get_current_queue()
    for i, patient in enumerate(queue, 1):
        wait_minutes = int((patient.arrival_time).second / 60) if hasattr(patient, 'arrival_time') else 0
        print(f"{i}. {patient.name:15} | {patient.priority_level:10} | Score: {patient.risk_score:5.1f} | Complaint: {patient.chief_complaint}")
    
    # Display statistics
    print("\n" + "="*50)
    print("QUEUE STATISTICS")
    print("="*50)
    stats = clinic.get_queue_stats()
    for key, value in stats.items():
        if key != "department":
            print(f"{key.replace('_', ' ').title():20}: {value}")
    
    # Simulate doctor calling next patient
    print("\n" + "="*50)
    print("DOCTOR CALLING NEXT PATIENT")
    print("="*50)
    next_patient = clinic.get_next_patient()
    if next_patient:
        print(f"\n📞 CALL: {next_patient.name}")
        print(f"   Priority: {next_patient.priority_level}")
        print(f"   Complaint: {next_patient.chief_complaint}")
        print(f"   Exam Room: Room 1")
        
        # Simulate completion
        import time
        print(f"\n   [Patient being examined...]")
        print(f"   [Visit duration: 15 minutes]")
        
        clinic.queue.mark_patient_completed(next_patient.patient_id, duration_minutes=15)
        print(f"   ✓ Visit completed and recorded")
    
    # Show updated queue
    print("\n" + "="*50)
    print("UPDATED QUEUE (After patient completion)")
    print("="*50)
    queue = clinic.get_current_queue()
    for i, patient in enumerate(queue, 1):
        print(f"{i}. {patient.name:15} | {patient.priority_level:10} | Score: {patient.risk_score:5.1f}")


# ═══════════════════════════════════════════════════════════════
# EXAMPLE 3: API Usage (HTTP Calls)
# ═══════════════════════════════════════════════════════════════

def test_api_calls():
    """Test via HTTP API calls"""
    
    BASE_URL = "http://localhost:5001"
    
    print("\n" + "="*50)
    print("API INTEGRATION TEST")
    print("="*50)
    
    # 1. Initialize triage
    print("\n1. Initialize Triage Session")
    response = requests.post(
        f"{BASE_URL}/api/triage/init",
        json={
            "patient_name": "Test Patient",
            "patient_age": 45,
            "phone": "555-1234",
            "gender": "M"
        }
    )
    if response.status_code == 200:
        data = response.json()
        session_id = data["session_id"]
        print(f"   ✓ Session created: {session_id}")
        print(f"   First question: {data['first_question']}")
    else:
        print(f"   ✗ Error: {response.status_code}")
        return
    
    # 2. Critical Assessment
    print("\n2. Critical Assessment")
    response = requests.post(
        f"{BASE_URL}/api/triage/critical-assessment?session_id={session_id}",
        json={
            "is_conscious": True,
            "can_speak": True,
            "can_ambulate": True,
            "breathing_difficulty": "moderate",
            "red_flag_description": "chest pain"
        }
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Critical Score: {data['score']}")
        print(f"   Red Flags: {data['red_flags']}")
    
    # 3. Complete Triage (single call)
    print("\n3. Complete Triage (Quick Method)")
    response = requests.post(
        f"{BASE_URL}/api/triage/complete",
        json={
            "patient_name": "Quick Test",
            "patient_age": 42,
            "phone": "555-5678",
            "is_conscious": True,
            "can_speak": True,
            "can_ambulate": True,
            "symptom_description": "Severe chest pain",
            "has_heart_disease": True,
            "oxygen_saturation": 94.0,
            "pain_level": 9
        }
    )
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Risk Score: {data['total_risk_score']}")
        print(f"   Priority: {data['priority_level']}")
        print(f"   Wait: {data['estimated_wait_minutes']} minutes")
    
    # 4. Get clinic queue
    print("\n4. Get Current Queue")
    response = requests.get(f"{BASE_URL}/api/queue/clinic/current")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Patients waiting: {data['statistics']['waiting_count']}")
        print(f"   Avg wait: {data['statistics']['avg_wait_minutes']} minutes")
    
    # 5. Health check
    print("\n5. Health Check")
    response = requests.get(f"{BASE_URL}/health")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✓ Status: {data['status']}")


# ═══════════════════════════════════════════════════════════════
# RUN TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n" + "█"*50)
    print("█  TRIAGE ENGINE TEST SUITE")
    print("█"*50)
    
    # Test 1: Direct usage
    test_triage_directly()
    
    # Test 2: Queue management
    test_clinic_queue()
    
    # Test 3: API calls (requires server running)
    try:
        print("\n\nAttempting API tests... (requires server running at localhost:5001)")
        test_api_calls()
    except Exception as e:
        print(f"\n⚠️  API test skipped: {e}")
        print("   Start server with: python main.py")
    
    print("\n" + "█"*50)
    print("█  TESTS COMPLETE")
    print("█"*50 + "\n")
