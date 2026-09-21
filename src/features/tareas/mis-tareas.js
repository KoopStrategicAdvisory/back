'use strict';
const { authenticate } = require('../../middleware/auth');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await tareas.findMisTareas(req.user.sub);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/mis-tareas', middleware: [authenticate], handler };
