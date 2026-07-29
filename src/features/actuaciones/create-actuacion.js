'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { actuaciones } = require('../../repositories');

const rules = [
  body('id_expediente').isInt({ min: 1 }).withMessage('id_expediente requerido.'),
  body('fecha').notEmpty().withMessage('La fecha de actuación es requerida.'),
  body('titulo').trim().notEmpty().withMessage('El título de la actuación es requerido.'),
  body('id_tipo_actuacion').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await actuaciones.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
