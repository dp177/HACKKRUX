# 🏥 AI-Powered Medical Triage & Queue Management System

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An intelligent healthcare triage system that uses AI/LLM to assess patient severity, prioritize walk-ins, and manage appointment schedules. Built for both **personal clinics** (single doctor) and **multi-specialty hospitals** (multiple departments).

## 🎯 Problem Statement

Healthcare facilities face critical challenges:
- **Long wait times** for walk-in patients
- **Inefficient manual triage** based on first-come-first-served
- **No intelligent prioritization** of emergency cases
- **Booked patients waiting** alongside walk-ins
- **Information overload** for doctors reviewing patient histories

## ✨ Key Features

### 🚨 Intelligent Triage Engine
- **5-Phase Assessment:** Critical factors, symptoms, patient context, vitals, timeline
- **Risk Scoring:** 0-100 weighted score with explainable breakdown
- **Red Flag Detection:** Automatically identifies life-threatening symptoms
- **LLM-Powered:** Conversational triage using Ollama + Llama2 (100% FREE)

### 📊 Dynamic Queue Management
- **Priority-Based:** Patients sorted by risk score + wait time
- **Continuous Re-scoring:** Queue updates every 5 minutes
- **Department Routing:** Smart specialty recommendations
- **Real-time Updates:** WebSocket notifications for position changes

### 📅 Dual-Mode Booking System
- **Walk-In Queue:** Priority queue for triage-assessed patients
- **Booked Appointments:** Guaranteed time slots with doctor availability management
- **VIP Lanes:** Separate queues for scheduled vs walk-in patients

### 👨‍⚕️ Doctor Dashboard
- **Patient Preview:** Critical allergies, medications, history before calling
- **Queue Visibility:** See who's waiting with priority levels
- **Today's Schedule:** Appointments + walk-ins in one view
- **Quick Actions:** Call next patient, start consultation, complete visit

### 👨‍💼 Patient Dashboard
- **Medical History:** All visits, diagnoses, prescriptions
- **Vital Trends:** Blood pressure, weight, BMI tracking
- **Upcoming Appointments:** View and manage bookings
- **Triage Records:** Past assessments and risk scores

### 🔒 Security & Privacy
- **JWT Authentication:** Separate roles for patients and doctors
- **Password Hashing:** bcrypt with 10 salt rounds
- **HIPAA-Ready Architecture:** Encrypted data, audit trails
- **Rate Limiting:** Protection against abuse

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATIONS                      │
├──────────────────────────┬──────────────────────────────────┤
│   Next.js Dashboard      │   Expo React Native App         │
│   (Doctors/Staff)        │   (Patients)                     │
└──────────┬───────────────┴─────────────┬────────────────────┘
           │                              │
           │         HTTP/REST API        │
           └──────────────┬───────────────┘
                          │
         ┌────────────────▼────────────────┐
         │   Node.js Express Backend       │
         │   (Port 5000)                   │
         ├─────────────────────────────────┤
         │ • Patient/Doctor Management     │
         │ • Appointments & Scheduling     │
         │ • Authentication (JWT)          │
         │ • Medical Records & Visits      │
         │ • Department Management         │
         └──────────┬──────────────────────┘
                    │
      ┌─────────────┼─────────────┐
      │             │             │
      ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │  │  Python  │
│ (Data)   │  │ (Cache)  │  │  Triage  │
│          │  │          │  │  Engine  │
│ Patients │  │ Queue    │  │ (5001)   │
│ Doctors  │  │ State    │  │          │
│ Visits   │  │          │  │ • Ollama │
│ Triage   │  │          │  │ • Llama2 │
└──────────┘  └──────────┘  └────┬─────┘
                                  │
                            ┌─────▼─────┐
                            │   Ollama  │
                            │   Server  │
                            │ (Port 11434)│
                            └───────────┘
