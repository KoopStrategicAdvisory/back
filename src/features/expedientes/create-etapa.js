'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { expedientes } = require('../../repositories');

const rules = [
  body('id_etapa_procesal').optional().isInt({ min: 1 }),
  body('id_estado_etapa').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await expedientes.createEtapa(Number(req.params.id), req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/etapas',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
