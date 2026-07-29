'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { kanban } = require('../../../repositories');

const rules = [
  body('id_tablero').isInt({ min: 1 }).withMessage('id_tablero requerido.'),
  body('id_columna').isInt({ min: 1 }).withMessage('id_columna requerido.'),
  body('tipo_entidad').notEmpty().withMessage('tipo_entidad requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await kanban.upsertPosicion(req.body, req.user.sub);
    res.status(200).json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, ...rules, validate],
  handler,
};
