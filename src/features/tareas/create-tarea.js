'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { tareas } = require('../../repositories');

const rules = [
  body('titulo').trim().notEmpty().withMessage('El título es requerido.'),
  // id_expediente e id_estado_tarea son NOT NULL en el esquema (tareas.id_expediente,
  // tareas.id_estado_tarea); estaban marcados como opcionales, lo que dejaba pasar
  // la validacion y fallar despues con un 500 crudo de Postgres.
  body('id_expediente').isInt({ min: 1 }).withMessage('El expediente es requerido.'),
  body('id_expediente_etapa').optional().isInt({ min: 1 }),
  body('id_estado_tarea').isInt({ min: 1 }).withMessage('El estado de la tarea es requerido.'),
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
