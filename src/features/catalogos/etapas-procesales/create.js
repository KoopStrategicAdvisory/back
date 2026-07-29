'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { catalogos } = require('../../../repositories');

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('id_tipo_proceso').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await catalogos.etapasProcesales.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin'), ...rules, validate],
  handler,
};
