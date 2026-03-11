const mongoose = require('mongoose');

const hospitalOnboardingRequestSchema = new mongoose.Schema({
  hospitalName: {
    type: String,
    required: true,
    trim: true
  },
  preferredHospitalCode: {
    type: String,
    default: null,
    uppercase: true,
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
  phone: {
    type: String,
    default: null
  },
  contactName: {
    type: String,
    required: true,
    trim: true
  },
  contactEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  contactPhone: {
    type: String,
    required: true,
    trim: true
  },
  contactRole: {
    type: String,
    default: 'hospital_staff'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewNotes: {
    type: String,
    default: null
  },
  reviewedBy: {
    type: String,
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  approvedHospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null
  },
  credentialsEmailSent: {
    type: Boolean,
    default: false
  },
  credentialsEmailReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'hospital_onboarding_requests'
});

hospitalOnboardingRequestSchema.index({ status: 1, createdAt: -1 });
hospitalOnboardingRequestSchema.index({ contactEmail: 1 });

module.exports = mongoose.model('HospitalOnboardingRequest', hospitalOnboardingRequestSchema);
