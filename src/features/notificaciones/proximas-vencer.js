'use strict';
const { authenticate } = require('../../middleware/auth');
const { notificaciones } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await notificaciones.findProximasVencer(Number(req.query.dias ?? 7));
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/proximas-vencer', middleware: [authenticate], handler };