```

## 🛠️ Technology Stack

### 100% FREE - No API Costs! 💰

**Backend Services:**
- **Node.js + Express** - Main API server (patient/doctor/appointments)
- **Python + FastAPI** - Triage engine (risk assessment only)
- **PostgreSQL** - Relational database with JSONB support
- **Redis** - Real-time queue state & caching
- **Ollama + Llama2** - Self-hosted LLM (replaces GPT-4o for $0 cost)

**Frontend (Planned):**
- **Next.js** - Doctor/staff dashboard
- **Expo Router** - Patient mobile app (React Native)

**DevOps:**
- **Docker + docker-compose** - Multi-service orchestration
- **JWT** - Stateless authentication
- **WebSockets** - Real-time queue updates

## 🚀 Quick Start

### Prerequisites

```bash
# Required Software
- Node.js 18+
- Python 3.10+
- PostgreSQL 14+
- Redis 7+
- Ollama (for local LLM)
```

### Installation

**1. Clone Repository:**
```bash
git clone <repository-url>
cd HACKKRUX
```

**2. Setup Database:**
```bash
# Create PostgreSQL database
createdb triage_db

# Or using Docker
docker run -d \
  --name triage-postgres \
  -e POSTGRES_DB=triage_db \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:14
```

**3. Install Ollama + Llama2:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Llama2 model (3GB download)
ollama pull llama2

# Start Ollama server (runs on port 11434)
ollama serve
```

**4. Setup Python Triage Engine:**
```bash
cd triage_engine

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start triage engine (port 5001)
python main.py
```

**5. Setup Node.js Backend:**
```bash
cd ../backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Start server (port 5000)
npm run dev
```

**6. Verify Everything Works:**
```bash
# Check Node.js backend
curl http://localhost:5000/health

# Check Python triage engine
curl http://localhost:5001/health

# Check Ollama
curl http://localhost:11434/api/version
```

## 📖 Usage Examples

### Patient Registration & Triage

```bash
# 1. Register patient
curl -X POST http://localhost:5000/api/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "password": "securepass",
    "dateOfBirth": "1985-06-15",
    "gender": "male",
    "bloodType": "O+"
  }'

# Response includes JWT token
{
  "message": "Patient registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "patient": { "id": "uuid", "name": "John Doe" }
}

# 2. Perform triage assessment
curl -X POST http://localhost:5000/api/triage/complete-single \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "uuid",
    "chiefComplaint": "Severe chest pain",
    "symptoms": ["chest_pain", "shortness_of_breath"],
    "symptomSeverity": "severe",
    "symptomDuration": 2,
    "vitalSigns": {
      "bloodPressure": "150/95",
      "heartRate": 95,
      "temperature": 37.2
    },
    "mode": "clinic"
  }'

# Response includes risk score and queue position
{
  "triageId": "uuid",
  "priorityLevel": "urgent",
  "riskScore": 85,
  "queuePosition": 1,
  "estimatedWaitMinutes": 5,
  "redFlags": ["chest_pain", "shortness_of_breath"],
  "summary": "High-priority case with cardiac red flags"
}
```

### Doctor Workflow

```bash
# 1. Login as doctor
curl -X POST http://localhost:5000/api/auth/login/doctor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dr.smith@hospital.com",
    "password": "doctorpass"
  }'

# 2. Get dashboard (today's schedule + queue)
curl -X GET http://localhost:5000/api/doctors/:doctorId/dashboard \
  -H "Authorization: Bearer <token>"

# 3. Preview patient before calling
curl -X GET http://localhost:5000/api/doctors/:doctorId/patient-preview/:patientId \
  -H "Authorization: Bearer <token>"

# Returns critical info:
{
  "basicInfo": { "name": "John Doe", "age": 39, "bloodType": "O+" },
  "criticalAlerts": {
    "allergies": [{ "allergen": "Penicillin", "severity": "severe" }],
    "activeConditions": [{ "condition": "Hypertension" }]
  },
  "currentMedications": [...],
  "todayTriage": {
    "chiefComplaint": "Chest pain",
    "riskScore": 85,
    "redFlags": ["chest_pain"]
  },
  "recentVisits": [...]
}

# 4. Call next patient
curl -X POST http://localhost:5000/api/doctors/:doctorId/call-next \
  -H "Authorization: Bearer <token>"

# 5. Complete visit record
curl -X POST http://localhost:5000/api/visits \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientId": "uuid",
    "chiefComplaint": "Chest pain",
    "diagnosis": "Stable angina",
    "treatment": "Prescribed beta-blockers",
    "prescriptions": [{
      "medication": "Metoprolol",
      "dosage": "50mg",
      "frequency": "twice daily",
      "duration": "30 days"
    }],
    "followUpNeeded": true,
    "followUpDate": "2024-12-27"
  }'
```

