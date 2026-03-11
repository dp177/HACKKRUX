# AI-POWERED TRIAGE & SCHEDULING SYSTEM
## Architecture & System Design

**Built for:** Personal Doctor Clinic + Multi-Specialty Hospital  
**Timeline:** 1 week MVP  
**Users:** Patients, Doctors, Receptionists, Hospital Managers

---

## 1. SYSTEM OVERVIEW

### Two Operating Modes
```
┌─────────────────────┐          ┌──────────────────────────┐
│  PERSONAL CLINIC    │          │  MULTI-SPECIALTY HOSPIT  │
├─────────────────────┤          ├──────────────────────────┤
│ 1 Doctor            │          │ Multiple Departments     │
│ 50-100 patients/day │          │ Multiple Doctors/Dept    │
│ 2 flows:            │          │ 2 flows:                 │
│  - Walk-in queue    │          │  - Department queue      │
│  - Booked slots     │          │  - Booked slots/dept     │
└─────────────────────┘          └──────────────────────────┘
```

---

## 2. TECH STACK

| Layer | Technology | Purpose | Cost |
|-------|-----------|---------|------|
| **Patient App** | Expo Router + React Native | Cross-platform (iOS/Android) for patient symptom input & booking | ✅ FREE |
| **Staff Dashboard** | Next.js + React | Web portal for doctors, receptionists, hospital managers | ✅ FREE |
| **Main Backend** | Node.js + Express | REST API, auth, appointments, data management | ✅ FREE |
| **Triage Engine** | Python (FastAPI) | AI risk scoring, queue management, personalized questions | ✅ FREE |
| **AI Model** | Ollama + Llama2/Mistral 7B | Self-hosted LLM for conversational triage (no API costs) | ✅ FREE |
| **Database** | PostgreSQL + Redis | Patient data, appointments, real-time queue state | ✅ FREE |
| **Hosting** | Docker + Self-hosted/Render.com free tier | All components containerized | ✅ FREE |

---

## 3. CORE FEATURES

### 3.1 WALK-IN TRIAGE FLOW

```
Patient Arrives (Walk-in) 
    ↓
[Patient Input Options]
  ├─ Text: Type symptoms
  ├─ Voice: Talk to AI (conversational)
  ├─ Form: Pre-filled questions
  ├─ Receptionist: Manual entry
    ↓
[AI Triage Assessment]
  ├─ Step 1: Critical factors (conscious? can speak? mobility?)
  ├─ Step 2: Symptoms + age + medical history
  ├─ Step 3: Vital signs (if available)
  ├─ Step 4: Calculate RISK SCORE (0-100)
  ├─ Step 5: Assign PRIORITY LEVEL (Critical/High/Medium/Low)
    ↓
[Enter Priority Queue]
  ├─ Queue sorted by: Risk Score (desc) + Wait Time (asc)
  ├─ Doctor sees next patient from queue
  ├─ Real-time updates to doctor dashboard
    ↓
[Doctor Calls Patient]
```

**INTELLIGENT ADAPTIVE TRIAGE ASSESSMENT:**

