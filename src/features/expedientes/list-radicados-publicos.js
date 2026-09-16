'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { radicadosPublicos } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const idExpediente = Number(req.params.id);
    const rows = await radicadosPublicos.findByExpediente(idExpediente);
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/:id/radicados-publicos',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
