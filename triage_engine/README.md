# Triage Engine - Core Medical Triage System

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run with Docker (Recommended)
```bash
docker-compose up -d
```

### 3. Run Locally
```bash
python main.py
```

Access API at: `http://localhost:5001`
Swagger Docs: `http://localhost:5001/docs`

---

## API ENDPOINTS

### TRIAGE ASSESSMENT (5 Phases)

#### 1. Initialize Triage Session
```bash
POST /api/triage/init
Content-Type: application/json

{
  "patient_name": "John Doe",
  "patient_age": 45,
  "phone": "555-1234",
  "gender": "M"
}
```

**Response:**
```json
{
  "session_id": "1",
  "message": "Welcome John Doe! Let's assess your condition.",
  "first_question": "Are you conscious and able to respond right now?",
  "expected_duration_minutes": 3
}
```

---

#### 2. Critical Assessment
```bash
POST /api/triage/critical-assessment?session_id=1
Content-Type: application/json

{
  "is_conscious": true,
  "can_speak": true,
  "can_ambulate": true,
  "breathing_difficulty": "moderate",
  "red_flag_description": "chest pain"
}
```

**Response:**
```json
{
  "phase": "critical",
  "score": 50.0,
  "red_flags": ["Chest pain"],
  "alert": "URGENT - Please tell the receptionist immediately",
  "next_question": "Can you describe your main symptom?"
}
```

---

#### 3. Symptom Assessment
```bash
POST /api/triage/symptom-assessment?session_id=1
Content-Type: application/json

{
  "symptom_description": "Severe chest pain with shortness of breath",
  "severity": "severe",
  "duration_text": "sudden onset 30 minutes ago",
  "associated_symptoms": ["sweating", "nausea"]
}
```

**Response:**
```json
{
  "phase": "symptoms",
  "score": 45.5,
  "category": "chest",
  "adaptive_questions": [
    "Is the pain pressure, sharp, or burning?",
    "Did it start suddenly or gradually?",
    "Does it radiate to your arm, jaw, or back?",
    "Are you experiencing sweating or nausea?",
    "Any shortness of breath?"
  ],
  "specialist": "Cardiology"
}
```

---

#### 4. Context Assessment
```bash
POST /api/triage/context-assessment?session_id=1
Content-Type: application/json

{
  "age": 45,
  "gender": "M",
  "has_diabetes": true,
  "has_heart_disease": true,
  "has_asthma_copd": false,
  "on_blood_thinners": true
}
```

**Response:**
```json
{
  "phase": "context",
  "score": 35.0,
  "risk_factors_count": 2,
  "next_question": "Do you have any vital signs available?"
}
```

---

#### 5. Vitals Assessment
```bash
POST /api/triage/vitals-assessment?session_id=1
Content-Type: application/json

{
  "heart_rate": 95,
  "blood_pressure_systolic": 140,
  "blood_pressure_diastolic": 90,
  "temperature": 37.5,
  "respiratory_rate": 20,
  "oxygen_saturation": 95.0,
  "pain_level": 8
}
```

**Response:**
```json
{
  "phase": "vitals",
  "score": 15.0,
  "alerts": ["Possible tachycardia: HR 95 bpm", "Slight elevation in BP"],
  "next_question": "How long has this been going on?"
}
```

---

#### 6. Timeline & Final Result
```bash
POST /api/triage/timeline-assessment?session_id=1
Content-Type: application/json

{
  "onset_type": "sudden",
  "duration_hours": 0.5,
  "is_recurring": false,
  "recent_surgery": false,
  "recent_trauma": false
}
```

**Response:**
```json
{
  "phase": "complete",
  "total_risk_score": 75.3,
  "priority_level": "HIGH",
  "red_flags": ["Chest pain"],
  "estimated_wait_minutes": 15,
  "recommended_specialty": "cardiology",
  "severity_breakdown": {
    "critical": 50.0,
    "symptoms": 45.5,
    "risk_factors": 35.0,
    "vitals": 15.0,
    "timeline": 10.0
  },
  "ready_for_queue": true
}
```

---

### QUICK ASSESSMENT (Single Call)

For receptionist quick input:

```bash
POST /api/triage/complete
Content-Type: application/json

{
  "patient_name": "Jane Smith",
  "patient_age": 32,
  "phone": "555-5678",
  "gender": "F",
  "is_conscious": true,
  "can_speak": true,
  "can_ambulate": true,
  "breathing_difficulty": "severe",
  "symptom_description": "Shortness of breath for 2 hours",
  "has_asthma_copd": true,
  "oxygen_saturation": 92.0,
  "pain_level": 6
}
```

**Response:** Same as Phase 6 (complete triage result)

---

### QUEUE MANAGEMENT

#### Add to Clinic Queue
```bash
POST /api/queue/add-clinic
Content-Type: application/json

{
  "patient_id": "P001",
  "patient_name": "John Doe",
  "risk_score": 75.3,
  "priority_level": "HIGH",
  "chief_complaint": "Chest pain",
  "recommended_specialty": "cardiology"
}
```

**Response:**
```json
{
  "patient_id": "P001",
  "queue_position": 2,
  "priority_level": "HIGH",
  "estimated_wait_minutes": 15,
  "message": "Added to queue at position 2"
}
```

---

#### Add to Hospital Department Queue
```bash
POST /api/queue/add-hospital
Content-Type: application/json

{
  "patient_id": "P001",
  "patient_name": "John Doe",
  "risk_score": 75.3,
  "priority_level": "HIGH",
  "chief_complaint": "Chest pain",
  "recommended_specialty": "cardiology",
  "department_id": "cardio"
}
```

---

#### Get Clinic Queue Status
```bash
GET /api/queue/clinic/current
```

