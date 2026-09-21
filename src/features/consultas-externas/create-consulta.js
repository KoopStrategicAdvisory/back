'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { consultasExternas } = require('../../repositories');

const rules = [
  body('id_radicado_publico').isInt({ min: 1 }),
  body('resultado').isIn(['sin_movimiento', 'actuacion_nueva', 'termino_corriendo']),
  body('observacion').optional({ checkFalsy: true }).trim(),
  body('fecha_consulta').optional().isDate({ format: 'YYYY-MM-DD', strictMode: true }),
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
