'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { radicadosPublicos } = require('../../repositories');
const { query } = require('express-validator');
const validate = require('../../middleware/validate');

// Lista el seguimiento vigente para la fecha solicitada, una fila por
// radicado/portal, con su constancia del día si ya fue revisado.
async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || undefined;
    const rows = await radicadosPublicos.findAllActivos({ fecha });
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/radicados',
  middleware: [authenticate, requireRoles('admin', 'lawyer'),
    query('fecha').optional().isDate({ format: 'YYYY-MM-DD', strictMode: true }), validate],
  handler,
};
