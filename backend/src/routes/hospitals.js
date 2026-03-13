const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Hospital, Department, Doctor, TriageRecord } = require('../models');
const { ensureHospitalQrCode } = require('../utils/hospitalQr');

async function findHospitalByIdentifier(hospitalId) {
  if (mongoose.Types.ObjectId.isValid(hospitalId)) {
    const byId = await Hospital.findById(hospitalId);
    if (byId) return byId;
  }

  return Hospital.findOne({ code: String(hospitalId || '').toUpperCase() });
}

router.get('/', async (req, res) => {
  try {
    const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 });

    const results = await Promise.all(hospitals.map(async (hospital) => {
      const [departmentCount, doctorCount] = await Promise.all([
        Department.countDocuments({ hospitalId: hospital._id, isActive: true }),
        Doctor.countDocuments({ hospitalId: hospital._id, isActive: true })
      ]);

      return {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code,
        address: hospital.address,
        city: hospital.city,
        state: hospital.state,
        phone: hospital.phone,
        email: hospital.email,
        qrCodeUrl: hospital.qrCodeUrl,
        departmentCount,
        doctorCount
      };
    }));

    res.json({ hospitals: results });
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    res.status(500).json({ error: 'Failed to fetch hospitals' });
  }
});

router.get('/:hospitalId', async (req, res) => {
  try {
    const hospital = await findHospitalByIdentifier(req.params.hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    if (!hospital.isActive) {
      return res.status(410).json({ error: 'Hospital currently unavailable' });
    }

    await ensureHospitalQrCode(hospital);

    const departments = await Department.find({ hospitalId: hospital._id, isActive: true }).sort({ name: 1 });
    const departmentIds = departments.map((d) => d._id);
    let averageWaitTime = null;

    if (departmentIds.length) {
      const triageRecords = await TriageRecord.find({ departmentId: { $in: departmentIds } }).select('estimatedWaitMinutes');
      const waitValues = triageRecords
        .map((record) => Number(record.estimatedWaitMinutes))
        .filter((value) => Number.isFinite(value) && value >= 0);

      if (waitValues.length) {
        const total = waitValues.reduce((sum, value) => sum + value, 0);
        averageWaitTime = Math.round(total / waitValues.length);
      }
    }

    res.json({
      id: hospital._id,
      name: hospital.name,
      city: hospital.city,
      address: hospital.address,
      averageWaitTime,
      hospital: {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code,
        address: hospital.address,
        city: hospital.city,
        state: hospital.state,
        phone: hospital.phone,
        email: hospital.email,
        qrCodeUrl: hospital.qrCodeUrl
      },
      departments: departments.map((d) => ({
        id: d._id,
        name: d.name,
        code: d.code,
        floor: d.floor,
        capacity: d.capacity
      }))
    });
  } catch (error) {
    console.error('Error fetching hospital:', error);
    res.status(500).json({ error: 'Failed to fetch hospital' });
  }
});

router.get('/:hospitalId/qr', async (req, res) => {
  try {
    const hospital = await findHospitalByIdentifier(req.params.hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'QR code not found for hospital' });
    }

    await ensureHospitalQrCode(hospital);

    if (hospital.qrCodeUrl.startsWith('data:image/png;base64,')) {
      const base64 = hospital.qrCodeUrl.replace('data:image/png;base64,', '');
      const imageBuffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="hospital-${hospital.id}-qr.png"`);
      return res.send(imageBuffer);
    }

    return res.redirect(hospital.qrCodeUrl);
  } catch (error) {
    console.error('Error fetching hospital QR:', error);
    return res.status(500).json({ error: 'Failed to fetch hospital QR' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, code, address, city, state, phone, email } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Hospital name and code are required' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await Hospital.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(400).json({ error: 'Hospital code already exists' });
    }

    const hospital = new Hospital({
      name: String(name).trim(),
      code: normalizedCode,
      address: address || null,
      city: city || null,
      state: state || null,
      phone: phone || null,
      email: email || null,
      isActive: true
    });
    await hospital.save();

    res.status(201).json({
      message: 'Hospital created successfully',
      hospital: {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code
      }
    });
  } catch (error) {
    console.error('Error creating hospital:', error);
    res.status(500).json({ error: 'Failed to create hospital' });
  }
});

module.exports = router;