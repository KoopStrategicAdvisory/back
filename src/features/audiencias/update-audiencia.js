'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { audiencias } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await audiencias.update(Number(req.params.id), req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Audiencia no encontrada.');
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
