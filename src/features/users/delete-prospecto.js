'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { users } = require('../../repositories');

// Borrado real (no soft-delete): estas cuentas nunca se activaron, no
// tienen expedientes ni documentos — descartar un prospecto que no
// interesa no debe dejar basura permanente en la base.
async function handler(req, res, next) {
  try {
    const row = await users.hardDeletePendiente(Number(req.params.id));
    if (!row) throw new AppError(404, 'Prospecto no encontrado (o ya esta vinculado a un cliente).');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/prospectos/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
