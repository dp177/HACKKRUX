/**
 * VITALSIGNRECORD MODEL - Mongoose Schema
 * Replaces Sequelize VitalSignRecord model
 */

const mongoose = require('mongoose');

const vitalSignRecordSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visit',
    default: null
  },

  // Vital Signs
  bloodPressureSystolic: {
    type: Number,
    default: null
  },
  bloodPressureDiastolic: {
    type: Number,
    default: null
  },
  heartRate: {
    type: Number,
    default: null
  },
  temperature: {
    type: Number,
    default: null,
    comment: 'In Celsius'
  },
  respiratoryRate: {
    type: Number,
    default: null
  },
  oxygenSaturation: {
    type: Number,
    default: null,
    comment: 'SpO2 percentage'
  },

  // Body Metrics
  weightKg: {
    type: Number,
    default: null
  },
  heightCm: {
    type: Number,
    default: null
  },
  bmi: {
    type: Number,
    default: null
  },

  // Pain Assessment
  painLevel: {
    type: Number,
    default: null,
    min: 0,
    max: 10
  },

  recordedBy: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'vital_sign_records'
});

// Indexes
vitalSignRecordSchema.index({ patientId: 1 });
vitalSignRecordSchema.index({ createdAt: 1 });

module.exports = mongoose.model('VitalSignRecord', vitalSignRecordSchema);
