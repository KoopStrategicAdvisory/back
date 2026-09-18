'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const AppError = require('../../../errors/AppError');
const { colaboracion } = require('../../../repositories');

const rules = [body('contenido').trim().notEmpty().withMessage('El contenido es requerido.')];

async function handler(req, res, next) {
  try {
    const row = await colaboracion.updateComentario(Number(req.params.id), req.body.contenido, req.user.sub);
    if (!row) throw new AppError(404, 'Comentario no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, ...rules, validate],
  handler,
};
