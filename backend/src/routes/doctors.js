/**
 * DOCTOR ROUTES
 * Endpoints for doctor dashboard, patient preview, queue management
 */

const express = require('express');
const router = express.Router();
const {
  Doctor,
  Patient,
  Visit,
  VitalSignRecord,
  TriageRecord,
  Appointment,
  DoctorSchedule,
  DoctorBreak,
  DoctorSlot
} = require('../models');
const { authenticateDoctor } = require('../middleware/auth');
const axios = require('axios');
const { assertWithinNextWeek, generateSlots, overlaps, parseMinutes } = require('../utils/scheduling');
const { getSocketServer } = require('../utils/socketServer');

const TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001';

function localIsoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureDoctorAccess(req, doctorId) {
  return String(req.userId) === String(doctorId);
}

async function emitSlotsUpdate(doctorId, date) {
  const io = getSocketServer();
  if (!io) return;

  const slots = await DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 });
  io.to(`doctor:${doctorId}:slots:${date}`).emit('slot:update', {
    doctorId,
    date,
    slots: slots.map((slot) => ({
      slotId: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: slot.status
    }))
  });
}

async function regenerateDoctorSlots({ doctor, date }) {
  const [schedule, breaks] = await Promise.all([
    DoctorSchedule.findOne({ doctorId: doctor.id, date }),
    DoctorBreak.find({ doctorId: doctor.id, date })
  ]);

  if (!schedule) {
    return { generated: 0, slots: [] };
  }

  const generated = generateSlots(schedule, breaks);
  const bookedSlots = await DoctorSlot.find({ doctorId: doctor.id, date, status: 'BOOKED' });
  const bookedByStart = new Map(bookedSlots.map((slot) => [slot.startTime, slot]));

  await DoctorSlot.deleteMany({ doctorId: doctor.id, date, status: { $ne: 'BOOKED' } });

  const docsToInsert = [];
  for (const slot of generated) {
    if (bookedByStart.has(slot.startTime)) {
      continue;
    }

    docsToInsert.push({
      doctorId: doctor.id,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: slot.status
    });
  }

  if (docsToInsert.length) {
    try {
      await DoctorSlot.insertMany(docsToInsert, { ordered: false });
    } catch (error) {
      const duplicateOnly = error?.code === 11000
        || (Array.isArray(error?.writeErrors) && error.writeErrors.every((entry) => entry?.code === 11000));
      if (!duplicateOnly) {
        throw error;
      }
    }
  }

  const finalSlots = await DoctorSlot.find({ doctorId: doctor.id, date }).sort({ startTime: 1 });
  return {
    generated: docsToInsert.length,
    slots: finalSlots
  };
}

