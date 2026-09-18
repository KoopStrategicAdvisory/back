'use strict';
const { authenticate } = require('../../../middleware/auth');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await colaboracion.findEtiquetas({ active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
