const { Queue, Doctor, Department, Hospital } = require('../models');
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
  const patientsAhead = Number.isFinite(Number(entry.patientsAhead))
    ? Number(entry.patientsAhead)
    : Math.max(0, position - 1);
  const estimatedWaitMinutes = Number.isFinite(Number(entry.estimatedWaitMinutes))
    ? Number(entry.estimatedWaitMinutes)
    : patientsAhead * avgConsultationMinutes;
  const waitedFromJoinedAt = entry?.joinedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(entry.joinedAt).getTime()) / 60000))
    : 0;
  const waitTimeMinutes = Number.isFinite(Number(entry.waitTimeMinutes))
    ? Math.max(Number(entry.waitTimeMinutes), waitedFromJoinedAt)
    : waitedFromJoinedAt;

  return {
    patientId: String(entry.patientId),
    queueEntryId: String(entry._id),
    tokenNumber: position,
    position,
    patientsAhead,
    estimatedWaitMinutes,
    waitTimeMinutes,
    priorityLevel: entry.priorityLevel,
    riskScore: Number(entry.riskScore || 0),
    status: entry.status,
    hospitalName: entry.hospitalName || null,
    departmentName: entry.departmentName || null,
    departmentId: entry.departmentId ? String(entry.departmentId) : null,
    hospitalId: entry.hospitalId ? String(entry.hospitalId) : null
  };
}

async function resolveQueueNames({ departmentId, hospitalId }) {
  let resolvedDepartmentId = departmentId ? String(departmentId) : null;
  let resolvedHospitalId = hospitalId ? String(hospitalId) : null;
  let departmentName = null;
  let hospitalName = null;

  if (resolvedDepartmentId) {
    const dept = await Department.findById(resolvedDepartmentId).select('name hospitalId').lean();
    if (dept) {
      departmentName = dept.name || null;
      if (!resolvedHospitalId && dept.hospitalId) {
        resolvedHospitalId = String(dept.hospitalId);
      }
    }
  }

  if (resolvedHospitalId) {
    const hospital = await Hospital.findById(resolvedHospitalId).select('name').lean();
    hospitalName = hospital?.name || null;
  }

  return {
    departmentName,
    hospitalName,
    resolvedDepartmentId,
    resolvedHospitalId
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
      queue_position: entry.queuePosition,
      position: entry.queuePosition,
      priorityLevel: entry.priorityLevel,
      urgency_level: entry.urgencyLevel,
      riskScore: entry.riskScore,
      total_risk_score: entry.riskScore,
      joinedAt: entry.joinedAt,
      estimatedWaitMinutes: entry.estimatedWaitMinutes,
      wait_minutes: entry.estimatedWaitMinutes,
      waited_minutes: entry.waitTimeMinutes,
      department: entry.departmentName || null,
      chief_complaint: 'General consultation'
    }))
  });
}

async function recalculateDepartmentQueue(departmentId) {
  if (!departmentId) return [];

  const startedAt = Date.now();
  console.log('[queueService] recalculate_start', { departmentId: String(departmentId) });

  const avgConsultationMinutes = await getAvgConsultationMinutesForDepartment(departmentId);

  let departmentName = null;
  let hospitalName = null;
  const department = await Department.findById(departmentId).select('name hospitalId').lean();
  if (department) {
    departmentName = department.name || null;
    if (department.hospitalId) {
      const hospital = await Hospital.findById(department.hospitalId).select('name').lean();
      hospitalName = hospital?.name || null;
    }
  }

  const waiting = await Queue.find({ departmentId, status: 'WAITING' }).sort({ priorityScore: -1, joinedAt: 1, createdAt: 1 });

  for (let i = 0; i < waiting.length; i += 1) {
    const entry = waiting[i];
    const nextPosition = i + 1;
    const nextPatientsAhead = i;
    const nextEstimated = i * avgConsultationMinutes;
    const nextWaited = entry?.joinedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(entry.joinedAt).getTime()) / 60000))
      : 0;

    if (
      entry.queuePosition !== nextPosition
      || entry.patientsAhead !== nextPatientsAhead
      || entry.estimatedWaitMinutes !== nextEstimated
      || entry.waitTimeMinutes !== nextWaited
      || (departmentName && entry.departmentName !== departmentName)
      || (hospitalName && entry.hospitalName !== hospitalName)
    ) {
      entry.queuePosition = nextPosition;
      entry.patientsAhead = nextPatientsAhead;
      entry.estimatedWaitMinutes = nextEstimated;
      entry.waitTimeMinutes = nextWaited;
      if (departmentName) entry.departmentName = departmentName;
      if (hospitalName) entry.hospitalName = hospitalName;
      await entry.save();
    }

    await emitQueueUpdate(entry, avgConsultationMinutes);
  }

  await emitDepartmentQueueSnapshot(departmentId);
  console.log('[queueService] recalculate_done', {
    departmentId: String(departmentId),
    waitingCount: waiting.length,
    avgConsultationMinutes,
    durationMs: Date.now() - startedAt
  });
  return waiting;
}

