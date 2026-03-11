/**
 * VISIT MODEL - Mongoose Schema
 * Replaces Sequelize Visit model
 */

const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
  // Relationships
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
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  triageRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TriageRecord',
    default: null
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },

  // Visit Details
  visitDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  chiefComplaint: {
    type: String,
    default: null
  },

  // Clinical Assessment
  diagnosis: {
    type: String,
    required: true
  },
  icdCodes: {
    type: [String],
    default: [],
    comment: 'Array of ICD-10 codes'
  },
  treatment: {
    type: String,
    default: null
  },
  prescriptions: {
    type: [
      {
        medicine: String,
        dosage: String,
        duration: String,
        instructions: String
      }
    ],
    default: []
  },
  testsOrdered: {
    type: [
      {
        test: String,
        reason: String,
        urgency: String
      }
    ],
    default: []
  },

  // Visit Notes
  doctorNotes: {
    type: String,
    default: null
  },
  patientInstructions: {
    type: String,
    default: null
  },

  // Follow-up
  followUpNeeded: {
    type: Boolean,
    default: false
  },
  followUpDate: {
    type: Date,
    default: null
  },
  followUpInstructions: {
    type: String,
    default: null
  },

  // Vitals Recorded During Visit
  vitalsRecorded: {
    type: {
      hr: Number,
      bp: String,
      temp: Number,
      o2: Number,
      weight: Number,
      height: Number,
      bmi: Number
    },
    default: {}
  },

  // Visit Metadata
  duration: {
    type: Number,
    default: null,
    comment: 'Duration in minutes'
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'pending-results'],
    default: 'completed'
  }
}, {
  timestamps: true,
  collection: 'visits'
});

// Indexes
visitSchema.index({ patientId: 1 });
visitSchema.index({ doctorId: 1 });
visitSchema.index({ visitDate: 1 });

module.exports = mongoose.model('Visit', visitSchema);
