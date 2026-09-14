'use strict';
const { body } = require('express-validator');
const crypto   = require('crypto');
const validate = require('../../middleware/validate');
const { users } = require('../../repositories');
const { sendPasswordResetEmail } = require('../../services/email');

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

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    try {
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch (e) {
      console.error('[AUTH] error enviando email de reset:', e.message);
    }

    return res.status(200).json({ message: 'Si el email existe, recibirás un enlace.' });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/forgot-password', middleware: [...rules, validate], handler };
