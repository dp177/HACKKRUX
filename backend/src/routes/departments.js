/**
 * DEPARTMENT ROUTES
 * Hospital department management
 */

const express = require('express');
const router = express.Router();
const { Department, Doctor, TriageRecord, Patient, Hospital } = require('../models');
const { authenticateDoctor } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════
// SEARCH DEPARTMENTS (for booking/walk-in UX)
// ═══════════════════════════════════════════════════════════════

router.get('/search', async (req, res) => {
  try {
    const { query = '', hospitalId = '' } = req.query;

    const where = query
      ? {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { code: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } }
          ]
        }
      : {};

    if (hospitalId) {
      where.hospitalId = hospitalId;
    }

    const departments = await Department.find(where).sort({ name: 1 });

    const payload = await Promise.all(departments.map(async (department) => {
      const activeDoctors = await Doctor.countDocuments({
        departmentId: department._id,
        isActive: true
      });

      return {
        id: department._id,
        hospitalId: department.hospitalId,
        name: department.name,
        code: department.code,
        description: department.description,
        floor: department.floor,
        capacity: department.capacity,
        activeDoctors
      };
    }));

    res.json({
      total: payload.length,
      departments: payload
    });
  } catch (error) {
    console.error('Error searching departments:', error);
    res.status(500).json({ error: 'Failed to search departments' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET ALL DEPARTMENTS
// ═══════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const { hospitalId = '' } = req.query;
    const where = hospitalId ? { hospitalId } : {};
    const departments = await Department.find(where).sort({ name: 1 });

    const responseDepartments = await Promise.all(departments.map(async (dept) => {
      const doctors = await Doctor.find({ departmentId: dept._id, isActive: true })
        .select('_id firstName lastName specialty')
        .sort({ firstName: 1, lastName: 1 });

      return {
        id: dept._id,
        hospitalId: dept.hospitalId,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        floor: dept.floor,
        capacity: dept.capacity,
        activeDoctors: doctors.length,
        doctors: doctors.map((d) => ({
          id: d._id,
          name: `Dr. ${d.firstName} ${d.lastName}`,
          specialty: d.specialty
        }))
      };
    }));
    
    res.json({
      departments: responseDepartments
    });
    
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET DEPARTMENT BY ID
// ═══════════════════════════════════════════════════════════════

router.get('/:departmentId', async (req, res) => {
  try {
    const department = await Department.findById(req.params.departmentId)
      .populate({
        path: 'doctors',
        select: '-passwordHash'
      });
    
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Get current queue count
    const queueCount = await TriageRecord.countDocuments({
      departmentId: department._id,
      queuePosition: { $ne: null }
    });
    
    res.json({
      id: department._id,
      name: department.name,
      code: department.code,
      description: department.description,
      floor: department.floor,
      capacity: department.capacity,
      currentQueueCount: queueCount,
      doctors: (department.doctors || []).map(d => ({
        id: d._id,
        name: `Dr. ${d.firstName} ${d.lastName}`,
        specialty: d.specialty,
        isAvailableToday: d.isAvailableToday
      }))
    });
    
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATE DEPARTMENT (Hospital Admin)
// ═══════════════════════════════════════════════════════════════

router.post('/', async (req, res) => {
  try {
    const { hospitalId, name, code, description, floor, capacity } = req.body;
    
    if (!hospitalId || !name || !code) {
      return res.status(400).json({ error: 'Hospital, department name and code required' });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(400).json({ error: 'Invalid hospital selected' });
    }
    
    // Check if department with same code already exists
    const existing = await Department.findOne({ hospitalId, code: String(code).trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ error: 'Department code already exists in this hospital' });
    }
    
    const department = new Department({
      hospitalId,
      name,
      code: String(code).trim().toUpperCase(),
      description: description || '',
      floor: floor || null,
      capacity: capacity || null
    });
    await department.save();
    
    res.status(201).json({
      message: 'Department created successfully',
      department: {
        id: department._id,
        hospitalId: department.hospitalId,
        name: department.name,
        code: department.code
      }
    });
    
  } catch (error) {
    console.error('Department creation error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE DEPARTMENT
// ═══════════════════════════════════════════════════════════════

router.put('/:departmentId', async (req, res) => {
  try {
    const department = await Department.findById(req.params.departmentId);
    
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    const { name, description, floor, capacity } = req.body;
    
    if (name !== undefined) department.name = name;
    if (description !== undefined) department.description = description;
    if (floor !== undefined) department.floor = floor;
    if (capacity !== undefined) department.capacity = capacity;
    
    await department.save();
    
    res.json({
      message: 'Department updated successfully',
      department: {
        id: department._id,
        name: department.name,
        code: department.code
      }
    });
    
  } catch (error) {
    console.error('Department update error:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET DEPARTMENT QUEUE (current patients waiting)
// ═══════════════════════════════════════════════════════════════

router.get('/:departmentId/queue', authenticateDoctor, async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Get patients in queue for this department
    const queuedPatients = await TriageRecord.find({
      departmentId,
      queuePosition: { $ne: null }
    })
    .populate('patientId')
    .sort({ queuePosition: 1 });
    
    res.json({
      department: {
        id: department._id,
        name: department.name,
        code: department.code
      },
      queueCount: queuedPatients.length,
      patients: queuedPatients.map(triage => ({
        queuePosition: triage.queuePosition,
        patient: {
          id: triage.patientId._id,
          name: `${triage.patientId.firstName} ${triage.patientId.lastName}`,
          age: Math.floor((new Date() - new Date(triage.patientId.dateOfBirth)) / 31557600000)
        },
        chiefComplaint: triage.chiefComplaint,
        priorityLevel: triage.priorityLevel,
        riskScore: triage.totalRiskScore,
        estimatedWaitMinutes: triage.estimatedWaitMinutes,
        triageTime: triage.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Error fetching department queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET DEPARTMENT STATISTICS
// ═══════════════════════════════════════════════════════════════

router.get('/:departmentId/stats', authenticateDoctor, async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    // Get doctor count
    const doctorCount = await Doctor.countDocuments({
      departmentId,
      isActive: true
    });
    
    // Get today's triage count
    const today = new Date().toISOString().split('T')[0];
    const todayTriageCount = await TriageRecord.countDocuments({
      departmentId,
      createdAt: { $gte: new Date(today) }
    });
    
    // Get current queue
    const currentQueue = await TriageRecord.countDocuments({
      departmentId,
      queuePosition: { $ne: null }
    });
    
    // Get average wait time (from recent triage records)
    const recentTriages = await TriageRecord.find({ departmentId })
      .sort({ createdAt: -1 })
      .limit(20);
    
    const avgWaitMinutes = recentTriages.length > 0 ?
      recentTriages.reduce((sum, t) => sum + (t.estimatedWaitMinutes || 0), 0) / recentTriages.length :
      0;
    
    res.json({
      department: {
        id: department._id,
        name: department.name,
        code: department.code
      },
      statistics: {
        activeDoctors: doctorCount,
        todayTriages: todayTriageCount,
        currentQueueSize: currentQueue,
        averageWaitMinutes: Math.round(avgWaitMinutes),
        capacity: department.capacity,
        utilizationPercent: department.capacity ? 
          Math.round((currentQueue / department.capacity) * 100) : null
      }
    });
    
  } catch (error) {
    console.error('Error fetching department stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ═══════════════════════════════════════════════════════════════
// SEARCH DEPARTMENTS by Specialty
// ═══════════════════════════════════════════════════════════════

router.get('/search/specialty', async (req, res) => {
  try {
    const { specialty } = req.query;
    
    if (!specialty) {
      return res.status(400).json({ error: 'Specialty parameter required' });
    }
    
    // Find doctors with matching specialty
    const doctors = await Doctor.find({
      specialty: { $regex: specialty, $options: 'i' },
      isActive: true
    })
    .select('id firstName lastName specialty departmentId');
    
    // Get unique department IDs
    const departmentIds = [...new Set(doctors.map(d => d.departmentId).filter(Boolean))];
    
    // Fetch departments
    const departments = await Department.find({
      _id: { $in: departmentIds }
    });
    
    // Map doctors to departments
    const departmentMap = {};
    departments.forEach(dept => {
      departmentMap[dept._id] = {
        id: dept._id,
        name: dept.name,
        code: dept.code,
        matchingDoctors: []
      };
    });
    
    doctors.forEach(d => {
      if (d.departmentId && departmentMap[d.departmentId]) {
        departmentMap[d.departmentId].matchingDoctors.push({
          id: d._id,
          name: `Dr. ${d.firstName} ${d.lastName}`,
          specialty: d.specialty
        });
      }
    });
    
    res.json({
      specialty,
      departments: Object.values(departmentMap)
    });
    
  } catch (error) {
    console.error('Error searching departments:', error);
    res.status(500).json({ error: 'Failed to search departments' });
  }
});

module.exports = router;
