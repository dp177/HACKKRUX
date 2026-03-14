const onboardingService = require('../hospital-onboarding/hospitalOnboardingService');
const { Hospital, Department, Doctor } = require('../../models');

async function listOnboardingRequests(status) {
  return onboardingService.listOnboardingRequests(status);
}

async function approveOnboardingRequest(requestId, payload) {
  return onboardingService.approveOnboardingRequest(requestId, payload);
}

async function rejectOnboardingRequest(requestId, payload) {
  return onboardingService.rejectOnboardingRequest(requestId, payload);
}

async function listHospitalOverview() {
  const [hospitals, departmentCounts, doctorCounts] = await Promise.all([
    Hospital.find({}).sort({ createdAt: -1 }).lean(),
    Department.aggregate([
      {
        $group: {
          _id: '$hospitalId',
          count: { $sum: 1 }
        }
      }
    ]),
    Doctor.aggregate([
      {
        $match: {
          hospitalId: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$hospitalId',
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const departmentsByHospitalId = new Map(
    departmentCounts.map((item) => [String(item._id), item.count])
  );
  const doctorsByHospitalId = new Map(
    doctorCounts.map((item) => [String(item._id), item.count])
  );

  return hospitals.map((hospital) => {
    const hospitalId = String(hospital._id);

    return {
      id: hospitalId,
      name: hospital.name,
      code: hospital.code,
      city: hospital.city || null,
      state: hospital.state || null,
      isActive: Boolean(hospital.isActive),
      departmentCount: departmentsByHospitalId.get(hospitalId) || 0,
      doctorCount: doctorsByHospitalId.get(hospitalId) || 0,
      createdAt: hospital.createdAt
    };
  });
}

module.exports = {
  listOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
  listHospitalOverview
};
