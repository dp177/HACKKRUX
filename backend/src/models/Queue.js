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

  // Queue Position and Status
  queuePosition: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['waiting', 'called', 'in-session', 'completed', 'cancelled'],
    default: 'waiting'
  },
  priorityLevel: {
    type: String,
    enum: ['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'ROUTINE'],
    default: 'ROUTINE'
  },

  // Times
  arrivedAt: {
    type: Date,
    required: true,
    default: Date.now
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

module.exports = mongoose.model('Queue', queueSchema);
