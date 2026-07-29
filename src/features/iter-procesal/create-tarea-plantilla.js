'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { iterProcesal } = require('../../repositories');

const rules = [
  body('titulo').trim().notEmpty().withMessage('El título es requerido.'),
  body('orden').optional().isInt({ min: 0 }),
];

async function handler(req, res, next) {
  try {
    const row = await iterProcesal.createTareaPlantilla(
      { ...req.body, id_iter_procesal_plantilla: Number(req.params.id) },
      req.user.sub
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/tareas',
  middleware: [authenticate, requireRoles('admin'), ...rules, validate],
  handler,
};
