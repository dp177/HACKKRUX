const { Queue, Doctor } = require('../models');
const { getSocketServer } = require('../utils/socketServer');
const { rescoreBatch } = require('./triageService');

const DEFAULT_AVG_CONSULT_MINUTES = Number(process.env.AVG_CONSULTATION_MINUTES || 5);

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function normalizeUrgency(raw) {
  const value = String(raw || '').toUpperCase();
  if (['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'ROUTINE'].includes(value)) return value;
  if (value === 'MEDIUM') return 'MODERATE';
  return 'ROUTINE';
}

function mapUrgencyToPriorityScore(urgency, riskScore) {
  const score = Number(riskScore || 0);
  const normalizedUrgency = normalizeUrgency(urgency);
  const bonus = normalizedUrgency === 'CRITICAL'
    ? 10
    : normalizedUrgency === 'HIGH'
      ? 6
      : normalizedUrgency === 'MODERATE'
        ? 3
        : 0;

  return Math.max(0, score + bonus);
}

async function getAvgConsultationMinutesForDepartment(departmentId) {
  if (!departmentId) return DEFAULT_AVG_CONSULT_MINUTES;

  const doctors = await Doctor.find({ departmentId, isActive: true }).select('consultationDuration');
  const durations = doctors
    .map((d) => Number(d.consultationDuration || 0))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (!durations.length) return DEFAULT_AVG_CONSULT_MINUTES;
  const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return toPositiveInt(avg, DEFAULT_AVG_CONSULT_MINUTES);
}

function queuePayload(entry, avgConsultationMinutes) {
  const position = Number(entry.queuePosition || 1);
  const patientsAhead = Math.max(0, position - 1);
  const estimatedWaitMinutes = patientsAhead * avgConsultationMinutes;

  return {
    patientId: String(entry.patientId),
    queueEntryId: String(entry._id),
    tokenNumber: position,
    position,
    patientsAhead,
    estimatedWaitMinutes,
    priorityLevel: entry.priorityLevel,
    riskScore: Number(entry.riskScore || 0),
    status: entry.status,
    departmentId: entry.departmentId ? String(entry.departmentId) : null,
    hospitalId: entry.hospitalId ? String(entry.hospitalId) : null
  };
}

async function emitQueueUpdate(entry, avgConsultationMinutes) {
  const io = getSocketServer();
  if (!io) return;

  const payload = queuePayload(entry, avgConsultationMinutes);
  io.to(`patient:${String(entry.patientId)}`).emit('queue:update', payload);
}

async function emitDepartmentQueueSnapshot(departmentId) {
  const io = getSocketServer();
  if (!io || !departmentId) return;

  const entries = await Queue.find({ departmentId, status: 'WAITING' })
    .populate('patientId', 'firstName lastName')
    .sort({ queuePosition: 1 });

  io.to(`department:${String(departmentId)}`).emit('queue:department:update', {
    departmentId: String(departmentId),
    waitingCount: entries.length,
    patients: entries.map((entry) => ({
      queueEntryId: String(entry._id),
      patientId: String(entry.patientId?._id || entry.patientId),
      patientName: entry.patientId ? `${entry.patientId.firstName} ${entry.patientId.lastName}` : 'Patient',
      position: entry.queuePosition,
      priorityLevel: entry.priorityLevel,
      riskScore: entry.riskScore,
      joinedAt: entry.joinedAt,
      estimatedWaitMinutes: entry.estimatedWaitMinutes
    }))
  });
}

async function recalculateDepartmentQueue(departmentId) {
  if (!departmentId) return [];

  const avgConsultationMinutes = await getAvgConsultationMinutesForDepartment(departmentId);

  const waiting = await Queue.find({ departmentId, status: 'WAITING' }).sort({ priorityScore: -1, joinedAt: 1, createdAt: 1 });

  for (let i = 0; i < waiting.length; i += 1) {
    const entry = waiting[i];
    const nextPosition = i + 1;
    const nextEstimated = i * avgConsultationMinutes;

    if (entry.queuePosition !== nextPosition || entry.estimatedWaitMinutes !== nextEstimated) {
      entry.queuePosition = nextPosition;
      entry.estimatedWaitMinutes = nextEstimated;
      await entry.save();
    }

    await emitQueueUpdate(entry, avgConsultationMinutes);
  }

  await emitDepartmentQueueSnapshot(departmentId);
  return waiting;
}

async function enqueuePatientToDepartmentQueue({ patientId, triageRecordId, departmentId, hospitalId, riskScore, urgencyLevel }) {
  if (!patientId || !departmentId) {
    throw new Error('patientId and departmentId are required for queue entry');
  }

  const resolvedRisk = Number(riskScore || 0);
  const resolvedUrgency = normalizeUrgency(urgencyLevel);
  const priorityScore = mapUrgencyToPriorityScore(resolvedUrgency, resolvedRisk);

  await Queue.findOneAndUpdate(
    { patientId, departmentId, status: 'WAITING' },
    {
      patientId,
      triageRecordId: triageRecordId || null,
      departmentId,
      hospitalId: hospitalId || null,
      riskScore: resolvedRisk,
      urgencyLevel: resolvedUrgency,
      priorityScore,
      priorityLevel: resolvedUrgency,
      status: 'WAITING',
      joinedAt: new Date(),
      calledAt: null,
      startedAt: null,
      completedAt: null
    },
    { upsert: true, new: true }
  );

  const waiting = await recalculateDepartmentQueue(departmentId);
  return waiting.find((item) => String(item.patientId) === String(patientId)) || null;
}

async function getPatientQueueStatus(patientId) {
  const entry = await Queue.findOne({ patientId, status: 'WAITING' }).sort({ updatedAt: -1 });
  if (!entry) return null;

  const avgConsultationMinutes = await getAvgConsultationMinutesForDepartment(entry.departmentId);
  return queuePayload(entry, avgConsultationMinutes);
}

async function getDepartmentQueueForDoctorDepartment(departmentId) {
  if (!departmentId) return [];
  return Queue.find({ departmentId, status: 'WAITING' })
    .populate('patientId', 'firstName lastName dateOfBirth phone')
    .populate('triageRecordId', 'chiefComplaint triageNotes totalRiskScore priorityLevel')
    .sort({ queuePosition: 1 });
}

async function callNextFromDepartmentQueue(departmentId) {
  if (!departmentId) return null;

  const nextEntry = await Queue.findOne({ departmentId, status: 'WAITING' }).sort({ queuePosition: 1 });
  if (!nextEntry) return null;

  nextEntry.status = 'IN_CONSULTATION';
  nextEntry.calledAt = new Date();
  nextEntry.startedAt = new Date();
  await nextEntry.save();

  await recalculateDepartmentQueue(departmentId);
  return nextEntry;
}

async function runRescoreForAllDepartments() {
  const waitingRows = await Queue.find({ status: 'WAITING' }).select('_id patientId departmentId riskScore urgencyLevel joinedAt');
  if (!waitingRows.length) {
    return { scanned: 0, updated: 0, departments: 0 };
  }

  const byDepartment = new Map();
  for (const row of waitingRows) {
    const key = String(row.departmentId || 'none');
    if (!byDepartment.has(key)) byDepartment.set(key, []);
    byDepartment.get(key).push(row);
  }

  let updated = 0;

  for (const [deptKey, rows] of byDepartment.entries()) {
    if (deptKey === 'none') continue;

    const patientsPayload = rows.map((row) => ({
      patient_id: String(row.patientId),
      risk_score: Number(row.riskScore || 0),
      urgency_level: normalizeUrgency(row.urgencyLevel),
      wait_time_minutes: Math.max(0, Math.floor((Date.now() - new Date(row.joinedAt).getTime()) / 60000))
    }));

    const ai = await rescoreBatch(patientsPayload);
    const results = Array.isArray(ai?.results) ? ai.results : [];

    const byPatientId = new Map(results.map((r) => [String(r.patient_id || ''), r]));

    for (const row of rows) {
      const next = byPatientId.get(String(row.patientId));
      if (!next) continue;

      const nextScore = Number(next.risk_score);
      if (!Number.isFinite(nextScore)) continue;

      const nextUrgency = normalizeUrgency(next.urgency_level);
      const nextPriority = mapUrgencyToPriorityScore(nextUrgency, nextScore);

      await Queue.findByIdAndUpdate(row._id, {
        riskScore: nextScore,
        urgencyLevel: nextUrgency,
        priorityLevel: nextUrgency,
        priorityScore: nextPriority
      });
      updated += 1;
    }

    await recalculateDepartmentQueue(rows[0].departmentId);
  }

  return { scanned: waitingRows.length, updated, departments: byDepartment.size };
}

module.exports = {
  DEFAULT_AVG_CONSULT_MINUTES,
  enqueuePatientToDepartmentQueue,
  recalculateDepartmentQueue,
  getPatientQueueStatus,
  getDepartmentQueueForDoctorDepartment,
  callNextFromDepartmentQueue,
  runRescoreForAllDepartments,
  mapUrgencyToPriorityScore,
  normalizeUrgency
};