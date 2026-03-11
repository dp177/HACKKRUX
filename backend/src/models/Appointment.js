/**
 * APPOINTMENT MODEL - Mongoose Schema
 * Replaces Sequelize Appointment model
 */

const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
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
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },

  // Appointment Details
  scheduledDate: {
    type: Date,
    required: true
  },
  scheduledTime: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 30,
    comment: 'Duration in minutes'
  },

  // Reason for Visit
  chiefComplaint: {
    type: String,
    default: null
  },
  appointmentType: {
    type: String,
    enum: ['routine', 'follow-up', 'urgent', 'consultation'],
    default: 'routine'
  },

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'checked-in', 'in-progress', 'completed', 'cancelled', 'no-show'],
    default: 'scheduled'
  },

  // Check-in/Check-out
  checkInTime: {
    type: Date,
    default: null
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  actualDuration: {
    type: Number,
    default: null,
    comment: 'Actual duration in minutes'
  },

  // Notes
  patientNotes: {
    type: String,
    default: null,
    comment: 'Patient-provided notes before appointment'
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  cancellationReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'appointments'
});

// Indexes
appointmentSchema.index({ patientId: 1 });
appointmentSchema.index({ doctorId: 1 });
appointmentSchema.index({ scheduledDate: 1, scheduledTime: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
