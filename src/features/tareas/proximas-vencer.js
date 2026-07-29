'use strict';
const { authenticate } = require('../../middleware/auth');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const dias = Number(req.query.dias ?? 7);
    const rows = await tareas.findProximasVencer(dias);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/proximas-vencer', middleware: [authenticate], handler };
