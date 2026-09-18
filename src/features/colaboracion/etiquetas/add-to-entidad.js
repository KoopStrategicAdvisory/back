'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../../middleware/auth');
const validate = require('../../../middleware/validate');
const { colaboracion } = require('../../../repositories');

const rules = [
  body('tipo_entidad').notEmpty().withMessage('tipo_entidad requerido.'),
  body('id_etiqueta').isInt({ min: 1 }).withMessage('id_etiqueta requerido.'),
];

async function handler(req, res, next) {
  try {
    const row = await colaboracion.addEtiquetaEntidad(req.body, req.user.sub);
    res.status(201).json(row ?? { message: 'Etiqueta ya asignada.' });
  } catch (err) { next(err); }
}
module.exports = {
  method: 'POST', path: '/entidad',
  middleware: [authenticate, ...rules, validate],
  handler,
};
