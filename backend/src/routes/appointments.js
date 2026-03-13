/**
 * APPOINTMENT ROUTES
 * Booking, scheduling, slot management
 */

const express = require('express');
const router = express.Router();
const { Appointment, Doctor, Patient, Department, DoctorSchedule, DoctorBreak, DoctorSlot } = require('../models');
const { authenticatePatient, authenticateDoctor, authenticateAny } = require('../middleware/auth');
const { assertWithinNextWeek, generateSlots } = require('../utils/scheduling');
const { getSocketServer } = require('../utils/socketServer');

// ═══════════════════════════════════════════════════════════════
// BOOK APPOINTMENT (Patient)
// ═══════════════════════════════════════════════════════════════

router.post('/book', authenticatePatient, async (req, res) => {
  try {
    const {
      doctorId,
      slotId,
      scheduledDate,
      scheduledTime,
      chiefComplaint,
      appointmentType = 'regular'
    } = req.body;
    
    // Validation
    if (!doctorId || (!slotId && (!scheduledDate || !scheduledTime))) {
      return res.status(400).json({ error: 'doctorId and slotId are required, or provide scheduledDate with scheduledTime' });
    }
    
    const patientId = req.patient.id;
    
    // Check if doctor exists and is active
    const doctor = await Doctor.findById(doctorId);
    if (!doctor || !doctor.isActive) {
      return res.status(404).json({ error: 'Doctor not found or inactive' });
    }
    
    let resolvedScheduledDate = scheduledDate;
    let resolvedScheduledTime = scheduledTime;
    let resolvedDuration = doctor.consultationDuration;
    let resolvedSlotId = null;

    if (slotId) {
      const lockedSlot = await DoctorSlot.findOneAndUpdate(
        {
          _id: slotId,
          doctorId,
          status: 'AVAILABLE'
        },
        {
          status: 'BOOKED'
        },
        { new: true }
      );

      if (!lockedSlot) {
        return res.status(409).json({ error: 'Slot already booked or unavailable' });
      }

      resolvedSlotId = lockedSlot.id;
      resolvedScheduledDate = lockedSlot.date;
      resolvedScheduledTime = lockedSlot.startTime;

      const [sh, sm] = String(lockedSlot.startTime).split(':').map(Number);
      const [eh, em] = String(lockedSlot.endTime).split(':').map(Number);
      resolvedDuration = ((eh * 60) + em) - ((sh * 60) + sm);
    } else {
      // Fallback legacy protection when slotId is not provided
      const conflictingAppointment = await Appointment.findOne({
        doctorId,
        scheduledDate,
        scheduledTime,
        status: {
          $nin: ['cancelled', 'completed', 'no-show']
        }
      });

      if (conflictingAppointment) {
        return res.status(409).json({ error: 'This time slot is already booked' });
      }
    }
    
    // Create appointment
    const appointment = new Appointment({
      patientId,
      doctorId,
      slotId: resolvedSlotId,
      hospitalId: doctor.hospitalId,
      departmentId: doctor.departmentId,
      scheduledDate: resolvedScheduledDate,
      appointmentDate: String(resolvedScheduledDate).slice(0, 10),
      scheduledTime: resolvedScheduledTime,
      duration: resolvedDuration,
      chiefComplaint: chiefComplaint || 'General consultation',
      appointmentType,
      status: 'scheduled'
    });
    await appointment.save();

    const slotEventDate = String(resolvedScheduledDate).slice(0, 10);
    const io = getSocketServer();
    if (io && resolvedSlotId) {
      const payload = {
        slotId: resolvedSlotId,
        doctorId,
        date: slotEventDate,
        status: 'BOOKED'
      };
      io.to(`doctor:${doctorId}:slots:${slotEventDate}`).emit('slot:update', payload);
      io.emit('slot:update', payload);
    }
    
    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: appointment._id,
        slotId: appointment.slotId,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty,
        scheduledDate: appointment.scheduledDate,
        scheduledTime: appointment.scheduledTime,
        duration: appointment.duration,
        status: appointment.status
      }
    });
    
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET AVAILABLE SLOTS for a Doctor
// ═══════════════════════════════════════════════════════════════

