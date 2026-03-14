/**
 * TRIAGERECORD MODEL - Mongoose Schema
 * Replaces Sequelize TriageRecord model
 */

const mongoose = require('mongoose');

const triageRecordSchema = new mongoose.Schema({
  // Relationships
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },

  // Triage Assessment
  chiefComplaint: {
    type: String,
    required: true
  },
  symptomCategory: {
    type: String,
    default: null,
    comment: 'chest, abdominal, neurological, etc.'
  },

  // Risk Scores (from Python engine)
  criticalScore: {
    type: Number,
    default: null,
    comment: 'Phase 1 score (0-100)'
  },
  symptomScore: {
    type: Number,
    default: null,
    comment: 'Phase 2 score (0-50)'
  },
  contextScore: {
    type: Number,
    default: null,
    comment: 'Phase 3 score (0-40)'
  },
  vitalScore: {
    type: Number,
    default: null,
    comment: 'Phase 4 score (0-50)'
  },
  timelineScore: {
    type: Number,
    default: null,
    comment: 'Phase 5 score (0-20)'
  },
  totalRiskScore: {
    type: Number,
    required: true,
    comment: 'Final weighted score (0-100)'
  },

  // Priority
  priorityLevel: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'ROUTINE'],
    required: true
  },
  estimatedWaitMinutes: {
    type: Number,
    default: null
  },

  // Clinical Data
  redFlags: {
    type: [String],
    default: []
  },
  vitalSigns: {
    type: {
      hr: Number,
      bp: String,
      temp: Number,
      o2: Number,
      rr: Number,
      pain: Number
    },
    default: {}
  },

  // Recommendations
  recommendedSpecialty: {
    type: String,
    default: null
  },
  triageNotes: {
    type: String,
    default: null
  },
  historicalSummary: {
    type: String,
    default: null
  },
  extractedSymptoms: {
    type: [String],
    default: []
  },
  extractedComorbidities: {
    type: [String],
    default: []
  },
  onsetType: {
    type: String,
    default: null
  },
  aiSeverity: {
    type: String,
    default: null
  },
  aiAnalysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  analyzeOutput: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Queue Information
  queuePosition: {
    type: Number,
    default: null
  },

  // Assessment Completed
  assessedBy: {
    type: String,
    default: null,
    comment: 'Staff member who conducted triage'
  },
  assessmentDuration: {
    type: Number,
    default: null,
    comment: 'Time taken for triage in seconds'
  }
}, {
  timestamps: true,
  collection: 'triage_records'
});

// Indexes
triageRecordSchema.index({ patientId: 1 });
triageRecordSchema.index({ priorityLevel: 1 });
triageRecordSchema.index({ createdAt: 1 });

module.exports = mongoose.model('TriageRecord', triageRecordSchema);
