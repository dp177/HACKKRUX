/**
 * AUTHENTICATION ROUTES
 * Login, registration, password management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Doctor, Patient, Department } = require('../models');
const { generateToken, authenticateDoctor, authenticatePatient } = require('../middleware/auth');
const { sendPatientCredentialsEmail } = require('../utils/credentials');

const SALT_ROUNDS = 10;

function normalizeGender(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (value === 'm' || value === 'male') return 'M';
  if (value === 'f' || value === 'female') return 'F';
  if (value === 'other') return 'Other';
  if (value === 'prefer not to say' || value === 'prefer_not_to_say') return 'Prefer not to say';
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PATIENT REGISTRATION
// ═══════════════════════════════════════════════════════════════

router.post('/register/patient', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      phone,
      email,
      password,
      address,
      bloodType,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation
    } = req.body;
    
    const normalizedGender = normalizeGender(gender);
    const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
    const normalizedBloodType = validBloodTypes.includes(bloodType) ? bloodType : 'Unknown';

    // Validation
    if (!firstName || !lastName || !phone || !email || !password || !dateOfBirth || !normalizedGender) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if phone already exists
    const existingPatient = await Patient.findOne({ phone });
    if (existingPatient) {
      return res.status(400).json({ error: 'Patient with this phone number already exists' });
    }
    
    // Check if email already exists
    const existingEmail = await Patient.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'Patient with this email already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    
    // Create patient
    const patient = new Patient({
      firstName,
      lastName,
      dateOfBirth,
      gender: normalizedGender,
      phone,
      email,
      passwordHash,
      address,
      bloodType: normalizedBloodType,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      consentToTreatment: true, // Default consent
      consentToShareData: false
    });
    await patient.save();

    const patientName = `${patient.firstName} ${patient.lastName}`;
    let credentialsEmail = { sent: false, reason: 'Not attempted' };

    try {
      credentialsEmail = await sendPatientCredentialsEmail({
        to: patient.email,
        patientName,
        loginId: patient.phone,
        temporaryPassword: password
      });
    } catch (mailError) {
      credentialsEmail = { sent: false, reason: mailError.message };
    }
    
    // Generate JWT token
    const token = generateToken(patient.id, 'patient');
    
    res.status(201).json({
      message: 'Patient registered successfully',
      token,
      patient: {
        id: patient.id,
        name: patientName,
        phone: patient.phone,
        email: patient.email
      },
      credentialsEmail
    });
    
  } catch (error) {
    console.error('Patient registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DOCTOR REGISTRATION
// ═══════════════════════════════════════════════════════════════

router.post('/register/doctor', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      specialty,
      licenseNumber,
      hospitalId,
      departmentId,
      clinicId,
      qualifications,
      yearsOfExperience,
      consultationDuration
    } = req.body;
    
    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !specialty || !licenseNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if email already exists
    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({ error: 'Doctor with this email already exists' });
    }
    
    // Check if phone already exists
    const existingPhone = await Doctor.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ error: 'Doctor with this phone number already exists' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const resolvedHospitalId = hospitalId || null;
    const resolvedDepartmentId = departmentId || null;

    if (!resolvedHospitalId || !resolvedDepartmentId) {
      return res.status(400).json({ error: 'Hospital and department are required for doctor registration' });
    }

    const department = await Department.findById(resolvedDepartmentId);
    if (!department) {
      return res.status(400).json({ error: 'Invalid department selected' });
    }

    if (String(department.hospitalId) !== String(resolvedHospitalId)) {
      return res.status(400).json({ error: 'Department does not belong to selected hospital' });
    }
    
    // Create doctor
    const doctor = new Doctor({
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      specialty,
      practiceType: 'hospital',
      licenseNumber,
      hospitalId: resolvedHospitalId,
      departmentId: resolvedDepartmentId,
      clinicId,
      clinicName: null,
      clinicAddress: null,
      qualifications,
      yearsOfExperience: yearsOfExperience || 0,
      consultationDuration: consultationDuration || 15,
      isActive: true,
      isAvailableToday: false
    });
    await doctor.save();
    
    // Generate JWT token
    const token = generateToken(doctor.id, 'doctor');
    
    res.status(201).json({
      message: 'Doctor registered successfully',
      token,
      doctor: {
        id: doctor.id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialty: doctor.specialty
      }
    });
    
  } catch (error) {
    console.error('Doctor registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATIENT LOGIN
// ═══════════════════════════════════════════════════════════════

router.post('/login/patient', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password required' });
    }
    
    // Find patient by phone
    const patient = await Patient.findOne({ phone });
    
    if (!patient) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, patient.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }
    
    // Generate JWT token
    const token = generateToken(patient.id, 'patient');
    
    res.json({
      message: 'Login successful',
      token,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        phone: patient.phone,
        email: patient.email,
        bloodType: patient.bloodType
      }
    });
    
  } catch (error) {
    console.error('Patient login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DOCTOR LOGIN
// ═══════════════════════════════════════════════════════════════

router.post('/login/doctor', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find doctor by email
    const doctor = await Doctor.findOne({ email: String(email).toLowerCase() }).populate('departmentId');
    
    if (!doctor) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    if (!doctor.isActive) {
      return res.status(403).json({ error: 'Doctor account is inactive. Contact administrator.' });
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, doctor.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = generateToken(doctor.id, 'doctor');
    
    res.json({
      message: 'Login successful',
      token,
      doctor: {
        id: doctor.id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialty: doctor.specialty,
        department: doctor.departmentId?.name || null,
        consultationDuration: doctor.consultationDuration
      }
    });
    
  } catch (error) {
    console.error('Doctor login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET CURRENT USER (verify token)
// ═══════════════════════════════════════════════════════════════

router.get('/me/patient', authenticatePatient, async (req, res) => {
  try {
    res.json({
      id: req.patient.id,
      name: `${req.patient.firstName} ${req.patient.lastName}`,
      phone: req.patient.phone,
      email: req.patient.email,
      bloodType: req.patient.bloodType,
      dateOfBirth: req.patient.dateOfBirth,
      gender: req.patient.gender
    });
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Failed to fetch patient data' });
  }
});

router.get('/me/doctor', authenticateDoctor, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.doctor.id)
      .populate('departmentId')
      .select('-passwordHash');
    
    res.json(doctor);
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ error: 'Failed to fetch doctor data' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════

router.post('/change-password/patient', authenticatePatient, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, req.patient.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    // Update password
    await Patient.findByIdAndUpdate(
      req.patient.id,
      { passwordHash: newPasswordHash }
    );
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/change-password/doctor', authenticateDoctor, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, req.doctor.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    // Update password
    await Doctor.findByIdAndUpdate(
      req.doctor.id,
      { passwordHash: newPasswordHash }
    );
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
