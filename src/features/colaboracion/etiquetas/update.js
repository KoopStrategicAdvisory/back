'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await colaboracion.updateEtiqueta(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Etiqueta no encontrada.');
    res.json(row);
  } catch (err) { next(err); }
}
module.exports = { method: 'PUT', path: '/:id', middleware: [authenticate], handler };
