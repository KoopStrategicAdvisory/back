'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { colaboracion } = require('../../../repositories');

const rules = [
  body('tipo_entidad').notEmpty().withMessage('tipo_entidad requerido.'),
  body('nombre_archivo').trim().notEmpty().withMessage('El nombre de archivo es requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await colaboracion.createAdjunto(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, ...rules, validate],
  handler,
};
