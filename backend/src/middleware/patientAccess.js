/**
 * Shared patient-record access guard.
 * A patient may access their own record. A doctor may access a patient record only when
 * the patient has a relationship with the doctor's hospital (appointment or queue entry).
 */
const { Appointment, Queue, TriageRecord, Department } = require('../models');

async function patientHasHospitalRelationship(patientId, hospitalId) {
  if (!patientId || !hospitalId) return false;
  const [hasAppointment, inQueue] = await Promise.all([
    Appointment.exists({ patientId, hospitalId }),
    Queue.exists({ patientId, hospitalId })
  ]);
  if (hasAppointment || inQueue) return true;
  // Walk-in/phased triage patients live on TriageRecord (no hospitalId field);
  // their hospital is determined by the triage department.
  const deptIds = await Department.find({ hospitalId }).distinct('_id');
  if (!deptIds.length) return false;
  return Boolean(await TriageRecord.exists({ patientId, departmentId: { $in: deptIds } }));
}

function requirePatientAccess(paramName = 'patientId') {
  return async (req, res, next) => {
    try {
      const patientId = req.params[paramName];
      if (req.role === 'patient') {
        if (String(req.userId) !== String(patientId)) {
          return res.status(403).json({ error: 'Access denied: not your record' });
        }
        return next();
      }
      if (req.role === 'doctor') {
        const ok = await patientHasHospitalRelationship(patientId, req.doctor.hospitalId);
        if (!ok) return res.status(403).json({ error: 'Access denied: patient has no record at your hospital' });
        return next();
      }
      return res.status(403).json({ error: 'Access denied' });
    } catch (e) {
      return res.status(500).json({ error: 'Access check failed' });
    }
  };
}

module.exports = { requirePatientAccess, patientHasHospitalRelationship };
