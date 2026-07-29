'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { tareas } = require('../../repositories');

const rules = [
  body('titulo').trim().notEmpty().withMessage('El título es requerido.'),
  body('id_expediente').optional().isInt({ min: 1 }),
  body('id_expediente_etapa').optional().isInt({ min: 1 }),
  body('id_estado_tarea').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await tareas.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