```
═══════════════════════════════════════════════════════════════
PHASE 1: CRITICAL ASSESSMENT (Immediate Safety Check)
═══════════════════════════════════════════════════════════════

Q1: "Are you conscious and able to respond?"
    → NO → IMMEDIATE ESCALATION (Critical Risk = 100)
    → YES → Continue

Q2: "Can you breathe without difficulty right now?"
    → SEVERE DIFFICULTY → +40 points (respiratory distress)
    → MILD DIFFICULTY → +20 points
    → NORMAL → Continue

Q3: "Any of these RIGHT NOW: chest pain, severe bleeding, fainting, seizure?"
    → YES (any) → +50 points (RED FLAG trigger)
    → NO → Continue

RESULT: Critical Risk Score (0-100)
├─ If score ≥ 70 → PRIORITY = CRITICAL (see doctor immediately)
├─ If score ≥ 50 → PRIORITY = HIGH (see within 15 min)
└─ Score < 50 → Continue to Phase 2

═══════════════════════════════════════════════════════════════
PHASE 2: SYMPTOM ANALYSIS (AI Learns What's Wrong)
═══════════════════════════════════════════════════════════════

Q4: "What's your main concern/symptom right now?"
    [Patient describes in their own words]
    
    → AI ANALYZES using LLM:
       ├─ Identifies symptom category (chest, abdomen, neuro, etc.)
       ├─ Detects RED FLAGS (chest pain + shortness of breath = cardiac alert)
       ├─ Extracts severity indicators (mild/moderate/severe)
       ├─ Identifies likely specialties (Cardio, General, Ortho, etc.)
       └─ Generates follow-up symptom-specific questions

Q5-Q9: ADAPTIVE SYMPTOM QUESTIONS (AI Generated)
    IF Chest Pain → 
        - "Pressure/sharp/burning?" (character)
        - "Started suddenly or gradual?" (onset)
        - "Radiation to arm/jaw/back?" (pattern)
        - "With nausea/sweating?" (associated)
        → Scoring: Acute MI risk (ESI Template)
    
    IF Abdominal Pain →
        - "Localized or diffuse?" 
        - "Constant or intermittent?"
        - "With vomiting/fever?" 
        → Scoring: Surgical abdomen risk
    
    IF Headache →
        - "Worst headache of life?" (thunderclap alert)
        - "With vision loss/weakness?" (neuro findings)
        - "Progressive or stable?" (trajectory)
        → Scoring: Stroke/meningitis risk
    
    [Similar adaptive branches for all symptom types]

RESULT: Symptom Risk Score (0-50 points)

═══════════════════════════════════════════════════════════════
PHASE 3: PATIENT CONTEXT (Demographics + Risk Modifiers)
═══════════════════════════════════════════════════════════════

Q10: "Age and any chronic conditions?"
    [Retrieved from patient database OR new entry]
    
    AGE WEIGHTING:
    ├─ <5 years OR >75 years → +15 points (vulnerable)
    ├─ 5-18 years OR 65-75 years → +10 points
    ├─ 19-64 years → 0 points (baseline)
    
    COMORBIDITIES (multiply risk if present):
    ├─ Diabetes → +10 points
    ├─ Hypertension → +8 points
    ├─ Heart Disease → +25 points (when + chest symptoms)
    ├─ Asthma/COPD → +15 points (with respiratory symptoms)
    ├─ Cancer → +12 points
    ├─ Pregnancy → Variable (depends on trimester + symptoms)
    └─ Immunocompromised → +10 points

Q11: "Taking any medications currently?"
    → On blood thinners (warfarin/apixaban)? → +10 (bleeding risk)
    → On antibiotics? → Check if infection present
    → On pain meds? → May mask severity

RESULT: Context Risk Score (0-40 points)

═══════════════════════════════════════════════════════════════
PHASE 4: VITAL SIGNS & OBJECTIVE DATA
═══════════════════════════════════════════════════════════════

Q12: "If available: Blood Pressure, Heart Rate, Temperature, O2 Sat"
    [Receptionist manual entry OR patient self-entry]
    
    VITAL SIGN ALERTS:
    ├─ BP >180/120 → +20 points (hypertensive crisis)
    ├─ HR >120 or <50 → +15 points (tachycardia/bradycardia)
    ├─ Temp >40°C (104F) → +15 points (high fever)
    ├─ O2 Sat <94% → +25 points (hypoxia - CRITICAL)
    ├─ Respiratory Rate >30 → +20 points
    └─ All normal → 0 points

RESULT: Vital Risk Score (0-50 points)

═══════════════════════════════════════════════════════════════
PHASE 5: PSYCHOSOCIAL & TIMELINE FACTORS
═══════════════════════════════════════════════════════════════

Q13: "How long has this been going on?"
    ├─ Sudden onset (last hour) + severe → +10 points (acute)
    ├─ Gradual worsening → +0-5 points
    ├─ Chronic but worse today → +5 points

Q14: "First time or recurring issue?"
    ├─ Known condition, same symptoms → 0 points (stable)
    ├─ New presentation → +5 points (unpredictable)

Q15: "Any recent trauma, surgery, or change?"
    ├─ Recent surgery (<4 weeks) → +15 points (post-op risk)
    ├─ Trauma → +10 points
    ├─ No changes → 0 points

RESULT: Timeline Risk Score (0-20 points)

═══════════════════════════════════════════════════════════════
FINAL SCORING ALGORITHM
═══════════════════════════════════════════════════════════════

TOTAL RISK = 
    (Critical_Score * 0.40)           [40% weight - safety]
  + (Symptom_Score * 0.30)            [30% weight - what's wrong]
  + (Context_Score * 0.15)            [15% weight - vulnerability]
  + (Vitals_Score * 0.10)             [10% weight - objective data]
  + (Timeline_Score * 0.05)           [5% weight - urgency]

RED FLAG OVERRIDES (If ANY triggered, MINIMUM priority = HIGH):
├─ Chest pain of any kind
├─ Severe difficulty breathing
├─ Inability to move limb
├─ Vision/speech changes
├─ Severe bleeding
├─ Altered consciousness
├─ Severe allergic reaction
├─ Severe burn
└─ Suicide/self-harm risk

═══════════════════════════════════════════════════════════════
PRIORITY ASSIGNMENT (Based on TOTAL RISK Score)
═══════════════════════════════════════════════════════════════

CRITICAL (90-100):
    ├─ Example: Chest pain + SOB + low O2 + cardiac history
    ├─ Action: Call doctor IMMEDIATELY, consider ambulance
    ├─ Wait time: <5 minutes
    └─ Triage level: ESI-1

HIGH (70-89):
    ├─ Example: High fever + severe headache + neck stiffness (meningitis risk)
    ├─ Action: See doctor within 10-15 min
    ├─ Wait time: 10-15 minutes
    └─ Triage level: ESI-2

MODERATE (50-69):
    ├─ Example: Moderate pain, vitals stable, no red flags
    ├─ Action: See doctor within 30-45 min
    ├─ Wait time: 30-45 minutes
    └─ Triage level: ESI-3

LOW (30-49):
    ├─ Example: Mild cold symptoms, routine follow-up
    ├─ Action: Standard appointment, within 60 min
    ├─ Wait time: 45-60 minutes
    └─ Triage level: ESI-4

ROUTINE (<30):
    ├─ Example: Wellness check, medication refill
    ├─ Action: Can be scheduled later
    ├─ Wait time: 60+ minutes or reschedule
    └─ Triage level: ESI-5

═══════════════════════════════════════════════════════════════
CONTINUOUS QUEUE RE-SCORING
═══════════════════════════════════════════════════════════════

While patient waits:
├─ Every 5 min: Recalculate risk (ask brief checks)
│   "Any changes in symptoms?"
│   "Still able to breathe okay?"
│   "Pain level now?"
│
├─ If HIGH → CRITICAL change detected → MOVE TO TOP immediately
│
└─ Wait time consideration:
    ├─ Patient waiting >30 min with HIGH priority → escalate
    ├─ Patient waiting >60 min with MODERATE → escalate
    └─ Dynamic adjustment prevents "stuck in queue" situations

═══════════════════════════════════════════════════════════════
```

