const QRCode = require('qrcode');

function buildHospitalDeepLink(hospitalId) {
  const baseUrl = String(process.env.HOSPITAL_QR_BASE_URL || 'https://triage.app').replace(/\/$/, '');
  return `${baseUrl}/hospital/${hospitalId}`;
}

async function generateHospitalQrDataUrl(hospitalId) {
  const deepLink = buildHospitalDeepLink(hospitalId);
  return QRCode.toDataURL(deepLink);
}

async function ensureHospitalQrCode(hospital) {
  if (!hospital) return null;
  if (hospital.qrCodeUrl) return hospital.qrCodeUrl;

  const qrCodeUrl = await generateHospitalQrDataUrl(hospital.id);
  hospital.qrCodeUrl = qrCodeUrl;
  await hospital.save();
  return qrCodeUrl;
}

module.exports = {
  buildHospitalDeepLink,
  generateHospitalQrDataUrl,
  ensureHospitalQrCode
};