### Appointment Booking

```bash
# 1. Get available slots for doctor
curl http://localhost:5000/api/appointments/available-slots/:doctorId?date=2024-12-20

# Response:
{
  "date": "2024-12-20",
  "doctorName": "Dr. Smith",
  "availableSlots": [
    { "time": "09:00", "available": true },
    { "time": "09:30", "available": false },
    { "time": "10:00", "available": true }
  ]
}

# 2. Book appointment
curl -X POST http://localhost:5000/api/appointments/book \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": "uuid",
    "scheduledDate": "2024-12-20",
    "scheduledTime": "10:00",
    "chiefComplaint": "Follow-up consultation"
  }'
```

## 📊 Database Schema

### Core Models

**Patient** (50+ fields)
- Demographics, contact, emergency contact
- Medical profile (JSONB: allergies, conditions, medications, surgeries)
- Insurance, preferences
- Visit statistics

**Doctor**
- Professional info (specialty, license, qualifications)
- Department/clinic association
- Schedule (JSONB: weekly availability)
- Statistics (patients seen, ratings)

**Appointment**
- Patient-Doctor link with date/time
- Status tracking (scheduled → completed)
- Duration tracking

**TriageRecord** (stores Python results)
- 5-phase scores (critical, symptom, context, vital, timeline)
- Priority level, queue position
- Red flags, vital signs (JSONB)

**Visit** (complete medical record)
- Diagnosis, ICD codes
- Prescriptions (JSONB array)
- Doctor notes, patient instructions
- Follow-up tracking

**Department**
- Name, code, floor, capacity
- Associated doctors

**VitalSignRecord**
- Blood pressure, heart rate, temperature
- Oxygen saturation, respiratory rate
- Weight, height, BMI, pain level

## 🔌 API Documentation

See detailed API docs:
- **Backend API:** [backend/README.md](backend/README.md)
- **Triage Engine:** `triage_engine/README.md` (already exists)

Quick reference:
- **Auth:** `/api/auth/register/*`, `/api/auth/login/*`
- **Patients:** `/api/patients/:id/dashboard`, `/api/patients/:id/visits`
- **Doctors:** `/api/doctors/:id/dashboard`, `/api/doctors/:id/patient-preview/:patientId`
- **Appointments:** `/api/appointments/book`, `/api/appointments/available-slots/:doctorId`
- **Triage:** `/api/triage/complete-single`, `/api/triage/initiate`
- **Visits:** `/api/visits`, `/api/visits/:id/prescriptions`
- **Departments:** `/api/departments`, `/api/departments/:id/queue`

## 🎮 Two Operational Modes

### 1. Personal Clinic (Single Doctor)
```javascript
// Configure for single-doctor practice
{
  mode: "clinic",
  doctorId: 1,
  queueType: "single" // All patients in one queue
}
```

Features:
- One doctor, one queue
- Walk-ins get triaged and queued by priority
- Booked appointments get guaranteed slots
- Simple queue visualization

### 2. Multi-Specialty Hospital (Departments)
```javascript
// Configure for hospital with departments
{
  mode: "hospital",
  departments: [
    { id: 1, name: "Cardiology", doctors: [1, 2, 3] },
    { id: 2, name: "Orthopedics", doctors: [4, 5] }
  ],
  queueType: "departmental" // Separate queues per department
}
```

Features:
- Multiple departments with specialized doctors
- Triage engine recommends appropriate specialty
- Department-level queue management
- Cross-department patient transfers

## 🔐 Security Features

