const express = require('express');
const router = express.Router();
const { Queue } = require('../models');
const { authenticateAny, authenticatePatient, authenticateDoctor } = require('../middleware/auth');
const {
  getPatientQueueStatus,
  recalculateDepartmentQueue,
  callNextFromDepartmentQueue
} = require('../services/queueService');

router.get('/my-status', authenticatePatient, async (req, res) => {
  try {
    const status = await getPatientQueueStatus(req.userId);
    if (!status) {
      return res.status(404).json({ error: 'No active queue entry found' });
    }
    return res.json(status);
  } catch (error) {
    console.error('queue/my-status error:', error);
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

router.get('/patient/:patientId/status', authenticateAny, async (req, res) => {
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
    console.error('queue/patient/status error:', error);
    return res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

router.get('/department/:departmentId', authenticateDoctor, async (req, res) => {
  try {
    const { departmentId } = req.params;
    await recalculateDepartmentQueue(departmentId);

    const waiting = await Queue.find({ departmentId, status: 'WAITING' })
      .populate('patientId', 'firstName lastName')
      .sort({ queuePosition: 1 });

    return res.json({
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
    });
  } catch (error) {
    console.error('queue/department error:', error);
    return res.status(500).json({ error: 'Failed to fetch department queue' });
  }
});

router.post('/doctor/call-next', authenticateDoctor, async (req, res) => {
  try {
    const departmentId = req.doctor?.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Doctor has no department assigned' });
    }

    const queueEntry = await callNextFromDepartmentQueue(departmentId);
    if (!queueEntry) {
      return res.json({ message: 'No patients waiting in queue' });
    }

    return res.json({
      message: 'Next patient moved to consultation',
      queueEntryId: queueEntry.id,
      patientId: queueEntry.patientId,
      priorityLevel: queueEntry.priorityLevel
    });
  } catch (error) {
    console.error('queue/doctor/call-next error:', error);
    return res.status(500).json({ error: 'Failed to call next patient' });
  }
});

module.exports = router;
