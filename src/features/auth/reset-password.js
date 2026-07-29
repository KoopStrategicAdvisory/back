'use strict';
const { body } = require('express-validator');
const bcrypt   = require('bcrypt');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { getDb } = require('../../db/client');
const { users } = require('../../repositories');

const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const rules = [
  body('token').notEmpty().withMessage('Token requerido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
];

async function handler(req, res, next) {
  try {
    const { token, password } = req.body;
    const db = await getDb();
    const { rows } = await db.query(
      `SELECT id FROM users
       WHERE password_reset_token = $1 AND password_reset_expires > now() AND active = TRUE`,
      [token]
    );
    if (!rows.length) throw new AppError(400, 'Token inválido o expirado.');

    const userId = rows[0].id;
    const password_hash = await bcrypt.hash(password, ROUNDS);
    await users.updatePassword(userId, password_hash, userId);

    return res.status(200).json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/reset-password', middleware: [...rules, validate], handler };
