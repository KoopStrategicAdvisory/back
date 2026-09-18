'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { clientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await clientes.softDelete(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'Cliente no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
