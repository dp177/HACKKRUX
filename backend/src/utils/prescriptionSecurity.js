const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

function normalizeDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toStableString(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableString(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${toStableString(value[key])}`).join(',')}}`;
}

function buildPrescriptionHashPayload({
  patientId,
  doctorId,
  consultationId,
  form,
  medicines,
  remarks,
  createdAt
}) {
  const normalizedMedicines = Array.isArray(medicines)
    ? medicines.map((item) => ({
      medicineId: item?.medicineId ? String(item.medicineId) : null,
      name: String(item?.name || '').trim(),
      dosage: String(item?.dosage || '').trim() || null,
      frequency: String(item?.frequency || '').trim() || null,
      duration: String(item?.duration || '').trim() || null,
      instructions: String(item?.instructions || '').trim() || null
    }))
    : [];

  return {
    patientId: String(patientId || ''),
    doctorId: String(doctorId || ''),
    consultationId: String(consultationId || ''),
    diagnosis: String(form?.diagnosis || '').trim() || null,
    temperature: String(form?.temperature || '').trim() || null,
    bloodPressure: String(form?.bloodPressure || '').trim() || null,
    notes: String(form?.notes || '').trim() || null,
    medicines: normalizedMedicines,
    remarks: String(remarks || '').trim() || null,
    createdAt: normalizeDateTime(createdAt) || new Date().toISOString()
  };
}

function generatePrescriptionHash(payload) {
  const text = toStableString(payload);
  const secret = String(process.env.PRESCRIPTION_HASH_SECRET || '').trim();
  if (secret) {
    return crypto.createHmac('sha256', secret).update(text).digest('hex');
  }
  return crypto.createHash('sha256').update(text).digest('hex');
}

function buildVerificationUrl(hash) {
  const baseUrl = String(
    process.env.PRESCRIPTION_VERIFY_BASE_URL
    || process.env.WEB_BASE_URL
    || 'http://localhost:3000'
  ).replace(/\/$/, '');

  return `${baseUrl}/verify/${encodeURIComponent(hash)}`;
}

async function generateVerificationQrDataUrl(verificationUrl) {
  return QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220
  });
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function bufferToDataUrl(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return null;
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function generatePrescriptionPdfBuffer({
  prescription,
  doctor,
  patient,
  verificationUrl,
  qrCodeDataUrl
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Prescription', { align: 'left' });
    doc.moveDown(0.5);

    doc.fontSize(11);
    doc.text(`Prescription ID: ${String(prescription._id || '')}`);
    doc.text(`Issued On: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.6);

    const patientName = patient
      ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim()
      : 'Patient';
    const doctorName = doctor
      ? `Dr. ${doctor.firstName || ''} ${doctor.lastName || ''}`.trim()
      : 'Doctor';

    doc.fontSize(12).text(`Patient: ${patientName}`);
    doc.text(`Doctor: ${doctorName}`);
    if (doctor?.licenseNumber) {
      doc.text(`Registration: ${doctor.licenseNumber}`);
    }
    doc.moveDown(0.6);

    doc.fontSize(12).text('Diagnosis', { underline: true });
    doc.fontSize(11).text(prescription?.form?.diagnosis || 'Not recorded');

    const vitals = [
      prescription?.form?.temperature ? `Temperature: ${prescription.form.temperature}` : null,
      prescription?.form?.bloodPressure ? `Blood Pressure: ${prescription.form.bloodPressure}` : null,
      prescription?.form?.notes ? `Clinical Notes: ${prescription.form.notes}` : null
    ].filter(Boolean);

    if (vitals.length) {
      doc.moveDown(0.4);
      vitals.forEach((line) => doc.text(line));
    }

    doc.moveDown(0.8);
    doc.fontSize(12).text('Medicines', { underline: true });

    if (!Array.isArray(prescription?.medicines) || !prescription.medicines.length) {
      doc.fontSize(11).text('No medicines prescribed.');
    } else {
      prescription.medicines.forEach((item, idx) => {
        const name = item?.name || 'Medicine';
        const dosage = item?.dosage || '-';
        const frequency = item?.frequency || '-';
        const duration = item?.duration || '-';
        const instructions = item?.instructions || '-';
        doc.fontSize(11).text(`${idx + 1}. ${name}`);
        doc.fontSize(10).fillColor('#374151').text(`   Dosage: ${dosage} | Frequency: ${frequency} | Duration: ${duration}`);
        doc.fontSize(10).fillColor('#374151').text(`   Instructions: ${instructions}`);
      });
      doc.fillColor('#000000');
    }

    if (prescription?.remarks) {
      doc.moveDown(0.6);
      doc.fontSize(12).text('Remarks', { underline: true });
      doc.fontSize(11).text(prescription.remarks);
    }

    const signatureBuffer = dataUrlToBuffer(doctor?.signatureUrl || '');
    const qrBuffer = dataUrlToBuffer(qrCodeDataUrl);

    doc.moveDown(1.2);
    const signatureY = doc.y;

    doc.fontSize(10).fillColor('#6b7280').text('Doctor Signature', 48, signatureY);
    if (signatureBuffer) {
      doc.image(signatureBuffer, 48, signatureY + 14, { fit: [150, 60], align: 'left', valign: 'center' });
    } else {
      doc.fontSize(10).fillColor('#9ca3af').text('Signature not uploaded', 48, signatureY + 32);
    }

    if (qrBuffer) {
      doc.image(qrBuffer, 420, signatureY + 8, { fit: [120, 120] });
      doc.fontSize(9).fillColor('#374151').text('Scan to verify authenticity', 410, signatureY + 132, { width: 145, align: 'center' });
    }

    doc.fontSize(9).fillColor('#6b7280').text(verificationUrl, 48, signatureY + 120, { width: 330 });

    doc.end();
  });
}

async function generatePrescriptionArtifacts({
  hashPayload,
  prescription,
  doctor,
  patient
}) {
  const hash = generatePrescriptionHash(hashPayload);
  const verificationUrl = buildVerificationUrl(hash);
  const qrCodeDataUrl = await generateVerificationQrDataUrl(verificationUrl);
  const pdfBuffer = await generatePrescriptionPdfBuffer({
    prescription,
    doctor,
    patient,
    verificationUrl,
    qrCodeDataUrl
  });

  const pdfDataUrl = bufferToDataUrl(pdfBuffer, 'application/pdf');

  return {
    hash,
    verificationUrl,
    qrCodeDataUrl,
    pdfDataUrl
  };
}

module.exports = {
  buildPrescriptionHashPayload,
  generatePrescriptionHash,
  buildVerificationUrl,
  generateVerificationQrDataUrl,
  generatePrescriptionPdfBuffer,
  generatePrescriptionArtifacts
};