**Response:**
```json
{
  "statistics": {
    "department": "Main Clinic",
    "waiting_count": 5,
    "being_seen": 1,
    "completed_today": 12,
    "avg_wait_minutes": 18.5,
    "max_wait_minutes": 35.0,
    "total_in_queue": 6
  },
  "queue": [
    {
      "patient_id": "P001",
      "name": "John Doe",
      "priority": "CRITICAL",
      "position": 1,
      "wait_minutes": 5,
      "chief_complaint": "Chest pain"
    },
    {
      "patient_id": "P002",
      "name": "Jane Smith",
      "priority": "HIGH",
      "position": 2,
      "wait_minutes": 12,
      "chief_complaint": "Shortness of breath"
    }
  ]
}
```

---

#### Get Patient Queue Status
```bash
GET /api/queue/P001/status
```

**Response:**
```json
{
  "patient_id": "P001",
  "name": "John Doe",
  "priority_level": "HIGH",
  "queue_position": 2,
  "wait_minutes": 12,
  "status": "waiting"
}
```

---

#### Doctor Calls Next Patient
```bash
POST /api/queue/P001/next
```

**Response:**
```json
{
  "patient_id": "P001",
  "name": "John Doe",
  "priority": "HIGH",
  "chief_complaint": "Chest pain",
  "message": "Call John Doe to examination room"
}
```

---

#### Complete Patient Visit
```bash
POST /api/queue/P001/complete?duration_minutes=20
```

**Response:**
```json
{
  "patient_id": "P001",
  "status": "completed",
  "duration_minutes": 20,
  "message": "Patient visit recorded"
}
```

---

## RISK SCORING ALGORITHM

**Total Risk = (Critical × 0.40) + (Symptom × 0.30) + (Context × 0.15) + (Vitals × 0.10) + (Timeline × 0.05)**

### Priority Levels
- **CRITICAL (90-100):** Immediate threat to life
- **HIGH (70-89):** High risk, needs rapid evaluation
- **MODERATE (50-69):** Stable, moderate complexity
- **LOW (30-49):** Minor, simple problem
- **ROUTINE (<30):** Minimal acuity

### Wait Time Estimates
- **CRITICAL:** 5 minutes
- **HIGH:** 15 minutes
- **MODERATE:** 45 minutes
- **LOW:** 60 minutes
- **ROUTINE:** 120+ minutes

---

## RED FLAG TRIGGERS

Automatically escalates to HIGH priority (minimum):
- Chest pain
- Severe difficulty breathing
- Loss of consciousness
- Severe bleeding
- Seizures
- Vision loss
- Stroke signs (facial droop, weakness)
- Anaphylaxis
- Severe burn injury
- Suicidal ideation

---

## EXAMPLE FLOW

### Patient Arrives with Chest Pain

```
1. Receptionist enters patient info → /api/triage/init

2. AI asks critical questions → /api/triage/critical-assessment
   (Detects "chest pain" → RED FLAG)

3. Symptom questions → /api/triage/symptom-assessment
   (Sympathetic assessment → cardiology specialist)

4. Medical history → /api/triage/context-assessment
   (Patient has diabetes, heart disease)

5. Vital signs → /api/triage/vitals-assessment
   (BP elevated, O2 normal, HR 95)

6. Timeline → /api/triage/timeline-assessment
   (Sudden onset 30 min ago)

7. RESULT: HIGH PRIORITY → 15 min estimated wait
   → Added to queue
   → Doctor alerted immediately

8. WebSocket updates patient in real-time
   → "Position 2 in queue, 8 minutes to wait"

9. Doctor calls patient when ready
   → /api/queue/P001/next

10. Visit complete → /api/queue/P001/complete?duration_minutes=20
```

---

## PERFORMANCE

- **Triage Time:** ~2-3 minutes per patient
- **Queue Rescore:** Every 5 minutes (adjusts wait-time priority)
- **Real-time Updates:** WebSocket push to all connected clients
- **Throughput:** Handles 50-100 patients/day per clinic

---

## RESPONSIBLE AI PRACTICES

✅ **Explainability:** Every score shows component breakdown
✅ **Human-in-the-loop:** AI supports decision, doctor makes final call
✅ **No automation:** System never auto-treats, only prioritizes
✅ **Bias monitoring:** Tracks demographic data for fairness analysis
✅ **Privacy:** All patient data encrypted at rest & in transit
✅ **Audit trail:** Every queue change logged

---

## TESTING

```bash
# Run unit tests
pytest test_triage.py -v

# Run integration tests
pytest test_integration.py -v

# Load testing
locust -f locustfile.py --headless -u 100 -r 10
```

---

## TROUBLESHOOTING

**API not responding:**
```bash
docker-compose logs triage_engine
```

**Database connection error:**
```bash
docker-compose logs postgres
```

**WebSocket not updating:**
- Check browser console for connection errors
- Verify patient_id matches in URL

---

## DEPLOYMENT

### Production Checklist
- [ ] Configure environment variables (.env)
- [ ] Set up HTTPS/TLS
- [ ] Configure rate limiting
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Configure logging (ELK stack)
- [ ] Set up backups
- [ ] Load test with expected volume
- [ ] Audit security

### Scale to Multiple Hospitals
- Separate database per hospital (or multi-tenant schema)
- Load-balanced API servers
- Redis cluster for cache
- Kafka for event streaming between departments

---

## LICENSE & COMPLIANCE

- **HIPAA Ready:** Encryption, access controls, audit logs
- **GDPR Compliant:** Data minimization, right to deletion
- **Open Source:** MIT License
- **No Real Data:** Use synthetic/de-identified datasets only

---

For questions or contributions: [GitHub Issues]
