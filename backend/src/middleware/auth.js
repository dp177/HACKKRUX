/**
 * AUTHENTICATION MIDDLEWARE
 * JWT verification for doctors and patients
 */

const jwt = require('jsonwebtoken');
const { Doctor, Patient, User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 days

// ═══════════════════════════════════════════════════════════════
// Generate JWT Token
// ═══════════════════════════════════════════════════════════════

function generateToken(userId, role) {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// ═══════════════════════════════════════════════════════════════
// Verify JWT Token
// ═══════════════════════════════════════════════════════════════

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Extract Token from Request
// ═══════════════════════════════════════════════════════════════

function extractToken(req) {
  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check query parameter (for WebSocket connections)
  if (req.query.token) {
    return req.query.token;
  }
  
  // Check cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  return null;
}

function splitName(name) {
  const raw = String(name || '').trim();
  if (!raw) {
    return { firstName: 'Guest', lastName: 'User' };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'User' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]
  };
}

async function resolvePatientByJwtUserId(userId) {
  // Primary path: direct patient token where JWT userId is Patient._id.
  const directPatient = await Patient.findById(userId);
  if (directPatient) {
    return directPatient;
  }

  // Google path: JWT userId may refer to User._id with patient role.
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }

  const email = String(user.email || '').toLowerCase();
  if (!email) {
    return null;
  }

  let patient = await Patient.findOne({ email });
  if (patient) {
    return patient;
  }

  const { firstName, lastName } = splitName(user.name);
  patient = await Patient.create({
    firstName,
    lastName,
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    gender: 'Prefer not to say',
    phone: `google-${user.id}`,
    email,
    passwordHash: null,
    consentToTreatment: true,
    consentToShareData: false
  });

  return patient;
}

// ═══════════════════════════════════════════════════════════════
// Authenticate Doctor Middleware
// ═══════════════════════════════════════════════════════════════

async function authenticateDoctor(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const decodedRole = String(decoded.role || '').toLowerCase();

    if (decodedRole !== 'doctor') {
      return res.status(403).json({ error: 'Access denied. Doctor role required.' });
    }
    
    // Verify doctor exists in database
    const doctor = await Doctor.findById(decoded.userId);
    
    if (!doctor) {
      return res.status(401).json({ error: 'Doctor not found' });
    }
    
    if (!doctor.isActive) {
      return res.status(403).json({ error: 'Doctor account is inactive' });
    }
    
    // Attach doctor to request
    req.doctor = doctor;
    req.userId = doctor.id;
    req.role = 'doctor';
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Authenticate Patient Middleware
// ═══════════════════════════════════════════════════════════════

async function authenticatePatient(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const decodedRole = String(decoded.role || '').toLowerCase();

    if (decodedRole !== 'patient') {
      return res.status(403).json({ error: 'Access denied. Patient role required.' });
    }
    
    // Verify patient exists in database; for Google auth tokens, auto-resolve via User profile.
    const patient = await resolvePatientByJwtUserId(decoded.userId);
    
    if (!patient) {
      return res.status(401).json({ error: 'Patient not found' });
    }
    
    // Attach patient to request
    req.patient = patient;
    req.userId = patient.id;
    req.role = 'patient';
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Authenticate Either Doctor or Patient
// ═══════════════════════════════════════════════════════════════

async function authenticateAny(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const decodedRole = String(decoded.role || '').toLowerCase();

    if (decodedRole === 'doctor') {
      const doctor = await Doctor.findById(decoded.userId);
      if (!doctor || !doctor.isActive) {
        return res.status(401).json({ error: 'Doctor not found or inactive' });
      }
      req.doctor = doctor;
      req.userId = doctor.id;
      req.role = 'doctor';
    } else if (decodedRole === 'patient') {
      const patient = await resolvePatientByJwtUserId(decoded.userId);
      if (!patient) {
        return res.status(401).json({ error: 'Patient not found' });
      }
      req.patient = patient;
      req.userId = patient.id;
      req.role = 'patient';
    } else {
      return res.status(403).json({ error: 'Invalid role' });
    }
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Optional Authentication (doesn't fail if no token)
// ═══════════════════════════════════════════════════════════════

async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next(); // No token, but continue
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return next(); // Invalid token, but continue
    }
    
    const decodedRole = String(decoded.role || '').toLowerCase();

    if (decodedRole === 'doctor') {
      const doctor = await Doctor.findById(decoded.userId);
      if (doctor && doctor.isActive) {
        req.doctor = doctor;
        req.userId = doctor.id;
        req.role = 'doctor';
      }
    } else if (decodedRole === 'patient') {
      const patient = await resolvePatientByJwtUserId(decoded.userId);
      if (patient) {
        req.patient = patient;
        req.userId = patient.id;
        req.role = 'patient';
      }
    }
    
    next();
    
  } catch (error) {
    console.error('Optional auth error:', error);
    next(); // Continue even on error
  }
}

module.exports = {
  generateToken,
  verifyToken,
  authenticateDoctor,
  authenticatePatient,
  authenticateAny,
  optionalAuth
};
