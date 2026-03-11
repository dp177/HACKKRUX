"""
FASTAPI TRIAGE ENGINE SERVER
REST API endpoints for triage assessment and queue management
"""

from fastapi import FastAPI, HTTPException, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime
import json
import asyncio

from triage import (
    IntelligentTriageEngine,
    VitalSigns,
    PatientContext,
    TriageAssessment,
    PriorityLevel,
    SymptomCategory
)
from queue import (
    QueuedPatient,
    PatientType,
    ClinicQueueSystem,
    HospitalQueueSystem
)
from patient_profile import (
    PatientProfile,
    PatientProfileManager,
    Allergy,
    Medication,
    ChronicCondition,
    PastVisit,
    VitalHistory,
    FamilyHistory,
    SurgicalHistory,
    AllergyType,
    BloodType,
    VisitStatus
)

# ═══════════════════════════════════════════════════════════════
# PYDANTIC MODELS (API Schemas)
# ═══════════════════════════════════════════════════════════════

class InitTriageRequest(BaseModel):
    """Start triage assessment"""
    patient_name: str
    patient_age: int
    phone: str
    gender: Optional[str] = None


class CriticalAssessmentRequest(BaseModel):
    """Phase 1: Critical assessment"""
    is_conscious: bool
    can_speak: bool
    can_ambulate: bool
    breathing_difficulty: Optional[str] = None  # 'severe', 'moderate', 'none'
    red_flag_description: Optional[str] = None


class SymptomAssessmentRequest(BaseModel):
    """Phase 2: Symptom analysis"""
    symptom_description: str
    severity: Optional[str] = None
    duration_text: Optional[str] = None
    associated_symptoms: Optional[List[str]] = None


class ContextAssessmentRequest(BaseModel):
    """Phase 3: Patient context"""
    age: int
    gender: Optional[str] = None
    has_diabetes: bool = False
    has_hypertension: bool = False
    has_heart_disease: bool = False
    has_asthma_copd: bool = False
    has_cancer: bool = False
    is_pregnant: bool = False
    is_immunocompromised: bool = False
    on_blood_thinners: bool = False
    on_antibiotics: bool = False
    on_pain_meds: bool = False


class VitalSignsRequest(BaseModel):
    """Phase 4: Vital signs"""
    heart_rate: Optional[int] = None
    blood_pressure_systolic: Optional[int] = None
    blood_pressure_diastolic: Optional[int] = None
    temperature: Optional[float] = None
    respiratory_rate: Optional[int] = None
    oxygen_saturation: Optional[float] = None
    pain_level: Optional[int] = None


class TimelineAssessmentRequest(BaseModel):
    """Phase 5: Timeline factors"""
    onset_type: str  # 'sudden', 'gradual', 'recurring'
    duration_hours: Optional[float] = None
    is_recurring: bool = False
    recent_surgery: bool = False
    recent_trauma: bool = False


class CompleteTriageRequest(BaseModel):
    """Full triage in one call (for quick assessment)"""
    patient_name: str
    patient_age: int
    phone: str
    gender: Optional[str] = None
    
    # Critical
    is_conscious: bool = True
    can_speak: bool = True
    can_ambulate: bool = True
    breathing_difficulty: Optional[str] = None
    red_flag_description: Optional[str] = None
    
    # Symptoms
    symptom_description: str = ""
    symptom_severity: Optional[str] = None
    
    # Context
    has_diabetes: bool = False
    has_heart_disease: bool = False
    has_asthma_copd: bool = False
    on_blood_thinners: bool = False
    
    # Vitals
    heart_rate: Optional[int] = None
    blood_pressure_systolic: Optional[int] = None
    temperature: Optional[float] = None
    oxygen_saturation: Optional[float] = None
    pain_level: Optional[int] = None


class AddToQueueRequest(BaseModel):
    """Add patient to queue after triage"""
    patient_id: str
    patient_name: str
    risk_score: float
    priority_level: str
    chief_complaint: str
    recommended_specialty: str = "general"
    department_id: str = "general"
    appointment_id: Optional[str] = None  # For booked


