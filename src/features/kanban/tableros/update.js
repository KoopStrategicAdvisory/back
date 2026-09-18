'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await kanban.updateTablero(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Tablero no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}
module.exports = { method: 'PUT', path: '/:id', middleware: [authenticate], handler };
