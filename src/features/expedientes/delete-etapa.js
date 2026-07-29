'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await expedientes.softDeleteEtapa(Number(req.params.etapaId), req.user.sub);
    if (!row) throw new AppError(404, 'Etapa no encontrada.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id/etapas/:etapaId',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
