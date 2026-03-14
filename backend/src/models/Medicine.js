/**
 * MEDICINE MODEL - Searchable medicine catalog for prescriptions.
 */

const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genericName: {
    type: String,
    default: null,
    trim: true
  },
  dosageForms: {
    type: [String],
    default: []
  },
  strength: {
    type: [String],
    default: []
  },
  manufacturer: {
    type: String,
    default: null,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'medicines'
});

medicineSchema.index({ name: 'text', genericName: 'text' });
medicineSchema.index({ name: 1 });
medicineSchema.index({ isActive: 1 });

module.exports = mongoose.model('Medicine', medicineSchema);
