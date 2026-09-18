'use strict';
const { authenticate } = require('../../../middleware/auth');
const { catalogos } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await catalogos.tipoProcSubtipo.findAll({ active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
