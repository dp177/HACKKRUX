const portalService = require('./hospitalPortalService');

async function login(req, res) {
  try {
    const data = await portalService.loginHospitalStaff(req.body.email, req.body.password);
    return res.json(data);
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}

async function createDepartment(req, res) {
  try {
    const department = await portalService.createDepartment(req.hospitalStaff, req.body);
    return res.status(201).json({
      message: 'Department created',
      department
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function createDoctor(req, res) {
  try {
    const result = await portalService.createDoctor(req.hospitalStaff, req.body);
    return res.status(201).json({
      message: 'Doctor onboarded successfully',
      ...result
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function getDoctors(req, res) {
  try {
    const doctors = await portalService.listDoctors(req.hospitalStaff);
    return res.json({ doctors });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

module.exports = {
  login,
  createDepartment,
  createDoctor,
  getDoctors
};
