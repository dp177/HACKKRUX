const mongoose = require('mongoose');

const doctorBreakSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true,
    comment: 'YYYY-MM-DD'
  },
  breakStart: {
    type: String,
    required: true
  },
  breakEnd: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
  collection: 'doctor_breaks'
});

doctorBreakSchema.index({ doctorId: 1, date: 1 });

module.exports = mongoose.model('DoctorBreak', doctorBreakSchema);
