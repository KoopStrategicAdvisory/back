'use strict';
const { authenticate, requireRoles } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { catalogos } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await catalogos.tipoProcSubtipo.softDelete(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'No encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin')],
  handler,
};
