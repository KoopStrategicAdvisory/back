'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { consultasExternas } = require('../../repositories');

// Borra un registro de la bitacora de consultas externas — para cuando se
// marco un radicado equivocado por error (el resultado incorrecto, el
// radicado que no era, etc.) y hay que corregirlo sin que quede
// contaminando el checklist/la constancia del dia.
async function handler(req, res, next) {
  try {
    const row = await consultasExternas.remove(Number(req.params.id), req.user.sub);
    if (!row) throw new AppError(404, 'Registro no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
