/**
 * DOCTOR ROUTES
 * Endpoints for doctor dashboard, patient preview, queue management
 */

const express = require('express');
const router = express.Router();
const { Doctor, Patient, Visit, VitalSignRecord, TriageRecord, Appointment } = require('../models');
const { authenticateDoctor } = require('../middleware/auth');
const axios = require('axios');

const TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001';

// ══════════════════════════════════════════════════════════════════
// DOCTOR DASHBOARD - Today's Schedule & Queue
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId/dashboard', authenticateDoctor, async (req, res) => {
  try {
    const {doctorId } = req.params;
    const today = new Date().toISOString().split('T')[0];
    
    // Get doctor info
    const doctor = await Doctor.findById(doctorId).populate('departmentId');
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    
    // Get today's appointments
    const appointments = await Appointment.find({
      doctorId,
      scheduledDate: today,
      status: { $in: ['scheduled', 'confirmed', 'checked-in', 'in-progress'] }
    })
    .populate('patientId')
    .sort({ scheduledTime: 1 });
    
    // Get current queue from Python triage engine
    let queueData = { queue: [], statistics: {} };
    try {
      const queueResponse = await axios.get(`${TRIAGE_ENGINE_URL}/api/queue/clinic/current`);
      queueData = queueResponse.data;
    } catch (error) {
      console.error('Error fetching queue:', error.message);
    }
    
    // Get today's completed visits
    const completedToday = await Visit.countDocuments({
      doctorId,
      visitDate: { $gte: new Date(today) }
    });
    
    res.json({
      doctor: {
        id: doctor.id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty,
        department: doctor.departmentId?.name || 'General',
        consultationDuration: doctor.consultationDuration
      },
      
      todaySchedule: {
        totalAppointments: appointments.length,
        appointments: appointments.map(app => ({
          id: app._id,
          time: app.scheduledTime,
          duration: app.duration,
          patient: {
            id: app.patientId._id,
            name: `${app.patientId.firstName} ${app.patientId.lastName}`,
            age: Math.floor((new Date() - new Date(app.patientId.dateOfBirth)) / 31557600000),
            phone: app.patientId.phone
          },
          type: app.appointmentType,
          status: app.status,
          chiefComplaint: app.chiefComplaint
        }))
      },
      
      currentQueue: {
        ...queueData.statistics,
        patients: queueData.queue || []
      },
      
      statistics: {
        completedToday,
        patientsWaiting: queueData.statistics?.waiting_count || 0,
        avgWaitTime: queueData.statistics?.avg_wait_minutes || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching doctor dashboard:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATIENT PREVIEW - Before Calling to Cabin
// Shows complete medical summary for doctor
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId/patient-preview/:patientId', authenticateDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Get patient with comprehensive data
    const patient = await Patient.findById(patientId)
      .populate({
        path: 'visits',
        options: { limit: 5, sort: { visitDate: -1 } },
        populate: { path: 'doctorId' }
      });
    
    // Get additional data separately
    const vitalSigns = await VitalSignRecord.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    const triageRecords = await TriageRecord.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(1);
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const age = Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000);
    const lastVisit = patient.visits?.[0];
    const latestTriage = triageRecords[0];
    const latestVitals = vitalSigns[0];
    
    // Build comprehensive preview
    const preview = {
      // BASIC INFO (Top Section)
      basicInfo: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        age,
        gender: patient.gender,
        bloodType: patient.bloodType,
        phone: patient.phone,
        preferredLanguage: patient.preferredLanguage
      },
      
      // CRITICAL ALERTS (Highlighted)
      criticalAlerts: {
        allergies: (patient.allergies || [])
          .filter(a => a.severity === 'severe' || a.severity === 'life-threatening')
          .map(a => ({
            allergen: a.allergen,
            reaction: a.reaction,
            severity: a.severity
          })),
        
        activeConditions: (patient.chronicConditions || [])
          .filter(c => c.status === 'active')
          .map(c => ({
            condition: c.condition,
            severity: c.severity
          }))
      },
      
      // CURRENT MEDICATIONS
      currentMedications: (patient.currentMedications || [])
        .filter(m => m.active !== false)
        .map(m => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          reason: m.reason
        })),
      
      // TODAY'S TRIAGE (if available)
      todayTriage: latestTriage ? {
        timestamp: latestTriage.createdAt,
        chiefComplaint: latestTriage.chiefComplaint,
        priorityLevel: latestTriage.priorityLevel,
        totalRiskScore: latestTriage.totalRiskScore,
        symptomCategory: latestTriage.symptomCategory,
        redFlags: latestTriage.redFlags || [],
        vitalSigns: latestTriage.vitalSigns,
        triageNotes: latestTriage.triageNotes
      } : null,
      
      // LATEST VITALS
      latestVitals: latestVitals ? {
        date: latestVitals.createdAt,
        bloodPressure: latestVitals.bloodPressureSystolic ? 
          `${latestVitals.bloodPressureSystolic}/${latestVitals.bloodPressureDiastolic}` : null,
        heartRate: latestVitals.heartRate,
        temperature: latestVitals.temperature,
        oxygenSaturation: latestVitals.oxygenSaturation,
        painLevel: latestVitals.painLevel,
        weight: latestVitals.weightKg,
        bmi: latestVitals.bmi
      } : null,
      
      // RECENT VISIT HISTORY (Last 5 visits)
      recentVisits: (patient.visits || []).map(visit => ({
        date: visit.visitDate,
        doctor: visit.doctorId ? `Dr. ${visit.doctorId.firstName} ${visit.doctorId.lastName}` : 'Unknown',
        chiefComplaint: visit.chiefComplaint,
        diagnosis: visit.diagnosis,
        treatment: visit.treatment,
        prescriptions: visit.prescriptions,
        followUpNeeded: visit.followUpNeeded
      })),
      
      // LAST VISIT SUMMARY
      lastVisit: lastVisit ? {
        date: lastVisit.visitDate,
        doctor: lastVisit.doctorId ? `Dr. ${lastVisit.doctorId.firstName} ${lastVisit.doctorId.lastName}` : 'Unknown',
        diagnosis: lastVisit.diagnosis,
        treatment: lastVisit.treatment,
        followUpNeeded: lastVisit.followUpNeeded,
        followUpDate: lastVisit.followUpDate,
        doctorNotes: lastVisit.doctorNotes
      } : null,
      
      // COMPLETE MEDICAL PROFILE
      medicalProfile: {
        allAllergies: patient.allergies || [],
        chronicConditions: patient.chronicConditions || [],
        surgicalHistory: patient.surgicalHistory || [],
        familyHistory: patient.familyHistory || []
      },
      
      // EMERGENCY CONTACT
      emergencyContact: {
        name: patient.emergencyContactName,
        phone: patient.emergencyContactPhone,
        relation: patient.emergencyContactRelation
      },
      
      // VISIT STATISTICS
      statistics: {
        totalVisits: patient.totalVisits,
        lastVisitDate: patient.lastVisitDate,
        hasActiveFollowUp: lastVisit?.followUpNeeded || false
      }
    };
    
    res.json(preview);
    
  } catch (error) {
    console.error('Error fetching patient preview:', error);
    res.status(500).json({ error: 'Failed to load patient preview' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CALL NEXT PATIENT - Integration with Python Queue
// ═══════════════════════════════════════════════════════════════

router.post('/:doctorId/call-next', authenticateDoctor, async (req, res) => {
  try {
    // Call Python triage engine to get next patient
    const response = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/next`);
    
    if (!response.data.patient_id) {
      return res.json({ message: 'No patients waiting in queue' });
    }
    
    const nextPatientId = response.data.patient_id;
    
    // Get patient details from database
    const patient = await Patient.findById(nextPatientId);
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found in database' });
    }
    
    res.json({
      message: `Call ${patient.firstName} ${patient.lastName} to examination room`,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        age: Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000),
        chiefComplaint: response.data.chief_complaint,
        priority: response.data.priority
      }
    });
    
  } catch (error) {
    console.error('Error calling next patient:', error);
    res.status(500).json({ error: 'Failed to call next patient' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEARCH Doctors (for easy booking UX)
// ═══════════════════════════════════════════════════════════════

router.get('/search', async (req, res) => {
  try {
    const { query = '', specialty = '', departmentId = '' } = req.query;

    const where = {
      isActive: true
    };

    if (specialty) {
      where.specialty = new RegExp(specialty, 'i');
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    const doctors = await Doctor.find(where)
      .select('id firstName lastName specialty yearsOfExperience consultationDuration averageRating departmentId')
      .populate('departmentId')
      .sort({ firstName: 1 });

    const normalizedQuery = String(query).trim().toLowerCase();
    const filtered = normalizedQuery
      ? doctors.filter((doctor) => {
          const fullName = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
          const departmentName = doctor.departmentId?.name?.toLowerCase() || '';
          const specialtyName = doctor.specialty?.toLowerCase() || '';
          return fullName.includes(normalizedQuery)
            || departmentName.includes(normalizedQuery)
            || specialtyName.includes(normalizedQuery);
        })
      : doctors;

    res.json({
      total: filtered.length,
      doctors: filtered.map((doctor) => ({
        id: doctor._id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty,
        department: doctor.departmentId?.name || null,
        yearsOfExperience: doctor.yearsOfExperience,
        consultationDuration: doctor.consultationDuration,
        averageRating: doctor.averageRating
      }))
    });
  } catch (error) {
    console.error('Error searching doctors:', error);
    res.status(500).json({ error: 'Failed to search doctors' });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE Doctor Availability
// ═══════════════════════════════════════════════════════════════

router.put('/:doctorId/availability', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { isAvailableToday, availableSlots } = req.body;
    
    await Doctor.findByIdAndUpdate(doctorId, { isAvailableToday, availableSlots }, { new: true });
    
    res.json({ message: 'Availability updated successfully' });
    
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Doctors by Specialty (for patient booking)
// ═══════════════════════════════════════════════════════════════

router.get('/specialty/:specialty', async (req, res) => {
  try {
    const { specialty } = req.params;
    
    const doctors = await Doctor.find({
      specialty,
      isActive: true
    })
    .select('id firstName lastName specialty qualifications yearsOfExperience averageRating')
    .populate('departmentId');
    
    res.json({
      specialty,
      doctors: doctors.map(d => ({
        id: d._id,
        name: `Dr. ${d.firstName} ${d.lastName}`,
        specialty: d.specialty,
        qualifications: d.qualifications,
        experience: d.yearsOfExperience,
        rating: d.averageRating,
        department: d.departmentId?.name
      }))
    });
    
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Doctor Profile
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId)
      .populate('departmentId')
      .select('-passwordHash');
    
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    
    res.json(doctor);
  } catch (error) {
    console.error('Error fetching doctor:', error);
    res.status(500).json({ error: 'Failed to fetch doctor' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATE Doctor (Registration)
// ═══════════════════════════════════════════════════════════════

router.post('/', async (req, res) => {
  try {
    const doctorData = req.body;
    
    // Check if doctor with email already exists
    const existing = await Doctor.findOne({ email: doctorData.email });
    if (existing) {
      return res.status(400).json({ error: 'Doctor with this email already exists' });
    }
    
    const doctor = new Doctor(doctorData);
    await doctor.save();
    
    res.status(201).json({
      message: 'Doctor registered successfully',
      doctorId: doctor._id,
      doctor: {
        id: doctor._id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        specialty: doctor.specialty
      }
    });
    
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: 'Failed to register doctor' });
  }
});

module.exports = router;