// ══════════════════════════════════════════════════════════════════
// DOCTOR DASHBOARD - Today's Schedule & Queue
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId/dashboard', authenticateDoctor, async (req, res) => {
  try {
    const {doctorId } = req.params;
    const today = localIsoDate();
    const next7 = new Date();
    next7.setDate(next7.getDate() + 7);
    const next7Iso = localIsoDate(next7);
    
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

    const upcomingAppointments = await Appointment.find({
      doctorId,
      scheduledDate: { $gte: today, $lte: next7Iso },
      status: { $in: ['scheduled', 'confirmed', 'checked-in', 'in-progress'] }
    })
    .populate('patientId')
    .sort({ scheduledDate: 1, scheduledTime: 1 });
    
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
      todayDate: today,
      
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

      upcomingAppointments: {
        total: upcomingAppointments.length,
        appointments: upcomingAppointments.map(app => ({
          id: app._id,
          date: app.scheduledDate,
          time: app.scheduledTime,
          duration: app.duration,
          patient: {
            id: app.patientId?._id,
            name: app.patientId ? `${app.patientId.firstName} ${app.patientId.lastName}` : 'Patient'
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
// CREATE/UPDATE Doctor Schedule (Weekly planning)
// ═══════════════════════════════════════════════════════════════

router.post('/schedule', authenticateDoctor, async (req, res) => {
  try {
    const {
      doctorId,
      date,
      shiftStart,
      shiftEnd,
      appointmentStart,
      appointmentEnd,
      slotDuration
    } = req.body;

    if (!doctorId || !date || !shiftStart || !shiftEnd || !appointmentStart || !appointmentEnd || !slotDuration) {
      return res.status(400).json({ error: 'doctorId, date, shift and appointment window, and slotDuration are required' });
    }

    assertWithinNextWeek(date);

    const normalizedSlotDuration = Number(slotDuration);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'Doctor not found or inactive' });
    }

    const [existingSchedule, existingSlots] = await Promise.all([
      DoctorSchedule.findOne({ doctorId, date }),
      DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 })
    ]);

    const hasSameSchedule = Boolean(existingSchedule
      && existingSchedule.shiftStart === shiftStart
      && existingSchedule.shiftEnd === shiftEnd
      && existingSchedule.appointmentStart === appointmentStart
      && existingSchedule.appointmentEnd === appointmentEnd
      && Number(existingSchedule.slotDuration) === normalizedSlotDuration);

    if (hasSameSchedule && existingSlots.length) {
      return res.status(200).json({
        message: 'Schedule already exists for this date. Reusing existing generated slots.',
        schedule: existingSchedule,
        slots: existingSlots.map((slot) => ({
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status
        }))
      });
    }

    const schedule = await DoctorSchedule.findOneAndUpdate(
      { doctorId, date },
      {
        doctorId,
        date,
        shiftStart,
        shiftEnd,
        appointmentStart,
        appointmentEnd,
        slotDuration: normalizedSlotDuration
      },
      { upsert: true, new: true }
    );

    const { slots } = await regenerateDoctorSlots({ doctor, date });

    const io = getSocketServer();
    if (io) {
      io.to(`doctor:${doctor.id}:slots:${date}`).emit('slot:update', {
        doctorId: doctor.id,
        date,
        slots: slots.map((slot) => ({
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status
        }))
      });
    }

    return res.status(201).json({
      message: 'Schedule saved and slots generated',
      schedule,
      slots: slots.map((slot) => ({
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status
      }))
    });
  } catch (error) {
    console.error('Error setting doctor schedule:', error);
    return res.status(400).json({ error: error.message || 'Failed to set doctor schedule' });
  }
});

router.get('/:doctorId/schedule', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only access your own schedule' });
    }

    assertWithinNextWeek(date);

    const schedule = await DoctorSchedule.findOne({ doctorId, date });
    return res.json({ doctorId, date, schedule });
  } catch (error) {
    console.error('Error fetching doctor schedule:', error);
    return res.status(400).json({ error: error.message || 'Failed to fetch doctor schedule' });
  }
});

router.delete('/:doctorId/schedule', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only delete your own schedule' });
    }

    assertWithinNextWeek(date);

    const [bookedCount] = await Promise.all([
      DoctorSlot.countDocuments({ doctorId, date, status: 'BOOKED' })
    ]);

    if (bookedCount > 0) {
      return res.status(400).json({ error: 'Cannot delete schedule with booked slots. Cancel appointments first.' });
    }

    await Promise.all([
      DoctorSchedule.deleteOne({ doctorId, date }),
      DoctorBreak.deleteMany({ doctorId, date }),
      DoctorSlot.deleteMany({ doctorId, date })
    ]);

    await emitSlotsUpdate(doctorId, date);

    return res.json({ message: 'Schedule, breaks and slots deleted for selected date' });
  } catch (error) {
    console.error('Error deleting doctor schedule:', error);
    return res.status(400).json({ error: error.message || 'Failed to delete doctor schedule' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADD Doctor Break and block overlapping slots
// ═══════════════════════════════════════════════════════════════

router.post('/break', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId, date, breakStart, breakEnd } = req.body;

    if (!doctorId || !date || !breakStart || !breakEnd) {
      return res.status(400).json({ error: 'doctorId, date, breakStart and breakEnd are required' });
    }

    assertWithinNextWeek(date);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'Doctor not found or inactive' });
    }

    if (parseMinutes(breakStart) >= parseMinutes(breakEnd)) {
      return res.status(400).json({ error: 'breakEnd must be after breakStart' });
    }

    const createdBreak = await DoctorBreak.create({ doctorId, date, breakStart, breakEnd });

    const slots = await DoctorSlot.find({ doctorId, date, status: { $in: ['AVAILABLE', 'BLOCKED'] } });
    const breakStartMinutes = parseMinutes(breakStart);
    const breakEndMinutes = parseMinutes(breakEnd);
    const overlappedIds = slots
      .filter((slot) => overlaps(parseMinutes(slot.startTime), parseMinutes(slot.endTime), breakStartMinutes, breakEndMinutes))
      .map((slot) => slot._id);

    if (overlappedIds.length) {
      await DoctorSlot.updateMany({ _id: { $in: overlappedIds }, status: 'AVAILABLE' }, { status: 'BLOCKED' });
    }

    const finalSlots = await DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 });
    const io = getSocketServer();
    if (io) {
      io.to(`doctor:${doctorId}:slots:${date}`).emit('slot:update', {
        doctorId,
        date,
        slots: finalSlots.map((slot) => ({
          slotId: slot.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status
        }))
      });
    }

    return res.status(201).json({
      message: 'Break added and overlapping slots blocked',
      break: createdBreak,
      blockedCount: overlappedIds.length
    });
  } catch (error) {
    console.error('Error creating doctor break:', error);
    return res.status(400).json({ error: error.message || 'Failed to add doctor break' });
  }
});

