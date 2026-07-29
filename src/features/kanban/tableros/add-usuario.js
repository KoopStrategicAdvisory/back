'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { kanban } = require('../../../repositories');

const rules = [body('id_usuario').isInt({ min: 1 }).withMessage('id_usuario requerido.')];

async function handler(req, res, next) {
  try {
    const row = await kanban.addUsuarioTablero(Number(req.params.id), req.body.id_usuario, req.user.sub);
    res.status(201).json(row ?? { message: 'Usuario ya en el tablero.' });
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/:id/usuarios',
  middleware: [authenticate, ...rules, validate],
  handler,
};