class TriageResponse(BaseModel):
    """Triage assessment result"""
    patient_id: str
    risk_score: float
    priority_level: str
    red_flags: List[str]
    recommended_specialty: str
    estimated_wait_minutes: int
    severity_breakdown: Dict
    next_question: Optional[str] = None


class QueueStatusResponse(BaseModel):
    """Current queue status"""
    queue_position: Optional[int]
    wait_minutes: int
    priority_level: str
    ahead_of_you: int


# ═══════════════════════════════════════════════════════════════
# FASTAPI APP SETUP
# ═══════════════════════════════════════════════════════════════

app = FastAPI(
    title="AI-Powered Triage & Queue System",
    description="Intelligent medical triage with dynamic queue prioritization",
    version="1.0.0"
)

# CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize systems
triage_engine = IntelligentTriageEngine()
clinic_system = ClinicQueueSystem(doctor_id="DR001")
hospital_system = HospitalQueueSystem()

# Create sample departments for hospital
hospital_system.create_department("cardio", "Cardiology")
hospital_system.create_department("ortho", "Orthopedics")
hospital_system.create_department("neuro", "Neurology")
hospital_system.create_department("respiratory", "Respiratory")
hospital_system.create_department("general", "General Medicine")

# Active triage sessions (in-memory storage)
active_sessions: Dict[str, Dict] = {}

# ═══════════════════════════════════════════════════════════════
# TRIAGE ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.post("/api/triage/init")
async def init_triage(request: InitTriageRequest) -> Dict:
    """
    Initialize triage session
    Returns: initial assessment and first questions
    """
    session_id = str(len(active_sessions) + 1)
    
    active_sessions[session_id] = {
        "patient_name": request.patient_name,
        "patient_age": request.patient_age,
        "phone": request.phone,
        "gender": request.gender,
        "started_at": datetime.now(),
        "scores": {}
    }
    
    return {
        "session_id": session_id,
        "message": f"Welcome {request.patient_name}! Let's assess your condition.",
        "first_question": "Are you conscious and able to respond right now?",
        "expected_duration_minutes": 3
    }


@app.post("/api/triage/critical-assessment")
async def assess_critical(session_id: str, request: CriticalAssessmentRequest) -> Dict:
    """Phase 1: Critical safety assessment"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    critical_score, red_flags = triage_engine.assess_critical_factors(
        is_conscious=request.is_conscious,
        can_speak=request.can_speak,
        can_ambulate=request.can_ambulate,
        breathing_difficulty=request.breathing_difficulty,
        red_flag_text=request.red_flag_description
    )
    
    active_sessions[session_id]["scores"]["critical"] = {
        "score": critical_score,
        "red_flags": red_flags
    }
    
    # If critical score is high, alert immediately
    if red_flags:
        return {
            "phase": "critical",
            "score": critical_score,
            "red_flags": red_flags,
            "alert": "URGENT - Please tell the receptionist immediately",
            "next_question": "Can you describe your main symptom?"
        }
    
    return {
        "phase": "critical",
        "score": critical_score,
        "message": "Thank you. Now let's understand your symptoms better.",
        "next_question": "What's your main concern or symptom right now?"
    }


@app.post("/api/triage/symptom-assessment")
async def assess_symptoms(session_id: str, request: SymptomAssessmentRequest) -> Dict:
    """Phase 2: Symptom analysis with adaptive questions"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    symptom_score, category, adaptive_questions = triage_engine.assess_symptoms(
        symptom_description=request.symptom_description,
        symptom_severity=request.severity,
        symptom_duration=request.duration_text,
        associated_symptoms=request.associated_symptoms
    )
    
    active_sessions[session_id]["scores"]["symptom"] = {
        "score": symptom_score,
        "category": category.value,
        "chief_complaint": request.symptom_description
    }
    
    return {
        "phase": "symptoms",
        "score": symptom_score,
        "category": category.value,
        "adaptive_questions": adaptive_questions,
        "next_question": adaptive_questions[0] if adaptive_questions else "Any other symptoms?",
        "specialist": category.value.title()
    }