router.get('/available-slots/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }
    
    // Get doctor with schedule
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    try {
      assertWithinNextWeek(date);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Prefer generated slot model when a schedule exists.
    const [schedule, breaks, persistedSlots] = await Promise.all([
      DoctorSchedule.findOne({ doctorId, date }),
      DoctorBreak.find({ doctorId, date }),
      DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 })
    ]);

    if (schedule) {
      let slots = persistedSlots;

      if (!slots.length) {
        const generated = generateSlots(schedule, breaks).map((slot) => ({
          doctorId,
          hospitalId: doctor.hospitalId,
          departmentId: doctor.departmentId,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: slot.status
        }));

        if (generated.length) {
          await DoctorSlot.insertMany(generated);
        }

        slots = await DoctorSlot.find({ doctorId, date }).sort({ startTime: 1 });
      }

      return res.json({
        date,
        doctorId,
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialty: doctor.specialty,
        consultationDuration: Number(schedule.slotDuration),
        availableSlots: slots.map((slot) => ({
          slotId: slot.id,
          time: slot.startTime,
          endTime: slot.endTime,
          status: slot.status,
          available: slot.status === 'AVAILABLE'
        }))
      });
    }
    
    // Get normalized weekday key used in doctor.availableSlots (monday, tuesday, ...)
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    const dayOfWeek = parsedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    // Get doctor's available slots for this day
    const daySchedule = doctor.availableSlots?.[dayOfWeek];
    
    if (!daySchedule || !daySchedule.available) {
      return res.json({
        date,
        doctorId,
        slots: [],
        message: `Dr. ${doctor.firstName} ${doctor.lastName} is not available on ${dayOfWeek}s`
      });
    }
    
    // Get all booked appointments for this doctor on this date
    const bookedAppointments = await Appointment.find({
      doctorId,
      scheduledDate: date,
      status: {
        $nin: ['cancelled', 'no-show']
      }
    }).select('scheduledTime duration');
    
    const bookedTimes = bookedAppointments.map((apt) => apt.scheduledTime);
    
    // Generate time slots from startTime to endTime
    const startTime = daySchedule.startTime; // e.g., "09:00"
    const endTime = daySchedule.endTime; // e.g., "17:00"
    const slotDuration = doctor.consultationDuration || 15;
    
    const slots = generateTimeSlots(startTime, endTime, slotDuration, bookedTimes);
    
    res.json({
      date,
      doctorId,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      specialty: doctor.specialty,
      consultationDuration: slotDuration,
      availableSlots: slots
    });
    
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// Helper function to generate time slots
function generateTimeSlots(startTime, endTime, durationMinutes, bookedTimes) {
  const slots = [];
  
  // Parse start and end times
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let currentHour = startHour;
  let currentMin = startMin;
  
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;
    
    const isBooked = bookedTimes.includes(timeString);
    
    slots.push({
      time: timeString,
      available: !isBooked
    });
    
    // Add duration to current time
    currentMin += durationMinutes;
    if (currentMin >= 60) {
      currentHour += Math.floor(currentMin / 60);
      currentMin = currentMin % 60;
    }
  }
  
  return slots;
}

// ═══════════════════════════════════════════════════════════════
// GET APPOINTMENT DETAILS
// ═══════════════════════════════════════════════════════════════

