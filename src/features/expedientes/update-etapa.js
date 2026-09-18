'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await expedientes.updateEtapa(Number(req.params.etapaId), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Etapa no encontrada.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id/etapas/:etapaId',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
