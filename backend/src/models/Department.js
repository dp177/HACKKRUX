/**
 * DEPARTMENT MODEL - Mongoose Schema
 * Replaces Sequelize Department model
 */

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: null
  },
  floor: {
    type: String,
    default: null
  },
  capacity: {
    type: Number,
    default: 10,
    comment: 'Max patients in queue'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'departments'
});

departmentSchema.index({ hospitalId: 1, name: 1 });
departmentSchema.index({ hospitalId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
