/**
 * PRESCRIPTION ROUTES
 * Create prescription during consultation and view patient history.
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Prescription, Queue, Patient, Doctor } = require('../models');
const { authenticateDoctor, authenticatePatient } = require('../middleware/auth');
const {
  buildPrescriptionHashPayload,
  generatePrescriptionArtifacts,
  generatePrescriptionHash,
  buildVerificationUrl,
  generateVerificationQrDataUrl,
  generatePrescriptionPdfBuffer
} = require('../utils/prescriptionSecurity');

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

    const [doctor, patient] = await Promise.all([
      Doctor.findById(doctorId).populate('hospitalId', 'name address city state phone email'),
      Patient.findById(queueEntry.patientId)
    ]);

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const medicines = normalizeMedicineArray(req.body?.medicines);
    const form = {
      diagnosis: normalizeOptionalString(req.body?.form?.diagnosis),
      temperature: normalizeOptionalString(req.body?.form?.temperature),
      bloodPressure: normalizeOptionalString(req.body?.form?.bloodPressure),
      notes: normalizeOptionalString(req.body?.form?.notes)
    };
    const remarks = normalizeOptionalString(req.body?.remarks);
    const createdAt = new Date();

    const hashPayload = buildPrescriptionHashPayload({
      patientId: queueEntry.patientId,
      doctorId,
      consultationId: queueEntry._id,
      form,
      medicines,
      remarks,
      createdAt
    });

    const draftPrescription = {
      _id: new mongoose.Types.ObjectId(),
      patientId: queueEntry.patientId,
      doctorId,
      consultationId: queueEntry._id,
      form,
      medicines,
      remarks,
      createdAt
    };

    const artifacts = await generatePrescriptionArtifacts({
      hashPayload,
      prescription: draftPrescription,
      doctor,
      patient
    });

    const prescription = await Prescription.create({
      ...draftPrescription,
      hash: artifacts.hash,
      verificationUrl: artifacts.verificationUrl,
      qrCodeDataUrl: artifacts.qrCodeDataUrl,
      pdfDataUrl: artifacts.pdfDataUrl,
      pdfFileName: `prescription-${String(draftPrescription._id)}.pdf`
    });

    queueEntry.status = 'COMPLETED';
    queueEntry.completedAt = new Date();
    await queueEntry.save();

    return res.status(201).json({
      message: 'Prescription created and consultation completed',
      prescription,
      verification: {
        hash: prescription.hash,
        verificationUrl: prescription.verificationUrl,
        qrCodeDataUrl: prescription.qrCodeDataUrl
      }
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
      hash: item.hash || null,
      verificationUrl: item.verificationUrl || null,
      hasPdf: Boolean(item.pdfDataUrl),
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

router.get('/me', authenticatePatient, async (req, res) => {
  try {
    const patientId = String(req.patient.id);

    const history = await Prescription.find({ patientId })
      .populate('doctorId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(history.map((item) => ({
      id: String(item._id),
      date: item.createdAt,
      diagnosis: item?.form?.diagnosis || null,
      temperature: item?.form?.temperature || null,
      bloodPressure: item?.form?.bloodPressure || null,
      notes: item?.form?.notes || null,
      medicines: (item.medicines || []).map((m) => ({
        name: m?.name || null,
        dosage: m?.dosage || null,
        frequency: m?.frequency || null,
        duration: m?.duration || null,
        instructions: m?.instructions || null
      })).filter((m) => m.name),
      remarks: item?.remarks || null,
      hash: item.hash || null,
      verificationUrl: item.verificationUrl || null,
      doctorName: item?.doctorId
        ? `Dr. ${item.doctorId.firstName || ''} ${item.doctorId.lastName || ''}`.trim()
        : null
    })));
  } catch (error) {
    console.error('Error fetching own prescription history:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription history' });
  }
});

router.get('/verify/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const normalizedHash = String(hash || '').trim().toLowerCase();
    if (!normalizedHash || !/^[a-f0-9]{64}$/.test(normalizedHash)) {
      return res.status(400).json({
        status: 'INVALID',
        valid: false,
        reason: 'Invalid verification hash format'
      });
    }

    const prescription = await Prescription.findOne({ hash: normalizedHash })
      .populate('patientId', 'firstName lastName dateOfBirth gender phone')
      .populate('doctorId', 'firstName lastName specialty licenseNumber')
      .lean();

    if (!prescription) {
      return res.status(404).json({
        status: 'INVALID',
        valid: false,
        reason: 'Prescription record not found'
      });
    }

    const payload = buildPrescriptionHashPayload({
      patientId: prescription.patientId?._id || prescription.patientId,
      doctorId: prescription.doctorId?._id || prescription.doctorId,
      consultationId: prescription.consultationId,
      form: prescription.form,
      medicines: prescription.medicines,
      remarks: prescription.remarks,
      createdAt: prescription.createdAt
    });
    const recomputedHash = generatePrescriptionHash(payload);
    const valid = recomputedHash === normalizedHash;

    if (!valid) {
      return res.status(409).json({
        status: 'INVALID',
        valid: false,
        reason: 'Prescription integrity check failed'
      });
    }

    const patientName = prescription?.patientId
      ? `${prescription.patientId.firstName || ''} ${prescription.patientId.lastName || ''}`.trim()
      : 'Patient';
    const doctorName = prescription?.doctorId
      ? `Dr. ${prescription.doctorId.firstName || ''} ${prescription.doctorId.lastName || ''}`.trim()
      : 'Doctor';

    return res.json({
      status: 'VALID',
      valid: true,
      hash: normalizedHash,
      issuedAt: prescription.createdAt,
      verificationUrl: prescription.verificationUrl || null,
      diagnosis: prescription?.form?.diagnosis || null,
      doctor: {
        name: doctorName,
        specialty: prescription?.doctorId?.specialty || null,
        licenseNumber: prescription?.doctorId?.licenseNumber || null
      },
      patient: {
        name: patientName,
        phone: prescription?.patientId?.phone || null,
        gender: prescription?.patientId?.gender || null
      }
    });
  } catch (error) {
    console.error('Error verifying prescription:', error);
    return res.status(500).json({
      status: 'INVALID',
      valid: false,
      reason: 'Verification failed due to server error'
    });
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

router.get('/:prescriptionId/pdf', authenticateDoctor, async (req, res) => {
  try {
    const MAX_DIRECT_PDF_BYTES = Number(process.env.PRESCRIPTION_MAX_DOWNLOAD_BYTES || (1.5 * 1024 * 1024));
    const { prescriptionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(prescriptionId)) {
      return res.status(400).json({ error: 'Invalid prescriptionId' });
    }

    const prescription = await Prescription.findOne({
      _id: prescriptionId,
      doctorId: req.userId
    })
      .populate({
        path: 'doctorId',
        select: 'firstName lastName specialty licenseNumber signatureUrl signatureMimeType hospitalId',
        populate: {
          path: 'hospitalId',
          select: 'name address city state phone email'
        }
      })
      .populate('patientId', 'firstName lastName dateOfBirth gender phone address city state zipCode')
      .select('pdfDataUrl pdfFileName verificationUrl hash createdAt form medicines remarks doctorId patientId')
      .lean();

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

    const raw = String(prescription.pdfDataUrl || '');
    const match = raw.match(/^data:application\/pdf;base64,(.+)$/);
    let pdfBuffer = match ? Buffer.from(match[1], 'base64') : null;

    if (!pdfBuffer || pdfBuffer.length > MAX_DIRECT_PDF_BYTES) {
      const verificationUrl = prescription.verificationUrl || buildVerificationUrl(prescription.hash || '');
      const qrCodeDataUrl = await generateVerificationQrDataUrl(verificationUrl);
      pdfBuffer = await generatePrescriptionPdfBuffer({
        prescription,
        doctor: prescription.doctorId,
        patient: prescription.patientId,
        verificationUrl,
        qrCodeDataUrl
      });
    }

    const fileName = prescription.pdfFileName || `prescription-${prescriptionId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error fetching prescription PDF:', error);
    return res.status(500).json({ error: 'Failed to fetch prescription PDF' });
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
