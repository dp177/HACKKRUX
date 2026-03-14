const express = require('express');
const router = express.Router();
const { Queue } = require('../models');
const { authenticateAny, authenticatePatient, authenticateDoctor } = require('../middleware/auth');
const {
  getPatientQueueStatus,
  recalculateDepartmentQueue,
  callNextFromDepartmentQueue
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

    const waiting = await Queue.find({ departmentId, status: 'WAITING' })
      .populate('patientId', 'firstName lastName')
      .sort({ queuePosition: 1 });

    const payload = {
      departmentId,
      patients: waiting.map((row) => ({
        queueEntryId: row.id,
        patientId: row.patientId?._id || row.patientId,
        patientName: row.patientId ? `${row.patientId.firstName} ${row.patientId.lastName}` : 'Patient',
        position: row.queuePosition,
        patientsAhead: Math.max(0, Number(row.queuePosition || 1) - 1),
        estimatedWaitMinutes: row.estimatedWaitMinutes,
        priorityLevel: row.priorityLevel,
        riskScore: row.riskScore,
        status: row.status
      }))
    };

    console.log('[QueueRoute] department_queue_success', {
      url: req.originalUrl,
      departmentId,
      waitingCount: payload.patients.length
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

    const queueEntry = await callNextFromDepartmentQueue(departmentId);
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

module.exports = router;
