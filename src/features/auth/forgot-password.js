'use strict';
const { body } = require('express-validator');
const crypto   = require('crypto');
const validate = require('../../middleware/validate');
const { users } = require('../../repositories');

const rules = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
];

async function handler(req, res, next) {
  try {
    const user = await users.findByEmail(req.body.email);
    // Respuesta genérica para no revelar si el email existe
    if (!user) return res.status(200).json({ message: 'Si el email existe, recibirás un enlace.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await users.setPasswordReset(user.id, token, expires);

    // TODO: enviar email con token
    console.log('[AUTH] password reset token for', user.email, ':', token);

    return res.status(200).json({ message: 'Si el email existe, recibirás un enlace.' });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/forgot-password', middleware: [...rules, validate], handler };
