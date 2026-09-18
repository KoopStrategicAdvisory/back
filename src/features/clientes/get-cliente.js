'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { clientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await clientes.findById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Cliente no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
