'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { kanban } = require('../../../repositories');

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('orden').isInt({ min: 0 }).withMessage('El orden es requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await kanban.createColumna({ ...req.body, id_tablero: Number(req.params.id) }, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/:id/columnas',
  middleware: [authenticate, ...rules, validate],
  handler,
};
