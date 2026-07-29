'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { financiero } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await financiero.findHonorarioById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Honorario no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
