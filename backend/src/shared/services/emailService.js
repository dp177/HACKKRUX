const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailLayout({ title, intro, contentHtml, footerNote }) {
  return `
  <div style="margin:0;padding:24px;background:#f3f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:18px 24px;border-bottom:1px solid #eef1f4;background:#f9fafb;">
          <div style="font-size:14px;color:#0f766e;font-weight:700;letter-spacing:0.02em;">Jeeva</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">AI Clinical Triage & Hospital Decision Support</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <h2 style="margin:0 0 10px;font-size:20px;line-height:1.3;font-weight:650;color:#0f172a;">${title}</h2>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#475569;">${intro}</p>
          ${contentHtml}
          <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">${footerNote}</p>
        </td>
      </tr>
    </table>
  </div>
  `;
}

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

  const safeContactName = escapeHtml(contactName || 'there');
  const safeHospitalName = escapeHtml(hospitalName || 'your hospital');
  const safeLoginEmail = escapeHtml(loginEmail || '');
  const safeTemporaryPassword = escapeHtml(temporaryPassword || '');

  const html = renderEmailLayout({
    title: 'Hospital Portal Credentials',
    intro: `Hello ${safeContactName},<br/>Your hospital onboarding has been approved for <strong>${safeHospitalName}</strong>.`,
    contentHtml: `
      <div style="margin:0 0 14px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
        <div style="margin-bottom:10px;font-size:12px;line-height:1.4;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Access Credentials</div>
        <div style="margin-bottom:8px;">
          <div style="font-size:12px;line-height:1.4;color:#64748b;margin-bottom:3px;">Portal Login Email</div>
          <div style="font-size:14px;line-height:1.5;font-weight:500;color:#0f172a;word-break:break-word;">${safeLoginEmail}</div>
        </div>
        <div>
          <div style="font-size:12px;line-height:1.4;color:#64748b;margin-bottom:3px;">Temporary Password</div>
          <div style="font-size:14px;line-height:1.5;font-weight:500;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safeTemporaryPassword}</div>
        </div>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#475569;">Please sign in and update your password immediately after first login.</div>
    `,
    footerNote: '- Platform Admin'
  });

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Hospital Portal Credentials',
    text: `Hello ${contactName},\n\nYour hospital onboarding has been approved for ${hospitalName}.\n\nPortal Login Email: ${loginEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease sign in and change your password immediately.\n\n- Platform Admin`,
    html
  });

  return { sent: true };
}

async function sendDoctorCredentialsEmail({ to, doctorName, hospitalName, loginEmail, temporaryPassword }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  const safeDoctorName = escapeHtml(doctorName || 'Doctor');
  const safeHospitalName = escapeHtml(hospitalName || 'your hospital');
  const safeLoginEmail = escapeHtml(loginEmail || '');
  const safeTemporaryPassword = escapeHtml(temporaryPassword || '');

  const html = renderEmailLayout({
    title: 'Doctor Portal Credentials',
    intro: `Hello Dr. ${safeDoctorName},<br/>You have been onboarded to <strong>${safeHospitalName}</strong>.`,
    contentHtml: `
      <div style="margin:0 0 14px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
        <div style="margin-bottom:10px;font-size:12px;line-height:1.4;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Access Credentials</div>
        <div style="margin-bottom:8px;">
          <div style="font-size:12px;line-height:1.4;color:#64748b;margin-bottom:3px;">Login Email</div>
          <div style="font-size:14px;line-height:1.5;font-weight:500;color:#0f172a;word-break:break-word;">${safeLoginEmail}</div>
        </div>
        <div>
          <div style="font-size:12px;line-height:1.4;color:#64748b;margin-bottom:3px;">Temporary Password</div>
          <div style="font-size:14px;line-height:1.5;font-weight:500;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safeTemporaryPassword}</div>
        </div>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#475569;">Please sign in and update your password immediately after first login.</div>
    `,
    footerNote: '- Hospital Admin'
  });

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Doctor Portal Credentials',
    text: `Hello Dr. ${doctorName},\n\nYou have been onboarded to ${hospitalName}.\n\nLogin Email: ${loginEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease sign in and update your password.\n\n- Hospital Admin`,
    html
  });

  return { sent: true };
}

async function sendHospitalOnboardingRejectionEmail({ to, contactName, hospitalName, reviewNotes }) {
  const transporter = createMailer();
  if (!transporter) {
    return { sent: false, reason: 'Email transport not configured' };
  }

  const safeContactName = escapeHtml(contactName || 'there');
  const safeHospitalName = escapeHtml(hospitalName || 'your hospital');
  const safeReviewNotes = escapeHtml(reviewNotes || 'Not provided');

  const html = renderEmailLayout({
    title: 'Hospital Onboarding Update',
    intro: `Hello ${safeContactName},<br/>Your onboarding request for <strong>${safeHospitalName}</strong> was not approved at this time.`,
    contentHtml: `
      <div style="margin:0 0 14px;padding:14px;border:1px solid #fecaca;border-radius:10px;background:#fff1f2;">
        <div style="margin-bottom:6px;font-size:12px;line-height:1.4;color:#9f1239;text-transform:uppercase;letter-spacing:0.06em;">Review Notes</div>
        <div style="font-size:14px;line-height:1.6;color:#4c0519;">${safeReviewNotes}</div>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#475569;">You can update your details and submit a fresh onboarding request.</div>
    `,
    footerNote: '- Platform Admin'
  });

  await transporter.sendMail({
    from: getSender(),
    to,
    subject: 'Hospital Onboarding Update',
    text: `Hello ${contactName},\n\nYour onboarding request for ${hospitalName} was not approved at this time.\n\nReason: ${reviewNotes || 'Not provided'}\n\nYou can update details and submit a fresh onboarding request again.\n\n- Platform Admin`,
    html
  });

  return { sent: true };
}

module.exports = {
  sendHospitalCredentialsEmail,
  sendDoctorCredentialsEmail,
  sendHospitalOnboardingRejectionEmail
};
