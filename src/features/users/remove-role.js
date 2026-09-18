'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await users.removeRole(Number(req.params.id), Number(req.params.rolId), req.user.sub);
    if (!row) throw new AppError(404, 'Rol no asignado al usuario.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id/roles/:rolId',
  middleware: [authenticate, requireRoles('admin')],
  handler,
};
