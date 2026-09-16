'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { consultasExternas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
    const rows = await consultasExternas.findByFecha(fecha);
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
