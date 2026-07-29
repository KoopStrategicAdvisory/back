'use strict';
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { tareas } = require('../../repositories');

const rules = [body('titulo').trim().notEmpty().withMessage('El título es requerido.')];

async function handler(req, res, next) {
  try {
    const row = await tareas.createChecklistItem(
      { ...req.body, id_tarea: Number(req.params.id) },
      req.user.sub
    );
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/checklist',
  middleware: [authenticate, ...rules, validate],
  handler,
};