async function enqueuePatientToDepartmentQueue({ patientId, triageRecordId, departmentId, hospitalId, riskScore, urgencyLevel }) {
  const startedAt = Date.now();
  console.log('[queueService] enqueue_start', {
    patientId: patientId ? String(patientId) : null,
    triageRecordId: triageRecordId ? String(triageRecordId) : null,
    departmentId: departmentId ? String(departmentId) : null,
    hospitalId: hospitalId ? String(hospitalId) : null,
    riskScore: Number(riskScore || 0),
    urgencyLevel: normalizeUrgency(urgencyLevel)
  });

  if (!patientId || !departmentId) {
    throw new Error('patientId and departmentId are required for queue entry');
  }

  const resolvedRisk = Number(riskScore || 0);
  const resolvedUrgency = normalizeUrgency(urgencyLevel);
  const priorityScore = mapUrgencyToPriorityScore(resolvedUrgency, resolvedRisk);
  const nameResolution = await resolveQueueNames({ departmentId, hospitalId });
  const persistedHospitalId = nameResolution.resolvedHospitalId || (hospitalId ? String(hospitalId) : null);

  await Queue.findOneAndUpdate(
    { patientId, departmentId, status: 'WAITING' },
    {
      patientId,
      triageRecordId: triageRecordId || null,
      departmentId,
      hospitalId: persistedHospitalId || null,
      hospitalName: nameResolution.hospitalName,
      departmentName: nameResolution.departmentName,
      riskScore: resolvedRisk,
      urgencyLevel: resolvedUrgency,
      priorityScore,
      priorityLevel: resolvedUrgency,
      status: 'WAITING',
      joinedAt: new Date(),
      patientsAhead: 0,
      queuePosition: 1,
      estimatedWaitMinutes: 0,
      waitTimeMinutes: 0,
      calledAt: null,
      startedAt: null,
      completedAt: null
    },
    { upsert: true, new: true }
  );

  const waiting = await recalculateDepartmentQueue(departmentId);
  const queued = waiting.find((item) => String(item.patientId) === String(patientId)) || null;

  console.log('[queueService] enqueue_done', {
    patientId: String(patientId),
    departmentId: String(departmentId),
    queueEntryId: queued ? String(queued._id) : null,
    queuePosition: queued?.queuePosition || null,
    status: queued?.status || null,
    durationMs: Date.now() - startedAt
  });

  return queued;
}

async function getPatientQueueStatus(patientId) {
  console.log('[queueService] patient_status_start', {
    patientId: patientId ? String(patientId) : null
  });

  const entry = await Queue.findOne({ patientId, status: 'WAITING' }).sort({ updatedAt: -1 });
  if (!entry) {
    console.log('[queueService] patient_status_empty', {
      patientId: patientId ? String(patientId) : null
    });
    return null;
  }

  const avgConsultationMinutes = await getAvgConsultationMinutesForDepartment(entry.departmentId);
  const payload = queuePayload(entry, avgConsultationMinutes);
  console.log('[queueService] patient_status_done', {
    patientId: String(patientId),
    departmentId: entry.departmentId ? String(entry.departmentId) : null,
    queuePosition: payload.position,
    estimatedWaitMinutes: payload.estimatedWaitMinutes
  });
  return payload;
}

async function getDepartmentQueueForDoctorDepartment(departmentId) {
  if (!departmentId) return [];
  return Queue.find({ departmentId, status: 'WAITING' })
    .populate('patientId', 'firstName lastName dateOfBirth phone')
    .populate('triageRecordId', 'chiefComplaint triageNotes totalRiskScore priorityLevel')
    .sort({ queuePosition: 1 });
}

