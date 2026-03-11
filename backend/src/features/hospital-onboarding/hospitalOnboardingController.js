const onboardingService = require('./hospitalOnboardingService');

async function createOnboardingRequest(req, res) {
  try {
    const request = await onboardingService.submitOnboardingRequest(req.body);
    return res.status(201).json({
      message: 'Hospital onboarding request submitted',
      request
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = {
  createOnboardingRequest
};