router.get('/:doctorId/breaks', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only access your own breaks' });
    }

    assertWithinNextWeek(date);

    const breaks = await DoctorBreak.find({ doctorId, date }).sort({ breakStart: 1 });
    return res.json({ doctorId, date, breaks });
  } catch (error) {
    console.error('Error fetching doctor breaks:', error);
    return res.status(400).json({ error: error.message || 'Failed to fetch doctor breaks' });
  }
});

router.put('/break/:breakId', authenticateDoctor, async (req, res) => {
  try {
    const { breakId } = req.params;
    const { breakStart, breakEnd } = req.body;

    if (!breakStart || !breakEnd) {
      return res.status(400).json({ error: 'breakStart and breakEnd are required' });
    }

    if (parseMinutes(breakStart) >= parseMinutes(breakEnd)) {
      return res.status(400).json({ error: 'breakEnd must be after breakStart' });
    }

    const existingBreak = await DoctorBreak.findById(breakId);
    if (!existingBreak) {
      return res.status(404).json({ error: 'Break not found' });
    }

    if (!ensureDoctorAccess(req, existingBreak.doctorId)) {
      return res.status(403).json({ error: 'You can only update your own breaks' });
    }

    existingBreak.breakStart = breakStart;
    existingBreak.breakEnd = breakEnd;
    await existingBreak.save();

    const doctor = await Doctor.findById(existingBreak.doctorId);
    await regenerateDoctorSlots({ doctor, date: existingBreak.date });
    await emitSlotsUpdate(String(existingBreak.doctorId), existingBreak.date);

    return res.json({ message: 'Break updated and slots regenerated', break: existingBreak });
  } catch (error) {
    console.error('Error updating doctor break:', error);
    return res.status(400).json({ error: error.message || 'Failed to update doctor break' });
  }
});

router.delete('/break/:breakId', authenticateDoctor, async (req, res) => {
  try {
    const { breakId } = req.params;

    const existingBreak = await DoctorBreak.findById(breakId);
    if (!existingBreak) {
      return res.status(404).json({ error: 'Break not found' });
    }

    if (!ensureDoctorAccess(req, existingBreak.doctorId)) {
      return res.status(403).json({ error: 'You can only delete your own breaks' });
    }

    await DoctorBreak.deleteOne({ _id: breakId });

    const doctor = await Doctor.findById(existingBreak.doctorId);
    await regenerateDoctorSlots({ doctor, date: existingBreak.date });
    await emitSlotsUpdate(String(existingBreak.doctorId), existingBreak.date);

    return res.json({ message: 'Break deleted and slots regenerated' });
  } catch (error) {
    console.error('Error deleting doctor break:', error);
    return res.status(400).json({ error: error.message || 'Failed to delete doctor break' });
  }
});

router.post('/slot', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId, date, startTime, endTime, status = 'AVAILABLE' } = req.body;

    if (!doctorId || !date || !startTime || !endTime) {
      return res.status(400).json({ error: 'doctorId, date, startTime and endTime are required' });
    }

    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only add your own slots' });
    }

    assertWithinNextWeek(date);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'Doctor not found or inactive' });
    }

    const schedule = await DoctorSchedule.findOne({ doctorId, date });
    if (!schedule) {
      return res.status(400).json({ error: 'Create schedule before adding custom slots' });
    }

    const slotStart = parseMinutes(startTime);
    const slotEnd = parseMinutes(endTime);
    if (slotStart >= slotEnd) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    const appointmentStart = parseMinutes(schedule.appointmentStart);
    const appointmentEnd = parseMinutes(schedule.appointmentEnd);
    if (slotStart < appointmentStart || slotEnd > appointmentEnd) {
      return res.status(400).json({ error: 'Custom slot must be within appointment window' });
    }

    const breaks = await DoctorBreak.find({ doctorId, date });
    const hasBreakOverlap = breaks.some((entry) => overlaps(slotStart, slotEnd, parseMinutes(entry.breakStart), parseMinutes(entry.breakEnd)));
    if (hasBreakOverlap) {
      return res.status(400).json({ error: 'Custom slot overlaps with a break' });
    }

    const existingSlots = await DoctorSlot.find({ doctorId, date });
    const hasSlotOverlap = existingSlots.some((slot) => overlaps(slotStart, slotEnd, parseMinutes(slot.startTime), parseMinutes(slot.endTime)));
    if (hasSlotOverlap) {
      return res.status(400).json({ error: 'Custom slot overlaps with an existing slot' });
    }

    const createdSlot = await DoctorSlot.create({
      doctorId,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      date,
      startTime,
      endTime,
      status
    });

    await emitSlotsUpdate(doctorId, date);

    return res.status(201).json({
      message: 'Custom slot added',
      slot: {
        slotId: createdSlot.id,
        startTime: createdSlot.startTime,
        endTime: createdSlot.endTime,
        status: createdSlot.status
      }
    });
  } catch (error) {
    console.error('Error adding custom doctor slot:', error);
    return res.status(400).json({ error: error.message || 'Failed to add custom doctor slot' });
  }
});

