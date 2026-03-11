/**
 * DOCTOR MODEL - Mongoose Schema
 * Replaces Sequelize Doctor model
 */

const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },

  // Professional Information
  specialty: {
    type: String,
    required: true
  },
  practiceType: {
    type: String,
    enum: ['hospital'],
    default: 'hospital'
  },
  licenseNumber: {
    type: String,
    unique: true
  },
  yearsOfExperience: {
    type: Number,
    default: 0
  },
  qualifications: {
    type: String,
    default: null
  },

  // Hospital/Clinic Association
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  clinicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clinic',
    default: null
  },
  clinicName: {
    type: String,
    default: null
  },
  clinicAddress: {
    type: String,
    default: null
  },

  // Scheduling
  consultationDuration: {
    type: Number,
    default: 30,
    comment: 'Default appointment duration in minutes'
  },
  availableSlots: {
    type: Map,
    of: [
      {
        start: String,
        end: String,
        available: { type: Boolean, default: true }
      }
    ],
    default: new Map()
  },

  // Statistics
  totalPatientsSeen: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0.0,
    min: 0,
    max: 5
  },

  // Authentication
  passwordHash: {
    type: String,
    required: true
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailableToday: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'doctors'
});

// Indexes
doctorSchema.index({ email: 1 });
doctorSchema.index({ specialty: 1 });
doctorSchema.index({ hospitalId: 1 });
doctorSchema.index({ departmentId: 1 });

module.exports = mongoose.model('Doctor', doctorSchema);
