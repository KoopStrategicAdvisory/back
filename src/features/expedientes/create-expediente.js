'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { expedientes } = require('../../repositories');

const rules = [
  body('numero_de_expediente').trim().notEmpty().withMessage('El número de expediente es requerido.'),
  body('id_cliente').optional().isInt({ min: 1 }),
  body('id_combo').optional().isInt({ min: 1 }),
  body('id_estado_proceso').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await expedientes.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