- **JWT Authentication:** Separate tokens for patients and doctors
- **Password Hashing:** bcrypt with 10 salt rounds
- **Rate Limiting:** 100 requests per 15 minutes per IP
- **CORS Protection:** Configurable allowed origins
- **Helmet Security Headers:** XSS, clickjacking protection
- **SQL Injection Prevention:** Sequelize ORM parameterized queries
- **Data Privacy:** JSONB encryption support for sensitive fields

## 📈 Performance Optimizations

- **Redis Caching:** Queue state cached for instant access
- **Database Indexing:** UUID primary keys, indexed foreign keys
- **Connection Pooling:** PostgreSQL connection pool (max 20)
- **Lazy Loading:** Sequelize includes only requested associations
- **WebSocket Efficiency:** Only broadcast queue updates when changed
- **Background Re-scoring:** Async queue priority recalculation every 5min

## 🧪 Testing

```bash
# Backend API tests
cd backend
npm test

# Python triage engine tests
cd triage_engine
pytest tests/

# Integration tests
docker-compose up -d
npm run test:integration
```

## 🐛 Troubleshooting

### Common Issues

**1. Database Connection Failed**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U postgres -d triage_db -c "SELECT 1;"
```

**2. Python Engine Not Responding**
```bash
# Verify Ollama is running
curl http://localhost:11434/api/version

# Check Python logs
cd triage_engine
python main.py  # Look for startup errors
```

**3. Port Already in Use**
```bash
# Find process using port
lsof -i :5000  # Node.js
lsof -i :5001  # Python

# Kill process
kill -9 <PID>
```

**4. Ollama Model Not Found**
```bash
# List installed models
ollama list

# Pull Llama2 if missing
ollama pull llama2
```

## 📚 Project Structure

```
HACKKRUX/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── models/            # Sequelize database models
│   │   │   └── index.js       # Patient, Doctor, Appointment, etc.
│   │   ├── routes/            # API endpoints
│   │   │   ├── auth.js        # Authentication
│   │   │   ├── patients.js    # Patient management
│   │   │   ├── doctors.js     # Doctor dashboard
│   │   │   ├── appointments.js # Booking system
│   │   │   ├── triage.js      # Python integration
│   │   │   ├── visits.js      # Medical records
│   │   │   └── departments.js # Hospital departments
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT verification
│   │   └── server.js          # Express app entry
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── triage_engine/             # Python FastAPI triage
│   ├── triage.py              # 5-phase assessment engine
│   ├── queue.py               # Priority queue management
│   ├── main.py                # FastAPI server
│   └── README.md
│
├── docker-compose.yml         # Multi-service orchestration
└── README.md                  # This file
```

## 🛣️ Roadmap

### ✅ Completed (Phase 1)
- [x] Python triage engine (5-phase assessment)
- [x] Dynamic priority queue with re-scoring
- [x] Node.js backend (CRUD for all entities)
- [x] JWT authentication
- [x] Patient dashboard API
- [x] Doctor preview API
- [x] Appointment booking system
- [x] Triage integration
- [x] PostgreSQL schema (7 models)

### 🔄 In Progress (Phase 2)
- [ ] Next.js doctor dashboard UI
- [ ] Expo patient mobile app
- [ ] WebSocket real-time queue updates
- [ ] Database migration scripts
- [ ] Docker deployment setup

### 📋 Planned (Phase 3)
- [ ] SMS notifications (Twilio)
- [ ] Email reminders (nodemailer)
- [ ] Analytics dashboard (patient flow, wait times)
- [ ] Multi-language support (i18n)
- [ ] Telemedicine integration (video calls)
- [ ] Prescription printing (PDF generation)
- [ ] Insurance claim integration
- [ ] HIPAA compliance audit logs

## 👥 Contributing

This is a hackathon project for HACKKRUX. Contributions welcome!

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **Ollama Team** - For free local LLM inference
- **Llama2** - Meta's open-source language model
- **FastAPI** - High-performance Python framework
- **Sequelize** - Node.js ORM for PostgreSQL
- **Healthcare Workers** - For insights into triage workflows

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Email: [your-email]
- Documentation: See README files in each directory

---

**Built with ❤️ for HACKKRUX** | Making healthcare smarter, one patient at a time.
