'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { kanban } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await kanban.removeUsuarioTablero(Number(req.params.id), Number(req.params.usuarioId), req.user.sub);
    if (!row) throw new AppError(404, 'Usuario no encontrado en el tablero.');
    res.status(204).send();
  } catch (err) { next(err); }
}
module.exports = {
  method: 'DELETE', path: '/:id/usuarios/:usuarioId',
  middleware: [authenticate],
  handler,
};
