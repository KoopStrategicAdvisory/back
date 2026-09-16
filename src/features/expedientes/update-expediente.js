'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { expedientes } = require('../../repositories');

// Este PUT se usa tanto para el formulario completo de edicion (que siempre manda
// contraparte y correo del juzgado, validados como obligatorios en el frontend) como
// para actualizaciones parciales de un solo campo (p.ej. cambiar solo id_estado_proceso
// desde el detalle del expediente) — por eso aqui solo se valida el formato de los
// campos que vengan, sin exigir que esten presentes.
const rules = [
  body('id_contraparte').optional().isInt({ min: 1 }),
  body('correo_juzgado').optional({ checkFalsy: true }).trim().isEmail()
    .withMessage('El correo del juzgado/entidad no es válido.'),
  body('direccion_juzgado').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
    .withMessage('La dirección del juzgado no puede superar los 255 caracteres.'),
];

async function handler(req, res, next) {
  try {
    const row = await expedientes.update(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Expediente no encontrado.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
