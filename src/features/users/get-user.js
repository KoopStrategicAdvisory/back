'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const id = Number(req.params.id);
    // Un usuario solo puede ver su propio perfil, admin puede ver cualquiera
    const roles = Array.isArray(req.user.roles) ? req.user.roles.map(r => String(r).toLowerCase()) : [];
    if (String(req.user.sub) !== String(id) && !roles.includes('admin'))
      throw new AppError(403, 'No autorizado.');

    const row = await users.findById(id);
    if (!row) throw new AppError(404, 'Usuario no encontrado.');

    const { password_hash, password_reset_token, email_verification_token, ...safe } = row;
    res.json(safe);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
