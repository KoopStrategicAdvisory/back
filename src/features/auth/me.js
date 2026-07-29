'use strict';
const { authenticate } = require('../../middleware/auth');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const user = await users.findById(req.user.sub);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado.' });
    const { password_hash, password_reset_token, email_verification_token, ...safe } = user;
    return res.json(safe);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/me', middleware: [authenticate], handler };
