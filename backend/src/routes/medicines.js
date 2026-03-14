/**
 * MEDICINE ROUTES
 * Searchable medicine catalog for doctor prescription form.
 */

const express = require('express');
const router = express.Router();
const { Medicine } = require('../models');
const { authenticateDoctor } = require('../middleware/auth');

router.get('/', authenticateDoctor, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

    const where = { isActive: true };
    if (search) {
      where.$or = [
        { name: new RegExp(search, 'i') },
        { genericName: new RegExp(search, 'i') }
      ];
    }

    const medicines = await Medicine.find(where)
      .select('_id name genericName dosageForms strength')
      .sort({ name: 1 })
      .limit(limit);

    return res.json(medicines);
  } catch (error) {
    console.error('Error searching medicines:', error);
    return res.status(500).json({ error: 'Failed to search medicines' });
  }
});

module.exports = router;
