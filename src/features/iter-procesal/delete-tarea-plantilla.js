'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { iterProcesal } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await iterProcesal.softDeleteTareaPlantilla(Number(req.params.tareaId), req.user.sub);
    if (!row) throw new AppError(404, 'Tarea plantilla no encontrada.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id/tareas/:tareaId',
  middleware: [authenticate, requireRoles('admin')],
  handler,
};
