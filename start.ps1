# ═══════════════════════════════════════════════════════════════
# TRIAGE SYSTEM - START SCRIPT (Windows)
# Starts backend services + web and mobile frontends
# ═══════════════════════════════════════════════════════════════

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  STARTING TRIAGE SYSTEM" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

# Get the current directory
$ROOT_DIR = Get-Location

# ===============================================================
# Start Ollama Server
# ===============================================================

Write-Host "Starting Ollama server..." -ForegroundColor Yellow
try {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "[OK] Ollama server started on port 11434" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Failed to start Ollama (not installed or already running)" -ForegroundColor Yellow
}

Write-Host ""

# ===============================================================
# Start Python Triage Engine
# ===============================================================

Write-Host "Starting Python triage engine..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\triage_engine"

# Check if venv exists
if (-Not (Test-Path "venv")) {
    Write-Host "[ERROR] Virtual environment not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}

# Start Python in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$ROOT_DIR\triage_engine';
    .\venv\Scripts\Activate.ps1;
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '  PYTHON TRIAGE ENGINE' -ForegroundColor Cyan;
    Write-Host '  Port: 5001' -ForegroundColor Cyan;
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '';
    python main.py
"@

Write-Host "[OK] Python triage engine starting in new window..." -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host ""

# ===============================================================
# Start Node.js Backend
# ===============================================================

Write-Host "Starting Node.js backend..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\backend"

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "[ERROR] Node modules not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}

# Start Node.js in new window
Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$ROOT_DIR\backend';
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '  NODE.JS BACKEND API' -ForegroundColor Cyan;
    Write-Host '  Port: 5000' -ForegroundColor Cyan;
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '';
    npm run dev
"@

Write-Host "[OK] Node.js backend starting in new window..." -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host ""

# ===============================================================
# Start Next.js Doctor Web App
# ===============================================================

Write-Host "Starting Next.js doctor web app..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\web"

if (-Not (Test-Path "node_modules")) {
    Write-Host "[WARN] Web node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$ROOT_DIR\web';
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '  NEXT.JS DOCTOR WEB APP' -ForegroundColor Cyan;
    Write-Host '  Port: 3000' -ForegroundColor Cyan;
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '';
    npm run dev
"@

Write-Host "[OK] Next.js web app starting in new window..." -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host ""

# ===============================================================
# Start Expo Patient App
# ===============================================================

Write-Host "Starting Expo patient app..." -ForegroundColor Yellow

Set-Location "$ROOT_DIR\mobile"

if (-Not (Test-Path "node_modules")) {
    Write-Host "[WARN] Mobile node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$ROOT_DIR\mobile';
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '  EXPO PATIENT APP' -ForegroundColor Cyan;
    Write-Host '  Press a for Android / w for Web in Expo terminal' -ForegroundColor Cyan;
    Write-Host '===============================================================' -ForegroundColor Cyan;
    Write-Host '';
    npx expo start -c
"@

Write-Host "[OK] Expo app starting in new window..." -ForegroundColor Green
Start-Sleep -Seconds 3

Write-Host ""

# ===============================================================
# Wait and Check Health
# ===============================================================

Write-Host "Waiting for services to start (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "Checking service health..." -ForegroundColor Yellow

# Check Node.js
try {
    Invoke-RestMethod -Uri "http://localhost:5000/health" -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Node.js API: HEALTHY" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Node.js API: NOT RESPONDING" -ForegroundColor Red
}

# Check Python
try {
    Invoke-RestMethod -Uri "http://localhost:5001/health" -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Python Triage Engine: HEALTHY" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Python Triage Engine: NOT RESPONDING" -ForegroundColor Red
}

# Check Ollama
try {
    Invoke-RestMethod -Uri "http://localhost:11434/api/version" -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Ollama Server: HEALTHY" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Ollama Server: NOT RESPONDING" -ForegroundColor Red
}

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM STARTED!" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service Endpoints:" -ForegroundColor Yellow
Write-Host "   - Node.js API:        http://localhost:5000" -ForegroundColor White
Write-Host "   - API Health:         http://localhost:5000/health" -ForegroundColor White
Write-Host "   - Python Triage:      http://localhost:5001" -ForegroundColor White
Write-Host "   - Triage Health:      http://localhost:5001/health" -ForegroundColor White
Write-Host "   - Ollama Server:      http://localhost:11434" -ForegroundColor White
Write-Host "   - Doctor Web App:     http://localhost:3000" -ForegroundColor White
Write-Host "   - Expo Dev UI:        http://localhost:8081" -ForegroundColor White
Write-Host ""
Write-Host "API Documentation:" -ForegroundColor Yellow
Write-Host "   See backend\README.md for all endpoints" -ForegroundColor White
Write-Host ""
Write-Host "To stop services:" -ForegroundColor Yellow
Write-Host "   Close the PowerShell windows or press Ctrl+C in each window" -ForegroundColor White
Write-Host ""
Write-Host "===============================================================" -ForegroundColor Cyan

Set-Location $ROOT_DIR
