'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await kanban.softDeleteColumna(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'Columna no encontrada.');
    res.status(204).send();
  } catch (err) { next(err); }
}
module.exports = { method: 'DELETE', path: '/:id', middleware: [authenticate], handler };
