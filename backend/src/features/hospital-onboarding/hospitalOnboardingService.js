const bcrypt = require('bcryptjs');
const Hospital = require('../../models/Hospital');
const HospitalOnboardingRequest = require('./hospitalOnboardingRequestModel');
const HospitalStaff = require('../hospital-portal/hospitalStaffModel');
const { generateTempPassword } = require('../../utils/credentials');
const {
  sendHospitalCredentialsEmail,
  sendHospitalOnboardingRejectionEmail
} = require('../../shared/services/emailService');

const SALT_ROUNDS = 10;

function normalizeHospitalCode(name, preferredCode) {
  if (preferredCode) {
    return String(preferredCode).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  const base = String(name || 'HOSP').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'HOSP';
  return base;
}

async function createUniqueHospitalCode(name, preferredCode) {
  const base = normalizeHospitalCode(name, preferredCode);
  let candidate = base;
  let suffix = 1;

  while (await Hospital.exists({ code: candidate })) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function submitOnboardingRequest(payload) {
  const {
    hospitalName,
    preferredHospitalCode,
    address,
    city,
    state,
    phone,
    contactName,
    contactEmail,
    contactPhone
  } = payload;

  if (!hospitalName || !contactName || !contactEmail || !contactPhone) {
    throw new Error('Missing required onboarding fields');
  }

  const request = await HospitalOnboardingRequest.create({
    hospitalName,
    preferredHospitalCode,
    address,
    city,
    state,
    phone,
    contactName,
    contactEmail,
    contactPhone,
    contactRole: 'hospital_staff'
  });

  return request;
}

async function listOnboardingRequests(status = 'pending') {
  const query = status ? { status } : {};
  const requests = await HospitalOnboardingRequest.find(query).sort({ createdAt: -1 });
  return requests;
}

async function approveOnboardingRequest(requestId, payload = {}) {
  const { reviewedBy, reviewNotes } = payload;
  const request = await HospitalOnboardingRequest.findById(requestId);

  if (!request) {
    throw new Error('Onboarding request not found');
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be approved');
  }

  const existingStaff = await HospitalStaff.findOne({ email: request.contactEmail });
  if (existingStaff) {
    throw new Error('A hospital staff account already exists with this email');
  }

  const hospitalCode = await createUniqueHospitalCode(request.hospitalName, request.preferredHospitalCode);

  const hospital = await Hospital.create({
    name: request.hospitalName,
    code: hospitalCode,
    address: request.address,
    city: request.city,
    state: request.state,
    phone: request.phone,
    isActive: true
  });

  const temporaryPassword = generateTempPassword(12);
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  const staff = await HospitalStaff.create({
    hospitalId: hospital.id,
    fullName: request.contactName,
    email: request.contactEmail,
    phone: request.contactPhone,
    role: 'hospital_staff',
    passwordHash,
    isActive: true
  });

  let emailResult = { sent: false, reason: 'Not attempted' };
  try {
    emailResult = await sendHospitalCredentialsEmail({
      to: request.contactEmail,
      contactName: request.contactName,
      hospitalName: request.hospitalName,
      loginEmail: request.contactEmail,
      temporaryPassword
    });
  } catch (error) {
    emailResult = { sent: false, reason: error.message };
  }

  request.status = 'approved';
  request.reviewNotes = reviewNotes || null;
  request.reviewedBy = reviewedBy || 'platform_admin';
  request.reviewedAt = new Date();
  request.approvedHospitalId = hospital.id;
  request.credentialsEmailSent = Boolean(emailResult.sent);
  request.credentialsEmailReason = emailResult.sent ? null : (emailResult.reason || 'Unknown email error');
  await request.save();

  return {
    request,
    hospital,
    staff,
    credentialsEmail: emailResult
  };
}

async function rejectOnboardingRequest(requestId, payload = {}) {
  const { reviewedBy, reviewNotes } = payload;
  const request = await HospitalOnboardingRequest.findById(requestId);

  if (!request) {
    throw new Error('Onboarding request not found');
  }

  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be rejected');
  }

  request.status = 'rejected';
  request.reviewNotes = reviewNotes || null;
  request.reviewedBy = reviewedBy || 'platform_admin';
  request.reviewedAt = new Date();

  let emailResult = { sent: false, reason: 'Not attempted' };
  try {
    emailResult = await sendHospitalOnboardingRejectionEmail({
      to: request.contactEmail,
      contactName: request.contactName,
      hospitalName: request.hospitalName,
      reviewNotes: request.reviewNotes
    });
  } catch (error) {
    emailResult = { sent: false, reason: error.message };
  }

  request.credentialsEmailSent = Boolean(emailResult.sent);
  request.credentialsEmailReason = emailResult.sent ? null : (emailResult.reason || 'Unknown email error');
  await request.save();

  return {
    request,
    decisionEmail: emailResult
  };
}

module.exports = {
  submitOnboardingRequest,
  listOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest
};
