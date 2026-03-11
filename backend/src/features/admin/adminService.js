const onboardingService = require('../hospital-onboarding/hospitalOnboardingService');

async function listOnboardingRequests(status) {
  return onboardingService.listOnboardingRequests(status);
}

async function approveOnboardingRequest(requestId, payload) {
  return onboardingService.approveOnboardingRequest(requestId, payload);
}

async function rejectOnboardingRequest(requestId, payload) {
  return onboardingService.rejectOnboardingRequest(requestId, payload);
}

module.exports = {
  listOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest
};