async function callNextFromDepartmentQueue(departmentId, options = {}) {
  if (!departmentId) return null;

  const doctorName = options?.doctorName ? String(options.doctorName) : 'Doctor';
  const doctorId = options?.doctorId ? String(options.doctorId) : null;

  const startedAt = Date.now();
  console.log('[queueService] call_next_start', { departmentId: String(departmentId) });

  const nextEntry = await Queue.findOne({ departmentId, status: 'WAITING' }).sort({ queuePosition: 1 });
  if (!nextEntry) {
    console.log('[queueService] call_next_empty', {
      departmentId: String(departmentId),
      durationMs: Date.now() - startedAt
    });
    return null;
  }

  nextEntry.status = 'IN_CONSULTATION';
  nextEntry.calledAt = new Date();
  nextEntry.startedAt = new Date();
  await nextEntry.save();

  const io = getSocketServer();
  if (io) {
    const calledPayload = {
      patientId: String(nextEntry.patientId),
      queueEntryId: String(nextEntry._id),
      status: nextEntry.status,
      calledAt: nextEntry.calledAt,
      doctorId,
      doctorName,
      notificationType: 'PATIENT_CALLED',
      message: `${doctorName} has called you. Please reach consultation now.`
    };

    io.to(`patient:${String(nextEntry.patientId)}`).emit('queue:update', calledPayload);
    io.to(`patient:${String(nextEntry.patientId)}`).emit('patient:called', calledPayload);
  }

  await recalculateDepartmentQueue(departmentId);
  console.log('[queueService] call_next_done', {
    departmentId: String(departmentId),
    queueEntryId: String(nextEntry._id),
    patientId: String(nextEntry.patientId),
    durationMs: Date.now() - startedAt
  });
  return nextEntry;
}

async function runRescoreForAllDepartments() {
  const startedAt = Date.now();
  console.log('[queueService] rescore_all_start');

  const waitingRows = await Queue.find({ status: 'WAITING' }).select('_id patientId departmentId riskScore urgencyLevel joinedAt');
  if (!waitingRows.length) {
    console.log('[queueService] rescore_all_no_waiting_rows');
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

    const groupStartedAt = Date.now();
    console.log('[queueService] rescore_department_start', {
      departmentId: deptKey,
      queuedPatients: rows.length
    });

    const now = Date.now();
    const rowsWithWait = rows.map((row) => {
      const waitTimeMinutes = Math.max(0, Math.floor((now - new Date(row.joinedAt).getTime()) / 60000));
      return {
        row,
        waitTimeMinutes
      };
    });

    // Persist timestamp-based wait-time values on each rescore pass.
    await Promise.all(rowsWithWait.map(({ row, waitTimeMinutes }) => (
      Queue.findByIdAndUpdate(row._id, { waitTimeMinutes })
    )));

    const patientsPayload = rowsWithWait.map(({ row, waitTimeMinutes }) => ({
      patient_id: String(row.patientId),
      risk_score: Number(row.riskScore || 0),
      urgency_level: normalizeUrgency(row.urgencyLevel),
      wait_time_minutes: waitTimeMinutes
    }));

    const ai = await rescoreBatch(patientsPayload);
    const results = Array.isArray(ai?.results) ? ai.results : [];

    console.log('[queueService] rescore_department_ai_response', {
      departmentId: deptKey,
      requested: patientsPayload.length,
      returned: results.length
    });

    const byPatientId = new Map(results.map((r) => [String(r.patient_id || ''), r]));

    for (const { row, waitTimeMinutes } of rowsWithWait) {
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
        priorityScore: nextPriority,
        waitTimeMinutes
      });
      updated += 1;
    }

    await recalculateDepartmentQueue(rows[0].departmentId);

    console.log('[queueService] rescore_department_done', {
      departmentId: deptKey,
      updatedSoFar: updated,
      durationMs: Date.now() - groupStartedAt
    });
  }

  console.log('[queueService] rescore_all_done', {
    scanned: waitingRows.length,
    updated,
    departments: byDepartment.size,
    durationMs: Date.now() - startedAt
  });

  const refreshedRows = await Queue.find({ status: 'WAITING' })
    .select('patientId hospitalName departmentName queuePosition patientsAhead estimatedWaitMinutes')
    .sort({ updatedAt: -1 })
    .lean();

  const queueSnapshots = refreshedRows.map((row) => ({
    patientId: String(row.patientId),
    hospital: row.hospitalName || null,
    department: row.departmentName || null,
    queuePosition: Number(row.queuePosition || 0),
    patientsAhead: Number(row.patientsAhead || 0),
    estimatedWaitMinutes: Number(row.estimatedWaitMinutes || 0)
  }));

  return {
    scanned: waitingRows.length,
    updated,
    departments: byDepartment.size,
    queueSnapshots
  };
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