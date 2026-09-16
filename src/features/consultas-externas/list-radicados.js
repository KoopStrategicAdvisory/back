'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const { consultasExternas } = require('../../repositories');

// Lista los expedientes activos con radicado de despacho (lo unico que se
// puede de verdad buscar en un portal externo), marcando si ya se reviso
// hoy — esto es el "checklist" diario: lo pendiente queda primero.
async function handler(req, res, next) {
  try {
    const fecha = req.query.fecha || undefined;
    const rows = await consultasExternas.findRadicadosActivos({ fecha });
    res.json({ items: rows, total: rows.length });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'GET', path: '/radicados',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
