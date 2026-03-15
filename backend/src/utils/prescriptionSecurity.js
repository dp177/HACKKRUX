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
  if (Array.isArray(value)) return `[${value.map((v) => toStableString(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${toStableString(value[k])}`).join(',')}}`;
}

function buildPrescriptionHashPayload({ patientId, doctorId, consultationId, form, medicines, remarks, createdAt }) {
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
  return secret
    ? crypto.createHmac('sha256', secret).update(text).digest('hex')
    : crypto.createHash('sha256').update(text).digest('hex');
}

function buildVerificationUrl(hash) {
  const baseUrl = String(process.env.PRESCRIPTION_VERIFY_BASE_URL || process.env.WEB_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${baseUrl}/verify/${encodeURIComponent(hash)}`;
}

async function generateVerificationQrDataUrl(verificationUrl) {
  return QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function dataUrlToMimeType(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match ? String(match[1] || '').toLowerCase() : null;
}

function bufferToDataUrl(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return null;
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function compactLine(items) {
  return items.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
}

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

async function generatePrescriptionPdfBuffer({ prescription, doctor, patient, verificationUrl, qrCodeDataUrl }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 48;
    const right = pageWidth - 48;
    const contentWidth = right - left;
    const hospital = doctor?.hospitalId && typeof doctor.hospitalId === 'object' ? doctor.hospitalId : null;

    const patientName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim() || 'Patient';
    const doctorName = `Dr. ${doctor?.firstName || ''} ${doctor?.lastName || ''}`.trim() || 'Doctor';
    const hospitalName = hospital?.name || process.env.PRESCRIPTION_CLINIC_NAME || 'Jeeva Health Clinic';
    const hospitalAddress = compactLine([hospital?.address, hospital?.city, hospital?.state]) || process.env.PRESCRIPTION_CLINIC_ADDRESS || '-';
    const hospitalContact = compactLine([hospital?.phone ? `Ph: ${hospital.phone}` : null, hospital?.email]) || process.env.PRESCRIPTION_CLINIC_CONTACT || '-';

    doc.rect(0, 0, pageWidth, 116).fill('#2f6fa7');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('PRESCRIPTION', left, 22);
    doc.fontSize(17).text(String(hospitalName).toUpperCase(), left, 50, { width: contentWidth - 130 });
    doc.font('Helvetica').fontSize(10).text(hospitalAddress, left, 76, { width: contentWidth - 130 });
    doc.text(hospitalContact, left, 91, { width: contentWidth - 130 });
    doc.circle(right - 38, 58, 30).fill('#5f96c6');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('RX', right - 48, 53);

    let y = 134;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
    doc.text('Prescription No:', left, y);
    doc.font('Helvetica-Bold').text(String(prescription?._id || '-'), left + 92, y, { width: 250 });
    doc.font('Helvetica').text('Date:', right - 180, y);
    doc.font('Helvetica-Bold').text(new Date(prescription?.createdAt || Date.now()).toLocaleDateString('en-IN'), right - 144, y);

    y += 20;
    doc.font('Helvetica').text('Doctor:', left, y);
    doc.font('Helvetica-Bold').text(doctorName, left + 92, y, { width: 250 });
    doc.font('Helvetica').text('Reg No:', right - 180, y);
    doc.font('Helvetica-Bold').text(doctor?.licenseNumber || '-', right - 136, y, { width: 136 });

    y += 30;
    doc.rect(left, y, contentWidth, 20).fill('#e9f1fa');
    doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(10).text('PATIENT DETAILS', left + 8, y + 6);
    y += 28;

    doc.fillColor('#0f172a').font('Helvetica').fontSize(10);
    doc.text('Name:', left, y); doc.font('Helvetica-Bold').text(patientName, left + 92, y, { width: 250 });
    doc.font('Helvetica').text('Gender:', right - 180, y); doc.font('Helvetica-Bold').text(patient?.gender || '-', right - 130, y, { width: 130 });
    y += 18;
    doc.font('Helvetica').text('Age:', left, y); doc.font('Helvetica-Bold').text(calculateAge(patient?.dateOfBirth) ?? '-', left + 92, y, { width: 250 });
    doc.font('Helvetica').text('Contact:', right - 180, y); doc.font('Helvetica-Bold').text(patient?.phone || '-', right - 130, y, { width: 130 });
    y += 18;
    doc.font('Helvetica').text('Address:', left, y); doc.font('Helvetica-Bold').text(compactLine([patient?.address, patient?.city, patient?.state, patient?.zipCode]) || '-', left + 92, y, { width: contentWidth - 92 });

    y += 26;
    doc.rect(left, y, contentWidth, 20).fill('#e9f1fa');
    doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(10).text('CLINICAL SUMMARY', left + 8, y + 6);
    y += 28;

    doc.fillColor('#0f172a').font('Helvetica').fontSize(10).text('Diagnosis:', left, y);
    doc.font('Helvetica-Bold').text(prescription?.form?.diagnosis || 'Not recorded', left + 92, y, { width: contentWidth - 92 });
    y = doc.y + 6;

    const notes = [
      prescription?.form?.temperature ? `Temperature: ${prescription.form.temperature}` : null,
      prescription?.form?.bloodPressure ? `Blood Pressure: ${prescription.form.bloodPressure}` : null,
      prescription?.form?.notes ? `Clinical Notes: ${prescription.form.notes}` : null
    ].filter(Boolean);
    if (notes.length) {
      notes.forEach((line) => {
        doc.font('Helvetica').fontSize(10).fillColor('#334155').text(`- ${line}`, left, y, { width: contentWidth });
        y = doc.y + 2;
      });
    }

    y += 10;
    doc.rect(left, y, contentWidth, 20).fill('#e9f1fa');
    doc.fillColor('#1e3a5f').font('Helvetica-Bold').fontSize(10).text('MEDICATIONS', left + 8, y + 6);
    y += 28;

    const medicines = Array.isArray(prescription?.medicines) ? prescription.medicines : [];
    if (!medicines.length) {
      doc.font('Helvetica').fontSize(10).fillColor('#475569').text('No medicines prescribed.', left, y);
      y = doc.y + 8;
    } else {
      medicines.forEach((m, idx) => {
        if (y > 640) { doc.addPage(); y = 48; }
        const line = `${idx + 1}. ${m?.name || 'Medicine'}  |  ${m?.dosage || '-'}  |  ${m?.frequency || '-'}  |  ${m?.duration || '-'}  |  ${m?.instructions || '-'}`;
        doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a').text(line, left, y, { width: contentWidth });
        y = doc.y + 3;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor('#d5e2f1').stroke();
        y += 4;
      });
    }

    if (prescription?.remarks) {
      y += 8;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a5f').text('Doctor Remarks', left, y);
      y = doc.y + 4;
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(prescription.remarks, left, y, { width: contentWidth });
      y = doc.y + 8;
    }

    const footerY = Math.max(y, 680);
    doc.rect(0, footerY - 10, pageWidth, 140).fill('#f3f8ff');

    const signatureDataUrl = doctor?.signatureUrl || '';
    const signatureMimeType = String(doctor?.signatureMimeType || dataUrlToMimeType(signatureDataUrl) || '').toLowerCase();
    const signatureBuffer = ['image/png', 'image/jpeg', 'image/jpg'].includes(signatureMimeType)
      ? dataUrlToBuffer(signatureDataUrl)
      : null;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a5f').text('Doctor Signature', left, footerY + 4);
    if (signatureBuffer) {
      try {
        doc.image(signatureBuffer, left, footerY + 20, { fit: [180, 64] });
      } catch {
        doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Signature could not be rendered', left, footerY + 46);
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Signature not uploaded', left, footerY + 46);
    }

    doc.moveTo(left, footerY + 90).lineTo(left + 190, footerY + 90).lineWidth(0.8).strokeColor('#9db8d5').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#475569').text(doctorName || 'Doctor', left, footerY + 95, { width: 200 });

    const qrBuffer = dataUrlToBuffer(qrCodeDataUrl);
    if (qrBuffer) {
      doc.image(qrBuffer, right - 120, footerY + 14, { fit: [96, 96] });
      doc.font('Helvetica').fontSize(8).fillColor('#334155').text('Scan to verify authenticity', right - 130, footerY + 112, { width: 120, align: 'center' });
    }

    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Issued: ${new Date(prescription?.createdAt || Date.now()).toLocaleString('en-IN')}`, left, footerY + 112, { width: 300 });
    doc.text(`Verify: ${verificationUrl}`, left, footerY + 124, { width: 360 });

    doc.end();
  });
}

async function generatePrescriptionArtifacts({ hashPayload, prescription, doctor, patient }) {
  const hash = generatePrescriptionHash(hashPayload);
  const verificationUrl = buildVerificationUrl(hash);
  const qrCodeDataUrl = await generateVerificationQrDataUrl(verificationUrl);
  const pdfBuffer = await generatePrescriptionPdfBuffer({ prescription, doctor, patient, verificationUrl, qrCodeDataUrl });
  const pdfDataUrl = bufferToDataUrl(pdfBuffer, 'application/pdf');
  return { hash, verificationUrl, qrCodeDataUrl, pdfDataUrl };
}

module.exports = {
  buildPrescriptionHashPayload,
  generatePrescriptionHash,
  buildVerificationUrl,
  generateVerificationQrDataUrl,
  generatePrescriptionPdfBuffer,
  generatePrescriptionArtifacts
};
