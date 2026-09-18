'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { audiencias } = require('../../repositories');

const rules = [
  body('id_expediente').isInt({ min: 1 }).withMessage('id_expediente requerido.'),
  body('fecha_programada').notEmpty().withMessage('La fecha programada es requerida.'),
  // tipo_audiencia es NOT NULL en el esquema (audiencias.tipo_audiencia).
  body('tipo_audiencia').trim().notEmpty().withMessage('El tipo de audiencia es requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await audiencias.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
