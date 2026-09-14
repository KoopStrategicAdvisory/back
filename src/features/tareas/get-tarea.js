'use strict';
const { authenticate } = require('../../middleware/auth');
const { isClientOnly, assertOwnCliente } = require('../../middleware/clientScope');
const AppError = require('../../errors/AppError');
const { tareas, expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await tareas.findById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Tarea no encontrada.');
    if (isClientOnly(req)) {
      const exp = await expedientes.findById(row.id_expediente);
      if (!assertOwnCliente(req, res, exp?.id_cliente)) return;
    }
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
