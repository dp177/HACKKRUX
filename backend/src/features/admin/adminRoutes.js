const express = require('express');
const controller = require('./adminController');

const router = express.Router();

function requireAdminOnboardingKey(req, res, next) {
  const expectedKey = String(process.env.ADMIN_ONBOARDING_KEY || '').trim();

  if (!expectedKey) {
    return res.status(500).json({ error: 'ADMIN_ONBOARDING_KEY is not configured' });
  }

  const providedKey = String(req.headers['x-admin-onboarding-key'] || '').trim();
  if (!providedKey || providedKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid admin onboarding key' });
  }

  return next();
}

router.use(requireAdminOnboardingKey);

router.get('/onboarding/requests', controller.getOnboardingRequests);
router.post('/onboarding/requests/:requestId/approve', controller.approveOnboardingRequest);
router.post('/onboarding/requests/:requestId/reject', controller.rejectOnboardingRequest);

module.exports = router;
