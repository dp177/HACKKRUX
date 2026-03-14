/**
 * PRESCRIPTION ROUTES
 * Create prescription during consultation and view patient history.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Prescription, Queue, Patient, Doctor } = require('../models');
const { authenticateDoctor } = require('../middleware/auth');

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeMedicineArray(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = normalizeOptionalString(item.name);
      if (!name) return null;

      const candidateMedicineId = normalizeOptionalString(item.medicineId || item._id);
      const medicineId = candidateMedicineId && mongoose.Types.ObjectId.isValid(candidateMedicineId)
        ? candidateMedicineId
        : null;

      return {
        medicineId,
        name,
        dosage: normalizeOptionalString(item.dosage),
        frequency: normalizeOptionalString(item.frequency),
        duration: normalizeOptionalString(item.duration),
        instructions: normalizeOptionalString(item.instructions)
      };
    })
    .filter(Boolean);
}

router.post('/', authenticateDoctor, async (req, res) => {
  try {
    const consultationId = normalizeOptionalString(req.body?.consultationId);
    if (!consultationId || !mongoose.Types.ObjectId.isValid(consultationId)) {
      return res.status(400).json({ error: 'Valid consultationId is required' });
    }

    const queueEntry = await Queue.findById(consultationId);
    if (!queueEntry) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    const doctorId = String(req.userId);
    if (String(queueEntry.calledByDoctorId || '') !== doctorId) {
      return res.status(403).json({ error: 'You can create prescription only for your active consultation' });
    }

    if (queueEntry.status !== 'IN_CONSULTATION') {
      return res.status(400).json({ error: 'Prescription can only be created while consultation is in progress' });
    }

    const existing = await Prescription.findOne({ consultationId: queueEntry._id }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'Prescription already exists for this consultation' });
    }

    const medicines = normalizeMedicineArray(req.body?.medicines);

    const prescription = await Prescription.create({
      patientId: queueEntry.patientId,
      doctorId,
      consultationId: queueEntry._id,
      form: {
        diagnosis: normalizeOptionalString(req.body?.form?.diagnosis),
        temperature: normalizeOptionalString(req.body?.form?.temperature),
        bloodPressure: normalizeOptionalString(req.body?.form?.bloodPressure),
        notes: normalizeOptionalString(req.body?.form?.notes)
      },
      medicines,
      remarks: normalizeOptionalString(req.body?.remarks)
    });

    queueEntry.status = 'COMPLETED';
    queueEntry.completedAt = new Date();
    await queueEntry.save();

    return res.status(201).json({
      message: 'Prescription created and consultation completed',
      prescription
    });
  } catch (error) {
    console.error('Error creating prescription:', error);
    return res.status(500).json({ error: 'Failed to create prescription' });
  }
});

router.get('/patient/:patientId', authenticateDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: 'Invalid patientId' });
    }

    const history = await Prescription.find({ patientId })
      .populate('doctorId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(history.map((item) => ({
      id: String(item._id),
      date: item.createdAt,
      diagnosis: item?.form?.diagnosis || null,
      medicines: (item.medicines || []).map((m) => m.name).filter(Boolean),
      doctorName: item?.doctorId
        ? `Dr. ${item.doctorId.firstName || ''} ${item.doctorId.lastName || ''}`.trim()
        : null,
      full: item
    })));
  } catch (error) {
    console.error('Error fetching patient prescription history:', error);
    return res.status(500).json({ error: 'Failed to fetch patient prescription history' });
  }
});

router.get('/:prescriptionId', authenticateDoctor, async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(prescriptionId)) {
      return res.status(400).json({ error: 'Invalid prescriptionId' });
    }

    const prescription = await Prescription.findById(prescriptionId)
      .populate('patientId', 'firstName lastName dateOfBirth gender phone')
      .populate('doctorId', 'firstName lastName specialty')
      .populate('consultationId', 'status startedAt completedAt departmentId')
      .lean();

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    return res.json(prescription);
  } catch (error) {
    console.error('Error fetching prescription:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription' });
  }
});

router.get('/consultation/:consultationId', authenticateDoctor, async (req, res) => {
  try {
    const { consultationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(consultationId)) {
      return res.status(400).json({ error: 'Invalid consultationId' });
    }

    const prescription = await Prescription.findOne({ consultationId }).lean();
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    return res.json(prescription);
  } catch (error) {
    console.error('Error fetching consultation prescription:', error);
    return res.status(500).json({ error: 'Failed to fetch consultation prescription' });
  }
});

router.get('/patient/:patientId/timeline', authenticateDoctor, async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: 'Invalid patientId' });
    }

    const patient = await Patient.findById(patientId).select('firstName lastName').lean();
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const items = await Prescription.find({ patientId })
      .select('createdAt form.diagnosis medicines.name')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      patientId,
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      items: items.map((item) => ({
        id: String(item._id),
        date: item.createdAt,
        diagnosis: item?.form?.diagnosis || null,
        medicines: (item.medicines || []).map((m) => m.name).filter(Boolean)
      }))
    });
  } catch (error) {
    console.error('Error fetching prescription timeline:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription timeline' });
  }
});

module.exports = router;