@app.post("/api/triage/context-assessment")
async def assess_context(session_id: str, request: ContextAssessmentRequest) -> Dict:
    """Phase 3: Patient demographics and comorbidities"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    context = PatientContext(
        age=request.age,
        gender=request.gender,
        has_diabetes=request.has_diabetes,
        has_hypertension=request.has_hypertension,
        has_heart_disease=request.has_heart_disease,
        has_asthma_copd=request.has_asthma_copd,
        has_cancer=request.has_cancer,
        is_pregnant=request.is_pregnant,
        is_immunocompromised=request.is_immunocompromised,
        on_blood_thinners=request.on_blood_thinners,
        on_antibiotics=request.on_antibiotics,
        on_pain_meds=request.on_pain_meds,
    )
    
    context_score = triage_engine.assess_context(context)
    
    active_sessions[session_id]["scores"]["context"] = {
        "score": context_score,
        "risk_factors": sum([
            request.has_diabetes, request.has_heart_disease,
            request.has_asthma_copd, request.is_pregnant
        ])
    }
    
    return {
        "phase": "context",
        "score": context_score,
        "risk_factors_count": sum([
            request.has_diabetes, request.has_heart_disease,
            request.has_asthma_copd, request.is_pregnant
        ]),
        "next_question": "Do you have any vital signs available (BP, temperature, etc)?"
    }


@app.post("/api/triage/vitals-assessment")
async def assess_vitals(session_id: str, request: VitalSignsRequest) -> Dict:
    """Phase 4: Vital signs assessment"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    vitals = VitalSigns(
        heart_rate=request.heart_rate,
        blood_pressure_systolic=request.blood_pressure_systolic,
        blood_pressure_diastolic=request.blood_pressure_diastolic,
        temperature=request.temperature,
        respiratory_rate=request.respiratory_rate,
        oxygen_saturation=request.oxygen_saturation,
        pain_level=request.pain_level
    )
    
    vital_score, vital_alerts = triage_engine.assess_vitals(vitals)
    
    active_sessions[session_id]["scores"]["vitals"] = {
        "score": vital_score,
        "alerts": vital_alerts
    }
    
    return {
        "phase": "vitals",
        "score": vital_score,
        "alerts": vital_alerts,
        "next_question": "How long has this been going on?"
    }