router.put('/slot/:slotId', authenticateDoctor, async (req, res) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime, status } = req.body;

    const slot = await DoctorSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (!ensureDoctorAccess(req, slot.doctorId)) {
      return res.status(403).json({ error: 'You can only update your own slots' });
    }

    if (slot.status === 'BOOKED' && (startTime || endTime)) {
      return res.status(400).json({ error: 'Cannot change time for booked slots' });
    }

    const nextStart = startTime || slot.startTime;
    const nextEnd = endTime || slot.endTime;
    const nextStatus = status || slot.status;

    const startMinutes = parseMinutes(nextStart);
    const endMinutes = parseMinutes(nextEnd);
    if (startMinutes >= endMinutes) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    const schedule = await DoctorSchedule.findOne({ doctorId: slot.doctorId, date: slot.date });
    if (schedule) {
      const windowStart = parseMinutes(schedule.appointmentStart);
      const windowEnd = parseMinutes(schedule.appointmentEnd);
      if (startMinutes < windowStart || endMinutes > windowEnd) {
        return res.status(400).json({ error: 'Slot must be within appointment window' });
      }
    }

    const breaks = await DoctorBreak.find({ doctorId: slot.doctorId, date: slot.date });
    const overlapsBreak = breaks.some((entry) => overlaps(startMinutes, endMinutes, parseMinutes(entry.breakStart), parseMinutes(entry.breakEnd)));
    if (overlapsBreak) {
      return res.status(400).json({ error: 'Slot overlaps with a break' });
    }

    const siblingSlots = await DoctorSlot.find({ doctorId: slot.doctorId, date: slot.date, _id: { $ne: slot._id } });
    const overlapsSlot = siblingSlots.some((entry) => overlaps(startMinutes, endMinutes, parseMinutes(entry.startTime), parseMinutes(entry.endTime)));
    if (overlapsSlot) {
      return res.status(400).json({ error: 'Slot overlaps with another slot' });
    }

    slot.startTime = nextStart;
    slot.endTime = nextEnd;
    slot.status = nextStatus;
    await slot.save();

    await emitSlotsUpdate(String(slot.doctorId), slot.date);

    return res.json({
      message: 'Slot updated',
      slot: {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status
      }
    });
  } catch (error) {
    console.error('Error updating doctor slot:', error);
    return res.status(400).json({ error: error.message || 'Failed to update doctor slot' });
  }
});

router.delete('/slot/:slotId', authenticateDoctor, async (req, res) => {
  try {
    const { slotId } = req.params;

    const slot = await DoctorSlot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    if (!ensureDoctorAccess(req, slot.doctorId)) {
      return res.status(403).json({ error: 'You can only delete your own slots' });
    }

    if (slot.status === 'BOOKED') {
      return res.status(400).json({ error: 'Cannot delete booked slot' });
    }

    await DoctorSlot.deleteOne({ _id: slotId });
    await emitSlotsUpdate(String(slot.doctorId), slot.date);

    return res.json({ message: 'Slot deleted' });
  } catch (error) {
    console.error('Error deleting doctor slot:', error);
    return res.status(400).json({ error: error.message || 'Failed to delete doctor slot' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Doctor Slots (patient + portal)
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId/slots', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    assertWithinNextWeek(date);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'Doctor not found or inactive' });
    }

    let slots = await DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 });
    if (!slots.length) {
      await regenerateDoctorSlots({ doctor, date });
      slots = await DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 });
    }

    return res.json({
      doctorId,
      date,
      slots: slots.map((slot) => ({
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        available: slot.status === 'AVAILABLE'
      }))
    });
  } catch (error) {
    console.error('Error fetching doctor slots:', error);
    return res.status(400).json({ error: error.message || 'Failed to fetch doctor slots' });
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
