const express = require('express');
const router = express.Router();
const { Hospital, Department, Doctor } = require('../models');

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
    const hospital = await Hospital.findById(req.params.hospitalId);
    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    const departments = await Department.find({ hospitalId: hospital._id, isActive: true }).sort({ name: 1 });

    res.json({
      hospital: {
        id: hospital._id,
        name: hospital.name,
        code: hospital.code,
        address: hospital.address,
        city: hospital.city,
        state: hospital.state,
        phone: hospital.phone
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

router.post('/', async (req, res) => {
  try {
    const { name, code, address, city, state, phone } = req.body;

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