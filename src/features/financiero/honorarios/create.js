'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { financiero } = require('../../../repositories');

const rules = [
  body('id_expediente').isInt({ min: 1 }).withMessage('id_expediente requerido.'),
  // honorarios.modalidad es NOT NULL con CHECK: sin esta regla, omitirla daba un
  // 500 de la base de datos en vez de un 400 claro.
  body('modalidad').isIn(['fijo', 'por_etapa', 'cuota_litis', 'por_hora', 'mixto'])
    .withMessage('La modalidad de honorarios es requerida (fijo, por_etapa, cuota_litis, por_hora o mixto).'),
  body('monto_total_pactado').optional().isFloat({ min: 0 }),
  body('moneda').optional().isLength({ min: 3, max: 3 }),
];

async function handler(req, res, next) {
  try {
    const row = await financiero.createHonorario(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
