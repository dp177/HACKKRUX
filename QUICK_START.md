# 🚀 QUICK START GUIDE

Get the AI Triage System running in **10 minutes**!

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js 18+** - [Download](https://nodejs.org/)
- [ ] **Python 3.10+** - [Download](https://www.python.org/)
- [ ] **PostgreSQL 14+** - [Download](https://www.postgresql.org/)
- [ ] **Ollama** - [Download](https://ollama.com/download)

### Quick Install Commands (Windows)

```powershell
# Install via Chocolatey (package manager)
choco install nodejs python postgresql

# Install Ollama
winget install Ollama.Ollama
```

## 🎯 Fast Setup (Automated)

### Option 1: Automated Setup Script

```powershell
# Run the automated setup (installs everything)
.\setup.ps1

# Start all services
.\start.ps1

# Test the system
.\test-api.ps1
```

**That's it!** Skip to [Step 5: Verify](#step-5-verify) if this worked.

---

## 🛠️ Manual Setup (If automated fails)

### Step 1: Database Setup (2 minutes)

```powershell
# Create database
psql -U postgres

postgres=# CREATE DATABASE triage_db;
postgres=# \q
```

### Step 2: Install Ollama Model (5 minutes, 3GB download)

```powershell
# Start Ollama server (leave running)
ollama serve

# In NEW terminal, download Llama2
ollama pull llama2
```

### Step 3: Python Triage Engine (2 minutes)

```powershell
cd triage_engine

# Create virtual environment
python -m venv venv

# Activate it
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start server (keep running)
python main.py
```

✅ Python engine running on **http://localhost:5001**

### Step 4: Node.js Backend (2 minutes)

Open **NEW PowerShell window**:

```powershell
cd backend

# Install dependencies
npm install

# Create config file
cp .env.example .env

# Edit .env - Update these lines:
# DB_PASSWORD=your_postgres_password
# JWT_SECRET=any_random_string_here

# Start server
npm run dev
```

✅ Node.js API running on **http://localhost:5000**

### Step 5: Verify

Open browser or run commands:

```powershell
# Check backend
curl http://localhost:5000/health

# Check triage engine  
curl http://localhost:5001/health

# Check Ollama
curl http://localhost:11434/api/version
```

Expected output:
```json
{
  "status": "healthy",
  "service": "Node.js Backend API",
  "timestamp": "2024-12-19T10:30:45.123Z"
}
```

---

## 🎮 First API Calls

### 1. Register a Patient

```powershell
# PowerShell
$body = @{
    firstName = "John"
    lastName = "Doe"
    phone = "+1234567890"
    password = "securepass"
    dateOfBirth = "1990-05-15"
    gender = "male"
    bloodType = "O+"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register/patient" `
    -Method POST -Body $body -ContentType "application/json"

$result
# Save the token!
$TOKEN = $result.token
$PATIENT_ID = $result.patient.id
```

**Response:**
```json
{
  "message": "Patient registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "patient": {
    "id": "uuid-here",
    "name": "John Doe",
    "phone": "+1234567890"
  }
}
```

### 2. Perform Triage

```powershell
$triageBody = @{
    patientId = $PATIENT_ID
    chiefComplaint = "Severe chest pain"
    symptoms = @("chest_pain", "shortness_of_breath")
    symptomSeverity = "severe"
    symptomDuration = 2
    vitalSigns = @{
        bloodPressure = "150/95"
        heartRate = 95
        temperature = 37.2
    }
    mode = "clinic"
} | ConvertTo-Json -Depth 10

$headers = @{
    "Authorization" = "Bearer $TOKEN"
}

$triageResult = Invoke-RestMethod -Uri "http://localhost:5000/api/triage/complete-single" `
    -Method POST -Headers $headers -Body $triageBody -ContentType "application/json"

$triageResult
```

**Response:**
```json
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

### 3. Register a Doctor

```powershell
$doctorBody = @{
    firstName = "Jane"
    lastName = "Smith"
    email = "dr.smith@hospital.com"
    phone = "+9876543210"
    password = "doctorpass"
    specialty = "Cardiology"
    licenseNumber = "MD12345"
    yearsOfExperience = 10
} | ConvertTo-Json

$doctorResult = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register/doctor" `
    -Method POST -Body $doctorBody -ContentType "application/json"

$DOCTOR_TOKEN = $doctorResult.token
$DOCTOR_ID = $doctorResult.doctor.id
```

### 4. Doctor Preview Patient

```powershell
$headers = @{
    "Authorization" = "Bearer $DOCTOR_TOKEN"
}

$preview = Invoke-RestMethod -Uri "http://localhost:5000/api/doctors/$DOCTOR_ID/patient-preview/$PATIENT_ID" `
    -Headers $headers

$preview
```

**Response - Critical patient info:**
```json
{
  "basicInfo": {
    "name": "John Doe",
    "age": 34,
    "bloodType": "O+"
  },
  "criticalAlerts": {
    "allergies": [],
    "activeConditions": []
  },
  "todayTriage": {
    "chiefComplaint": "Severe chest pain",
    "priorityLevel": "urgent",
    "riskScore": 85,
    "redFlags": ["chest_pain", "shortness_of_breath"]
  },
  "recentVisits": []
}
```

---

## 📊 Service URLs

Once running, access:

| Service | URL | Description |
|---------|-----|-------------|
| **Node.js API** | http://localhost:5000 | Main backend |
| **API Health** | http://localhost:5000/health | Health check |
| **Python Triage** | http://localhost:5001 | Triage engine |
| **Triage Health** | http://localhost:5001/health | Triage check |
| **Ollama** | http://localhost:11434 | LLM server |

---

## 🔧 Common Issues

### "Database connection failed"
```powershell
# Check PostgreSQL is running
Get-Service -Name postgresql*

# If not running
Start-Service postgresql-x64-14
```

### "Python ModuleNotFoundError"
```powershell
cd triage_engine
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### "Port 5000 already in use"
```powershell
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### "Ollama model not found"
```powershell
# Verify Ollama is running
ollama list

# Pull the model if missing
ollama pull llama2
```

---

## 📖 Next Steps

### Explore the API

See full documentation:
- **Backend API Docs:** [`backend/README.md`](backend/README.md)
- **Triage Engine:** `triage_engine/README.md`
- **Main README:** [`README.md`](README.md)

### Key Endpoints

**Authentication:**
- `POST /api/auth/register/patient` - Register patient
- `POST /api/auth/register/doctor` - Register doctor  
- `POST /api/auth/login/patient` - Patient login
- `POST /api/auth/login/doctor` - Doctor login

**Patient:**
- `GET /api/patients/:id/dashboard` - Patient dashboard
- `GET /api/patients/:id/visits` - Visit history
- `PUT /api/patients/:id` - Update profile

**Doctor:**
- `GET /api/doctors/:id/dashboard` - Doctor dashboard
- `GET /api/doctors/:id/patient-preview/:patientId` - Preview patient
- `POST /api/doctors/:id/call-next` - Call next in queue

**Triage:**
- `POST /api/triage/complete-single` - Quick triage
- `POST /api/triage/initiate` - Multi-step triage
- `GET /api/triage/queue/clinic` - View clinic queue

**Appointments:**
- `GET /api/appointments/available-slots/:doctorId?date=2024-12-20` - Check slots
- `POST /api/appointments/book` - Book appointment
- `POST /api/appointments/:id/check-in` - Check in

**Visits:**
- `POST /api/visits` - Create visit record
- `POST /api/visits/:id/prescriptions` - Add prescription
- `GET /api/visits/:id` - Get visit details

---

## 🧪 Run Tests

```powershell
# Automated API tests
.\test-api.ps1

# Manual test with curl
curl http://localhost:5000/health
```

---

## 🛑 Stop Services

1. Close the Python terminal window (or Ctrl+C)
2. Close the Node.js terminal window (or Ctrl+C)
3. Stop Ollama: `taskkill /F /IM ollama.exe`

---

## 🎯 Architecture Overview

```
Patient App → Node.js API → PostgreSQL (Data)
                   ↓
             Python Engine → Ollama/Llama2 (LLM)
                   ↓
             Redis (Queue Cache)
```

**Two Services:**
1. **Node.js (Port 5000):** Handles ALL patient/doctor data, appointments, auth
2. **Python (Port 5001):** ONLY handles triage risk assessment (calls Ollama)

---

## 💡 Pro Tips

**1. Keep services running in separate terminals:**
- Terminal 1: Ollama server
- Terminal 2: Python triage engine  
- Terminal 3: Node.js backend

**2. Use the automated scripts:**
```powershell
.\start.ps1    # Starts everything
.\test-api.ps1 # Runs tests
```

**3. Check logs for errors:**
- Python logs show triage assessment details
- Node.js logs show API requests
- PostgreSQL logs show database queries

**4. Database GUI:**
- Use pgAdmin or DBeaver to view database tables

---

## 📞 Need Help?

1. Check the error messages in the terminal
2. Read the detailed README files
3. Verify all prerequisites are installed
4. Run `.\test-api.ps1` to identify issues

---

**Built for HACKKRUX** | 100% Free Stack | No API Costs 💰
