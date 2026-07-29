'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await tareas.findById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Tarea no encontrada.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