**INTELLIGENCE FEATURES:**
✅ Adaptive questioning (based on symptoms)
✅ Red flag detection (cardiac, neuro, trauma, etc.)
✅ Multi-factor risk weighting (clinical decision rules)
✅ Continuous re-scoring (detects deterioration)
✅ Comorbidity multiplication (elderly + cardiac = higher)
✅ Vital sign integration (objective data)
✅ Timeline awareness (acute vs chronic)
✅ ESI-equivalent scoring (validated triage scale)
✅ Specialty routing (which dept needs this patient)
✅ Override rules (safety first)

---

### 3.2 BOOKED APPOINTMENT FLOW

```
Doctor Creates Slots (in dashboard)
  ├─ Sets duration: "This appointment = 30 minutes"
  ├─ System auto-creates slots (10:00-10:15, 10:15-10:30, etc.)
  ├─ Doctor marks available times
    ↓
Patient Books via App
  ├─ Sees available slots (calendar view)
  ├─ Submits basic info (name, phone, reason)
  ├─ Reservation CONFIRMED (no triage needed)
    ↓
Doctor Dashboard
  ├─ Sees: Booked appointments at exact times
  ├─ Calls patient when time arrives
  ├─ Separate from walk-in queue (no waiting)
```

---

### 3.3 HOSPITAL DEPARTMENTS (Multi-Specialty)