@app.post("/api/triage/timeline-assessment")
async def assess_timeline(session_id: str, request: TimelineAssessmentRequest) -> Dict:
    """Phase 5: Timeline assessment and final calculation"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    timeline_score = triage_engine.assess_timeline(
        onset_type=request.onset_type,
        duration_hours=request.duration_hours,
        is_recurring=request.is_recurring,
        recent_surgery=request.recent_surgery,
        recent_trauma=request.recent_trauma
    )
    
    active_sessions[session_id]["scores"]["timeline"] = {"score": timeline_score}
    
    # Calculate final result
    scores = active_sessions[session_id]["scores"]
    critical_score = scores.get("critical", {}).get("score", 0)
    symptom_score = scores.get("symptom", {}).get("score", 0)
    context_score = scores.get("context", {}).get("score", 0)
    vital_score = scores.get("vitals", {}).get("score", 0)
    red_flags = scores.get("critical", {}).get("red_flags", [])
    
    total_risk, priority_level = triage_engine.calculate_total_risk(
        critical_score, symptom_score, context_score, vital_score, timeline_score, red_flags
    )
    
    wait_estimate = triage_engine.get_wait_estimate(priority_level)
    specialty = scores.get("symptom", {}).get("category", "general")
    
    active_sessions[session_id]["final_result"] = {
        "total_risk": total_risk,
        "priority_level": priority_level.value,
        "wait_estimate": wait_estimate,
        "specialty": specialty
    }
    
    return {
        "phase": "complete",
        "total_risk_score": round(total_risk, 1),
        "priority_level": priority_level.value,
        "red_flags": red_flags,
        "estimated_wait_minutes": wait_estimate,
        "recommended_specialty": specialty,
        "severity_breakdown": {
            "critical": round(critical_score, 1),
            "symptoms": round(symptom_score, 1),
            "risk_factors": round(context_score, 1),
            "vitals": round(vital_score, 1),
            "timeline": round(timeline_score, 1)
        },
        "ready_for_queue": True
    }


@app.post("/api/triage/complete")
async def complete_triage(request: CompleteTriageRequest) -> Dict:
    """
    Complete triage assessment in single call
    Useful for quick assessments or receptionist input
    """
    # Phase 1: Critical
    critical_score, red_flags = triage_engine.assess_critical_factors(
        is_conscious=request.is_conscious,
        can_speak=request.can_speak,
        can_ambulate=request.can_ambulate,
        breathing_difficulty=request.breathing_difficulty,
        red_flag_description=request.red_flag_description
    )
    
    # Phase 2: Symptoms
    symptom_score, category, _ = triage_engine.assess_symptoms(
        symptom_description=request.symptom_description,
        symptom_severity=request.symptom_severity
    )
    
    # Phase 3: Context
    context = PatientContext(
        age=request.patient_age,
        gender=request.gender,
        has_diabetes=request.has_diabetes,
        has_heart_disease=request.has_heart_disease,
        has_asthma_copd=request.has_asthma_copd,
        on_blood_thinners=request.on_blood_thinners,
    )
    context_score = triage_engine.assess_context(context)
    
    # Phase 4: Vitals
    vitals = VitalSigns(
        heart_rate=request.heart_rate,
        blood_pressure_systolic=request.blood_pressure_systolic,
        temperature=request.temperature,
        oxygen_saturation=request.oxygen_saturation,
        pain_level=request.pain_level
    )
    vital_score, vital_alerts = triage_engine.assess_vitals(vitals)
    
    # Phase 5: Timeline (default immediate)
    timeline_score = 5.0
    
    # Final calculation
    total_risk, priority_level = triage_engine.calculate_total_risk(
        critical_score, symptom_score, context_score, vital_score, timeline_score, red_flags
    )
    
    wait_estimate = triage_engine.get_wait_estimate(priority_level)
    
    return {
        "patient_name": request.patient_name,
        "total_risk_score": round(total_risk, 1),
        "priority_level": priority_level.value,
        "chief_complaint": request.symptom_description,
        "recommended_specialty": category.value,
        "estimated_wait_minutes": wait_estimate,
        "red_flags": red_flags,
        "vital_alerts": vital_alerts,
        "ready_to_queue": True
    }


# ═══════════════════════════════════════════════════════════════
# QUEUE ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@app.post("/api/queue/add-clinic")
async def add_to_clinic_queue(request: AddToQueueRequest) -> Dict:
    """Add patient to clinic queue (single doctor)"""
    patient = QueuedPatient(
        patient_id=request.patient_id,
        name=request.patient_name,
        risk_score=request.risk_score,
        priority_level=request.priority_level,
        chief_complaint=request.chief_complaint,
        recommended_specialty=request.recommended_specialty
    )
    
    if request.appointment_id:
        patient_id = clinic_system.add_booked_appointment(patient, request.appointment_id)
    else:
        patient_id = clinic_system.add_walkin(patient)
    
    position = clinic_system.queue.get_patient_position(patient_id)
    
    return {
        "patient_id": patient_id,
        "queue_position": position,
        "priority_level": request.priority_level,
        "estimated_wait_minutes": triage_engine.get_wait_estimate(
            triage_engine.WEIGHTS.copy()  # Placeholder
        ),
        "message": f"Added to queue at position {position}"
    }


@app.post("/api/queue/add-hospital")
async def add_to_hospital_queue(request: AddToQueueRequest) -> Dict:
    """Add patient to hospital department queue"""
    patient = QueuedPatient(
        patient_id=request.patient_id,
        name=request.patient_name,
        risk_score=request.risk_score,
        priority_level=request.priority_level,
        chief_complaint=request.chief_complaint,
        recommended_specialty=request.recommended_specialty
    )
    
    patient_id = hospital_system.add_patient_to_department(patient, request.department_id)
    
    dept_queue = hospital_system.get_department_queue(request.department_id)
    position = dept_queue.get_patient_position(patient_id) if dept_queue else None
    
    return {
        "patient_id": patient_id,
        "department_id": request.department_id,
        "queue_position": position,
        "priority_level": request.priority_level,
        "message": f"Routed to {request.department_id} - Position {position}"
    }


@app.get("/api/queue/clinic/current")
async def get_clinic_queue() -> Dict:
    """Get current clinic queue"""
    queue = clinic_system.get_current_queue()
    stats = clinic_system.get_queue_stats()
    
    return {
        "statistics": stats,
        "queue": [
            {
                "patient_id": p.patient_id,
                "name": p.name,
                "priority": p.priority_level,
                "position": i + 1,
                "wait_minutes": int((datetime.now() - p.arrival_time).total_seconds() / 60),
                "chief_complaint": p.chief_complaint
            }
            for i, p in enumerate(queue)
        ]
    }


@app.get("/api/queue/hospital/current")
async def get_hospital_queues() -> Dict:
    """Get all department queues"""
    return hospital_system.get_all_queues_summary()


@app.get("/api/queue/{patient_id}/status")
async def get_patient_queue_status(patient_id: str) -> Dict:
    """Get patient's queue status"""
    if patient_id not in clinic_system.queue.patients_dict:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    patient = clinic_system.queue.patients_dict[patient_id]
    position = clinic_system.queue.get_patient_position(patient_id)
    
    return {
        "patient_id": patient_id,
        "name": patient.name,
        "priority_level": patient.priority_level,
        "queue_position": position,
        "wait_minutes": int((datetime.now() - patient.arrival_time).total_seconds() / 60),
        "status": patient.status
    }


