# 🏥 TRIAGE SYSTEM - Node.js Backend API

This is the main backend API that handles all patient data, doctor profiles, appointments, authentication, and medical records. It integrates with the Python triage engine for intelligent risk assessment.

## 📋 Architecture

```
Node.js Backend (Port 5000)
├── Patient & Doctor Data Management
├── Appointment Booking System
├── Authentication (JWT)
├── Medical Records (Visits, Prescriptions)
├── Department Management
└── Integration with Python Triage Engine (Port 5001)
```

## 🚀 Quick Start

### Prerequisites

- Node.js v18+ and npm
- PostgreSQL 14+
- Python Triage Engine running on port 5001

### Installation

1. **Install dependencies:**
```bash
cd backend
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Setup database:**
```bash
# Create PostgreSQL database
createdb triage_db

# Or using psql
psql -U postgres -c "CREATE DATABASE triage_db;"
```

4. **Run database migrations:**
```bash
npm run migrate
```

5. **Start server:**
```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

Server will start at `http://localhost:5000`

## 📁 Project Structure

```
backend/
├── src/
│   ├── models/          # Sequelize database models
│   │   └── index.js     # Patient, Doctor, Appointment, Visit, etc.
│   ├── routes/          # API endpoints
│   │   ├── auth.js      # Login, registration, JWT
│   │   ├── patients.js  # Patient dashboard, profile, history
│   │   ├── doctors.js   # Doctor dashboard, patient preview
│   │   ├── appointments.js  # Booking, scheduling, check-in
│   │   ├── triage.js    # Integration with Python engine
│   │   ├── visits.js    # Medical records, prescriptions
│   │   └── departments.js  # Hospital departments
│   ├── middleware/
│   │   └── auth.js      # JWT authentication middleware
│   └── server.js        # Express app entry point
├── package.json
├── .env.example
└── README.md
```

## 🔌 API Endpoints

### Authentication

#### Register Patient
```http
POST /api/auth/register/patient
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "password": "securepassword",
  "dateOfBirth": "1990-01-15",
  "gender": "male",
  "bloodType": "O+"
}
```

#### Login Patient
```http
POST /api/auth/login/patient
Content-Type: application/json

{
  "phone": "+1234567890",
  "password": "securepassword"
}
```

#### Register Doctor
```http
POST /api/auth/register/doctor
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "dr.smith@hospital.com",
  "phone": "+1234567891",
  "password": "doctorpassword",
  "specialty": "Cardiology",
  "licenseNumber": "MD12345",
  "departmentId": 1
}
```

#### Login Doctor
```http
POST /api/auth/login/doctor
Content-Type: application/json

{
  "email": "dr.smith@hospital.com",
  "password": "doctorpassword"
}
```

### Patient Routes

#### Get Patient Dashboard
```http
GET /api/patients/:patientId/dashboard
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "personalInfo": {
    "id": 1,
    "name": "John Doe",
    "age": 34,
    "gender": "male",
    "bloodType": "O+",
    "phone": "+1234567890"
  },
  "medicalProfile": {
    "allergies": [
      { "allergen": "Penicillin", "severity": "severe" }
    ],
    "chronicConditions": [
      { "condition": "Hypertension", "status": "active" }
    ],
    "currentMedications": [
      { "name": "Lisinopril", "dosage": "10mg", "frequency": "once daily" }
    ]
  },
  "visitHistory": {
    "totalVisits": 12,
    "lastVisitDate": "2024-01-15",
    "recentVisits": [...]
  },
  "upcomingAppointments": [...],
  "recentTriageAssessments": [...]
}
```

### Doctor Routes

#### Get Doctor Dashboard
```http
GET /api/doctors/:doctorId/dashboard
Authorization: Bearer <jwt_token>
```

#### Patient Preview (before calling to cabin)
```http
GET /api/doctors/:doctorId/patient-preview/:patientId
Authorization: Bearer <jwt_token>
```

**Response - CRITICAL INFO FOR DOCTOR:**
```json
{
  "basicInfo": {
    "name": "John Doe",
    "age": 34,
    "gender": "male",
    "bloodType": "O+"
  },
  "criticalAlerts": {
    "allergies": [
      { "allergen": "Penicillin", "reaction": "Anaphylaxis", "severity": "life-threatening" }
    ],
    "activeConditions": [
      { "condition": "Hypertension", "severity": "moderate" }
    ]
  },
  "currentMedications": [...],
  "todayTriage": {
    "chiefComplaint": "Chest pain",
    "priorityLevel": "urgent",
    "totalRiskScore": 75,
    "redFlags": ["chest_pain", "shortness_of_breath"],
    "vitalSigns": {
      "bloodPressure": "150/95",
      "heartRate": 95,
      "temperature": 37.2
    }
  },
  "recentVisits": [...],
  "lastVisit": {...}
}
```

#### Call Next Patient
```http
POST /api/doctors/:doctorId/call-next
Authorization: Bearer <jwt_token>
```

### Triage Integration Routes

#### Initiate Triage (Multi-step)
```http
POST /api/triage/initiate
Content-Type: application/json

{
  "patientId": 1,
  "chiefComplaint": "Severe headache",
  "mode": "clinic"
}
```

#### Complete Triage (Single call)
```http
POST /api/triage/complete-single
Content-Type: application/json

{
  "patientId": 1,
  "chiefComplaint": "Chest pain",
  "symptoms": ["chest_pain", "shortness_of_breath"],
  "symptomSeverity": "severe",
  "symptomDuration": 2,
  "vitalSigns": {
    "bloodPressure": "150/95",
    "heartRate": 95,
    "temperature": 37.2
  },
  "mode": "clinic"
}
```

