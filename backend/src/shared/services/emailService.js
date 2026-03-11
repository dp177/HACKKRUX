const nodemailer = require('nodemailer');

function createMailer() {
  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const secure = String(process.env.EMAIL_SECURE || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

function getSender() {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER;
}

async function sendHospitalCredentialsEmail({ to, contactName, hospitalName, loginEmail, temporaryPassword }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Hospital Portal Credentials',
    text: `Hello ${contactName},\n\nYour hospital onboarding has been approved for ${hospitalName}.\n\nPortal Login Email: ${loginEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease sign in and change your password immediately.\n\n- Platform Admin`
  });

  return { sent: true };
}

async function sendDoctorCredentialsEmail({ to, doctorName, hospitalName, loginEmail, temporaryPassword }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Doctor Portal Credentials',
    text: `Hello Dr. ${doctorName},\n\nYou have been onboarded to ${hospitalName}.\n\nLogin Email: ${loginEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease sign in and update your password.\n\n- Hospital Admin`
  });

  return { sent: true };
}

async function sendHospitalOnboardingRejectionEmail({ to, contactName, hospitalName, reviewNotes }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Hospital Onboarding Update',
    text: `Hello ${contactName},\n\nYour onboarding request for ${hospitalName} was not approved at this time.\n\nReason: ${reviewNotes || 'Not provided'}\n\nYou can update details and submit a fresh onboarding request again.\n\n- Platform Admin`
  });

  return { sent: true };
}

module.exports = {
  sendHospitalCredentialsEmail,
  sendDoctorCredentialsEmail,
  sendHospitalOnboardingRejectionEmail
};
