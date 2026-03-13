/**
 * WHATSAPP BOOKING ROUTES
 * Twilio webhook flow backed by live DB data and persistent conversation history.
 */

const express = require('express');
const router = express.Router();
const {
  Hospital,
  Department,
  Doctor,
  Appointment,
  Patient,
  WhatsAppConversation
} = require('../models');

const SESSION_TTL_MS = 30 * 60 * 1000;
const GEMINI_API_KEY = process.env.WHATSAPP_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.WHATSAPP_GEMINI_MODEL || 'gemini-1.5-flash';

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

function buildFallbackQuestions(historyMessages) {
  const userTexts = historyMessages
    .filter((m) => m.role === 'user')
    .map((m) => String(m.content || '').toLowerCase())
    .join(' ');

  if (/pain|chest|pressure|breath|breathing/.test(userTexts)) {
    return [
      'Is the pain getting worse with time or spreading to arm/jaw/back?',
      'Do you have sweating, vomiting, or shortness of breath right now?'
    ];
  }

  if (/fever|cold|cough|throat/.test(userTexts)) {
    return [
      'Have you measured temperature? If yes, what was the highest value?',
      'Any breathing difficulty, chest pain, or blood in cough?'
    ];
  }

  return [
    'Could you describe the symptom severity on a scale of 1 to 10?',
    'Did anything make it better or worse since it started?'
  ];
}

async function generateNextQuestions(historyMessages, patientLanguage = 'English') {
  const fallback = buildFallbackQuestions(historyMessages);
  if (!GEMINI_API_KEY) {
    return fallback;
  }

  const transcript = historyMessages
    .slice(-14)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  const prompt = [
    'You are a medical triage assistant for WhatsApp booking.',
    `Patient language: ${patientLanguage}`,
    'Based on the conversation history, ask exactly 2 concise follow-up questions.',
    'Output must be strict JSON: {"questions":["q1","q2"]}.',
    'Keep questions safe and non-diagnostic. No treatment advice.',
    '',
    'Conversation history:',
    transcript
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) {
      return fallback;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return fallback;
    }

    if (!Array.isArray(parsed?.questions) || !parsed.questions.length) {
      return fallback;
    }

    return parsed.questions.slice(0, 2).map((q) => String(q));
  } catch {
    return fallback;
  }
}

function touchConversation(conversation) {
  conversation.lastInteractionAt = new Date();
}

function appendMessage(conversation, role, content) {
  conversation.messages.push({ role, content, createdAt: new Date() });
  touchConversation(conversation);
}

async function sendAssistant(conversation, res, message) {
  appendMessage(conversation, 'assistant', message);
  await conversation.save();
  return res.type('text/xml').send(twimlMessage(message));
}

async function expireActiveConversation(senderId) {
  const active = await WhatsAppConversation.findOne({ senderId, status: 'active' }).sort({ updatedAt: -1 });
  if (!active) return;

  active.status = 'abandoned';
  active.step = 'expired';
  touchConversation(active);
  await active.save();
}

async function getActiveConversation(senderId) {
  const conversation = await WhatsAppConversation.findOne({ senderId, status: 'active' }).sort({ updatedAt: -1 });
  if (!conversation) return null;

  if (Date.now() - new Date(conversation.lastInteractionAt).getTime() > SESSION_TTL_MS) {
    conversation.status = 'abandoned';
    conversation.step = 'expired';
    touchConversation(conversation);
    await conversation.save();
    return null;
  }

  return conversation;
}

