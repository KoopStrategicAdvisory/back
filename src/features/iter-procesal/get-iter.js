'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { iterProcesal } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await iterProcesal.findById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Iter procesal no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
