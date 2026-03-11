/**
 * VISIT ROUTES
 * Medical visit records, prescriptions, doctor notes
 */

const express = require('express');
const router = express.Router();
const { Visit, Patient, Doctor, Appointment, TriageRecord, VitalSignRecord } = require('../models');
const { authenticateDoctor, authenticatePatient, authenticateAny } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// CREATE VISIT RECORD (Doctor)
// ═══════════════════════════════════════════════════════════════

router.post('/', authenticateDoctor, async (req, res) => {
  try {
    const {
      patientId,
      appointmentId,
      triageRecordId,
      chiefComplaint,
      diagnosis,
      icdCodes,
      treatment,
      prescriptions,
      testsOrdered,
      doctorNotes,
      patientInstructions,
      followUpNeeded,
      followUpDate,
      vitalsRecorded,
      duration
    } = req.body;
    
    if (!patientId || !chiefComplaint) {
      return res.status(400).json({ error: 'Patient ID and chief complaint required' });
    }
    
    const doctorId = req.doctor.id;
    
    // Create visit record
    const visit = new Visit({
      patientId,
      doctorId,
      appointmentId: appointmentId || null,
      triageRecordId: triageRecordId || null,
      visitDate: new Date(),
      chiefComplaint,
      diagnosis: diagnosis || '',
      icdCodes: icdCodes || [],
      treatment: treatment || '',
      prescriptions: prescriptions || [],
      testsOrdered: testsOrdered || [],
      doctorNotes: doctorNotes || '',
      patientInstructions: patientInstructions || '',
      followUpNeeded: followUpNeeded || false,
      followUpDate: followUpDate || null,
      vitalsRecorded: vitalsRecorded || {},
      duration: duration || null,
      status: 'completed'
    });
    await visit.save();
    
    // Update patient statistics
    const patient = await Patient.findById(patientId);
    if (patient) {
      patient.totalVisits = (patient.totalVisits || 0) + 1;
      patient.lastVisitDate = new Date();
      await patient.save();
    }
    
    // Update doctor statistics
    const doctor = await Doctor.findById(doctorId);
    if (doctor) {
      doctor.totalPatientsSeen = (doctor.totalPatientsSeen || 0) + 1;
      await doctor.save();
    }
    
    // If appointment exists, mark it as completed
    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, { status: 'completed' });
    }
    
    res.status(201).json({
      message: 'Visit record created successfully',
      visit: {
        id: visit._id,
        patientId: visit.patientId,
        doctorId: visit.doctorId,
        visitDate: visit.visitDate,
        diagnosis: visit.diagnosis,
        followUpNeeded: visit.followUpNeeded
      }
    });
    
  } catch (error) {
    console.error('Visit creation error:', error);
    res.status(500).json({ error: 'Failed to create visit record' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET VISIT DETAILS
// ═══════════════════════════════════════════════════════════════

router.get('/:visitId', authenticateAny, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId)
      .populate('patientId')
      .populate('doctorId')
      .populate('appointmentId')
      .populate('triageRecordId');
    
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    
    // Authorization check
    if (req.role === 'patient' && String(visit.patientId._id) !== String(req.patient.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.role === 'doctor' && String(visit.doctorId._id) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      id: visit._id,
      visitDate: visit.visitDate,
      patient: {
        id: visit.patientId._id,
        name: `${visit.patientId.firstName} ${visit.patientId.lastName}`,
        age: Math.floor((new Date() - new Date(visit.patientId.dateOfBirth)) / 31557600000),
        gender: visit.patientId.gender
      },
      doctor: {
        id: visit.doctorId._id,
        name: `Dr. ${visit.doctorId.firstName} ${visit.doctorId.lastName}`,
        specialty: visit.doctorId.specialty
      },
      chiefComplaint: visit.chiefComplaint,
      diagnosis: visit.diagnosis,
      icdCodes: visit.icdCodes,
      treatment: visit.treatment,
      prescriptions: visit.prescriptions,
      testsOrdered: visit.testsOrdered,
      doctorNotes: visit.doctorNotes,
      patientInstructions: visit.patientInstructions,
      followUpNeeded: visit.followUpNeeded,
      followUpDate: visit.followUpDate,
      vitalsRecorded: visit.vitalsRecorded,
      duration: visit.duration,
      status: visit.status,
      triageData: visit.triageRecordId ? {
        priorityLevel: visit.triageRecordId.priorityLevel,
        riskScore: visit.triageRecordId.totalRiskScore
      } : null
    });
    
  } catch (error) {
    console.error('Error fetching visit:', error);
    res.status(500).json({ error: 'Failed to fetch visit' });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE VISIT (Doctor adds notes/diagnosis after initial creation)
// ═══════════════════════════════════════════════════════════════

router.put('/:visitId', authenticateDoctor, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId);
    
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    
    if (String(visit.doctorId) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const {
      diagnosis,
      icdCodes,
      treatment,
      prescriptions,
      testsOrdered,
      doctorNotes,
      patientInstructions,
      followUpNeeded,
      followUpDate,
      status
    } = req.body;
    
    if (diagnosis !== undefined) visit.diagnosis = diagnosis;
    if (icdCodes !== undefined) visit.icdCodes = icdCodes;
    if (treatment !== undefined) visit.treatment = treatment;
    if (prescriptions !== undefined) visit.prescriptions = prescriptions;
    if (testsOrdered !== undefined) visit.testsOrdered = testsOrdered;
    if (doctorNotes !== undefined) visit.doctorNotes = doctorNotes;
    if (patientInstructions !== undefined) visit.patientInstructions = patientInstructions;
    if (followUpNeeded !== undefined) visit.followUpNeeded = followUpNeeded;
    if (followUpDate !== undefined) visit.followUpDate = followUpDate;
    if (status !== undefined) visit.status = status;
    
    await visit.save();
    
    res.json({
      message: 'Visit updated successfully',
      visitId: visit._id
    });
    
  } catch (error) {
    console.error('Visit update error:', error);
    res.status(500).json({ error: 'Failed to update visit' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADD PRESCRIPTION to Visit
// ═══════════════════════════════════════════════════════════════

router.post('/:visitId/prescriptions', authenticateDoctor, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId);
    
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    
    if (String(visit.doctorId) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { medication, dosage, frequency, duration, instructions } = req.body;
    
    if (!medication || !dosage || !frequency) {
      return res.status(400).json({ error: 'Medication, dosage, and frequency required' });
    }
    
    const prescription = {
      medication,
      dosage,
      frequency,
      duration,
      instructions,
      prescribedDate: new Date()
    };
    
    const currentPrescriptions = visit.prescriptions || [];
    currentPrescriptions.push(prescription);
    
    visit.prescriptions = currentPrescriptions;
    await visit.save();
    
    res.json({
      message: 'Prescription added successfully',
      prescription
    });
    
  } catch (error) {
    console.error('Prescription error:', error);
    res.status(500).json({ error: 'Failed to add prescription' });
  }
});

// ═══════════════════════════════════════════════════════════════
// RECORD VITAL SIGNS During Visit
// ═══════════════════════════════════════════════════════════════

router.post('/:visitId/vitals', authenticateDoctor, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId);
    
    if (!visit) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    
    const {
      bloodPressureSystolic,
      bloodPressureDiastolic,
      heartRate,
      temperature,
      respiratoryRate,
      oxygenSaturation,
      weightKg,
      heightCm,
      painLevel
    } = req.body;
    
    // Create vital sign record
    const vitalRecord = new VitalSignRecord({
      patientId: visit.patientId,
      visitId: visit._id,
      bloodPressureSystolic,
      bloodPressureDiastolic,
      heartRate,
      temperature,
      respiratoryRate,
      oxygenSaturation,
      weightKg,
      heightCm,
      bmi: weightKg && heightCm ? (weightKg / ((heightCm / 100) ** 2)).toFixed(1) : null,
      painLevel,
      recordedBy: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`
    });
    await vitalRecord.save();
    
    // Update visit vitals summary
    visit.vitalsRecorded = {
      bloodPressure: bloodPressureSystolic ? `${bloodPressureSystolic}/${bloodPressureDiastolic}` : null,
      heartRate,
      temperature,
      oxygenSaturation,
      painLevel
    };
    await visit.save();
    
    res.json({
      message: 'Vital signs recorded successfully',
      vitalRecord: {
        id: vitalRecord._id,
        bloodPressure: vitalRecord.bloodPressureSystolic ? 
          `${vitalRecord.bloodPressureSystolic}/${vitalRecord.bloodPressureDiastolic}` : null,
        heartRate: vitalRecord.heartRate,
        temperature: vitalRecord.temperature,
        oxygenSaturation: vitalRecord.oxygenSaturation,
        bmi: vitalRecord.bmi
      }
    });
    
  } catch (error) {
    console.error('Vitals recording error:', error);
    res.status(500).json({ error: 'Failed to record vital signs' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET ALL VISITS for Patient (with filters)
// ═══════════════════════════════════════════════════════════════

router.get('/patient/:patientId/all', authenticateAny, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    // Authorization check for patients
    if (req.role === 'patient' && parseInt(patientId) !== req.patient.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const visits = await Visit.find({ patientId })
      .populate('doctorId')
      .sort({ visitDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    const totalCount = await Visit.countDocuments({ patientId });
    
    res.json({
      patientId,
      totalVisits: totalCount,
      visits: visits.map(v => ({
        id: v._id,
        visitDate: v.visitDate,
        doctor: `Dr. ${v.doctorId.firstName} ${v.doctorId.lastName}`,
        specialty: v.doctorId.specialty,
        chiefComplaint: v.chiefComplaint,
        diagnosis: v.diagnosis,
        followUpNeeded: v.followUpNeeded,
        followUpDate: v.followUpDate
      }))
    });
    
  } catch (error) {
    console.error('Error fetching visits:', error);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Doctor's Recent Visits (for dashboard)
// ═══════════════════════════════════════════════════════════════

router.get('/doctor/:doctorId/recent', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { limit = 10 } = req.query;
    
    // Authorization check
    if (parseInt(doctorId) !== req.doctor.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const visits = await Visit.find({ doctorId })
      .populate('patientId')
      .sort({ visitDate: -1 })
      .limit(parseInt(limit));
    
    res.json({
      doctorId,
      recentVisits: visits.map(v => ({
        id: v._id,
        visitDate: v.visitDate,
        patient: {
          id: v.patientId._id,
          name: `${v.patientId.firstName} ${v.patientId.lastName}`,
          age: Math.floor((new Date() - new Date(v.patientId.dateOfBirth)) / 31557600000)
        },
        chiefComplaint: v.chiefComplaint,
        diagnosis: v.diagnosis,
        duration: v.duration
      }))
    });
    
  } catch (error) {
    console.error('Error fetching doctor visits:', error);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

module.exports = router;
