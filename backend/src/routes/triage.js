/**
 * TRIAGE INTEGRATION ROUTES
 * Connects Node.js backend to Python triage engine
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const speech = require('@google-cloud/speech');
const multer = require('multer');
const { TriageRecord, Patient, Doctor, Department, Queue } = require('../models');
const { authenticateAny, authenticateDoctor, authenticatePatient } = require('../middleware/auth');
const { getNextQuestions, analyzeTriage, rescoreBatch, TRIAGE_AI_URL } = require('../services/triageService');
const {
  enqueuePatientToDepartmentQueue,
  getPatientQueueStatus,
  runRescoreForAllDepartments,
  recalculateDepartmentQueue
} = require('../services/queueService');

const TRIAGE_ENGINE_URL = process.env.TRIAGE_ENGINE_URL || TRIAGE_AI_URL;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function createSpeechClient() {
  try {
    const keyFilename = normalizeOptionalString(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const inlineCredentialsRaw = normalizeOptionalString(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

    if (inlineCredentialsRaw) {
      const parsed = JSON.parse(inlineCredentialsRaw);
      const projectId = normalizeOptionalString(process.env.GOOGLE_CLOUD_PROJECT) || normalizeOptionalString(parsed?.project_id);

      console.log('[TriageTranscribe] speech_client_init', {
        mode: 'inline-json',
        hasProjectId: Boolean(projectId)
      });

      return new speech.SpeechClient({
        credentials: parsed,
        ...(projectId ? { projectId } : {})
      });
    }

    if (keyFilename) {
      console.log('[TriageTranscribe] speech_client_init', {
        mode: 'key-file',
        hasKeyFilePath: true
      });

      return new speech.SpeechClient({ keyFilename });
    }

    console.log('[TriageTranscribe] speech_client_init', {
      mode: 'application-default',
      hasGoogleApplicationCredentials: false
    });

    return new speech.SpeechClient();
  } catch (error) {
    console.error('[TriageTranscribe] speech_client_init_failed', {
      message: error?.message || 'unknown error'
    });
    return null;
  }
}

const speechClient = createSpeechClient();

function parseMaybeJson(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function buildTraceId(prefix = 'triage') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== null && item !== undefined && item !== '')
  );
}

function normalizeConversationHistory(value) {
  const parsed = parseMaybeJson(value, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (typeof entry === 'string') {
        const content = normalizeOptionalString(entry);
        return content ? { role: 'user', content } : null;
      }

      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const content = normalizeOptionalString(
        entry.content
        || entry.text
        || entry.message
        || entry.transcript
      );
      if (!content) return null;

      const roleCandidate = normalizeOptionalString(entry.role || entry.speaker)?.toLowerCase();
      const role = ['assistant', 'user', 'system'].includes(roleCandidate) ? roleCandidate : 'user';
      return { role, content };
    })
    .filter(Boolean);
}

function normalizeAvailableDepartments(value) {
  const parsed = parseMaybeJson(value, []);
  if (!Array.isArray(parsed)) return [];

  return Array.from(new Set(parsed
    .map((item) => {
      if (typeof item === 'string') return normalizeOptionalString(item);
      if (!item || typeof item !== 'object') return null;
      return normalizeOptionalString(item.name || item.department || item.label || item.value || item.id || item._id);
    })
    .filter(Boolean)));
}

function normalizeVitalsForAi(value) {
  const vitals = parseMaybeJson(value, {});
  if (!vitals || typeof vitals !== 'object') return {};

  return compactObject({
    heart_rate: toFiniteNumber(vitals.heart_rate ?? vitals.heartRate ?? vitals.hr),
    blood_pressure: normalizeOptionalString(vitals.blood_pressure ?? vitals.bloodPressure ?? vitals.bp),
    temperature: toFiniteNumber(vitals.temperature ?? vitals.temp),
    o2_sat: toFiniteNumber(vitals.o2_sat ?? vitals.oxygen_saturation ?? vitals.oxygenSaturation ?? vitals.o2),
    respiratory_rate: toFiniteNumber(vitals.respiratory_rate ?? vitals.respiratoryRate ?? vitals.rr),
    pain_level: toFiniteNumber(vitals.pain_level ?? vitals.painLevel ?? vitals.pain)
  });
}

function normalizeVitalsForRecord(value) {
  const vitals = parseMaybeJson(value, {});
  if (!vitals || typeof vitals !== 'object') return {};

  return compactObject({
    hr: toFiniteNumber(vitals.hr ?? vitals.heart_rate ?? vitals.heartRate),
    bp: normalizeOptionalString(vitals.bp ?? vitals.blood_pressure ?? vitals.bloodPressure),
    temp: toFiniteNumber(vitals.temp ?? vitals.temperature),
    o2: toFiniteNumber(vitals.o2 ?? vitals.o2_sat ?? vitals.oxygen_saturation ?? vitals.oxygenSaturation),
    rr: toFiniteNumber(vitals.rr ?? vitals.respiratory_rate ?? vitals.respiratoryRate),
    pain: toFiniteNumber(vitals.pain ?? vitals.pain_level ?? vitals.painLevel)
  });
}

function normalizeInputMode(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized === 'voice' || normalized === 'text' ? normalized : null;
}

function inferChiefComplaint(providedValue, context, conversationHistory) {
  const direct = normalizeOptionalString(providedValue || context?.chiefComplaint || context?.chief_complaint);
  if (direct) return direct;

  const firstUserMessage = (Array.isArray(conversationHistory) ? conversationHistory : []).find(
    (entry) => entry?.role === 'user' && normalizeOptionalString(entry?.content)
  );

  return normalizeOptionalString(firstUserMessage?.content);
}

function resolveSpeechEncoding(file = {}) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();

  if (mime.includes('wav') || name.endsWith('.wav')) return 'LINEAR16';
  if (mime.includes('webm') || name.endsWith('.webm')) return 'WEBM_OPUS';
  if (mime.includes('ogg') || name.endsWith('.ogg') || name.endsWith('.opus')) return 'OGG_OPUS';
  if (mime.includes('3gpp') || mime.includes('amr') || name.endsWith('.3gp') || name.endsWith('.amr')) return 'AMR';
  if (mime.includes('mp3') || name.endsWith('.mp3')) return 'MP3';
  // Google STT v1 does not accept an MP4 enum value here.
  // For Expo .m4a/.mp4 uploads, omit encoding so backend does not send an invalid config.
  if (mime.includes('mp4') || mime.includes('m4a') || name.endsWith('.m4a') || name.endsWith('.mp4')) return null;

  return null;
}

function resolveSpeechSampleRate(file = {}, encoding = null) {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();

  if (encoding === 'AMR') return 8000;
  if (encoding === 'AMR_WB') return 16000;
  if (encoding === 'OGG_OPUS' || encoding === 'WEBM_OPUS') return 48000;
  if (encoding === 'LINEAR16' && (mime.includes('wav') || name.endsWith('.wav'))) return 16000;
  return null;
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

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  const out = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim());
      continue;
    }

    if (item && typeof item === 'object') {
      const candidate = item.name || item.condition || item.symptom || item.title || item.label || item.value;
      if (typeof candidate === 'string' && candidate.trim()) {
        out.push(candidate.trim());
      }
    }
  }

  return Array.from(new Set(out));
}

function inferOnsetType(context, conversationHistory) {
  const aiContextOnset = context?.onset_type;
  if (typeof aiContextOnset === 'string' && aiContextOnset.trim()) {
    return aiContextOnset.trim();
  }

  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const durationAnswer = history
    .filter((msg) => msg?.role === 'user' && typeof msg?.content === 'string')
    .map((msg) => msg.content.toLowerCase())
    .find((text) => /hour|today|sudden|suddenly|just now|few min|minutes/.test(text))
    || history
      .filter((msg) => msg?.role === 'user' && typeof msg?.content === 'string')
      .map((msg) => msg.content.toLowerCase())
      .find((text) => /day|week|month|chronic|long|since/.test(text));

  if (!durationAnswer) return null;
  if (/hour|today|sudden|suddenly|just now|few min|minutes/.test(durationAnswer)) return 'sudden';
  if (/day|week|month|chronic|long|since/.test(durationAnswer)) return 'gradual';
  return null;
}

function buildFallbackHistoricalSummary(context, extractedComorbidities) {
  const parts = [];
  if (Array.isArray(extractedComorbidities) && extractedComorbidities.length) {
    parts.push(`Known comorbidities: ${extractedComorbidities.join(', ')}`);
  }

  if (context?.recent_trauma_or_surgery === true) {
    parts.push('Recent trauma or surgery reported.');
  }

  if (typeof context?.age === 'number' && context.age > 0) {
    parts.push(`Reported age: ${context.age}`);
  }

  return parts.length ? parts.join(' ') : null;
}

async function resolveDepartmentId(departmentInput) {
  if (!departmentInput) return null;

  const asId = String(departmentInput);
  try {
    const byId = await Department.findById(asId).select('_id');
    if (byId?._id) return byId._id;
  } catch {
    // Ignore cast errors and continue with name-based lookup.
  }

  const byName = await Department.findOne({ name: new RegExp(`^${asId}$`, 'i') }).select('_id');
  return byName?._id || null;
}

// New AI chat endpoint for mobile conversation flow.
router.post('/chat-next', authenticateAny, async (req, res) => {
  const traceId = req.headers['x-trace-id'] || buildTraceId('chatnext');
  try {
    const conversationHistory = normalizeConversationHistory(req.body?.conversation_history || req.body?.conversationHistory);
    console.log('[TriageChatNext] start', {
      traceId,
      role: req.role,
      resolvedUserId: req.userId || null,
      historyLength: conversationHistory.length,
      lastRole: conversationHistory.length ? conversationHistory[conversationHistory.length - 1]?.role || null : null
    });
    const result = await getNextQuestions(conversationHistory);
    console.log('[TriageChatNext] success', {
      traceId,
      questionCount: Array.isArray(result?.questions) ? result.questions.length : 0,
      nextQuestionPreview: typeof result?.questions?.[0] === 'string' ? result.questions[0].slice(0, 120) : null
    });
    return res.json(result);
  } catch (error) {
    console.error('[TriageChatNext] failed', {
      traceId,
      message: error?.response?.data || error?.message || 'unknown error'
    });
    return res.status(500).json({
      error: 'Failed to fetch next triage questions',
      details: error.response?.data || error.message
    });
  }
});

// Audio transcription endpoint for Expo Go voice mode (record + upload).
router.post('/transcribe', authenticateAny, upload.single('file'), async (req, res) => {
  const traceId = req.headers['x-trace-id'] || buildTraceId('transcribe');
  try {
    if (!speechClient) {
      return res.status(503).json({
        traceId,
        error: 'Speech transcription service is not configured on server'
      });
    }

    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'audio file is required' });
    }

    const languageCode = normalizeOptionalString(req.body?.language_code) || 'en-US';
    const encoding = resolveSpeechEncoding(req.file);
    const sampleRateHertz = resolveSpeechSampleRate(req.file, encoding);

    console.log('[TriageTranscribe] start', {
      traceId,
      role: req.role,
      resolvedUserId: req.userId || null,
      hasGoogleApplicationCredentials: Boolean(normalizeOptionalString(process.env.GOOGLE_APPLICATION_CREDENTIALS)),
      hasInlineGoogleCredentials: Boolean(normalizeOptionalString(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)),
      languageCode,
      encoding,
      sampleRateHertz,
      fileName: req.file.originalname || null,
      mimeType: req.file.mimetype || null,
      bytes: req.file.buffer.length
    });

    const request = {
      audio: {
        content: req.file.buffer.toString('base64')
      },
      config: {
        languageCode,
        model: 'latest_short',
        enableAutomaticPunctuation: true,
        ...(sampleRateHertz ? { sampleRateHertz } : {}),
        ...(encoding ? { encoding } : {})
      }
    };

    const [response] = await speechClient.recognize(request);
    const alternatives = response?.results?.flatMap((item) => item?.alternatives || []) || [];
    const best = alternatives[0] || null;
    const transcript = normalizeOptionalString(best?.transcript) || '';

    console.log('[TriageTranscribe] success', {
      traceId,
      transcriptLength: transcript.length,
      confidence: Number.isFinite(best?.confidence) ? best.confidence : null
    });

    if (!transcript) {
      return res.status(422).json({
        traceId,
        error: 'Could not detect clear speech from the uploaded audio'
      });
    }

    return res.json({
      traceId,
      transcript,
      confidence: Number.isFinite(best?.confidence) ? best.confidence : null,
      languageCode
    });
  } catch (error) {
    console.error('[TriageTranscribe] failed', {
      traceId,
      message: error?.message || 'unknown error'
    });

    return res.status(500).json({
      traceId,
      error: 'Failed to transcribe audio',
      details: error?.message || 'unknown error'
    });
  }
});

// New AI final analyze endpoint for mobile submit.
router.post('/analyze', authenticateAny, upload.single('file'), async (req, res) => {
  const traceId = req.headers['x-trace-id'] || buildTraceId('analyze');
  try {
    const startedAt = Date.now();
    const body = req.body || {};
    // req.userId is set by authenticateAny to the resolved Patient._id (handles Google OAuth → Patient mapping).
    // Fall back to body fields only as a last resort.
    const patientId = req.userId || body.patient_id || body.patientId;
    const conversationHistory = normalizeConversationHistory(body.conversation_history || body.conversationHistory);
    const context = parseMaybeJson(body.context, {});
    const aiVitals = normalizeVitalsForAi(body.vitals || body.vitalSigns);
    const recordVitals = normalizeVitalsForRecord(body.vitals || body.vitalSigns);
    const availableDepartments = normalizeAvailableDepartments(body.available_departments || body.availableDepartments);
    const inputMode = normalizeInputMode(body.input_mode || body.inputMode || context?.input_mode || context?.inputMode);
    const chiefComplaint = inferChiefComplaint(body.chief_complaint || body.chiefComplaint, context, conversationHistory) || 'General consultation';

    console.log('[TriageAnalyze] start', {
      traceId,
      role: req.role,
      resolvedUserId: req.userId,
      bodyPatientId: body.patient_id || body.patientId || null,
      hasFile: Boolean(req.file?.buffer?.length),
      historyLength: Array.isArray(conversationHistory) ? conversationHistory.length : 0,
      availableDepartmentsCount: Array.isArray(availableDepartments) ? availableDepartments.length : 0,
      inputMode
    });

    console.log('[TriageAnalyze] normalized_payload', {
      traceId,
      chiefComplaint,
      conversationHistoryLength: conversationHistory.length,
      contextKeys: Object.keys(context || {}),
      aiVitalsKeys: Object.keys(aiVitals || {}),
      recordVitalsKeys: Object.keys(recordVitals || {}),
      availableDepartmentsPreview: availableDepartments.slice(0, 5)
    });

    if (!patientId) {
      return res.status(400).json({ error: 'patient_id is required' });
    }

    const patient = await Patient.findById(patientId).select('_id firstName lastName');
    if (!patient) {
      console.log('[TriageAnalyze] patient_not_found', { traceId, patientId });
      return res.status(404).json({ error: 'Patient not found' });
    }

    const payload = {
      patient_id: patientId,
      conversation_history: conversationHistory,
      available_departments: Array.isArray(availableDepartments) ? availableDepartments : [],
      context: context || {},
      vitals: aiVitals
    };

    const ai = await analyzeTriage(payload, req.file || null);
    console.log('[TriageAnalyze] ai_success', {
      traceId,
      riskScore: ai?.risk_score ?? ai?.riskScore ?? null,
      urgency: ai?.urgency_level || ai?.urgencyLevel || null,
      department: ai?.department || ai?.recommended_department || null
    });

    const aiAnalysis = ai?.ai_analysis && typeof ai.ai_analysis === 'object' ? ai.ai_analysis : {};
    const rawAnalyzeOutput = {
      patient_id: ai?.patient_id ?? payload.patient_id ?? null,
      risk_score: ai?.risk_score ?? ai?.riskScore ?? null,
      urgency_level: ai?.urgency_level ?? ai?.urgencyLevel ?? null,
      department: ai?.department ?? ai?.recommended_department ?? aiAnalysis?.department ?? null,
      explainability_summary: ai?.explainability_summary ?? ai?.summary ?? null,
      historical_summary: ai?.historical_summary ?? null,
      ai_analysis: ai?.ai_analysis && typeof ai.ai_analysis === 'object' ? ai.ai_analysis : null
    };
    const departmentName = ai.department || ai.recommended_department || aiAnalysis.department || null;
    const requestedDepartmentId = body.department_id || body.departmentId || null;
    const departmentId = await resolveDepartmentId(requestedDepartmentId || departmentName);
    const hospitalId = body.hospital_id || body.hospitalId || null;

    console.log('[TriageAnalyze] resolution', {
      traceId,
      requestedDepartmentId,
      resolvedDepartmentId: departmentId || null,
      aiDepartment: departmentName,
      hospitalId
    });

    const riskScore = Number(ai.risk_score ?? ai.riskScore ?? 0);
    const priorityLevel = riskToPriority(ai.urgency_level || ai.urgencyLevel, riskScore);
    const chiefComplaintResolved = aiAnalysis.chief_complaint || ai.chief_complaint || chiefComplaint;
    const symptomCategoryResolved = aiAnalysis.symptom_category || ai.symptom_category || context?.symptom_category || null;
    const redFlagsResolvedRaw = normalizeStringArray(aiAnalysis.detected_red_flags || ai.red_flags);
    const extractedSymptomsRaw = normalizeStringArray(aiAnalysis.extracted_symptoms);
    const extractedComorbiditiesRaw = normalizeStringArray(aiAnalysis.extracted_comorbidities);
    const contextComorbidities = normalizeStringArray(context?.comorbidities);
    const extractedComorbidities = extractedComorbiditiesRaw.length
      ? extractedComorbiditiesRaw
      : contextComorbidities;
    const extractedSymptoms = extractedSymptomsRaw.length
      ? extractedSymptomsRaw
      : normalizeStringArray([
          symptomCategoryResolved,
          chiefComplaintResolved
        ]);
    const redFlagsResolved = redFlagsResolvedRaw.length
      ? redFlagsResolvedRaw
      : normalizeStringArray([
          context?.breathing_difficulty === 'severe' ? 'Severe breathing difficulty' : null,
          context?.recent_trauma_or_surgery ? 'Recent trauma or surgery' : null
        ]);
    const explainabilitySummary = ai.explainability_summary || ai.summary || null;
    const historicalSummary = ai.historical_summary || buildFallbackHistoricalSummary(context, extractedComorbidities);
    const onsetType = aiAnalysis.onset_type || inferOnsetType(context, conversationHistory);
    const aiSeverity = aiAnalysis.severity || priorityLevel;

    const normalizedAiAnalysis = {
      chief_complaint: chiefComplaintResolved,
      extracted_symptoms: extractedSymptoms,
      detected_red_flags: redFlagsResolved,
      severity: aiSeverity,
      symptom_category: symptomCategoryResolved,
      onset_type: onsetType,
      department: departmentName,
      extracted_comorbidities: extractedComorbidities
    };

    const triageRecord = await TriageRecord.create({
      patientId,
      departmentId: departmentId || null,
      chiefComplaint: chiefComplaintResolved,
      symptomCategory: symptomCategoryResolved,
      criticalScore: null,
      symptomScore: null,
      contextScore: null,
      vitalScore: null,
      timelineScore: null,
      totalRiskScore: riskScore,
      priorityLevel,
      estimatedWaitMinutes: Number(ai.estimated_wait_minutes ?? ai.estimatedWaitMinutes ?? 0),
      redFlags: redFlagsResolved,
      vitalSigns: recordVitals,
      recommendedSpecialty: departmentName,
      triageNotes: explainabilitySummary,
      historicalSummary,
      extractedSymptoms,
      extractedComorbidities,
      onsetType,
      aiSeverity,
      aiAnalysis: rawAnalyzeOutput.ai_analysis || normalizedAiAnalysis,
      analyzeOutput: rawAnalyzeOutput,
      inputMode,
      conversationHistory,
      queuePosition: null
    });
    console.log('[TriageAnalyze] triage_record_saved', { traceId, triageRecordId: triageRecord._id });

    let queueEntry = null;
    if (departmentId) {
      console.log('[TriageAnalyze] queue_enqueue_start', { traceId, patientId, departmentId, hospitalId });
      queueEntry = await enqueuePatientToDepartmentQueue({
        patientId,
        triageRecordId: triageRecord._id,
        departmentId,
        hospitalId,
        riskScore,
        urgencyLevel: priorityLevel
      });

      triageRecord.queuePosition = queueEntry?.queuePosition || null;
      triageRecord.estimatedWaitMinutes = queueEntry?.estimatedWaitMinutes || triageRecord.estimatedWaitMinutes;
      await triageRecord.save();
      console.log('[TriageAnalyze] queue_enqueue_done', {
        traceId,
        queueEntryId: queueEntry?._id || null,
        queuePosition: queueEntry?.queuePosition || null,
        estimatedWaitMinutes: queueEntry?.estimatedWaitMinutes || null
      });
    }

    console.log('[TriageAnalyze] completed', {
      traceId,
      triageRecordId: triageRecord._id,
      durationMs: Date.now() - startedAt
    });

    return res.json({
      traceId,
      triage: {
        id: triageRecord._id,
        risk_score: triageRecord.totalRiskScore,
        urgency_level: triageRecord.priorityLevel,
        department: triageRecord.recommendedSpecialty,
        explainability_summary: triageRecord.triageNotes,
        historical_summary: triageRecord.historicalSummary,
        red_flags: triageRecord.redFlags,
        input_mode: triageRecord.inputMode,
        ai_analysis: triageRecord.aiAnalysis,
        analyze_output: triageRecord.analyzeOutput
      },
      queue: {
        tokenNumber: queueEntry?.queuePosition || null,
        queuePosition: queueEntry?.queuePosition || null,
        patientsAhead: queueEntry?.patientsAhead ?? null,
        estimatedWaitMinutes: queueEntry?.estimatedWaitMinutes ?? triageRecord.estimatedWaitMinutes,
        hospital: queueEntry?.hospitalName || null,
        department: queueEntry?.departmentName || triageRecord.recommendedSpecialty || null,
        hospitalName: queueEntry?.hospitalName || null,
        departmentName: queueEntry?.departmentName || null,
        status: queueEntry?.status || null
      },
      aiRaw: ai
    });
  } catch (error) {
    console.error('[TriageAnalyze] failed', {
      traceId,
      message: error?.message || 'unknown error',
      stack: error?.stack,
      responseData: error?.response?.data || null
    });
    return res.status(500).json({
      error: 'Failed to analyze triage',
      traceId,
      details: error?.response?.data || error?.message || 'unknown error'
    });
  }
});

// Manual queue rescoring endpoint (scheduler uses same AI API).
router.post('/rescore-batch', authenticateDoctor, async (req, res) => {
  try {
    const summary = await runRescoreForAllDepartments();

    return res.json({
      message: 'Rescore complete',
      aiUrl: TRIAGE_AI_URL,
      refreshedQueue: summary.queueSnapshots || [],
      ...summary
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
      inputMode: triageRecord.inputMode,
      conversationHistory: triageRecord.conversationHistory || [],
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
    const departmentId = req.doctor?.departmentId;
    if (!departmentId) {
      return res.json({ queue: [], statistics: { waiting_count: 0, avg_wait_minutes: 0 } });
    }

    const waiting = await Queue.find({ departmentId, status: 'WAITING' })
      .populate('patientId', 'firstName lastName')
      .sort({ queuePosition: 1 });

    const avgWait = waiting.length
      ? Math.round(waiting.reduce((sum, row) => sum + Number(row.estimatedWaitMinutes || 0), 0) / waiting.length)
      : 0;

    return res.json({
      queue: waiting.map((row) => ({
        queue_entry_id: row.id,
        patient_id: row.patientId?._id || row.patientId,
        patient_name: row.patientId ? `${row.patientId.firstName} ${row.patientId.lastName}` : 'Patient',
        queue_position: row.queuePosition,
        wait_minutes: row.estimatedWaitMinutes,
        risk_score: row.riskScore,
        priority_level: row.priorityLevel,
        urgency_level: row.urgencyLevel,
        joined_at: row.joinedAt,
        status: row.status
      })),
      statistics: {
        waiting_count: waiting.length,
        avg_wait_minutes: avgWait
      }
    });
    
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
    const departmentId = await resolveDepartmentId(department);
    if (!departmentId) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await recalculateDepartmentQueue(departmentId);
    const waiting = await Queue.find({ departmentId, status: 'WAITING' })
      .populate('patientId', 'firstName lastName')
      .sort({ queuePosition: 1 });

    return res.json({
      queue: waiting.map((row) => ({
        queue_entry_id: row.id,
        patient_id: row.patientId?._id || row.patientId,
        patient_name: row.patientId ? `${row.patientId.firstName} ${row.patientId.lastName}` : 'Patient',
        queue_position: row.queuePosition,
        wait_minutes: row.estimatedWaitMinutes,
        risk_score: row.riskScore,
        priority_level: row.priorityLevel,
        urgency_level: row.urgencyLevel,
        joined_at: row.joinedAt,
        status: row.status
      }))
    });
    
  } catch (error) {
    console.error('Error fetching hospital queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET PATIENT QUEUE STATUS (for patient to check their position)
// ═══════════════════════════════════════════════════════════════

router.get('/queue/patient/:patientId/status', authenticateAny, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (req.role !== 'doctor' && String(req.userId) !== String(patientId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = await getPatientQueueStatus(patientId);
    if (!status) {
      return res.status(404).json({ error: 'No active queue entry found' });
    }

    return res.json(status);
    
  } catch (error) {
    console.error('Error fetching queue status:', error);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

router.get('/queue/my-status', authenticatePatient, async (req, res) => {
  try {
    const status = await getPatientQueueStatus(req.userId);
    if (!status) {
      return res.status(404).json({ error: 'No active queue entry found' });
    }

    return res.json(status);
  } catch (error) {
    console.error('Error fetching my queue status:', error);
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

module.exports = router;
