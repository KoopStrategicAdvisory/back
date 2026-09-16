'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { consultasExternas } = require('../../repositories');

const rules = [
  body('numero_radicado').trim().notEmpty().withMessage('El radicado es requerido.'),
  body('id_expediente').optional({ checkFalsy: true }).isInt({ min: 1 }),
  body('resultado').optional().isIn(['sin_movimiento', 'actuacion_nueva', 'termino_corriendo']),
  body('observacion').optional({ checkFalsy: true }).trim(),
  body('fecha_consulta').optional({ checkFalsy: true }).isISO8601(),
];

async function handler(req, res, next) {
  try {
    const row = await consultasExternas.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
