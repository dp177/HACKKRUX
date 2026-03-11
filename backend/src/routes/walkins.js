/**
 * WALK-IN ROUTES
 * Self-check via desk scanner code + receptionist assisted walk-in
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { Patient, TriageRecord } = require('../models');
const { generateTempPassword, sendPatientCredentialsEmail } = require('../utils/credentials');

const router = express.Router();
const TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001';
const DESK_SCANNER_CODE = process.env.DESK_SCANNER_CODE || 'FRONTDESK-QR-001';

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

function estimateAge(dateOfBirth) {
  return Math.floor((new Date() - new Date(dateOfBirth)) / 31557600000);
}

async function completeTriageAndQueue({ patient, chiefComplaint, symptoms = [], symptomSeverity = 'moderate', symptomDuration = 24, vitalSigns = {}, mode = 'clinic', departmentId = null }) {
  const triageResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/triage/complete`, {
    patient_id: patient._id,
    chief_complaint: chiefComplaint,
    symptoms,
    symptom_severity: symptomSeverity,
    symptom_duration_hours: symptomDuration,
    vital_signs: vitalSigns,
    patient_age: estimateAge(patient.dateOfBirth),
    patient_gender: patient.gender,
    chronic_conditions: patient.chronicConditions || [],
    current_medications: patient.currentMedications || []
  });

  const results = triageResponse.data;

  const triageRecord = new TriageRecord({
    patientId: patient._id,
    departmentId,
    chiefComplaint: results.chief_complaint,
    symptomCategory: results.symptom_category,
    criticalScore: results.scores.critical,
    symptomScore: results.scores.symptom,
    contextScore: results.scores.context,
    vitalScore: results.scores.vital,
    timelineScore: results.scores.timeline,
    totalRiskScore: results.final_risk_score,
    priorityLevel: results.priority_level,
    estimatedWaitMinutes: results.estimated_wait_minutes,
    redFlags: results.red_flags || [],
    vitalSigns: vitalSigns || {},
    recommendedSpecialty: results.recommended_specialty,
    triageNotes: results.summary || 'Walk-in triage assessment'
  });
  await triageRecord.save();

  let queueResponse;
  if (mode === 'hospital') {
    queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-hospital`, {
      patient_id: patient._id,
      triage_record_id: triageRecord._id,
      risk_score: triageRecord.totalRiskScore,
      chief_complaint: triageRecord.chiefComplaint,
      department_id: departmentId,
      recommended_specialty: triageRecord.recommendedSpecialty
    });
  } else {
    queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-clinic`, {
      patient_id: patient._id,
      triage_record_id: triageRecord._id,
      risk_score: triageRecord.totalRiskScore,
      chief_complaint: triageRecord.chiefComplaint
    });
  }

  if (queueResponse.data.queue_position) {
    triageRecord.queuePosition = queueResponse.data.queue_position;
    await triageRecord.save();
  }

  return {
    triageRecord,
    queuePosition: triageRecord.queuePosition,
    summary: triageRecord.triageNotes
  };
}

// Self check-in using desk scanner code
router.post('/self-checkin', async (req, res) => {
  try {
    const {
      patientId,
      phone,
      email,
      deskCode,
      chiefComplaint,
      symptoms = [],
      symptomSeverity = 'moderate',
      symptomDuration = 24,
      vitalSigns = {},
      mode = 'clinic',
      departmentId = null
    } = req.body;

    if (!deskCode || deskCode !== DESK_SCANNER_CODE) {
      return res.status(401).json({ error: 'Invalid scanner code' });
    }

    if (!chiefComplaint) {
      return res.status(400).json({ error: 'Chief complaint is required' });
    }

    let patient = null;
    if (patientId) {
      patient = await Patient.findById(patientId);
    }

    if (!patient && phone) {
      patient = await Patient.findOne({ phone });
    }

    if (!patient && email) {
      patient = await Patient.findOne({ email });
    }

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found. Please use receptionist check-in for new patient.' });
    }

    const triageResult = await completeTriageAndQueue({
      patient,
      chiefComplaint,
      symptoms,
      symptomSeverity,
      symptomDuration,
      vitalSigns,
      mode,
      departmentId
    });

    res.status(201).json({
      message: 'Self check-in successful. You are added to walk-in queue.',
      patient: {
        id: patient._id,
        name: `${patient.firstName} ${patient.lastName}`
      },
      triage: {
        triageId: triageResult.triageRecord._id,
        priorityLevel: triageResult.triageRecord.priorityLevel,
        riskScore: triageResult.triageRecord.totalRiskScore,
        estimatedWaitMinutes: triageResult.triageRecord.estimatedWaitMinutes,
        queuePosition: triageResult.queuePosition
      }
    });
  } catch (error) {
    console.error('Self check-in error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed self check-in', details: error.response?.data || error.message });
  }
});

// Receptionist assisted walk-in (can create patient + send credentials)
router.post('/receptionist-checkin', async (req, res) => {
  try {
    const {
      existingPatientId,
      firstName,
      lastName,
      dateOfBirth,
      gender,
      phone,
      email,
      chiefComplaint,
      symptoms = [],
      symptomSeverity = 'moderate',
      symptomDuration = 24,
      vitalSigns = {},
      mode = 'clinic',
      departmentId = null
    } = req.body;

    if (!chiefComplaint) {
      return res.status(400).json({ error: 'Chief complaint is required' });
    }

    let patient = null;
    let temporaryPassword = null;

    if (existingPatientId) {
      patient = await Patient.findById(existingPatientId);
      if (!patient) {
        return res.status(404).json({ error: 'Existing patient not found' });
      }
    } else {
      const normalizedGender = normalizeGender(gender);
      if (!firstName || !lastName || !dateOfBirth || !normalizedGender || !phone || !email) {
        return res.status(400).json({ error: 'For new walk-in patient, firstName, lastName, dateOfBirth, gender, phone, and email are required' });
      }

      const phoneExists = await Patient.findOne({ phone });
      if (phoneExists) {
        return res.status(400).json({ error: 'Phone already exists. Use existing patient ID or self check-in.' });
      }

      const emailExists = await Patient.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ error: 'Email already exists. Use existing patient ID or self check-in.' });
      }

      temporaryPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

      patient = new Patient({
        firstName,
        lastName,
        dateOfBirth,
        gender: normalizedGender,
        phone,
        email,
        passwordHash,
        bloodType: 'Unknown',
        consentToTreatment: true,
        consentToShareData: false
      });
      await patient.save();

      try {
        await sendPatientCredentialsEmail({
          to: patient.email,
          patientName: `${patient.firstName} ${patient.lastName}`,
          loginId: patient.phone,
          temporaryPassword
        });
      } catch (mailError) {
        console.error('Credential email send failed:', mailError.message);
      }
    }

    const triageResult = await completeTriageAndQueue({
      patient,
      chiefComplaint,
      symptoms,
      symptomSeverity,
      symptomDuration,
      vitalSigns,
      mode,
      departmentId
    });

    res.status(201).json({
      message: 'Receptionist walk-in completed and patient queued',
      patient: {
        id: patient._id,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        phone: patient.phone
      },
      credentials: temporaryPassword
        ? {
            loginId: patient.phone,
            temporaryPassword,
            email: patient.email,
            note: 'Temporary credentials created and email attempted'
          }
        : null,
      triage: {
        triageId: triageResult.triageRecord._id,
        priorityLevel: triageResult.triageRecord.priorityLevel,
        riskScore: triageResult.triageRecord.totalRiskScore,
        estimatedWaitMinutes: triageResult.triageRecord.estimatedWaitMinutes,
        queuePosition: triageResult.queuePosition
      }
    });
  } catch (error) {
    console.error('Receptionist check-in error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed receptionist check-in', details: error.response?.data || error.message });
  }
});

module.exports = router;
