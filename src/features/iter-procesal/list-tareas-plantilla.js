'use strict';
const { authenticate } = require('../../middleware/auth');
const { iterProcesal } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await iterProcesal.findTareasByIter(Number(req.params.id), { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/tareas', middleware: [authenticate], handler };
