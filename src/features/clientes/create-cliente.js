'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { clientes } = require('../../repositories');

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('tipo_persona').optional().isIn(['NATURAL', 'JURIDICA']),
  body('email').optional().isEmail().normalizeEmail(),
  body('tipo_documento').optional().notEmpty(),
  body('numero_documento').optional().notEmpty(),
];

async function handler(req, res, next) {
  try {
    const row = await clientes.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
