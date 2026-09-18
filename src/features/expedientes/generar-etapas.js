'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { expedientes } = require('../../repositories');

// Genera las etapas (y tareas ligadas) de este expediente a partir del iter
// procesal (plantilla) de su tipo/subtipo/pretension. Idempotente: se puede
// llamar varias veces sin duplicar lo que ya exista.
async function handler(req, res, next) {
  try {
    const idExpediente = Number(req.params.id);
    const result = await expedientes.generateEtapasFromPlantilla(idExpediente, req.user.sub);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/:id/generar-etapas',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
