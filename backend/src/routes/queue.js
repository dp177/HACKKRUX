const express = require('express');
const router = express.Router();
const { Queue } = require('../models');
const { authenticateAny, authenticatePatient, authenticateDoctor } = require('../middleware/auth');
const {
  getPatientQueueStatus,
  recalculateDepartmentQueue,
  callNextFromDepartmentQueue,
  endActiveConsultation
} = require('../services/queueService');

router.use((req, res, next) => {
  console.log('[QueueRoute] request', {
    method: req.method,
    url: req.originalUrl,
    userId: req.userId || null,
    role: req.role || null
  });
  next();
});

router.get('/my-status', authenticatePatient, async (req, res) => {
  try {
    console.log('[QueueRoute] my_status_start', { url: req.originalUrl, userId: req.userId || null });
    const status = await getPatientQueueStatus(req.userId);
    if (!status) {
      console.log('[QueueRoute] my_status_not_found', { url: req.originalUrl, userId: req.userId || null });
      return res.status(404).json({ error: 'No active queue entry found' });
    }
    console.log('[QueueRoute] my_status_success', {
      url: req.originalUrl,
      userId: req.userId || null,
      position: status?.position || null
    });
    return res.json(status);
  } catch (error) {
    console.error('queue/my-status error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

router.get('/patient/:patientId/status', authenticateAny, async (req, res) => {
  try {
    const { patientId } = req.params;
    console.log('[QueueRoute] patient_status_start', {
      url: req.originalUrl,
      requesterId: req.userId || null,
      requesterRole: req.role || null,
      patientId
    });

    if (req.role !== 'doctor' && String(req.userId) !== String(patientId)) {
      console.log('[QueueRoute] patient_status_forbidden', {
        url: req.originalUrl,
        requesterId: req.userId || null,
        patientId
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = await getPatientQueueStatus(patientId);
    if (!status) {
      console.log('[QueueRoute] patient_status_not_found', { url: req.originalUrl, patientId });
      return res.status(404).json({ error: 'No active queue entry found' });
    }

    console.log('[QueueRoute] patient_status_success', {
      url: req.originalUrl,
      patientId,
      position: status?.position || null
    });
    return res.json(status);
  } catch (error) {
    console.error('queue/patient/status error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

router.get('/department/:departmentId', authenticateDoctor, async (req, res) => {
  try {
    const { departmentId } = req.params;
    console.log('[QueueRoute] department_queue_start', {
      url: req.originalUrl,
      departmentId,
      doctorId: req.userId || null
    });
    await recalculateDepartmentQueue(departmentId);

    const entries = await Queue.find({ departmentId, status: { $in: ['IN_CONSULTATION', 'WAITING'] } })
      .populate('patientId', 'firstName lastName')
      .sort({ queuePosition: 1 });

    const payload = {
      departmentId,
      patients: entries.map((row) => ({
        queueEntryId: row.id,
        patientId: row.patientId?._id || row.patientId,
        patientName: row.patientId ? `${row.patientId.firstName} ${row.patientId.lastName}` : 'Patient',
        position: row.queuePosition,
        patientsAhead: Number(row.patientsAhead || 0),
        estimatedWaitMinutes: row.estimatedWaitMinutes,
        priorityLevel: row.priorityLevel,
        riskScore: row.riskScore,
        status: row.status
      }))
    };

    console.log('[QueueRoute] department_queue_success', {
      url: req.originalUrl,
      departmentId,
      waitingCount: payload.patients.filter((row) => row.status === 'WAITING').length
    });

    return res.json(payload);
  } catch (error) {
    console.error('queue/department error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to fetch department queue' });
  }
});

router.post('/doctor/call-next', authenticateDoctor, async (req, res) => {
  try {
    const departmentId = req.doctor?.departmentId;
    console.log('[QueueRoute] call_next_start', {
      url: req.originalUrl,
      doctorId: req.userId || null,
      departmentId: departmentId ? String(departmentId) : null
    });

    if (!departmentId) {
      return res.status(400).json({ error: 'Doctor has no department assigned' });
    }

    const queueEntry = await callNextFromDepartmentQueue(departmentId, {
      doctorId: req.userId,
      doctorName: req.doctor ? `Dr. ${req.doctor.firstName} ${req.doctor.lastName}` : 'Doctor'
    });
    if (!queueEntry) {
      console.log('[QueueRoute] call_next_empty', { url: req.originalUrl, departmentId: String(departmentId) });
      return res.json({ message: 'No patients waiting in queue' });
    }

    console.log('[QueueRoute] call_next_success', {
      url: req.originalUrl,
      departmentId: String(departmentId),
      queueEntryId: queueEntry.id,
      patientId: queueEntry.patientId
    });
    return res.json({
      message: 'Next patient moved to consultation',
      queueEntryId: queueEntry.id,
      patientId: queueEntry.patientId,
      priorityLevel: queueEntry.priorityLevel
    });
  } catch (error) {
    console.error('queue/doctor/call-next error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to call next patient' });
  }
});

router.post('/call-next', authenticateDoctor, async (req, res) => {
  try {
    const departmentId = req.doctor?.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Doctor has no department assigned' });
    }

    const queueEntry = await callNextFromDepartmentQueue(departmentId, {
      doctorId: req.userId,
      doctorName: req.doctor ? `Dr. ${req.doctor.firstName} ${req.doctor.lastName}` : 'Doctor'
    });

    if (!queueEntry) {
      return res.json({ message: 'No patients waiting in queue' });
    }

    return res.json({
      message: 'Next patient moved to consultation',
      queueEntryId: queueEntry.id,
      patientId: queueEntry.patientId,
      status: queueEntry.status
    });
  } catch (error) {
    console.error('queue/call-next error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to call next patient' });
  }
});

router.post('/end-consultation', authenticateDoctor, async (req, res) => {
  try {
    const departmentId = req.doctor?.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Doctor has no department assigned' });
    }

    const completedEntry = await endActiveConsultation(departmentId);
    if (!completedEntry) {
      return res.json({ message: 'No active consultation to end' });
    }

    return res.json({
      message: 'Consultation ended successfully',
      queueEntryId: completedEntry.id,
      patientId: completedEntry.patientId,
      status: completedEntry.status
    });
  } catch (error) {
    console.error('queue/end-consultation error:', { url: req.originalUrl, error: error?.message || error });
    return res.status(500).json({ error: 'Failed to end consultation' });
  }
});

module.exports = router;
