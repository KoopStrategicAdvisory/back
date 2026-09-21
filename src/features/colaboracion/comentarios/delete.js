'use strict';
const { authenticate } = require('../../../middleware/auth');
const AppError = require('../../../errors/AppError');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const row = await colaboracion.softDeleteComentario(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'Comentario no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}
module.exports = { method: 'DELETE', path: '/:id', middleware: [authenticate], handler };
