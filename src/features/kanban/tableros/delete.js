'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await kanban.softDeleteTablero(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'Tablero no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}
module.exports = { method: 'DELETE', path: '/:id', middleware: [authenticate], handler };
