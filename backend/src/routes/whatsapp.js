/**
 * WHATSAPP BOOKING ROUTES
 * Twilio webhook flow backed by live DB data (hospital/department/doctor/slots)
 */

const express = require('express');
const router = express.Router();
const { Hospital, Department, Doctor, Appointment, Patient } = require('../models');

const userSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twimlMessage(message) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`;
}

function normalizePhone(from) {
  return String(from || '').replace(/^whatsapp:/i, '').trim();
}

function cleanupSession(senderId) {
  const session = userSessions.get(senderId);
  if (session?.timeout) {
    clearTimeout(session.timeout);
  }
  userSessions.delete(senderId);
}

function saveSession(senderId, session) {
  if (session.timeout) {
    clearTimeout(session.timeout);
  }
  session.timeout = setTimeout(() => cleanupSession(senderId), SESSION_TTL_MS);
  userSessions.set(senderId, session);
}

function parseChoice(text, max) {
  const n = Number(String(text || '').trim());
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n - 1;
}

function toDateOnlyIso(date) {
  return date.toISOString().split('T')[0];
}

function getUpcomingDates(count = 3) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(toDateOnlyIso(d));
  }
  return out;
}

function buildDailySlots(startHour, endHour, durationMinutes, bookedTimes) {
  const slots = [];
  let minutes = startHour * 60;
  const endMinutes = endHour * 60;

  while (minutes + durationMinutes <= endMinutes) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const time = `${hh}:${mm}`;
    if (!bookedTimes.has(time)) {
      slots.push(time);
    }
    minutes += durationMinutes;
  }

  return slots;
}

async function ensurePatientByPhone(senderPhone) {
  let patient = await Patient.findOne({ phone: senderPhone });
  if (patient) return patient;

  const safePhone = senderPhone.replace(/[^0-9]/g, '') || 'unknown';
  const email = `wa_${safePhone}@jeeva.local`;

  patient = await Patient.create({
    firstName: 'WhatsApp',
    lastName: safePhone.slice(-4) || 'User',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'Prefer not to say',
    phone: senderPhone,
    email,
    preferredLanguage: 'English'
  });

  return patient;
}

router.post('/whatsapp-booking', async (req, res) => {
  const senderRaw = req.body?.From;
  const bodyRaw = req.body?.Body;
  const senderId = normalizePhone(senderRaw);
  const userMsg = String(bodyRaw || '').trim();

  if (!senderId) {
    return res.status(400).type('text/plain').send('Missing sender');
  }

  try {
    let session = userSessions.get(senderId);

    if (!session || userMsg.toLowerCase() === 'start' || userMsg.toLowerCase() === 'hi') {
      const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 }).limit(9);
      if (!hospitals.length) {
        return res.type('text/xml').send(twimlMessage('No active hospitals are available right now. Please try again later.'));
      }

      const lines = hospitals.map((h, i) => `${i + 1}. ${h.name}`);
      session = {
        step: 'choose_hospital',
        history: [],
        collectedData: {},
        options: { hospitals }
      };
      saveSession(senderId, session);

      return res.type('text/xml').send(
        twimlMessage(
          `Namaste! Welcome to Jeeva.\nReply with number to choose hospital:\n${lines.join('\n')}\n\n(Reply START anytime to restart)`
        )
      );
    }

    const step = session.step;

    if (step === 'choose_hospital') {
      const hospitals = session.options?.hospitals || [];
      const index = parseChoice(userMsg, hospitals.length);
      if (index === null) {
        return res.type('text/xml').send(twimlMessage('Invalid choice. Reply with a valid hospital number.'));
      }

      const hospital = hospitals[index];
      const departments = await Department.find({ hospitalId: hospital._id, isActive: true }).sort({ name: 1 }).limit(9);
      if (!departments.length) {
        return res.type('text/xml').send(twimlMessage('No departments available in this hospital. Reply START to choose another hospital.'));
      }

      session.collectedData.hospitalId = hospital._id;
      session.collectedData.hospitalName = hospital.name;
      session.step = 'choose_department';
      session.options.departments = departments;
      saveSession(senderId, session);

      const lines = departments.map((d, i) => `${i + 1}. ${d.name}`);
      return res.type('text/xml').send(
        twimlMessage(`Selected: ${hospital.name}\nChoose department:\n${lines.join('\n')}`)
      );
    }

    if (step === 'choose_department') {
      const departments = session.options?.departments || [];
      const index = parseChoice(userMsg, departments.length);
      if (index === null) {
        return res.type('text/xml').send(twimlMessage('Invalid choice. Reply with a valid department number.'));
      }

      const department = departments[index];
      const doctors = await Doctor.find({
        departmentId: department._id,
        hospitalId: session.collectedData.hospitalId,
        isActive: true,
        isAvailableToday: true
      })
        .sort({ firstName: 1, lastName: 1 })
        .limit(9);

      if (!doctors.length) {
        return res.type('text/xml').send(twimlMessage('No active doctors found in this department today. Reply START to restart.'));
      }

      session.collectedData.departmentId = department._id;
      session.collectedData.departmentName = department.name;
      session.step = 'choose_doctor';
      session.options.doctors = doctors;
      saveSession(senderId, session);

      const lines = doctors.map((d, i) => `${i + 1}. Dr. ${d.firstName} ${d.lastName} (${d.specialty})`);
      return res.type('text/xml').send(
        twimlMessage(`Selected: ${department.name}\nChoose doctor:\n${lines.join('\n')}`)
      );
    }

    if (step === 'choose_doctor') {
      const doctors = session.options?.doctors || [];
      const index = parseChoice(userMsg, doctors.length);
      if (index === null) {
        return res.type('text/xml').send(twimlMessage('Invalid choice. Reply with a valid doctor number.'));
      }

      const doctor = doctors[index];
      const dates = getUpcomingDates(3);
      session.collectedData.doctorId = doctor._id;
      session.collectedData.doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
      session.collectedData.specialty = doctor.specialty;
      session.step = 'choose_date';
      session.options.dates = dates;
      saveSession(senderId, session);

      const lines = dates.map((d, i) => `${i + 1}. ${d}`);
      return res.type('text/xml').send(
        twimlMessage(`Selected: ${session.collectedData.doctorName}\nChoose date:\n${lines.join('\n')}`)
      );
    }

    if (step === 'choose_date') {
      const dates = session.options?.dates || [];
      const index = parseChoice(userMsg, dates.length);
      if (index === null) {
        return res.type('text/xml').send(twimlMessage('Invalid choice. Reply with a valid date number.'));
      }

      const selectedDate = dates[index];
      const doctor = await Doctor.findById(session.collectedData.doctorId);
      if (!doctor) {
        cleanupSession(senderId);
        return res.type('text/xml').send(twimlMessage('Doctor not found now. Please reply START to begin again.'));
      }

      const existing = await Appointment.find({
        doctorId: doctor._id,
        scheduledDate: selectedDate,
        status: { $nin: ['cancelled', 'completed', 'no-show'] }
      }).select('scheduledTime');
      const bookedTimes = new Set(existing.map((a) => a.scheduledTime));

      const duration = doctor.consultationDuration || 30;
      const slots = buildDailySlots(9, 17, duration, bookedTimes).slice(0, 8);

      if (!slots.length) {
        return res.type('text/xml').send(twimlMessage('No slots available on this date. Reply with another date number.'));
      }

      session.collectedData.scheduledDate = selectedDate;
      session.step = 'choose_slot';
      session.options.slots = slots;
      saveSession(senderId, session);

      const lines = slots.map((s, i) => `${i + 1}. ${s}`);
      return res.type('text/xml').send(twimlMessage(`Available slots on ${selectedDate}:\n${lines.join('\n')}`));
    }

    if (step === 'choose_slot') {
      const slots = session.options?.slots || [];
      const index = parseChoice(userMsg, slots.length);
      if (index === null) {
        return res.type('text/xml').send(twimlMessage('Invalid choice. Reply with a valid slot number.'));
      }

      session.collectedData.scheduledTime = slots[index];
      session.step = 'ask_problem';
      saveSession(senderId, session);
      return res.type('text/xml').send(twimlMessage('What is your main medical problem today?'));
    }

    if (step === 'ask_problem') {
      session.collectedData.problem = userMsg;
      session.history.push({ role: 'user', content: `Problem: ${userMsg}` });
      session.step = 'ask_duration';
      saveSession(senderId, session);
      return res.type('text/xml').send(twimlMessage('How long has this been happening? (example: 2 hours, 3 days)'));
    }

    if (step === 'ask_duration') {
      session.collectedData.duration = userMsg;
      session.history.push({ role: 'user', content: `Duration: ${userMsg}` });
      session.step = 'ask_comorbidities';
      saveSession(senderId, session);
      return res.type('text/xml').send(twimlMessage('Do you have long-term conditions like Diabetes, BP, Asthma, or Heart issues?'));
    }

    if (step === 'ask_comorbidities') {
      session.collectedData.comorbidities = userMsg;

      const patient = await ensurePatientByPhone(senderId);

      const conflict = await Appointment.findOne({
        doctorId: session.collectedData.doctorId,
        scheduledDate: session.collectedData.scheduledDate,
        scheduledTime: session.collectedData.scheduledTime,
        status: { $nin: ['cancelled', 'completed', 'no-show'] }
      });

      if (conflict) {
        cleanupSession(senderId);
        return res.type('text/xml').send(
          twimlMessage('That slot was just booked by someone else. Please reply START to book another slot.')
        );
      }

      const appointment = await Appointment.create({
        patientId: patient._id,
        doctorId: session.collectedData.doctorId,
        departmentId: session.collectedData.departmentId,
        scheduledDate: session.collectedData.scheduledDate,
        scheduledTime: session.collectedData.scheduledTime,
        duration: 30,
        chiefComplaint: `${session.collectedData.problem} (Duration: ${session.collectedData.duration})`,
        patientNotes: `Comorbidities: ${session.collectedData.comorbidities}`,
        appointmentType: 'consultation',
        status: 'scheduled'
      });

      const summary = [
        '✅ Slot Booked!',
        `Hospital: ${session.collectedData.hospitalName}`,
        `Department: ${session.collectedData.departmentName}`,
        `Doctor: ${session.collectedData.doctorName}`,
        `Date: ${session.collectedData.scheduledDate}`,
        `Time: ${session.collectedData.scheduledTime}`,
        `Booking ID: ${appointment._id}`,
        '',
        `Reason noted: ${session.collectedData.problem}`,
        'Please show this message at reception.'
      ].join('\n');

      cleanupSession(senderId);
      return res.type('text/xml').send(twimlMessage(summary));
    }

    cleanupSession(senderId);
    return res.type('text/xml').send(twimlMessage('Session expired. Reply START to begin booking again.'));
  } catch (error) {
    console.error('WhatsApp booking error:', error);
    cleanupSession(senderId);
    return res.type('text/xml').send(twimlMessage('Sorry, we hit a server error. Please reply START and try again.'));
  }
});

module.exports = router;