router.post('/whatsapp-booking', async (req, res) => {
  const senderRaw = req.body?.From;
  const bodyRaw = req.body?.Body;
  const senderId = normalizePhone(senderRaw);
  const userMsg = String(bodyRaw || '').trim();
  const msgLower = userMsg.toLowerCase();

  if (!senderId) {
    return res.status(400).type('text/plain').send('Missing sender');
  }

  try {
    const patient = await ensurePatientByPhone(senderId);
    const shouldRestart = ['start', 'hi', 'hello', 'restart'].includes(msgLower);

    let conversation = await getActiveConversation(senderId);

    if (!conversation || shouldRestart) {
      await expireActiveConversation(senderId);

      const hospitals = await Hospital.find({ isActive: true }).sort({ name: 1 }).limit(9);
      if (!hospitals.length) {
        return res.type('text/xml').send(twimlMessage('No active hospitals are available right now. Please try again later.'));
      }

      const optionHospitals = hospitals.map((h) => ({ id: String(h._id), name: h.name }));

      conversation = new WhatsAppConversation({
        senderId,
        patientId: patient._id,
        status: 'active',
        step: 'choose_hospital',
        collectedData: {},
        options: { hospitals: optionHospitals },
        aiPendingQuestions: [],
        messages: []
      });

      if (userMsg) {
        appendMessage(conversation, 'user', userMsg);
      }

      const lines = optionHospitals.map((h, i) => `${i + 1}. ${h.name}`);
      return sendAssistant(
        conversation,
        res,
        `Namaste! Welcome to Jeeva.\nReply with number to choose hospital:\n${lines.join('\n')}\n\n(Reply START anytime to restart)`
      );
    }

    appendMessage(conversation, 'user', userMsg);

    const step = conversation.step;

    if (step === 'choose_hospital') {
      const hospitals = conversation.options?.hospitals || [];
      const index = parseChoice(userMsg, hospitals.length);
      if (index === null) {
        return sendAssistant(conversation, res, 'Invalid choice. Reply with a valid hospital number.');
      }

      const hospital = hospitals[index];
      const departments = await Department.find({ hospitalId: hospital.id, isActive: true }).sort({ name: 1 }).limit(9);
      if (!departments.length) {
        return sendAssistant(conversation, res, 'No departments available in this hospital. Reply START to choose another hospital.');
      }

      const optionDepartments = departments.map((d) => ({ id: String(d._id), name: d.name }));
      conversation.collectedData.hospitalId = hospital.id;
      conversation.collectedData.hospitalName = hospital.name;
      conversation.step = 'choose_department';
      conversation.options.departments = optionDepartments;

      const lines = optionDepartments.map((d, i) => `${i + 1}. ${d.name}`);
      return sendAssistant(conversation, res, `Selected: ${hospital.name}\nChoose department:\n${lines.join('\n')}`);
    }

    if (step === 'choose_department') {
      const departments = conversation.options?.departments || [];
      const index = parseChoice(userMsg, departments.length);
      if (index === null) {
        return sendAssistant(conversation, res, 'Invalid choice. Reply with a valid department number.');
      }

      const department = departments[index];
      const doctors = await Doctor.find({
        departmentId: department.id,
        hospitalId: conversation.collectedData.hospitalId,
        isActive: true,
        isAvailableToday: true
      })
        .sort({ firstName: 1, lastName: 1 })
        .limit(9);

      if (!doctors.length) {
        return sendAssistant(conversation, res, 'No active doctors found in this department today. Reply START to restart.');
      }

      const optionDoctors = doctors.map((d) => ({
        id: String(d._id),
        name: `Dr. ${d.firstName} ${d.lastName}`,
        specialty: d.specialty
      }));

      conversation.collectedData.departmentId = department.id;
      conversation.collectedData.departmentName = department.name;
      conversation.step = 'choose_doctor';
      conversation.options.doctors = optionDoctors;

      const lines = optionDoctors.map((d, i) => `${i + 1}. ${d.name} (${d.specialty})`);
      return sendAssistant(conversation, res, `Selected: ${department.name}\nChoose doctor:\n${lines.join('\n')}`);
    }

    if (step === 'choose_doctor') {
      const doctors = conversation.options?.doctors || [];
      const index = parseChoice(userMsg, doctors.length);
      if (index === null) {
        return sendAssistant(conversation, res, 'Invalid choice. Reply with a valid doctor number.');
      }

      const doctor = doctors[index];
      const dates = getUpcomingDates(3);

      conversation.collectedData.doctorId = doctor.id;
      conversation.collectedData.doctorName = doctor.name;
      conversation.collectedData.specialty = doctor.specialty;
      conversation.step = 'choose_date';
      conversation.options.dates = dates;

      const lines = dates.map((d, i) => `${i + 1}. ${d}`);
      return sendAssistant(conversation, res, `Selected: ${doctor.name}\nChoose date:\n${lines.join('\n')}`);
    }

    if (step === 'choose_date') {
      const dates = conversation.options?.dates || [];
      const index = parseChoice(userMsg, dates.length);
      if (index === null) {
        return sendAssistant(conversation, res, 'Invalid choice. Reply with a valid date number.');
      }

      const selectedDate = dates[index];
      const doctor = await Doctor.findById(conversation.collectedData.doctorId);
      if (!doctor) {
        conversation.status = 'abandoned';
        conversation.step = 'error';
        return sendAssistant(conversation, res, 'Doctor not found now. Please reply START to begin again.');
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
        return sendAssistant(conversation, res, 'No slots available on this date. Reply with another date number.');
      }

      conversation.collectedData.scheduledDate = selectedDate;
      conversation.step = 'choose_slot';
      conversation.options.slots = slots;

      const lines = slots.map((s, i) => `${i + 1}. ${s}`);
      return sendAssistant(conversation, res, `Available slots on ${selectedDate}:\n${lines.join('\n')}`);
    }

    if (step === 'choose_slot') {
      const slots = conversation.options?.slots || [];
      const index = parseChoice(userMsg, slots.length);
      if (index === null) {
        return sendAssistant(conversation, res, 'Invalid choice. Reply with a valid slot number.');
      }

      conversation.collectedData.scheduledTime = slots[index];
      conversation.step = 'ask_problem';
      return sendAssistant(conversation, res, 'What is your main medical problem today?');
    }

    if (step === 'ask_problem') {
      conversation.collectedData.problem = userMsg;
      conversation.step = 'ask_duration';
      return sendAssistant(conversation, res, 'How long has this been happening? (example: 2 hours, 3 days)');
    }

    if (step === 'ask_duration') {
      conversation.collectedData.duration = userMsg;
      const aiQuestions = await generateNextQuestions(
        conversation.messages,
        patient.preferredLanguage || 'English'
      );
      conversation.aiPendingQuestions = aiQuestions;
      conversation.step = 'ask_ai_1';
      return sendAssistant(conversation, res, `I understand. Let me ask a follow-up:\n\n${aiQuestions[0]}`);
    }

    if (step === 'ask_ai_1') {
      conversation.collectedData.aiAnswer1 = userMsg;
      conversation.step = 'ask_ai_2';
      const q2 = conversation.aiPendingQuestions?.[1] || 'Are you feeling any dizziness or weakness?';
      return sendAssistant(conversation, res, q2);
    }

    if (step === 'ask_ai_2') {
      conversation.collectedData.aiAnswer2 = userMsg;
      conversation.step = 'ask_comorbidities';
      return sendAssistant(conversation, res, 'One last thing: Do you have long-term health issues like Diabetes or Blood Pressure?');
    }

    if (step === 'ask_comorbidities') {
      conversation.collectedData.comorbidities = userMsg;

      const conflict = await Appointment.findOne({
        doctorId: conversation.collectedData.doctorId,
        scheduledDate: conversation.collectedData.scheduledDate,
        scheduledTime: conversation.collectedData.scheduledTime,
        status: { $nin: ['cancelled', 'completed', 'no-show'] }
      });

      if (conflict) {
        conversation.status = 'abandoned';
        conversation.step = 'slot_conflict';
        return sendAssistant(conversation, res, 'That slot was just booked by someone else. Please reply START to book another slot.');
      }

      const appointment = await Appointment.create({
        patientId: conversation.patientId,
        doctorId: conversation.collectedData.doctorId,
        departmentId: conversation.collectedData.departmentId,
        scheduledDate: conversation.collectedData.scheduledDate,
        scheduledTime: conversation.collectedData.scheduledTime,
        duration: 30,
        chiefComplaint: `${conversation.collectedData.problem} (Duration: ${conversation.collectedData.duration})`,
        patientNotes: [
          `Comorbidities: ${conversation.collectedData.comorbidities}`,
          `AI Follow-up 1: ${conversation.collectedData.aiAnswer1 || 'N/A'}`,
          `AI Follow-up 2: ${conversation.collectedData.aiAnswer2 || 'N/A'}`
        ].join(' | '),
        appointmentType: 'consultation',
        status: 'scheduled'
      });

      conversation.status = 'completed';
      conversation.step = 'completed';
      conversation.collectedData.appointmentId = String(appointment._id);

      const summary = [
        'Slot booked successfully.',
        `Hospital: ${conversation.collectedData.hospitalName}`,
        `Department: ${conversation.collectedData.departmentName}`,
        `Doctor: ${conversation.collectedData.doctorName}`,
        `Date: ${conversation.collectedData.scheduledDate}`,
        `Time: ${conversation.collectedData.scheduledTime}`,
        `Booking ID: ${appointment._id}`,
        '',
        `Reason noted: ${conversation.collectedData.problem}`,
        'Please show this message at reception.'
      ].join('\n');

      return sendAssistant(conversation, res, summary);
    }

    conversation.status = 'abandoned';
    conversation.step = 'expired';
    return sendAssistant(conversation, res, 'Session expired. Reply START to begin booking again.');
  } catch (error) {
    console.error('WhatsApp booking error:', error);
    return res.type('text/xml').send(twimlMessage('Sorry, we hit a server error. Please reply START and try again.'));
  }
});

router.get('/whatsapp-booking/history/:senderId', async (req, res) => {
  try {
    const senderId = normalizePhone(req.params.senderId);
    const limit = Math.min(Number(req.query.limit || 5), 20);

    const conversations = await WhatsAppConversation.find({ senderId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('patientId', 'firstName lastName phone email');

    return res.json({
      senderId,
      total: conversations.length,
      conversations: conversations.map((c) => ({
        id: c._id,
        status: c.status,
        step: c.step,
        patient: c.patientId,
        collectedData: c.collectedData,
        aiPendingQuestions: c.aiPendingQuestions,
        lastInteractionAt: c.lastInteractionAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: c.messages
      }))
    });
  } catch (error) {
    console.error('WhatsApp history error:', error);
    return res.status(500).json({ error: 'Failed to fetch WhatsApp history' });
  }
});

module.exports = router;