### Appointment Routes

#### Book Appointment
```http
POST /api/appointments/book
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "doctorId": 5,
  "scheduledDate": "2024-12-20",
  "scheduledTime": "10:30",
  "chiefComplaint": "Follow-up consultation",
  "appointmentType": "regular"
}
```

#### Get Available Slots
```http
GET /api/appointments/available-slots/:doctorId?date=2024-12-20
```

#### Check-in to Appointment
```http
POST /api/appointments/:appointmentId/check-in
Authorization: Bearer <jwt_token>
```

#### Cancel Appointment
```http
POST /api/appointments/:appointmentId/cancel
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "reason": "Feeling better"
}
```

### Visit Routes

#### Create Visit Record (Doctor)
```http
POST /api/visits
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "patientId": 1,
  "appointmentId": 123,
  "chiefComplaint": "Chest pain",
  "diagnosis": "Stable angina",
  "treatment": "Prescribed beta-blockers",
  "prescriptions": [
    {
      "medication": "Metoprolol",
      "dosage": "50mg",
      "frequency": "twice daily",
      "duration": "30 days"
    }
  ],
  "doctorNotes": "Patient stable, recommend follow-up in 2 weeks",
  "followUpNeeded": true,
  "followUpDate": "2024-12-27"
}
```

#### Add Prescription to Visit
```http
POST /api/visits/:visitId/prescriptions
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "medication": "Aspirin",
  "dosage": "81mg",
  "frequency": "once daily",
  "duration": "ongoing",
  "instructions": "Take with food"
}
```

### Department Routes

#### Get All Departments
```http
GET /api/departments
```

#### Get Department Queue
```http
GET /api/departments/:departmentId/queue
Authorization: Bearer <jwt_token>
```

## 🔐 Authentication

All protected routes require a JWT token in the Authorization header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Token contains:
- `userId`: Patient or Doctor ID
- `role`: "patient" or "doctor"

## 💾 Database Models

### Patient
- Demographics (name, DOB, gender, blood type)
- Contact info (phone, email, address)
- Emergency contact
- Medical profile (JSONB: allergies, conditions, medications, surgeries)
- Insurance info
- Visit statistics

### Doctor
- Professional info (specialty, license, qualifications)
- Department/clinic association
- Schedule (JSONB: weekly availability slots)
- Statistics (patients seen, ratings)

### Appointment
- Patient-Doctor link
- Date/Time scheduling
- Status tracking (scheduled → checked-in → in-progress → completed)
- Duration tracking

### TriageRecord
- Stores Python engine results
- 5-phase scores (critical, symptom, context, vital, timeline)
- Priority level, queue position
- Red flags, vital signs (JSONB)

### Visit
- Complete medical record
- Diagnosis, ICD codes
- Prescriptions (JSONB array)
- Doctor notes, patient instructions
- Follow-up tracking

### VitalSignRecord
- Blood pressure, heart rate, temperature
- Oxygen saturation, respiratory rate
- Weight, height, BMI
- Pain level (0-10 scale)

## 🔗 Integration with Python Triage Engine

The Node.js backend communicates with the Python FastAPI triage engine:

```javascript
// Node.js calls Python for triage assessment
axios.post('http://localhost:5001/api/triage/complete', {
  patient_id: 1,
  chief_complaint: "Chest pain",
  symptoms: ["chest_pain"],
  vital_signs: { bloodPressure: "150/95" }
})

// Node saves results to database
await TriageRecord.create({
  patientId: 1,
  totalRiskScore: results.final_risk_score,
  priorityLevel: results.priority_level,
  // ... more fields
})
```

## 🧪 Testing

Test endpoints using the provided sample requests:

```bash
# Health check
curl http://localhost:5000/health

# Register patient
curl -X POST http://localhost:5000/api/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{"firstName":"John","lastName":"Doe","phone":"+1234567890","password":"test123"}'

# Login and get token
curl -X POST http://localhost:5000/api/auth/login/patient \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890","password":"test123"}'
```

## 📊 Monitoring

Server logs requests in the format:
```
[2024-12-19T10:30:45.123Z] POST /api/auth/login/patient
✓ Database connection established
✓ Database models synchronized
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in dev mode (nodemon auto-reload)
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U postgres -d triage_db -c "SELECT 1;"
```

### Python Engine Not Responding
```bash
# Verify Python engine is running
curl http://localhost:5001/health

# Start Python engine
cd triage_engine
python main.py
```

### Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

## 🔒 Security Notes

- **JWT Secret:** Change `JWT_SECRET` in production to a strong random string
- **Password Hashing:** Uses bcrypt with 10 salt rounds
- **Rate Limiting:** 100 requests per 15 minutes per IP
- **CORS:** Configure `CORS_ORIGINS` for your frontend domains
- **SQL Injection:** Protected by Sequelize ORM parameterized queries
- **Helmet:** Adds security headers to responses

## 📝 Environment Variables

See `.env.example` for all required variables:
- `PORT` - Server port (default: 5000)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL config
- `JWT_SECRET` - Secret for JWT signing
- `TRIAGE_ENGINE_URL` - Python engine URL (default: http://localhost:5001)
- `CORS_ORIGINS` - Allowed frontend origins

## 📄 License

Part of HACKKRUX Triage System project.
