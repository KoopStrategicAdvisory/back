'use strict';
const AppError = require('../../errors/AppError');
const { getDb } = require('../../db/client');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) throw new AppError(400, 'Token requerido.');

    const db = await getDb();
    const { rows } = await db.query(
      `SELECT id FROM users
       WHERE email_verification_token = $1 AND email_verification_expires > now()`,
      [token]
    );
    if (!rows.length) throw new AppError(400, 'Token inválido o expirado.');

    await users.setEmailVerified(rows[0].id);
    return res.status(200).json({ message: 'Email verificado correctamente.' });
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/verify-email', middleware: [], handler };