@app.post("/api/queue/{patient_id}/next")
async def call_next_patient(patient_id: str) -> Dict:
    """Mark patient as called (doctor calling next patient)"""
    next_patient = clinic_system.get_next_patient()
    
    if not next_patient:
        return {"message": "No patients waiting"}
    
    return {
        "patient_id": next_patient.patient_id,
        "name": next_patient.name,
        "priority": next_patient.priority_level,
        "chief_complaint": next_patient.chief_complaint,
        "message": f"Call {next_patient.name} to examination room"
    }


@app.post("/api/queue/{patient_id}/complete")
async def complete_patient_visit(patient_id: str, duration_minutes: int = 15) -> Dict:
    """Mark patient's visit as completed"""
    clinic_system.queue.mark_patient_completed(patient_id, duration_minutes)
    
    return {
        "patient_id": patient_id,
        "status": "completed",
        "duration_minutes": duration_minutes,
        "message": "Patient visit recorded"
    }


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Triage Engine",
        "timestamp": datetime.now().isoformat()
    }


# ═══════════════════════════════════════════════════════════════
# WEBSOCKET FOR REAL-TIME QUEUE UPDATES
# ═══════════════════════════════════════════════════════════════

connected_clients = []

@app.websocket("/ws/queue/{patient_id}")
async def websocket_queue_updates(websocket: WebSocket, patient_id: str):
    """WebSocket for real-time queue updates"""
    await websocket.accept()
    connected_clients.append(websocket)
    
    try:
        while True:
            # Send queue position every 5 seconds
            if patient_id in clinic_system.queue.patients_dict:
                patient = clinic_system.queue.patients_dict[patient_id]
                position = clinic_system.queue.get_patient_position(patient_id)
                
                await websocket.send_json({
                    "patient_id": patient_id,
                    "queue_position": position,
                    "priority": patient.priority_level,
                    "status": patient.status,
                    "wait_minutes": int((datetime.now() - patient.arrival_time).total_seconds() / 60)
                })
            
            await asyncio.sleep(5)
    except Exception as e:
        connected_clients.remove(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
