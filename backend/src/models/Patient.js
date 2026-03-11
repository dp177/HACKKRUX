/**
 * PATIENT MODEL - Mongoose Schema
 * Replaces Sequelize Patient model
 */

const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
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
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['M', 'F', 'Other', 'Prefer not to say'],
    required: true
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
    default: 'Unknown'
  },

  // Contact Information
  phone: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  address: {
    type: String,
    default: null
  },
  city: {
    type: String,
    default: null
  },
  state: {
    type: String,
    default: null
  },
  zipCode: {
    type: String,
    default: null
  },

  // Emergency Contact
  emergencyContactName: {
    type: String,
    default: null
  },
  emergencyContactPhone: {
    type: String,
    default: null
  },
  emergencyContactRelation: {
    type: String,
    default: null
  },

  // Medical Profile (JSON objects natively supported)
  allergies: {
    type: [
      {
        allergen: String,
        type: String,
        reaction: String,
        severity: String
      }
    ],
    default: []
  },
  chronicConditions: {
    type: [
      {
        condition: String,
        diagnosedDate: Date,
        severity: String,
        status: String
      }
    ],
    default: []
  },
  currentMedications: {
    type: [
      {
        name: String,
        dosage: String,
        frequency: String,
        startDate: Date
      }
    ],
    default: []
  },
  surgicalHistory: {
    type: [
      {
        procedure: String,
        date: Date,
        hospital: String,
        notes: String
      }
    ],
    default: []
  },
  familyHistory: {
    type: [
      {
        relation: String,
        condition: String,
        notes: String
      }
    ],
    default: []
  },

  // Insurance
  insuranceProvider: {
    type: String,
    default: null
  },
  insuranceId: {
    type: String,
    default: null
  },

  // Preferences
  preferredLanguage: {
    type: String,
    default: 'English'
  },

  // Authentication
  passwordHash: {
    type: String,
    default: null
  },

  // Privacy & Consent
  consentToTreatment: {
    type: Boolean,
    default: true
  },
  consentToShareData: {
    type: Boolean,
    default: false
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  lastVisitDate: {
    type: Date,
    default: null
  },
  totalVisits: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'patients'
});

// Indexes
patientSchema.index({ phone: 1 });
patientSchema.index({ email: 1 });
patientSchema.index({ lastName: 1, firstName: 1 });

module.exports = mongoose.model('Patient', patientSchema);
