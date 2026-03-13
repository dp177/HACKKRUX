/**
 * DATABASE SETUP - Mongoose Connection
 * MongoDB models using Mongoose ODM
 * 
 * Core entities:
 * - Patients: Complete medical profiles
 * - Doctors: Provider profiles with specialties
 * - Appointments: Scheduled visits
 * - TriageRecords: Results from Python triage engine
 * - Visits: Completed visits with notes
 */

const mongoose = require('mongoose');

// Import models
const Hospital = require('./Hospital');
const Patient = require('./Patient');
const Doctor = require('./Doctor');
const Department = require('./Department');
const Appointment = require('./Appointment');
const TriageRecord = require('./TriageRecord');
const Visit = require('./Visit');
const VitalSignRecord = require('./VitalSignRecord');
const Queue = require('./Queue');
const DoctorSchedule = require('./DoctorSchedule');
const DoctorBreak = require('./DoctorBreak');
const DoctorSlot = require('./DoctorSlot');
const User = require('./User');
const WhatsAppConversation = require('./WhatsAppConversation');
const HospitalOnboardingRequest = require('../features/hospital-onboarding/hospitalOnboardingRequestModel');
const HospitalStaff = require('../features/hospital-portal/hospitalStaffModel');


// Connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/triage_db';

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('✓ MongoDB connection established');
    return true;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    return false;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('✓ MongoDB disconnected');
  } catch (error) {
    console.error('✗ MongoDB disconnect error:', error.message);
  }
}

/**
 * Health check - verify connection
 */
async function isConnected() {
  return mongoose.connection.readyState === 1;
}

// Export models and utility functions
module.exports = {
  // Models
  Hospital,
  Patient,
  Doctor,
  Department,
  Appointment,
  TriageRecord,
  Visit,
  VitalSignRecord,
  Queue,
  DoctorSchedule,
  DoctorBreak,
  DoctorSlot,
  User,
  WhatsAppConversation,
  HospitalOnboardingRequest,
  HospitalStaff,
  
  // Connection utilities
  connectDatabase,
  disconnectDatabase,
  isConnected,
  mongoose,
  
  // Mongoose utilities (for Operator usage in queries)
  ObjectId: mongoose.Types.ObjectId
};

