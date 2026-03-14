/**
 * PATIENT ROUTES
 * Endpoints for patient dashboard, profile management, medical history
 */

const express = require('express');
const router = express.Router();
const { Patient, Visit, VitalSignRecord, TriageRecord, Appointment } = require('../models');
const { authenticatePatient } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// PATIENT DASHBOARD - Get Complete Profile
// ═══════════════════════════════════════════════════════════════

router.get('/:patientId/dashboard', authenticatePatient, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (String(req.patient.id) !== String(patientId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Load patient plus related records by patientId.
    const patient = await Patient.findById(patientId);
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const [visits, vitalSigns, appointments, triageRecords] = await Promise.all([
      Visit.find({ patientId })
        .populate('doctorId', 'firstName lastName')
        .populate('departmentId', 'name')
        .sort({ visitDate: -1 }),
      VitalSignRecord.find({ patientId }).sort({ createdAt: -1 }),
      Appointment.find({ patientId })
        .populate('doctorId', 'firstName lastName specialty')
        .sort({ scheduledDate: -1, scheduledTime: -1 }),
      TriageRecord.find({ patientId }).sort({ createdAt: -1 })
    ]);
    
    // Calculate age
    const age = Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000);
    
    // Format dashboard response
    const dashboard = {
      personalInfo: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        age,
        gender: patient.gender,
        bloodType: patient.bloodType,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        preferredLanguage: patient.preferredLanguage
      },
      
      emergencyContact: {
        name: patient.emergencyContactName,
        phone: patient.emergencyContactPhone,
        relation: patient.emergencyContactRelation
      },
      
      insurance: {
        provider: patient.insuranceProvider,
        insuranceId: patient.insuranceId
      },
      
      medicalProfile: {
        allergies: patient.allergies || [],
        chronicConditions: patient.chronicConditions || [],
        currentMedications: patient.currentMedications || [],
        surgicalHistory: patient.surgicalHistory || [],
        familyHistory: patient.familyHistory || []
      },
      
      visitHistory: {
        totalVisits: Number.isFinite(patient.totalVisits) ? patient.totalVisits : visits.length,
        lastVisitDate: patient.lastVisitDate || visits[0]?.visitDate || null,
        recentVisits: visits.map((visit) => ({
          id: visit.id,
          date: visit.visitDate,
          doctor: visit.doctorId ? `Dr. ${visit.doctorId.firstName || ''} ${visit.doctorId.lastName || ''}`.trim() : 'Unknown',
          department: visit.departmentId?.name || 'General',
          chiefComplaint: visit.chiefComplaint,
          diagnosis: visit.diagnosis,
          treatment: visit.treatment,
          prescriptions: visit.prescriptions || [],
          followUpNeeded: visit.followUpNeeded,
          followUpDate: visit.followUpDate
        }))
      },
      
      vitalTrends: {
        latestVitals: vitalSigns[0] ? {
          date: vitalSigns[0].createdAt,
          bloodPressure: vitalSigns[0].bloodPressureSystolic ? 
            `${vitalSigns[0].bloodPressureSystolic}/${vitalSigns[0].bloodPressureDiastolic}` : null,
          heartRate: vitalSigns[0].heartRate,
          temperature: vitalSigns[0].temperature,
          oxygenSaturation: vitalSigns[0].oxygenSaturation,
          weight: vitalSigns[0].weightKg,
          bmi: vitalSigns[0].bmi
        } : null,
        history: vitalSigns.map((vital) => ({
          date: vital.createdAt,
          bp: vital.bloodPressureSystolic ? 
            `${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic}` : null,
          hr: vital.heartRate,
          temp: vital.temperature,
          o2: vital.oxygenSaturation,
          weight: vital.weightKg
        }))
      },
      
      upcomingAppointments: appointments.map((app) => ({
        id: app.id,
        date: app.scheduledDate,
        time: app.scheduledTime,
        doctor: app.doctorId ? `Dr. ${app.doctorId.firstName || ''} ${app.doctorId.lastName || ''}`.trim() : 'Unknown',
        specialty: app.doctorId?.specialty,
        type: app.appointmentType,
        status: app.status
      })),
      
      recentTriageAssessments: triageRecords.map((triage) => ({
        id: triage.id,
        date: triage.createdAt,
        chiefComplaint: triage.chiefComplaint,
        priorityLevel: triage.priorityLevel,
        totalRiskScore: triage.totalRiskScore,
        recommendedSpecialty: triage.recommendedSpecialty
      }))
    };
    
    res.json(dashboard);
    
  } catch (error) {
    console.error('Error fetching patient dashboard:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Patient Profile (Basic Info)
// ═══════════════════════════════════════════════════════════════

router.get('/:patientId', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId).select('-passwordHash');
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    res.json(patient);
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE Patient Profile
// ═══════════════════════════════════════════════════════════════

router.put('/:patientId', authenticatePatient, async (req, res) => {
  try {
    const { patientId } = req.params;
    const updates = req.body;
    
    // Don't allow updating sensitive fields via this route
    delete updates.id;
    delete updates.passwordHash;
    delete updates.totalVisits;
    delete updates.lastVisitDate;
    
    const updatedPatient = await Patient.findByIdAndUpdate(patientId, updates, { new: true }).select('-passwordHash');
    
    if (!updatedPatient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    res.json({
      message: 'Profile updated successfully',
      patient: updatedPatient
    });
    
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Medical History (Visits)
// ═══════════════════════════════════════════════════════════════

router.get('/:patientId/visits', authenticatePatient, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const [visits, total] = await Promise.all([
      Visit.find({ patientId })
        .populate(['doctor', 'department'])
        .sort({ visitDate: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset)),
      Visit.countDocuments({ patientId })
    ]);
    
    res.json({
      total,
      visits: visits.map(visit => ({
        id: visit.id,
        date: visit.visitDate,
        doctor: visit.doctor ? `Dr. ${visit.doctor.firstName} ${visit.doctor.lastName}` : 'Unknown',
        department: visit.department?.name || 'General',
        chiefComplaint: visit.chiefComplaint,
        diagnosis: visit.diagnosis,
        treatment: visit.treatment,
        prescriptions: visit.prescriptions,
        testsOrdered: visit.testsOrdered,
        doctorNotes: visit.doctorNotes,
        patientInstructions: visit.patientInstructions,
        followUpNeeded: visit.followUpNeeded,
        followUpDate: visit.followUpDate,
        duration: visit.duration
      }))
    });
    
  } catch (error) {
    console.error('Error fetching visit history:', error);
    res.status(500).json({ error: 'Failed to fetch visit history' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Vital Signs History
// ═══════════════════════════════════════════════════════════════

router.get('/:patientId/vitals', authenticatePatient, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 20 } = req.query;
    
    const vitals = await VitalSignRecord.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      vitals: vitals.map(v => ({
        date: v.createdAt,
        bloodPressure: v.bloodPressureSystolic ? 
          `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : null,
        heartRate: v.heartRate,
        temperature: v.temperature,
        respiratoryRate: v.respiratoryRate,
        oxygenSaturation: v.oxygenSaturation,
        weight: v.weightKg,
        height: v.heightCm,
        bmi: v.bmi,
        painLevel: v.painLevel,
        notes: v.notes
      }))
    });
    
  } catch (error) {
    console.error('Error fetching vital signs:', error);
    res.status(500).json({ error: 'Failed to fetch vital signs' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATE Patient (Registration)
// ═══════════════════════════════════════════════════════════════

router.post('/', async (req, res) => {
  try {
    const patientData = req.body;
    
    // Check if patient with phone already exists
    const existing = await Patient.findOne({ phone: patientData.phone });
    if (existing) {
      return res.status(400).json({ error: 'Patient with this phone number already exists' });
    }
    
    const patient = new Patient(patientData);
    await patient.save();
    
    res.status(201).json({
      message: 'Patient registered successfully',
      patientId: patient.id,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        phone: patient.phone,
        email: patient.email
      }
    });
    
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to register patient' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEARCH Patients
// ═══════════════════════════════════════════════════════════════

router.get('/search', async (req, res) => {
  try {
    const { query, type = 'name' } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    let searchQuery = {};
    
    if (type === 'name') {
      searchQuery = {
        $or: [
          { firstName: new RegExp(query, 'i') },
          { lastName: new RegExp(query, 'i') }
        ]
      };
    } else if (type === 'phone') {
      searchQuery = { phone: query };
    } else if (type === 'email') {
      searchQuery = { email: query };
    }
    
    const patients = await Patient.find(searchQuery)
      .select('id firstName lastName phone email dateOfBirth gender')
      .limit(20);
    
    res.json({
      results: patients.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        phone: p.phone,
        email: p.email,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender
      }))
    });
    
  } catch (error) {
    console.error('Error searching patients:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
