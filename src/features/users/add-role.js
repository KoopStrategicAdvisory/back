'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { users } = require('../../repositories');

const rules = [body('id_rol').isInt({ min: 1 }).withMessage('id_rol requerido.')];

async function handler(req, res, next) {
  try {
    const row = await users.addRole(Number(req.params.id), req.body.id_rol, req.user.sub);
    res.status(201).json(row ?? { message: 'Rol ya asignado.' });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/roles',
  middleware: [authenticate, requireRoles('admin'), ...rules, validate],
  handler,
};
