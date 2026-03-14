/**
 * QUEUE MODEL - Mongoose Schema
 * For tracking queue status and positions
 */

const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
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
  hospitalName: {
    type: String,
    default: null
  },
  departmentName: {
    type: String,
    default: null
  },

  riskScore: {
    type: Number,
    default: 0
  },
  urgencyLevel: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'ROUTINE'],
    default: 'ROUTINE'
  },
  priorityScore: {
    type: Number,
    default: 0
  },

  // Queue Position and Status
  queuePosition: {
    type: Number,
    required: true,
    default: 1
  },
  patientsAhead: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED'],
    default: 'WAITING'
  },
  priorityLevel: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'ROUTINE'],
    default: 'ROUTINE'
  },

  // Times
  joinedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  arrivedAt: {
    type: Date,
    default: null
  },
  calledAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },

  // Wait Time Calculation
  estimatedWaitMinutes: {
    type: Number,
    default: 0
  },
  waitTimeMinutes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'queues'
});

// Indexes
queueSchema.index({ patientId: 1 });
queueSchema.index({ departmentId: 1 });
queueSchema.index({ status: 1 });
queueSchema.index({ queuePosition: 1 });
queueSchema.index({ departmentId: 1, status: 1, priorityScore: -1, joinedAt: 1 });
queueSchema.index({ hospitalId: 1, departmentId: 1, status: 1 });

module.exports = mongoose.model('Queue', queueSchema);
