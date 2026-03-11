const adminService = require('./adminService');

async function getOnboardingRequests(req, res) {
  try {
    const { status = 'pending' } = req.query;
    const requests = await adminService.listOnboardingRequests(status);
    return res.json({ requests });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function approveOnboardingRequest(req, res) {
  try {
    const { requestId } = req.params;
    const result = await adminService.approveOnboardingRequest(requestId, req.body);
    return res.status(201).json({
      message: 'Onboarding request approved',
      ...result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function rejectOnboardingRequest(req, res) {
  try {
    const { requestId } = req.params;
    const result = await adminService.rejectOnboardingRequest(requestId, req.body);
    return res.json({
      message: 'Onboarding request rejected',
      ...result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = {
  getOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest
};
