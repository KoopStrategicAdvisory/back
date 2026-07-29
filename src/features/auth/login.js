'use strict';
const { body } = require('express-validator');
const bcrypt   = require('bcrypt');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');
const { signAccessToken, signRefreshToken, refreshCookieOptions } = require('./_helpers');

const rules = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('password').notEmpty().withMessage('La contraseña es requerida.'),
];

async function handler(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await users.findByEmail(email);
    if (!user) return res.status(401).json({ message: 'Credenciales inválidas.' });

    if (user.locked_until && new Date(user.locked_until) > new Date())
      return res.status(423).json({ message: 'Cuenta bloqueada temporalmente. Intenta más tarde.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = await users.incrementFailedAttempts(user.id);
      if (attempts >= 5) {
        const until = new Date(Date.now() + 15 * 60 * 1000);
        await users.lockUntil(user.id, until);
        return res.status(423).json({ message: 'Demasiados intentos fallidos. Cuenta bloqueada 15 min.' });
      }
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    if (!user.active) return res.status(403).json({ message: 'Cuenta desactivada. Contacta al administrador.' });

    await users.resetFailedAttempts(user.id);
    await users.updateLastLogin(user.id);

    const roles = Array.isArray(user.roles)
      ? user.roles.map((r) => (typeof r === 'string' ? r : r.nombre))
      : [];

    res.cookie('refreshToken', signRefreshToken(user), refreshCookieOptions());
    return res.status(200).json({
      message: 'Login correcto.',
      accessToken: signAccessToken(user),
      user: { id: user.id, nombre: user.nombre, email: user.email, roles, active: user.active },
    });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/login', middleware: [...rules, validate], handler };
