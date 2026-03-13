/**
 * TRIAGE INTEGRATION ROUTES
 * Connects Node.js backend to Python triage engine
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const { TriageRecord, Patient, Doctor, Department } = require('../models');
const { authenticateAny, authenticateDoctor } = require('../middleware/auth');
const { getNextQuestions, analyzeTriage, rescoreBatch, TRIAGE_AI_URL } = require('../services/triageService');

const TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function parseMaybeJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function riskToPriority(urgencyLevel, riskScore) {
  const urgency = String(urgencyLevel || '').toUpperCase();
  if (urgency === 'CRITICAL') return 'CRITICAL';
  if (urgency === 'HIGH') return 'HIGH';
  if (urgency === 'MODERATE' || urgency === 'MEDIUM') return 'MODERATE';
  if (urgency === 'LOW') return 'LOW';

  const score = Number(riskScore || 0);
  if (score >= 90) return 'CRITICAL';
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MODERATE';
  if (score >= 25) return 'LOW';
  return 'ROUTINE';
}

async function resolveDepartmentId(departmentInput) {
  if (!departmentInput) return null;

  const asId = String(departmentInput);
  const byId = await Department.findById(asId).select('_id');
  if (byId?._id) return byId._id;

  const byName = await Department.findOne({ name: new RegExp(`^${asId}$`, 'i') }).select('_id');
  return byName?._id || null;
}

// New AI chat endpoint for mobile conversation flow.
router.post('/chat-next', authenticateAny, async (req, res) => {
  try {
    const conversationHistory = parseMaybeJson(req.body?.conversation_history, []);
    const result = await getNextQuestions(conversationHistory);
    return res.json(result);
  } catch (error) {
    console.error('chat-next error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to fetch next triage questions',
      details: error.response?.data || error.message
    });
  }
});

// New AI final analyze endpoint for mobile submit.
router.post('/analyze', authenticateAny, upload.single('file'), async (req, res) => {
  try {
    const body = req.body || {};
    // req.userId is set by authenticateAny to the resolved Patient._id (handles Google OAuth → Patient mapping).
    // Fall back to body fields only as a last resort.
    const patientId = req.userId || body.patient_id || body.patientId;
    const conversationHistory = parseMaybeJson(body.conversation_history, []);
    const context = parseMaybeJson(body.context, {});
    const vitals = parseMaybeJson(body.vitals, {});
    const availableDepartments = parseMaybeJson(body.available_departments, []);
    const chiefComplaint = body.chief_complaint || context?.chiefComplaint || 'General consultation';

    if (!patientId) {
      return res.status(400).json({ error: 'patient_id is required' });
    }

    const patient = await Patient.findById(patientId).select('_id firstName lastName');
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const payload = {
      patient_id: patientId,
      conversation_history: conversationHistory,
      available_departments: Array.isArray(availableDepartments) ? availableDepartments : [],
      context: context || {},
      vitals: vitals || {}
    };

    const ai = await analyzeTriage(payload, req.file || null);

    const departmentName = ai.department || ai.recommended_department || null;
    const departmentId = await resolveDepartmentId(departmentName);

    const queueCount = await TriageRecord.countDocuments({
      departmentId: departmentId || null,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      queuePosition: { $ne: null }
    });

    const riskScore = Number(ai.risk_score ?? ai.riskScore ?? 0);
    const priorityLevel = riskToPriority(ai.urgency_level || ai.urgencyLevel, riskScore);

    const triageRecord = await TriageRecord.create({
      patientId,
      departmentId: departmentId || null,
      chiefComplaint,
      symptomCategory: ai.symptom_category || null,
      criticalScore: null,
      symptomScore: null,
      contextScore: null,
      vitalScore: null,
      timelineScore: null,
      totalRiskScore: riskScore,
      priorityLevel,
      estimatedWaitMinutes: Number(ai.estimated_wait_minutes ?? ai.estimatedWaitMinutes ?? 0),
      redFlags: Array.isArray(ai.red_flags) ? ai.red_flags : [],
      vitalSigns: vitals || {},
      recommendedSpecialty: departmentName,
      triageNotes: ai.explainability_summary || ai.summary || null,
      queuePosition: queueCount + 1
    });

    return res.json({
      triage: {
        id: triageRecord._id,
        risk_score: triageRecord.totalRiskScore,
        urgency_level: triageRecord.priorityLevel,
        department: triageRecord.recommendedSpecialty,
        explainability_summary: triageRecord.triageNotes,
        red_flags: triageRecord.redFlags
      },
      queue: {
        queuePosition: triageRecord.queuePosition,
        estimatedWaitMinutes: triageRecord.estimatedWaitMinutes
      },
      aiRaw: ai
    });
  } catch (error) {
    console.error('triage analyze error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to analyze triage',
      details: error.response?.data || error.message
    });
  }
});

// Manual queue rescoring endpoint (scheduler uses same AI API).
router.post('/rescore-batch', authenticateDoctor, async (req, res) => {
  try {
    const providedPatients = parseMaybeJson(req.body?.patients, null);

    const patients = Array.isArray(providedPatients)
      ? providedPatients
      : (await TriageRecord.find({ queuePosition: { $ne: null } })
          .sort({ createdAt: 1 })
          .limit(100)
          .select('_id patientId totalRiskScore priorityLevel chiefComplaint createdAt'))
          .map((row) => ({
            triage_id: String(row._id),
            patient_id: String(row.patientId),
            risk_score: Number(row.totalRiskScore || 0),
            waiting_minutes: Math.max(0, Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 60000)),
            priority_level: row.priorityLevel,
            chief_complaint: row.chiefComplaint
          }));

    const result = await rescoreBatch(patients);
    const updates = Array.isArray(result?.results) ? result.results : [];

    let updated = 0;
    for (const row of updates) {
      const triageId = row?.triage_id || row?.triageId;
      const newScore = Number(row?.risk_score ?? row?.new_risk_score ?? row?.updated_risk_score);
      if (!triageId || Number.isNaN(newScore)) continue;

      await TriageRecord.findByIdAndUpdate(triageId, {
        totalRiskScore: newScore,
        priorityLevel: riskToPriority(row?.urgency_level, newScore)
      });
      updated += 1;
    }

    return res.json({
      message: 'Rescore complete',
      aiUrl: TRIAGE_AI_URL,
      scanned: patients.length,
      updated,
      result
    });
  } catch (error) {
    console.error('triage rescore-batch error:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to rescore queue',
      details: error.response?.data || error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// INITIATE TRIAGE SESSION
// ═══════════════════════════════════════════════════════════════

router.post('/initiate', async (req, res) => {
  try {
    const {
      patientId,
      chiefComplaint,
      mode = 'clinic', // 'clinic' or 'hospital'
      departmentId = null
    } = req.body;
    
    if (!patientId || !chiefComplaint) {
      return res.status(400).json({ error: 'Patient ID and chief complaint required' });
    }
    
    // Get patient info from database
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    // Call Python triage engine to initialize
    const triageResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/triage/init`, {
      patient_id: patientId,
      chief_complaint: chiefComplaint,
      patient_age: Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000),
      patient_gender: patient.gender,
      chronic_conditions: patient.chronicConditions || [],
      current_medications: patient.currentMedications || []
    });
    
    const { session_id, initial_questions } = triageResponse.data;
    
    res.json({
      sessionId: session_id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      chiefComplaint,
      phase: 'critical_assessment',
      questions: initial_questions
    });
    
  } catch (error) {
    console.error('Triage initiation error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to initiate triage',
      details: error.response?.data || error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// SUBMIT ASSESSMENT PHASE
// ═══════════════════════════════════════════════════════════════

router.post('/assess/:phase', async (req, res) => {
  try {
    const { phase } = req.params; // critical, symptom, context, vitals, timeline
    const { sessionId, answers } = req.body;
    
    if (!sessionId || !answers) {
      return res.status(400).json({ error: 'Session ID and answers required' });
    }
    
    // Forward to Python triage engine
    const phaseUrl = `${TRIAGE_ENGINE_URL}/api/triage/${phase}-assessment`;
    
    const triageResponse = await axios.post(phaseUrl, {
      session_id: sessionId,
      answers
    });
    
    const { next_phase, questions, score, completed } = triageResponse.data;
    
    res.json({
      sessionId,
      completedPhase: phase,
      score,
      nextPhase: next_phase,
      questions: questions || [],
      completed: completed || false
    });
    
  } catch (error) {
    console.error('Assessment error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to process assessment',
      details: error.response?.data || error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// COMPLETE TRIAGE & SAVE TO DATABASE
// ═══════════════════════════════════════════════════════════════

router.post('/complete', async (req, res) => {
  try {
    const {
      sessionId,
      patientId,
      mode = 'clinic', // 'clinic' or 'hospital'
      departmentId = null
    } = req.body;
    
    if (!sessionId || !patientId) {
      return res.status(400).json({ error: 'Session ID and patient ID required' });
    }
    
    // Get final triage results from Python engine
    const triageResponse = await axios.get(
      `${TRIAGE_ENGINE_URL}/api/triage/${sessionId}/results`
    );
    
    const results = triageResponse.data;
    
    // Save triage record to database
    const triageRecord = new TriageRecord({
      patientId,
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
      vitalSigns: results.vital_signs || {},
      recommendedSpecialty: results.recommended_specialty,
      triageNotes: results.summary || '',
      queuePosition: null // Will be set when added to queue
    });
    await triageRecord.save();
    
    // Add patient to queue in Python engine
    let queueResponse;
    if (mode === 'clinic') {
      queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-clinic`, {
        patient_id: patientId,
        triage_record_id: triageRecord.id,
        risk_score: triageRecord.totalRiskScore,
        chief_complaint: triageRecord.chiefComplaint
      });
    } else {
      queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-hospital`, {
        patient_id: patientId,
        triage_record_id: triageRecord.id,
        risk_score: triageRecord.totalRiskScore,
        chief_complaint: triageRecord.chiefComplaint,
        department_id: departmentId,
        recommended_specialty: triageRecord.recommendedSpecialty
      });
    }
    
    // Update queue position in database
    if (queueResponse.data.queue_position) {
      triageRecord.queuePosition = queueResponse.data.queue_position;
      await triageRecord.save();
    }
    
    // Update patient statistics
    await Patient.findByIdAndUpdate(patientId, { lastVisitDate: new Date() });
    
    res.json({
      message: 'Triage completed and patient added to queue',
      triageId: triageRecord._id,
      priorityLevel: triageRecord.priorityLevel,
      riskScore: triageRecord.totalRiskScore,
      queuePosition: triageRecord.queuePosition,
      estimatedWaitMinutes: triageRecord.estimatedWaitMinutes,
      recommendedSpecialty: triageRecord.recommendedSpecialty,
      redFlags: triageRecord.redFlags,
      summary: triageRecord.triageNotes
    });
    
  } catch (error) {
    console.error('Triage completion error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to complete triage',
      details: error.response?.data || error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// SINGLE-CALL TRIAGE (Complete in one request)
// ═══════════════════════════════════════════════════════════════

router.post('/complete-single', async (req, res) => {
  try {
    const {
      patientId,
      chiefComplaint,
      symptoms,
      symptomSeverity,
      symptomDuration,
      vitalSigns,
      mode = 'clinic',
      departmentId = null
    } = req.body;
    
    if (!patientId || !chiefComplaint) {
      return res.status(400).json({ error: 'Patient ID and chief complaint required' });
    }
    
    // Get patient info
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    const age = Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000);
    
    // Call Python's single-call triage endpoint
    const triageResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/triage/complete`, {
      patient_id: patientId,
      chief_complaint: chiefComplaint,
      symptoms: symptoms || [],
      symptom_severity: symptomSeverity || 'moderate',
      symptom_duration_hours: symptomDuration || 24,
      vital_signs: vitalSigns || {},
      patient_age: age,
      patient_gender: patient.gender,
      chronic_conditions: patient.chronicConditions || [],
      current_medications: patient.currentMedications || []
    });
    
    const results = triageResponse.data;
    
    // Save to database
    const triageRecord = new TriageRecord({
      patientId,
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
      triageNotes: results.summary || ''
    });
    await triageRecord.save();
    
    // Add to queue
    let queueResponse;
    if (mode === 'clinic') {
      queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-clinic`, {
        patient_id: patientId,
        triage_record_id: triageRecord.id,
        risk_score: triageRecord.totalRiskScore,
        chief_complaint: triageRecord.chiefComplaint
      });
    } else {
      queueResponse = await axios.post(`${TRIAGE_ENGINE_URL}/api/queue/add-hospital`, {
        patient_id: patientId,
        triage_record_id: triageRecord.id,
        risk_score: triageRecord.totalRiskScore,
        chief_complaint: triageRecord.chiefComplaint,
        department_id: departmentId,
        recommended_specialty: triageRecord.recommendedSpecialty
      });
    }
    
    if (queueResponse.data.queue_position) {
      triageRecord.queuePosition = queueResponse.data.queue_position;
      await triageRecord.save();
    }
    
    res.json({
      message: 'Triage completed successfully',
      triageId: triageRecord._id,
      priorityLevel: triageRecord.priorityLevel,
      riskScore: triageRecord.totalRiskScore,
      queuePosition: triageRecord.queuePosition,
      estimatedWaitMinutes: triageRecord.estimatedWaitMinutes,
      recommendedSpecialty: triageRecord.recommendedSpecialty,
      redFlags: triageRecord.redFlags,
      summary: results.summary
    });
    
  } catch (error) {
    console.error('Single-call triage error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to complete triage',
      details: error.response?.data || error.message 
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET TRIAGE RECORD
// ═══════════════════════════════════════════════════════════════

router.get('/:triageId', authenticateAny, async (req, res) => {
  try {
    const triageRecord = await TriageRecord.findById(req.params.triageId)
      .populate('patientId');
    
    if (!triageRecord) {
      return res.status(404).json({ error: 'Triage record not found' });
    }
    
    res.json({
      id: triageRecord._id,
      patient: {
        id: triageRecord.patientId._id,
        name: `${triageRecord.patientId.firstName} ${triageRecord.patientId.lastName}`
      },
      chiefComplaint: triageRecord.chiefComplaint,
      symptomCategory: triageRecord.symptomCategory,
      scores: {
        critical: triageRecord.criticalScore,
        symptom: triageRecord.symptomScore,
        context: triageRecord.contextScore,
        vital: triageRecord.vitalScore,
        timeline: triageRecord.timelineScore,
        total: triageRecord.totalRiskScore
      },
      priorityLevel: triageRecord.priorityLevel,
      estimatedWaitMinutes: triageRecord.estimatedWaitMinutes,
      queuePosition: triageRecord.queuePosition,
      redFlags: triageRecord.redFlags,
      vitalSigns: triageRecord.vitalSigns,
      recommendedSpecialty: triageRecord.recommendedSpecialty,
      notes: triageRecord.triageNotes,
      createdAt: triageRecord.createdAt
    });
    
  } catch (error) {
    console.error('Error fetching triage record:', error);
    res.status(500).json({ error: 'Failed to fetch triage record' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET CURRENT CLINIC QUEUE
// ═══════════════════════════════════════════════════════════════

router.get('/queue/clinic', authenticateDoctor, async (req, res) => {
  try {
    // Get queue from Python engine
    const queueResponse = await axios.get(`${TRIAGE_ENGINE_URL}/api/queue/clinic/current`);
    
    res.json(queueResponse.data);
    
  } catch (error) {
    console.error('Error fetching clinic queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET HOSPITAL DEPARTMENT QUEUE
// ═══════════════════════════════════════════════════════════════

router.get('/queue/hospital/:department', authenticateDoctor, async (req, res) => {
  try {
    const { department } = req.params;
    
    // Get queue from Python engine
    const queueResponse = await axios.get(
      `${TRIAGE_ENGINE_URL}/api/queue/hospital/current/${department}`
    );
    
    res.json(queueResponse.data);
    
  } catch (error) {
    console.error('Error fetching hospital queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET PATIENT QUEUE STATUS (for patient to check their position)
// ═══════════════════════════════════════════════════════════════

router.get('/queue/patient/:patientId/status', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Get status from Python engine
    const statusResponse = await axios.get(
      `${TRIAGE_ENGINE_URL}/api/queue/${patientId}/status`
    );
    
    res.json(statusResponse.data);
    
  } catch (error) {
    console.error('Error fetching queue status:', error);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

module.exports = router;
