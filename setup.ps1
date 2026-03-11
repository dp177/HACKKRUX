# ===============================================================
# TRIAGE SYSTEM - SETUP SCRIPT (Windows PowerShell)
# Installs dependencies and configures the system
# ===============================================================

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  TRIAGE SYSTEM - AUTOMATED SETUP" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"
$ROOT_DIR = Get-Location

# ===============================================================
# Check Prerequisites
# ===============================================================

Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version 2>$null
    if ($nodeVersion) {
        Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green
    } else {
        throw "Not found"
    }
} catch {
    Write-Host "[ERROR] Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

# Check Python
try {
    $pythonVersion = python --version 2>$null
    if ($pythonVersion) {
        Write-Host "[OK] $pythonVersion" -ForegroundColor Green
    } else {
        throw "Not found"
    }
} catch {
    Write-Host "[ERROR] Python not found. Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

# Check MongoDB CLI (optional)
try {
    $mongoVersion = mongosh --version 2>$null
    if ($mongoVersion) {
        Write-Host "[OK] MongoDB Shell available" -ForegroundColor Green
    } else {
        throw "Not found"
    }
} catch {
    Write-Host "[WARN] MongoDB Shell not found (OK if using Atlas URI)" -ForegroundColor Yellow
}

# Check Ollama
try {
    $ollamaVersion = ollama --version 2>$null
    if ($ollamaVersion) {
        Write-Host "[OK] Ollama installed" -ForegroundColor Green
    } else {
        throw "Not found"
    }
} catch {
    Write-Host "[WARN] Ollama not found. Install from: https://ollama.com/download/windows" -ForegroundColor Yellow
}

Write-Host ""

# ===============================================================
# Database Setup
# ===============================================================

Write-Host "Configuring MongoDB connection..." -ForegroundColor Yellow

$MONGODB_URI = "mongodb://localhost:27017/triage_db"
Write-Host "[INFO] Default MongoDB URI: $MONGODB_URI" -ForegroundColor Gray
Write-Host "[INFO] If using Atlas, update backend/.env MONGODB_URI after setup." -ForegroundColor Gray

Write-Host ""

# ===============================================================
# Ollama Model Setup
# ===============================================================

Write-Host "Setting up Ollama model..." -ForegroundColor Yellow

try {
    $ollamaList = ollama list 2>$null
    if ($ollamaList -match "llama2") {
        Write-Host "[OK] Llama2 model already installed" -ForegroundColor Green
    } else {
        Write-Host "Downloading Llama2 model (3GB)..."
        ollama pull llama2 2>$null
        Write-Host "[OK] Llama2 downloaded" -ForegroundColor Green
    }
    
    Write-Host "Starting Ollama server..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "[OK] Ollama server started" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Skipping Ollama setup" -ForegroundColor Yellow
}

Write-Host ""

# ===============================================================
# Python Triage Engine Setup
# ===============================================================

Write-Host "Setting up Python triage engine..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\triage_engine"

if (-Not (Test-Path "venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv venv
    Write-Host "[OK] Virtual environment created" -ForegroundColor Green
}

Write-Host "Installing Python dependencies..."
& .\venv\Scripts\Activate.ps1
pip install -q -r requirements.txt
Write-Host "[OK] Python dependencies installed" -ForegroundColor Green

Set-Location $ROOT_DIR
Write-Host ""

# ===============================================================
# Next.js Doctor Web Setup
# ===============================================================

Write-Host "Setting up Next.js doctor web..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\web"

Write-Host "Installing web dependencies..."
npm install --silent
Write-Host "[OK] Web dependencies installed" -ForegroundColor Green

if (-Not (Test-Path ".env.local")) {
    "NEXT_PUBLIC_API_URL=http://localhost:5000" | Out-File -FilePath ".env.local" -Encoding utf8
    Write-Host "[OK] Created .env.local" -ForegroundColor Green
}

Set-Location $ROOT_DIR
Write-Host ""

# ===============================================================
# Expo Patient App Setup
# ===============================================================

Write-Host "Setting up Expo patient app..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\mobile"

Write-Host "Installing mobile dependencies..."
npm install --silent
Write-Host "[OK] Mobile dependencies installed" -ForegroundColor Green

Set-Location $ROOT_DIR
Write-Host ""

# ===============================================================
# Node.js Backend Setup
# ===============================================================

Write-Host "Setting up Node.js backend..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\backend"

Write-Host "Installing backend dependencies..."
npm install --silent
Write-Host "[OK] Backend dependencies installed" -ForegroundColor Green

if (-Not (Test-Path ".env")) {
    Write-Host "Creating .env configuration..."
    
    $JWT_SECRET = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
$envContent = @"
NODE_ENV=development
PORT=5000
MONGODB_URI=$MONGODB_URI
JWT_SECRET=$JWT_SECRET
TRIAGE_ENGINE_URL=http://localhost:5001
DESK_SCANNER_CODE=FRONTDESK-QR-001
CORS_ORIGINS=http://localhost:3000,http://localhost:19006
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-password
LOG_LEVEL=info
"@
    
    $envContent | Out-File -FilePath ".env" -Encoding utf8
    Write-Host "[OK] .env file created" -ForegroundColor Green
} else {
    Write-Host "[WARN] .env already exists" -ForegroundColor Yellow
}

Set-Location $ROOT_DIR

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  SETUP COMPLETE!" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start all services:" -ForegroundColor Yellow
Write-Host "  .\start.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or start manually:" -ForegroundColor Yellow
Write-Host "  cd triage_engine; .\venv\Scripts\Activate.ps1; python main.py" -ForegroundColor Gray
Write-Host "  cd backend; npm run dev" -ForegroundColor Gray
Write-Host "  cd web; npm run dev" -ForegroundColor Gray
Write-Host "  cd mobile; npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "Endpoints:" -ForegroundColor Yellow
Write-Host "  Backend: http://localhost:5000" -ForegroundColor Gray
Write-Host "  Python: http://localhost:5001" -ForegroundColor Gray
Write-Host "  Web: http://localhost:3000" -ForegroundColor Gray
Write-Host "  Admin: http://localhost:3000/admin" -ForegroundColor Gray
Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan
