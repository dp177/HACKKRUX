const express = require('express');
const controller = require('./adminController');

const router = express.Router();

const { adminBasicAuth } = require('../../middleware/adminBasicAuth');
router.use(adminBasicAuth);

router.get('/onboarding/requests', controller.getOnboardingRequests);
router.get('/hospitals/overview', controller.getHospitalOverview);
router.post('/onboarding/requests/:requestId/approve', controller.approveOnboardingRequest);
router.post('/onboarding/requests/:requestId/reject', controller.rejectOnboardingRequest);

module.exports = router;
