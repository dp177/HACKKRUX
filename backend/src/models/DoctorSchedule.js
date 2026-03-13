const mongoose = require('mongoose');

const doctorScheduleSchema = new mongoose.Schema({
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
  shiftStart: {
    type: String,
    required: true
  },
  shiftEnd: {
    type: String,
    required: true
  },
  appointmentStart: {
    type: String,
    required: true
  },
  appointmentEnd: {
    type: String,
    required: true
  },
  slotDuration: {
    type: Number,
    required: true,
    min: 5,
    max: 180
  }
}, {
  timestamps: true,
  collection: 'doctor_schedules'
});

doctorScheduleSchema.index({ doctorId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorSchedule', doctorScheduleSchema);
