'use strict';
const { authenticate } = require('../../../middleware/auth');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await kanban.findColumnas(Number(req.params.id), { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/:id/columnas', middleware: [authenticate], handler };
