'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await users.update(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Usuario no encontrado.');
    const { password_hash, password_reset_token, email_verification_token, ...safe } = row;
    res.json(safe);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, requireRoles('admin')],
  handler,
};
