'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { expedientes } = require('../../repositories');

const rules = [
  // El campo real en el esquema/repositorio es 'id_etapa' (expediente_etapas.id_etapa),
  // no 'id_etapa_procesal' — esa regla nunca validaba el campo que de verdad se usa.
  // 'orden' e 'id_estado_etapa' son NOT NULL.
  body('id_etapa').optional().isInt({ min: 1 }),
  body('orden').isInt({ min: 1 }).withMessage('El orden de la etapa es requerido.'),
  body('id_estado_etapa').isInt({ min: 1 }).withMessage('El estado de la etapa es requerido.'),
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
