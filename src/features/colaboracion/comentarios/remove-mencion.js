'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await colaboracion.removeMencion(Number(req.params.id), Number(req.params.usuarioId), req.user.sub);
    if (!row) throw new AppError(404, 'Mención no encontrada.');
    res.status(204).send();
  } catch (err) { next(err); }
}
module.exports = {
  method: 'DELETE', path: '/:id/menciones/:usuarioId',
  middleware: [authenticate],
  handler,
};