```
Hospital Setup:
├─ Department 1: Cardiology
│  ├─ Doctor A, B, C
│  ├─ Walk-in queue (cardio patients)
│  ├─ Booked slots (cardio doctors)
│  └─ Receptionist manages this dept queues
│
├─ Department 2: Orthopedics
│  ├─ Doctor X, Y
│  ├─ Walk-in queue (ortho patients)
│  ├─ Booked slots
│  └─ Separate dashboard
│
└─ Department 3: General
   └─ [Similar structure]

KEY: Each department has OWN QUEUE
     Each doctor picks from THEIR DEPT queue first
```

---

## 4. DATABASE SCHEMA (PostgreSQL)

```sql
-- Core Tables
Patients (id, name, age, phone, medical_history, vitals)
Doctors (id, name, specialty, department_id, clinic_id)
Departments (id, name, hospital_id)
Hospitals/Clinics (id, name, type: 'clinic' OR 'hospital', config)

Appointments (id, doctor_id, patient_id, slot_time, duration, status: 'booked'/'completed')
Queue (id, patient_id, department_id, risk_score, priority_level, arrival_time, status: 'waiting'/'called'/'completed')
Slots (id, doctor_id, start_time, end_time, available: true/false, duration_minutes)

Triage_Records (id, patient_id, questions_asked, responses, risk_score, calculated_at)
```

---

## 5. DOCKER ARCHITECTURE

```
Docker Containers:
├─ Node.js Backend (port 5000)
│  └─ REST API, auth, appointment management
├─ Python Triage Engine (port 5001)
│  └─ Queue logic, risk scoring, AI integration
├─ PostgreSQL (port 5432)
│  └─ All persistent data
├─ Redis (port 6379)
│  └─ Real-time queue state, caching
└─ Nginx (port 80/443)
   └─ Route traffic to services

docker-compose.yml handles orchestration
```

---

## 6. API ENDPOINTS

### Patient App → Node Backend
```
POST   /api/patients/register          (new patient)
POST   /api/appointments/book          (book a slot)
GET    /api/appointments/{id}          (view booking)
GET    /api/available-slots/{doctor}   (fetch available times)
```

### Triage Flow → Python Backend
```
POST   /api/triage/init                (start assessment)
POST   /api/triage/answer              (submit answer, get next Q)
GET    /api/queue/{clinic_or_dept}     (get current queue)
PUT    /api/queue/{patient}/priority   (update priority)
```

### Doctor Dashboard → Node Backend
```
GET    /api/doctor/queue               (my current queue)
GET    /api/doctor/appointments        (my booked patients)
PUT    /api/queue/{patient}/called     (mark as seen)
GET    /api/doctor/stats               (wait times, throughput)
```

---

## 7. REAL-TIME SYNC (WebSockets)

Queue updates push to doctor dashboard instantly:
```
When walk-in priority changes:
  → WebSocket broadcasts to doctor
  → Dashboard refreshes (no manual refresh)

When booked patient arrives:
  → System notifies doctor
```

---

## 8. SECURITY & COMPLIANCE

- **Encryption:** TLS in transit, encrypted at rest
- **Auth:** JWT tokens (patient app, staff dashboard)
- **HIPAA/Privacy:** Patient data encrypted, access logs
- **Rate limiting:** Prevent abuse
- **Audit trail:** All queue changes logged

---

## 9. DEPLOYMENT FLOW

### Week 1 MVP (Target)
```
Day 1: Python triage engine + basic queue
Day 2: Node API + database setup
Day 3: Expo app skeleton + booking form
Day 4: Next.js doctor dashboard
Day 5: Integrate all, test clinic mode
Day 6: Add hospital mode (departments)
Day 7: Deploy + refine
```

### Production Ready (Week 2-3)
- Load testing
- Edge cases (peak hours, network issues)
- User feedback iteration

---

## 10. KEY METRICS TO TRACK

- **Queue wait time:** Target <30 min average
- **Triage duration:** Target <2 min per walk-in
- **Booking utilization:** % booked slots filled
- **Doctor call accuracy:** Right patient at right time
- **Hospital mode:** Patients routed to correct dept

---

## NEXT STEP

**Ready to code?** We'll build in this order:
1. ✅ Python triage backend (queue + risk scoring)
2. Node.js REST API
3. PostgreSQL setup
4. Expo patient app
5. Next.js doctor dashboard
6. Integration & testing

**Questions before we start?**
