'use strict';
const { authenticate } = require('../../middleware/auth');
const { expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await expedientes.findEtapas(Number(req.params.id), { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/etapas', middleware: [authenticate], handler };
