'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { expedientes } = require('../../repositories');

const rules = [
  body('numero_de_expediente').trim().notEmpty().withMessage('El número de expediente es requerido.'),
  body('id_cliente').optional().isInt({ min: 1 }),
  // La columna es NOT NULL en el esquema (expediente.id_tipo_proc_subtipo_proc_tipo_pre);
  // antes se validaba un campo 'id_combo' que el repositorio nunca lee.
  body('id_tipo_proc_subtipo_proc_tipo_pre').isInt({ min: 1 })
    .withMessage('La materia (tipo de proceso/subtipo/pretensión) es requerida.'),
  body('id_estado_proceso').optional().isInt({ min: 1 }),
];

async function handler(req, res, next) {
  try {
    const row = await expedientes.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
