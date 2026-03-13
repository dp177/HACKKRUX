/**
 * AUTHENTICATION ROUTES
 * Login, registration, password management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const { Doctor, Patient, Department, User } = require('../models');
const { generateToken, authenticateDoctor, authenticatePatient, verifyToken } = require('../middleware/auth');
const { sendPatientCredentialsEmail } = require('../utils/credentials');

const SALT_ROUNDS = 10;
const oauthClient = new OAuth2Client();

function normalizeUserRoleForJwt(role) {
  return String(role || '').toLowerCase();
}

// In-memory store for pending mobile OAuth sessions (single-use, expire in 5 min)
const mobileSessions = new Map();

function normalizeGender(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (value === 'm' || value === 'male') return 'M';
  if (value === 'f' || value === 'female') return 'F';
  if (value === 'other') return 'Other';
  if (value === 'prefer not to say' || value === 'prefer_not_to_say') return 'Prefer not to say';
  return null;
}

function getAllowedGoogleAudiences() {
  return String(process.env.GOOGLE_OAUTH_CLIENT_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE AUTH (PATIENT APP)
// ═══════════════════════════════════════════════════════════════

router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const audience = getAllowedGoogleAudiences();
    if (!audience.length) {
      return res.status(500).json({ error: 'GOOGLE_OAUTH_CLIENT_IDS is not configured' });
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      return res.status(401).json({ error: 'Invalid Google token payload' });
    }

    const googleId = payload.sub;
    const email = String(payload.email).toLowerCase();
    const name = payload.name || email;
    const profilePicture = payload.picture || null;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        googleId,
        email,
        name,
        profilePicture,
        role: 'PATIENT'
      });
    } else {
      user.googleId = googleId;
      user.name = name;
      user.profilePicture = profilePicture;
      user.role = String(user.role || 'PATIENT').toUpperCase();
      await user.save();
    }

    const token = generateToken(user.id, normalizeUserRoleForJwt(user.role));

    return res.json({
      token,
      user: {
        id: user.id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
        role: normalizeUserRoleForJwt(user.role)
      }
    });
  } catch (error) {
    console.error('Google auth error:', error.message);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        googleId: user.googleId,
        email: user.email,
        name: user.name,
        profilePicture: user.profilePicture,
        role: normalizeUserRoleForJwt(user.role)
      }
    });
  } catch (error) {
    console.error('Auth me error:', error.message);
    return res.status(500).json({ error: 'Failed to restore session' });
  }
});

router.post('/logout', async (_req, res) => {
  return res.json({ message: 'Logged out successfully' });
});

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

// ═══════════════════════════════════════════════════════════════
// GOOGLE AUTH — MOBILE BROWSER FLOW (backend-driven with polling)
// ═══════════════════════════════════════════════════════════════

// Step 1: Mobile app opens this URL in a browser — backend redirects to Google OAuth
router.get('/google/mobile', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).send('sessionId is required');

  const callbackUrl = process.env.GOOGLE_MOBILE_CALLBACK_URL;
  if (!callbackUrl) {
    return res.status(500).send('GOOGLE_MOBILE_CALLBACK_URL is not configured in backend .env');
  }

  const clientId = getAllowedGoogleAudiences()[0];
  if (!clientId) {
    return res.status(500).send('GOOGLE_OAUTH_CLIENT_IDS is not configured in backend .env');
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', sessionId);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('access_type', 'offline');

  return res.redirect(url.toString());
});

// Step 2: Google redirects here after user signs in
router.get('/google/mobile/callback', async (req, res) => {
  const { code, state: sessionId, error } = req.query;

  if (error || !code) {
    if (sessionId) mobileSessions.set(sessionId, { error: error || 'No authorization code received' });
    return res.send('<html><body style="font-family:sans-serif;padding:32px"><h2>\u274c Sign-in failed</h2><p>You can close this tab and return to the app.</p></body></html>');
  }

  try {
    const clientId = getAllowedGoogleAudiences()[0];
    const callbackUrl = process.env.GOOGLE_MOBILE_CALLBACK_URL;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !callbackUrl || !clientSecret) {
      const configError = 'Google OAuth backend config missing (GOOGLE_OAUTH_CLIENT_IDS, GOOGLE_MOBILE_CALLBACK_URL, or GOOGLE_CLIENT_SECRET).';
      if (sessionId) mobileSessions.set(sessionId, { error: configError });
      return res.send('<html><body style="font-family:sans-serif;padding:32px"><h2>Sign-in failed</h2><p>Backend OAuth config is incomplete. Please contact support.</p></body></html>');
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || tokens.error) {
      if (sessionId) mobileSessions.set(sessionId, { error: tokens.error_description || tokens.error });
      return res.send('<html><body style="font-family:sans-serif;padding:32px"><h2>Sign-in failed</h2><p>Google token exchange failed. Please return to app and retry.</p></body></html>');
    }

    // Get user info with the access token
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const userInfo = await userInfoRes.json();

    const email = String(userInfo.email).toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        googleId: userInfo.sub,
        email,
        name: userInfo.name,
        profilePicture: userInfo.picture,
        role: 'PATIENT'
      });
    } else {
      user.googleId = userInfo.sub;
      user.name = userInfo.name;
      user.profilePicture = userInfo.picture;
      user.role = String(user.role || 'PATIENT').toUpperCase();
      await user.save();
    }

    const token = generateToken(user.id, normalizeUserRoleForJwt(user.role));
    mobileSessions.set(sessionId, {
      token,
      user: { id: user.id, email: user.email, name: user.name, profilePicture: user.profilePicture, role: normalizeUserRoleForJwt(user.role) }
    });
    setTimeout(() => mobileSessions.delete(sessionId), 5 * 60 * 1000);

    return res.send('<html><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>\u2705 Sign-in successful!</h2><p>You can now close this tab and return to the app.</p></body></html>');
  } catch (err) {
    console.error('Mobile OAuth callback error:', err);
    if (sessionId) mobileSessions.set(sessionId, { error: 'Server error during authentication' });
    return res.send('<html><body style="font-family:sans-serif;padding:32px"><h2>\u274c Sign-in failed</h2><p>Server error. Please try again.</p></body></html>');
  }
});

// Step 3: Mobile app polls this until it gets the JWT
router.get('/google/mobile/result', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ status: 'error', error: 'sessionId required' });

  const session = mobileSessions.get(sessionId);
  if (!session) return res.json({ status: 'pending' });

  mobileSessions.delete(sessionId);
  if (session.error) return res.json({ status: 'error', error: session.error });
  return res.json({ status: 'success', token: session.token, user: session.user });
});

module.exports = router;
