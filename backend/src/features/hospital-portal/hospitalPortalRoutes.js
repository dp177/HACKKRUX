const express = require('express');
const controller = require('./hospitalPortalController');
const portalService = require('./hospitalPortalService');

const router = express.Router();

router.post('/auth/login', controller.login);

router.use(async (req, res, next) => {
  try {
    await portalService.authenticateHospitalStaff(req);
    return next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

router.post('/departments', controller.createDepartment);
router.post('/doctors', controller.createDoctor);
router.get('/doctors', controller.getDoctors);

module.exports = router;
