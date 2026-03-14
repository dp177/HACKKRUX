/**
 * PRESCRIPTION MODEL - Consultation prescription record.
 */

const mongoose = require('mongoose');

const prescriptionMedicineSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    default: null
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    default: null,
    trim: true
  },
  frequency: {
    type: String,
    default: null,
    trim: true
  },
  duration: {
    type: String,
    default: null,
    trim: true
  },
  instructions: {
    type: String,
    default: null,
    trim: true
  }
}, { _id: false });

const prescriptionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  consultationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Queue',
    required: true
  },
  form: {
    diagnosis: { type: String, default: null, trim: true },
    temperature: { type: String, default: null, trim: true },
    bloodPressure: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true }
  },
  medicines: {
    type: [prescriptionMedicineSchema],
    default: []
  },
  remarks: {
    type: String,
    default: null,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'prescriptions'
});

prescriptionSchema.index({ patientId: 1, createdAt: -1 });
prescriptionSchema.index({ doctorId: 1, createdAt: -1 });
prescriptionSchema.index({ consultationId: 1 }, { unique: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
