'use strict';
const { body } = require('express-validator');
const bcrypt   = require('bcrypt');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');

const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
];

async function handler(req, res, next) {
  try {
    const { nombre, email, password, ...rest } = req.body;
    const existing = await users.findByEmail(email);
    if (existing) throw new AppError(409, 'El email ya está registrado.');

    const password_hash = await bcrypt.hash(password, ROUNDS);
    const user = await users.create({ nombre, email, password_hash, ...rest, active: rest.active ?? true }, req.user.sub);

    const { password_hash: _, ...safe } = user;
    res.status(201).json(safe);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin'), ...rules, validate],
  handler,
};