router.get('/:appointmentId', authenticateAny, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId)
      .populate('patientId')
      .populate('doctorId')
      .populate('departmentId');
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Authorization check
    if (req.role === 'patient' && String(appointment.patientId._id) !== String(req.patient.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.role === 'doctor' && String(appointment.doctorId._id) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      id: appointment._id,
      patient: {
        id: appointment.patientId._id,
        name: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
        phone: appointment.patientId.phone,
        age: Math.floor((new Date() - new Date(appointment.patientId.dateOfBirth)) / 31557600000)
      },
      doctor: {
        id: appointment.doctorId._id,
        name: `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
        specialty: appointment.doctorId.specialty
      },
      department: appointment.departmentId?.name || null,
      scheduledDate: appointment.scheduledDate,
      scheduledTime: appointment.scheduledTime,
      duration: appointment.duration,
      chiefComplaint: appointment.chiefComplaint,
      appointmentType: appointment.appointmentType,
      status: appointment.status,
      checkInTime: appointment.checkInTime,
      checkOutTime: appointment.checkOutTime
    });
    
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CHECK-IN to Appointment
// ═══════════════════════════════════════════════════════════════

router.post('/:appointmentId/check-in', authenticateAny, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
      return res.status(400).json({ error: 'Appointment cannot be checked in' });
    }
    
    // Update appointment status
    appointment.status = 'checked-in';
    appointment.checkInTime = new Date();
    await appointment.save();
    
    res.json({
      message: 'Patient checked in successfully',
      appointment: {
        id: appointment._id,
        status: appointment.status,
        checkInTime: appointment.checkInTime
      }
    });
    
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// ═══════════════════════════════════════════════════════════════
// START Consultation (Doctor marks as in-progress)
// ═══════════════════════════════════════════════════════════════

router.post('/:appointmentId/start', authenticateDoctor, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    if (String(appointment.doctorId) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (appointment.status !== 'checked-in') {
      return res.status(400).json({ error: 'Patient must check in first' });
    }
    
    appointment.status = 'in-progress';
    await appointment.save();
    
    res.json({
      message: 'Consultation started',
      appointmentId: appointment._id
    });
    
  } catch (error) {
    console.error('Start consultation error:', error);
    res.status(500).json({ error: 'Failed to start consultation' });
  }
});

// ═══════════════════════════════════════════════════════════════
// COMPLETE Appointment
// ═══════════════════════════════════════════════════════════════

router.post('/:appointmentId/complete', authenticateDoctor, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    if (String(appointment.doctorId) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    appointment.status = 'completed';
    appointment.checkOutTime = new Date();
    
    // Calculate actual duration
    if (appointment.checkInTime) {
      const durationMs = appointment.checkOutTime - new Date(appointment.checkInTime);
      appointment.actualDuration = Math.round(durationMs / 60000); // Convert to minutes
    }
    
    await appointment.save();
    
    res.json({
      message: 'Appointment completed',
      appointment: {
        id: appointment._id,
        status: appointment.status,
        actualDuration: appointment.actualDuration
      }
    });
    
  } catch (error) {
    console.error('Complete appointment error:', error);
    res.status(500).json({ error: 'Failed to complete appointment' });
  }
});

// ═══════════════════════════════════════════════════════════════
// CANCEL Appointment
// ═══════════════════════════════════════════════════════════════

router.post('/:appointmentId/cancel', authenticateAny, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const appointment = await Appointment.findById(req.params.appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    // Authorization check
    if (req.role === 'patient' && String(appointment.patientId) !== String(req.patient.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (req.role === 'doctor' && String(appointment.doctorId) !== String(req.doctor.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (appointment.status === 'completed' || appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment cannot be cancelled' });
    }
    
    appointment.status = 'cancelled';
    appointment.cancellationReason = reason || `Cancelled by ${req.role}`;
    await appointment.save();
    
    res.json({
      message: 'Appointment cancelled successfully',
      appointmentId: appointment._id
    });
    
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Patient's Appointments
// ═══════════════════════════════════════════════════════════════

router.get('/patient/:patientId', authenticatePatient, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
    
    // Authorization check
    if (patientId !== String(req.patient.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const whereClause = { patientId };
    if (status) {
      whereClause.status = status;
    }
    
    const appointments = await Appointment.find(whereClause)
      .populate('doctorId')
      .populate('departmentId')
      .sort({ scheduledDate: -1, scheduledTime: -1 });
    
    res.json({
      patientId,
      appointments: appointments.map(apt => ({
        id: apt._id,
        doctor: `Dr. ${apt.doctorId.firstName} ${apt.doctorId.lastName}`,
        specialty: apt.doctorId.specialty,
        department: apt.departmentId?.name,
        date: apt.scheduledDate,
        time: apt.scheduledTime,
        duration: apt.duration,
        status: apt.status,
        chiefComplaint: apt.chiefComplaint
      }))
    });
    
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET Doctor's Appointments
// ═══════════════════════════════════════════════════════════════

router.get('/doctor/:doctorId', authenticateDoctor, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, status } = req.query;
    
    // Authorization check
    if (parseInt(doctorId) !== req.doctor.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const whereClause = { doctorId };
    if (date) {
      whereClause.scheduledDate = date;
    }
    if (status) {
      whereClause.status = status;
    }
    
    const appointments = await Appointment.find(whereClause)
      .populate('patientId')
      .sort({ scheduledDate: 1, scheduledTime: 1 });
    
    res.json({
      doctorId,
      appointments: appointments.map(apt => ({
        id: apt._id,
        patient: {
          id: apt.patientId._id,
          name: `${apt.patientId.firstName} ${apt.patientId.lastName}`,
          age: Math.floor((new Date() - new Date(apt.patientId.dateOfBirth)) / 31557600000),
          phone: apt.patientId.phone
        },
        date: apt.scheduledDate,
        time: apt.scheduledTime,
        duration: apt.duration,
        status: apt.status,
        chiefComplaint: apt.chiefComplaint,
        appointmentType: apt.appointmentType
      }))
    });
    
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

module.exports = router;
