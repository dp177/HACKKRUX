const nodemailer = require('nodemailer');

function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createMailer() {
  const host = process.env.EMAIL_HOST;
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });
}

async function sendPatientCredentialsEmail({ to, patientName, loginId, temporaryPassword }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: 'Your Patient Dashboard Credentials',
    text: `Hello ${patientName},\n\nYour patient dashboard credentials are ready.\nLogin ID: ${loginId}\nPassword: ${temporaryPassword}\n\nPlease log in and change your password after first sign-in.\n\n- Hospital Desk`
  });

  return { sent: true };
}

module.exports = {
  generateTempPassword,
  sendPatientCredentialsEmail
};
