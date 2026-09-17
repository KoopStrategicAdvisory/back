'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { consultasExternas } = require('../../repositories');
const { query } = require('express-validator');
const validate = require('../../middleware/validate');

async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const rows = await consultasExternas.findByFecha(fecha);
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), query('fecha').optional().isDate({ format: 'YYYY-MM-DD', strictMode: true }), validate],
  handler,
};
