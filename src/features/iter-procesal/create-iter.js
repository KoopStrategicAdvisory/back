'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { iterProcesal } = require('../../repositories');

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('id_combo').optional().isInt({ min: 1 }),
  body('orden').optional().isInt({ min: 0 }),
];

async function handler(req, res, next) {
  try {
    const row = await iterProcesal.create(req.body, req.user.sub);
    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin'), ...rules, validate],
  handler,
};
