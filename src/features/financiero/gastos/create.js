'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { financiero } = require('../../../repositories');

const rules = [
  body('id_expediente').isInt({ min: 1 }).withMessage('id_expediente requerido.'),
  body('fecha_gasto').notEmpty().withMessage('La fecha del gasto es requerida.'),
  body('monto').isFloat({ min: 0 }).withMessage('El monto es requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await financiero.createGasto(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
