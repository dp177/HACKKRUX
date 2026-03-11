const express = require('express');
const controller = require('./hospitalOnboardingController');

const router = express.Router();

router.post('/requests', controller.createOnboardingRequest);

module.exports = router;
