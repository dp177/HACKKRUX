const express = require('express');
const controller = require('./adminController');

const router = express.Router();

function parseBasicAuth(authorizationHeader) {
  const value = String(authorizationHeader || '').trim();
  if (!value.startsWith('Basic ')) return null;

  const base64 = value.slice(6).trim();
  if (!base64) return null;

  try {
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex <= 0) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function requireAdminBasicAuth(req, res, next) {
  const expectedUsername = String(process.env.ADMIN_BASIC_USER || 'admin').trim();
  const expectedPassword = String(process.env.ADMIN_BASIC_PASSWORD || 'jeevaadmin123').trim();

  const parsed = parseBasicAuth(req.headers.authorization);
  const valid = parsed && parsed.username === expectedUsername && parsed.password === expectedPassword;

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Jeeva Admin"');
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  return next();
}

router.use(requireAdminBasicAuth);

router.get('/onboarding/requests', controller.getOnboardingRequests);
router.get('/hospitals/overview', controller.getHospitalOverview);
router.post('/onboarding/requests/:requestId/approve', controller.approveOnboardingRequest);
router.post('/onboarding/requests/:requestId/reject', controller.rejectOnboardingRequest);

module.exports = router;
