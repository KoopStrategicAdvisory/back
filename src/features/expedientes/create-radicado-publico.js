'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { radicadosPublicos } = require('../../repositories');

const rules = [
  body('organismo').trim().notEmpty().withMessage('El organismo/portal es requerido.'),
  body('numero_radicado').trim().notEmpty().withMessage('El numero de radicado es requerido.'),
];

async function handler(req, res, next) {
  try {
    const idExpediente = Number(req.params.id);
    const row = await radicadosPublicos.create(idExpediente, req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/radicados-publicos',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
