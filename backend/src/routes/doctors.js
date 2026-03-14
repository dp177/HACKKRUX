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
  Queue,
  Appointment,
  DoctorSchedule,
  DoctorBreak,
  DoctorSlot
} = require('../models');
const { authenticateDoctor } = require('../middleware/auth');
const axios = require('axios');
const { assertWithinNextWeek, generateSlots, overlaps, parseMinutes } = require('../utils/scheduling');
const { getSocketServer } = require('../utils/socketServer');
const { callNextFromDepartmentQueue, endActiveConsultation, recalculateDepartmentQueue } = require('../services/queueService');

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
    const search = String(req.query.search || '').trim().toLowerCase();
    const matchesSearch = (...values) => {
      if (!search) return true;
      return values.some((value) => String(value || '').toLowerCase().includes(search));
    };
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
    
    // Get current department queue from Mongo (department-level, not doctor-specific)
    let queueData = { queue: [], statistics: {} };
    try {
      if (doctor.departmentId) {
        await recalculateDepartmentQueue(doctor.departmentId);
        const waiting = await Queue.find({ departmentId: doctor.departmentId, status: { $in: ['IN_CONSULTATION', 'WAITING'] } })
          .populate('patientId', 'firstName lastName')
          .populate('triageRecordId', 'chiefComplaint triageNotes historicalSummary redFlags symptomCategory recommendedSpecialty extractedSymptoms extractedComorbidities onsetType aiSeverity aiAnalysis analyzeOutput')
          .sort({ queuePosition: 1 });

        const onlyWaiting = waiting.filter((row) => row.status === 'WAITING');
        const avgWait = onlyWaiting.length
          ? Math.round(onlyWaiting.reduce((sum, row) => sum + Number(row.estimatedWaitMinutes || 0), 0) / onlyWaiting.length)
          : 0;

        queueData = {
          queue: waiting.map((row) => {
            const rawOutput = row.triageRecordId?.analyzeOutput && typeof row.triageRecordId.analyzeOutput === 'object'
              ? row.triageRecordId.analyzeOutput
              : null;

            const fallbackAi = {
              ...(row.triageRecordId?.aiAnalysis || {}),
              chief_complaint: row.triageRecordId?.chiefComplaint || row.triageRecordId?.aiAnalysis?.chief_complaint || 'General consultation',
              extracted_symptoms: (() => {
                const direct = Array.isArray(row.triageRecordId?.extractedSymptoms)
                  ? row.triageRecordId.extractedSymptoms
                  : (Array.isArray(row.triageRecordId?.aiAnalysis?.extracted_symptoms) ? row.triageRecordId.aiAnalysis.extracted_symptoms : []);

                if (direct.length) return direct;

                const fallback = [
                  row.triageRecordId?.symptomCategory,
                  row.triageRecordId?.chiefComplaint
                ].filter((entry) => typeof entry === 'string' && entry.trim().length);

                return fallback;
              })(),
              detected_red_flags: Array.isArray(row.triageRecordId?.redFlags)
                ? row.triageRecordId.redFlags
                : (Array.isArray(row.triageRecordId?.aiAnalysis?.detected_red_flags) ? row.triageRecordId.aiAnalysis.detected_red_flags : []),
              severity: row.triageRecordId?.aiSeverity || row.priorityLevel,
              symptom_category: row.triageRecordId?.symptomCategory || row.triageRecordId?.aiAnalysis?.symptom_category || null,
              onset_type: row.triageRecordId?.onsetType || row.triageRecordId?.aiAnalysis?.onset_type || null,
              department: row.departmentName || row.triageRecordId?.recommendedSpecialty || row.triageRecordId?.aiAnalysis?.department || null,
              extracted_comorbidities: Array.isArray(row.triageRecordId?.extractedComorbidities)
                ? row.triageRecordId.extractedComorbidities
                : (Array.isArray(row.triageRecordId?.aiAnalysis?.extracted_comorbidities) ? row.triageRecordId.aiAnalysis.extracted_comorbidities : [])
            };

            return {
              queue_entry_id: row.id,
              patient_id: row.patientId?._id || row.patientId,
              analysis_patient_id: rawOutput?.patient_id || null,
              patient_name: row.patientId ? `${row.patientId.firstName} ${row.patientId.lastName}` : 'Patient',
              chief_complaint: rawOutput?.ai_analysis?.chief_complaint || row.triageRecordId?.chiefComplaint || 'General consultation',
              department: rawOutput?.department || row.departmentName || row.triageRecordId?.recommendedSpecialty || null,
              explainability_summary: rawOutput?.explainability_summary ?? row.triageRecordId?.triageNotes ?? null,
              historical_summary: rawOutput?.historical_summary ?? row.triageRecordId?.historicalSummary ?? null,
              priority_level: row.priorityLevel,
              urgency_level: rawOutput?.urgency_level || row.urgencyLevel,
              total_risk_score: rawOutput?.risk_score ?? row.riskScore,
              risk_score: rawOutput?.risk_score ?? row.riskScore,
              wait_minutes: row.estimatedWaitMinutes,
              estimated_wait_minutes: row.estimatedWaitMinutes,
              waited_minutes: row.waitTimeMinutes,
              queue_position: row.queuePosition,
              status: row.status,
              ai_analysis: rawOutput?.ai_analysis || fallbackAi,
              analysis_output: rawOutput
            };
          }),
          statistics: {
            waiting_count: onlyWaiting.length,
            active_consultation: waiting.some((row) => row.status === 'IN_CONSULTATION'),
            avg_wait_minutes: avgWait
          }
        };
      }
    } catch (error) {
      console.error('Error fetching queue:', error.message);
    }
    
    // Get today's completed visits
    const completedToday = await Visit.countDocuments({
      doctorId,
      visitDate: { $gte: new Date(today) }
    });
    
    const todayAppointmentsPayload = appointments
      .map((app) => ({
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
      .filter((app) => matchesSearch(app.patient?.name, app.chiefComplaint, app.status, app.time, app.type));

    const upcomingAppointmentsPayload = upcomingAppointments
      .map((app) => ({
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
      .filter((app) => matchesSearch(app.patient?.name, app.chiefComplaint, app.status, app.time, app.date, app.type));

    const filteredQueue = (queueData.queue || []).filter((row) => matchesSearch(
      row.patient_name,
      row.chief_complaint,
      row.department,
      row.urgency_level,
      row.priority_level,
      row.status
    ));

    const waitingCount = filteredQueue.filter((row) => row.status === 'WAITING').length;
    const hasActiveConsultation = filteredQueue.some((row) => row.status === 'IN_CONSULTATION');
    const avgWaitMinutes = waitingCount
      ? Math.round(filteredQueue
        .filter((row) => row.status === 'WAITING')
        .reduce((sum, row) => sum + Number(row.estimated_wait_minutes || 0), 0) / waitingCount)
      : 0;

    res.json({
      doctor: {
        id: doctor.id,
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        departmentId: doctor.departmentId?._id || doctor.departmentId || null,
        specialty: doctor.specialty,
        department: doctor.departmentId?.name || 'General',
        consultationDuration: doctor.consultationDuration
      },
      todayDate: today,
      
      todaySchedule: {
        totalAppointments: todayAppointmentsPayload.length,
        appointments: todayAppointmentsPayload
      },

      upcomingAppointments: {
        total: upcomingAppointmentsPayload.length,
        appointments: upcomingAppointmentsPayload
      },
      
      currentQueue: {
        waiting_count: waitingCount,
        active_consultation: hasActiveConsultation,
        avg_wait_minutes: avgWaitMinutes,
        patients: filteredQueue
      },
      
      statistics: {
        completedToday,
        patientsWaiting: waitingCount,
        avgWaitTime: avgWaitMinutes
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
    
    // Get patient core profile
    const patient = await Patient.findById(patientId);
    
    // Get additional data separately
    const vitalSigns = await VitalSignRecord.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    const triageRecords = await TriageRecord.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(1);

    const recentVisits = await Visit.find({ patientId })
      .sort({ visitDate: -1, createdAt: -1 })
      .limit(5)
      .populate('doctorId', 'firstName lastName');
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const age = Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000);
    const lastVisit = recentVisits?.[0];
    const latestTriage = triageRecords[0];
    const latestVitals = vitalSigns[0];

    if (latestTriage) {
      const chronicFromProfile = (patient.chronicConditions || [])
        .map((item) => item?.condition || item?.name || '')
        .filter((entry) => typeof entry === 'string' && entry.trim().length)
        .map((entry) => entry.trim());

      const extractedSymptoms = Array.isArray(latestTriage.extractedSymptoms) && latestTriage.extractedSymptoms.length
        ? latestTriage.extractedSymptoms
        : [latestTriage.symptomCategory, latestTriage.chiefComplaint]
          .filter((entry) => typeof entry === 'string' && entry.trim().length)
          .map((entry) => entry.trim());

      const extractedComorbidities = Array.isArray(latestTriage.extractedComorbidities) && latestTriage.extractedComorbidities.length
        ? latestTriage.extractedComorbidities
        : chronicFromProfile;

      const historicalSummary = latestTriage.historicalSummary
        || (extractedComorbidities.length ? `Known comorbidities: ${extractedComorbidities.join(', ')}` : null);

      const aiAnalysis = {
        ...(latestTriage.aiAnalysis || {}),
        chief_complaint: latestTriage.chiefComplaint || latestTriage.aiAnalysis?.chief_complaint || null,
        extracted_symptoms: extractedSymptoms,
        detected_red_flags: Array.isArray(latestTriage.redFlags) ? latestTriage.redFlags : [],
        severity: latestTriage.aiSeverity || latestTriage.priorityLevel || null,
        symptom_category: latestTriage.symptomCategory || latestTriage.aiAnalysis?.symptom_category || null,
        onset_type: latestTriage.onsetType || latestTriage.aiAnalysis?.onset_type || null,
        department: latestTriage.recommendedSpecialty || latestTriage.aiAnalysis?.department || null,
        extracted_comorbidities: extractedComorbidities
      };

      const analyzeOutput = latestTriage.analyzeOutput && typeof latestTriage.analyzeOutput === 'object'
        ? latestTriage.analyzeOutput
        : null;

      const needsBackfill =
        !Array.isArray(latestTriage.extractedSymptoms) || !latestTriage.extractedSymptoms.length
        || !Array.isArray(latestTriage.extractedComorbidities) || !latestTriage.extractedComorbidities.length
        || !latestTriage.historicalSummary
        || !latestTriage.aiAnalysis
        || !latestTriage.analyzeOutput;

      if (needsBackfill) {
        const patch = {
          extractedSymptoms,
          extractedComorbidities,
          historicalSummary,
          aiAnalysis,
          analyzeOutput: analyzeOutput || {
            patient_id: String(patient._id || patient.id || ''),
            risk_score: latestTriage.totalRiskScore ?? null,
            urgency_level: latestTriage.priorityLevel ?? null,
            department: latestTriage.recommendedSpecialty ?? null,
            explainability_summary: latestTriage.triageNotes ?? null,
            historical_summary: historicalSummary ?? null,
            ai_analysis: latestTriage.aiAnalysis || aiAnalysis
          }
        };

        await TriageRecord.updateOne({ _id: latestTriage._id }, { $set: patch });
        Object.assign(latestTriage, patch);
      }
    }
    
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
        triageNotes: latestTriage.triageNotes,
        explainabilitySummary: latestTriage.triageNotes || null,
        historicalSummary: latestTriage.historicalSummary || null,
        aiAnalysis: latestTriage.analyzeOutput?.ai_analysis || {
          ...(latestTriage.aiAnalysis || {}),
          chief_complaint: latestTriage.chiefComplaint || latestTriage.aiAnalysis?.chief_complaint || null,
          extracted_symptoms: Array.isArray(latestTriage.extractedSymptoms)
            ? latestTriage.extractedSymptoms
            : (Array.isArray(latestTriage.aiAnalysis?.extracted_symptoms) ? latestTriage.aiAnalysis.extracted_symptoms : []),
          detected_red_flags: Array.isArray(latestTriage.redFlags)
            ? latestTriage.redFlags
            : (Array.isArray(latestTriage.aiAnalysis?.detected_red_flags) ? latestTriage.aiAnalysis.detected_red_flags : []),
          severity: latestTriage.aiSeverity || latestTriage.priorityLevel || null,
          symptom_category: latestTriage.symptomCategory || latestTriage.aiAnalysis?.symptom_category || null,
          onset_type: latestTriage.onsetType || latestTriage.aiAnalysis?.onset_type || null,
          department: latestTriage.recommendedSpecialty || latestTriage.aiAnalysis?.department || null,
          extracted_comorbidities: Array.isArray(latestTriage.extractedComorbidities)
            ? latestTriage.extractedComorbidities
            : (Array.isArray(latestTriage.aiAnalysis?.extracted_comorbidities) ? latestTriage.aiAnalysis.extracted_comorbidities : [])
        },
        analysisOutput: latestTriage.analyzeOutput || null
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
      recentVisits: (recentVisits || []).map(visit => ({
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
    const { doctorId } = req.params;
    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only call next for your own queue' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const queueEntry = await callNextFromDepartmentQueue(doctor.departmentId, {
      doctorId: doctor.id,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`
    });
    if (!queueEntry) {
      return res.json({ message: 'No patients waiting in queue' });
    }

    const patient = await Patient.findById(queueEntry.patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found in database' });
    }
    
    res.json({
      message: `Call ${patient.firstName} ${patient.lastName} to examination room`,
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        age: Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000),
        chiefComplaint: 'Please review latest triage notes',
        priority: queueEntry.priorityLevel
      }
    });
    
  } catch (error) {
    console.error('Error calling next patient:', error);
    res.status(500).json({ error: 'Failed to call next patient' });
  }
});

router.post('/:doctorId/end-consultation', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only end consultation for your own queue' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const completedEntry = await endActiveConsultation(doctor.departmentId);
    if (!completedEntry) {
      return res.json({ message: 'No active consultation to end' });
    }

    const patient = await Patient.findById(completedEntry.patientId);
    return res.json({
      message: `Consultation completed for ${patient ? `${patient.firstName} ${patient.lastName}` : 'patient'}`,
      queueEntryId: completedEntry.id,
      patientId: completedEntry.patientId,
      status: completedEntry.status
    });
  } catch (error) {
    console.error('Error ending consultation:', error);
    return res.status(500).json({ error: 'Failed to end consultation' });
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
// DOCTOR PATIENT HISTORY (visited/treated patients)
// ═══════════════════════════════════════════════════════════════

router.get('/:doctorId/patients/history', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 500));

    if (!ensureDoctorAccess(req, doctorId)) {
      return res.status(403).json({ error: 'You can only access your own patient history' });
    }

    const [visits, appointments, queueHistory] = await Promise.all([
      Visit.find({ doctorId })
        .populate('patientId', 'firstName lastName phone dateOfBirth gender bloodType')
        .sort({ visitDate: -1, createdAt: -1 })
        .limit(limit),
      Appointment.find({
        doctorId,
        status: { $in: ['checked-in', 'in-progress', 'completed'] }
      })
        .populate('patientId', 'firstName lastName phone dateOfBirth gender bloodType')
        .sort({ checkOutTime: -1, checkInTime: -1, scheduledDate: -1, createdAt: -1 })
        .limit(limit),
      Queue.find({
        calledByDoctorId: doctorId,
        status: { $in: ['IN_CONSULTATION', 'COMPLETED'] }
      })
        .populate('patientId', 'firstName lastName phone dateOfBirth gender bloodType')
        .populate('triageRecordId', 'chiefComplaint')
        .sort({ completedAt: -1, calledAt: -1, createdAt: -1 })
        .limit(limit)
    ]);

    const normalizeName = (patient) => {
      if (!patient) return 'Patient';
      const first = String(patient.firstName || '').trim();
      const last = String(patient.lastName || '').trim();
      const full = `${first} ${last}`.trim();
      return full || 'Patient';
    };

    const computeAge = (dob) => {
      if (!dob) return null;
      const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
      return Number.isFinite(age) ? age : null;
    };

    const combinedVisits = [];

    for (const visit of visits) {
      const patient = visit.patientId;
      combinedVisits.push({
        id: `visit:${String(visit._id)}`,
        source: 'visit',
        patientId: patient?._id ? String(patient._id) : String(visit.patientId || ''),
        patientName: normalizeName(patient),
        patient,
        visitDate: visit.visitDate || visit.createdAt,
        chiefComplaint: visit.chiefComplaint || null,
        diagnosis: visit.diagnosis || null,
        treatment: visit.treatment || null,
        doctorNotes: visit.doctorNotes || null,
        followUpNeeded: Boolean(visit.followUpNeeded),
        followUpDate: visit.followUpDate || null,
        status: visit.status || null
      });
    }

    for (const appointment of appointments) {
      const patient = appointment.patientId;
      combinedVisits.push({
        id: `appointment:${String(appointment._id)}`,
        source: 'appointment',
        patientId: patient?._id ? String(patient._id) : String(appointment.patientId || ''),
        patientName: normalizeName(patient),
        patient,
        visitDate: appointment.checkOutTime || appointment.checkInTime || appointment.scheduledDate || appointment.createdAt,
        chiefComplaint: appointment.chiefComplaint || null,
        diagnosis: appointment.status === 'completed' ? 'Completed appointment' : 'Ongoing appointment',
        treatment: appointment.appointmentType || null,
        doctorNotes: appointment.patientNotes || null,
        followUpNeeded: false,
        followUpDate: null,
        status: appointment.status || null
      });
    }

    for (const queue of queueHistory) {
      const patient = queue.patientId;
      combinedVisits.push({
        id: `queue:${String(queue._id)}`,
        source: 'queue',
        patientId: patient?._id ? String(patient._id) : String(queue.patientId || ''),
        patientName: normalizeName(patient),
        patient,
        visitDate: queue.completedAt || queue.calledAt || queue.startedAt || queue.createdAt,
        chiefComplaint: queue.triageRecordId?.chiefComplaint || null,
        diagnosis: queue.status === 'COMPLETED' ? 'Consultation completed' : 'In consultation',
        treatment: queue.departmentName || null,
        doctorNotes: null,
        followUpNeeded: false,
        followUpDate: null,
        status: queue.status || null
      });
    }

    const dedupedVisits = combinedVisits
      .filter((item) => item.patientId)
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      .slice(0, limit);

    const treatedByPatient = new Map();
    for (const item of dedupedVisits) {
      const existing = treatedByPatient.get(item.patientId);
      if (!existing) {
        treatedByPatient.set(item.patientId, {
          patientId: item.patientId,
          name: item.patientName,
          phone: item.patient?.phone || null,
          gender: item.patient?.gender || null,
          bloodType: item.patient?.bloodType || null,
          age: computeAge(item.patient?.dateOfBirth),
          visitsCount: 1,
          lastVisitDate: item.visitDate,
          lastDiagnosis: item.diagnosis || null,
          lastChiefComplaint: item.chiefComplaint || null
        });
      } else {
        existing.visitsCount += 1;
      }
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const treatedToday = dedupedVisits.filter((item) => new Date(item.visitDate) >= startOfToday).length;

    return res.json({
      doctorId,
      totals: {
        totalVisits: dedupedVisits.length,
        totalPatientsTreated: treatedByPatient.size,
        treatedToday
      },
      treatedPatients: Array.from(treatedByPatient.values())
        .sort((a, b) => new Date(b.lastVisitDate).getTime() - new Date(a.lastVisitDate).getTime()),
      visits: dedupedVisits.map((item) => ({
        id: item.id,
        source: item.source,
        patientId: item.patientId,
        patientName: item.patientName,
        visitDate: item.visitDate,
        chiefComplaint: item.chiefComplaint || null,
        diagnosis: item.diagnosis || null,
        treatment: item.treatment || null,
        doctorNotes: item.doctorNotes || null,
        followUpNeeded: Boolean(item.followUpNeeded),
        followUpDate: item.followUpDate || null,
        status: item.status || null
      }))
    });
  } catch (error) {
    console.error('Error fetching doctor patient history:', error);
    return res.status(500).json({ error: 'Failed to fetch patient history' });
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
