'use strict';
const { authenticate, requireRoles } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { financiero } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await financiero.updateGasto(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Gasto no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
