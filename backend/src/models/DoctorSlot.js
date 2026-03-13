const mongoose = require('mongoose');

const doctorSlotSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true,
    index: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null,
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true,
    comment: 'YYYY-MM-DD'
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['AVAILABLE', 'BOOKED', 'BLOCKED'],
    default: 'AVAILABLE',
    index: true
  }
}, {
  timestamps: true,
  collection: 'doctor_slots'
});

doctorSlotSchema.index({ doctorId: 1, date: 1, startTime: 1 }, { unique: true });
doctorSlotSchema.index({ doctorId: 1, date: 1, status: 1 });

module.exports = mongoose.model('DoctorSlot', doctorSlotSchema);
