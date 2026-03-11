# ═══════════════════════════════════════════════════════════════
# TRIAGE SYSTEM - API TEST SCRIPT
# Tests all major endpoints to verify system is working
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  🧪 TRIAGE SYSTEM - API TESTS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$BASE_URL = "http://localhost:5000"
$TRIAGE_URL = "http://localhost:5001"
$testsPassed = 0
$testsFailed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Body = $null
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow -NoNewline
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            TimeoutSec = 10
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @params
        Write-Host " ✓ PASS" -ForegroundColor Green
        $script:testsPassed++
        return $response
    }
    catch {
        Write-Host " ✗ FAIL" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $null
    }
}

# ═══════════════════════════════════════════════════════════════
# 1. Health Checks
# ═══════════════════════════════════════════════════════════════

Write-Host "1️⃣  HEALTH CHECKS" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

Test-Endpoint -Name "Node.js Backend Health" -Url "$BASE_URL/health"
Test-Endpoint -Name "Python Triage Engine Health" -Url "$TRIAGE_URL/health"
Test-Endpoint -Name "Ollama Server" -Url "http://localhost:11434/api/version"

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 2. Patient Registration
# ═══════════════════════════════════════════════════════════════

Write-Host "2️⃣  PATIENT REGISTRATION" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

$timestamp = Get-Date -Format "HHmmss"
$patientData = @{
    firstName = "Test"
    lastName = "Patient"
    phone = "+1234567$timestamp"
    password = "testpass123"
    dateOfBirth = "1990-01-15"
    gender = "male"
    bloodType = "O+"
    email = "test$timestamp@example.com"
}

$patientResponse = Test-Endpoint -Name "Register Patient" `
    -Url "$BASE_URL/api/auth/register/patient" `
    -Method "POST" `
    -Body $patientData

if ($patientResponse) {
    $PATIENT_TOKEN = $patientResponse.token
    $PATIENT_ID = $patientResponse.patient.id
    Write-Host "  Patient ID: $PATIENT_ID" -ForegroundColor Gray
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 3. Doctor Registration
# ═══════════════════════════════════════════════════════════════

Write-Host "3️⃣  DOCTOR REGISTRATION" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

$doctorData = @{
    firstName = "Jane"
    lastName = "Smith"
    email = "dr.smith$timestamp@hospital.com"
    phone = "+9876543$timestamp"
    password = "doctorpass123"
    specialty = "Cardiology"
    licenseNumber = "MD$timestamp"
    yearsOfExperience = 10
}

$doctorResponse = Test-Endpoint -Name "Register Doctor" `
    -Url "$BASE_URL/api/auth/register/doctor" `
    -Method "POST" `
    -Body $doctorData

if ($doctorResponse) {
    $DOCTOR_TOKEN = $doctorResponse.token
    $DOCTOR_ID = $doctorResponse.doctor.id
    Write-Host "  Doctor ID: $DOCTOR_ID" -ForegroundColor Gray
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 4. Authentication
# ═══════════════════════════════════════════════════════════════

Write-Host "4️⃣  AUTHENTICATION" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

$loginData = @{
    phone = $patientData.phone
    password = $patientData.password
}

Test-Endpoint -Name "Patient Login" `
    -Url "$BASE_URL/api/auth/login/patient" `
    -Method "POST" `
    -Body $loginData

$doctorLoginData = @{
    email = $doctorData.email
    password = $doctorData.password
}

Test-Endpoint -Name "Doctor Login" `
    -Url "$BASE_URL/api/auth/login/doctor" `
    -Method "POST" `
    -Body $doctorLoginData

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 5. Patient Dashboard (Protected Route)
# ═══════════════════════════════════════════════════════════════

Write-Host "5️⃣  PATIENT DASHBOARD" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

if ($PATIENT_TOKEN -and $PATIENT_ID) {
    Write-Host "Testing: Patient Dashboard" -ForegroundColor Yellow -NoNewline
    try {
        $headers = @{
            "Authorization" = "Bearer $PATIENT_TOKEN"
        }
        $dashboard = Invoke-RestMethod -Uri "$BASE_URL/api/patients/$PATIENT_ID/dashboard" `
            -Headers $headers -TimeoutSec 10
        Write-Host " ✓ PASS" -ForegroundColor Green
        $testsPassed++
    }
    catch {
        Write-Host " ✗ FAIL" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $testsFailed++
    }
} else {
    Write-Host "⊘ Skipping (no patient token)" -ForegroundColor Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 6. Triage Assessment (Integration Test)
# ═══════════════════════════════════════════════════════════════

Write-Host "6️⃣  TRIAGE INTEGRATION" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

if ($PATIENT_TOKEN -and $PATIENT_ID) {
    $triageData = @{
        patientId = $PATIENT_ID
        chiefComplaint = "Severe headache"
        symptoms = @("headache", "nausea")
        symptomSeverity = "moderate"
        symptomDuration = 12
        vitalSigns = @{
            bloodPressure = "120/80"
            heartRate = 75
            temperature = 37.0
        }
        mode = "clinic"
    }
    
    Write-Host "Testing: Complete Triage Assessment" -ForegroundColor Yellow -NoNewline
    try {
        $headers = @{
            "Authorization" = "Bearer $PATIENT_TOKEN"
            "Content-Type" = "application/json"
        }
        $triageResult = Invoke-RestMethod -Uri "$BASE_URL/api/triage/complete-single" `
            -Method "POST" `
            -Headers $headers `
            -Body ($triageData | ConvertTo-Json -Depth 10) `
            -TimeoutSec 30
        Write-Host " ✓ PASS" -ForegroundColor Green
        Write-Host "  Priority: $($triageResult.priorityLevel)" -ForegroundColor Gray
        Write-Host "  Risk Score: $($triageResult.riskScore)" -ForegroundColor Gray
        Write-Host "  Queue Position: $($triageResult.queuePosition)" -ForegroundColor Gray
        $testsPassed++
    }
    catch {
        Write-Host " ✗ FAIL" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $testsFailed++
    }
} else {
    Write-Host "⊘ Skipping (no patient token)" -ForegroundColor Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# 7. Department Management
# ═══════════════════════════════════════════════════════════════

Write-Host "7️⃣  DEPARTMENT MANAGEMENT" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────" -ForegroundColor Gray

Test-Endpoint -Name "Get All Departments" -Url "$BASE_URL/api/departments"

$deptData = @{
    name = "Emergency"
    code = "ER"
    description = "Emergency Department"
    floor = 1
    capacity = 50
}

Test-Endpoint -Name "Create Department" `
    -Url "$BASE_URL/api/departments" `
    -Method "POST" `
    -Body $deptData

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# TEST SUMMARY
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  📊 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total Tests: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✅ ALL TESTS PASSED! System is working correctly." -ForegroundColor Green
} else {
    Write-Host "⚠ SOME TESTS FAILED. Check the errors above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
