'use strict';
const { body } = require('express-validator');
const bcrypt   = require('bcrypt');
const validate = require('../../middleware/validate');
const { users } = require('../../repositories');

const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const rules = [
  body('nombre').trim().notEmpty().withMessage('El nombre es requerido.'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
];

async function handler(req, res, next) {
  try {
    const { nombre, email, password } = req.body;
    const existing = await users.findByEmail(email);
    if (existing) return res.status(409).json({ message: 'El email ya está registrado.' });

    const password_hash = await bcrypt.hash(password, ROUNDS);
    const user = await users.create({ nombre, email, password_hash, active: false }, null);

    return res.status(201).json({
      message: 'Registro recibido. Un administrador debe activar tu cuenta.',
      pendingActivation: true,
      user: { id: user.id, nombre: user.nombre, email: user.email, active: user.active },
    });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/register', middleware: [...rules, validate], handler };
