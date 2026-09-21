'use strict';
const { authenticate } = require('../../middleware/auth');
const { iterProcesal } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { id_combo, active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await iterProcesal.findAll({
      id_combo: id_combo ? Number(id_combo) : undefined,
      active: active !== 'false',
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
