const bcrypt = require('bcryptjs');
const Doctor = require('../../models/Doctor');
const Department = require('../../models/Department');
const Hospital = require('../../models/Hospital');
const HospitalStaff = require('./hospitalStaffModel');
const { generateToken, verifyToken } = require('../../middleware/auth');
const { sendDoctorCredentialsEmail } = require('../../shared/services/emailService');
const { generateTempPassword } = require('../../utils/credentials');

const SALT_ROUNDS = 10;

async function loginHospitalStaff(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const staff = await HospitalStaff.findOne({ email: String(email).toLowerCase() });
  if (!staff || !staff.isActive) {
    throw new Error('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, staff.passwordHash);
  if (!passwordMatches) {
    throw new Error('Invalid email or password');
  }

  const hospital = await Hospital.findById(staff.hospitalId);
  if (!hospital || !hospital.isActive) {
    throw new Error('Hospital account is inactive');
  }

  staff.lastLoginAt = new Date();
  await staff.save();

  const token = generateToken(staff.id, staff.role);

  return {
    token,
    staff: {
      id: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      role: staff.role,
      hospitalId: staff.hospitalId
    },
    hospital: {
      id: hospital.id,
      name: hospital.name,
      code: hospital.code
    }
  };
}

async function authenticateHospitalStaff(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('No authentication token provided');
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    throw new Error('Invalid or expired token');
  }

  if (decoded.role !== 'hospital_staff') {
    throw new Error('Hospital portal role required');
  }

  const staff = await HospitalStaff.findById(decoded.userId);
  if (!staff || !staff.isActive) {
    throw new Error('Hospital staff not found or inactive');
  }

  req.hospitalStaff = staff;
  req.userId = staff.id;
  req.role = staff.role;
}

async function createDepartment(staff, payload) {
  const { name, code, description, floor, capacity } = payload;

  if (!name || !code) {
    throw new Error('Department name and code are required');
  }

  const exists = await Department.findOne({
    hospitalId: staff.hospitalId,
    code: String(code).toUpperCase()
  });

  if (exists) {
    throw new Error('Department code already exists for this hospital');
  }

  const department = await Department.create({
    hospitalId: staff.hospitalId,
    name,
    code: String(code).toUpperCase(),
    description: description || null,
    floor: floor ? String(floor) : null,
    capacity: capacity ? Number(capacity) : 10,
    isActive: true
  });

  return department;
}

async function createDoctor(staff, payload) {
  const {
    firstName,
    lastName,
    email,
    phone,
    specialty,
    licenseNumber,
    departmentId,
    qualifications,
    yearsOfExperience,
    consultationDuration
  } = payload;

  if (!firstName || !lastName || !email || !phone || !specialty || !licenseNumber || !departmentId) {
    throw new Error('Missing required doctor fields');
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    throw new Error('Invalid department selected');
  }

  if (String(department.hospitalId) !== String(staff.hospitalId)) {
    throw new Error('Department does not belong to your hospital');
  }

  const existingDoctor = await Doctor.findOne({
    $or: [
      { email: String(email).toLowerCase() },
      { phone },
      { licenseNumber }
    ]
  });

  if (existingDoctor) {
    throw new Error('Doctor already exists with same email, phone, or license number');
  }

  const temporaryPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  const doctor = await Doctor.create({
    firstName,
    lastName,
    email: String(email).toLowerCase(),
    phone,
    passwordHash,
    specialty,
    practiceType: 'hospital',
    licenseNumber,
    hospitalId: staff.hospitalId,
    departmentId,
    clinicId: null,
    clinicName: null,
    clinicAddress: null,
    qualifications: qualifications || null,
    yearsOfExperience: yearsOfExperience || 0,
    consultationDuration: consultationDuration || 15,
    isActive: true,
    isAvailableToday: false
  });

  const hospital = await Hospital.findById(staff.hospitalId);

  let credentialsEmail = { sent: false, reason: 'Not attempted' };
  try {
    credentialsEmail = await sendDoctorCredentialsEmail({
      to: doctor.email,
      doctorName: `${doctor.firstName} ${doctor.lastName}`,
      hospitalName: hospital?.name || 'Hospital',
      loginEmail: doctor.email,
      temporaryPassword
    });
  } catch (error) {
    credentialsEmail = { sent: false, reason: error.message };
  }

  return {
    doctor: {
      id: doctor.id,
      name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      email: doctor.email,
      specialty: doctor.specialty,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId
    },
    credentialsEmail
  };
}

async function listDoctors(staff) {
  const doctors = await Doctor.find({
    hospitalId: staff.hospitalId,
    isActive: true
  })
    .populate('departmentId', 'name code')
    .sort({ createdAt: -1 });

  return doctors.map((doctor) => ({
    id: doctor.id,
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
    email: doctor.email,
    phone: doctor.phone,
    specialty: doctor.specialty,
    licenseNumber: doctor.licenseNumber,
    yearsOfExperience: doctor.yearsOfExperience,
    consultationDuration: doctor.consultationDuration,
    department: doctor.departmentId
      ? {
        id: doctor.departmentId.id,
        name: doctor.departmentId.name,
        code: doctor.departmentId.code
      }
      : null,
    createdAt: doctor.createdAt
  }));
}

module.exports = {
  loginHospitalStaff,
  authenticateHospitalStaff,
  createDepartment,
  createDoctor,
  listDoctors
};
