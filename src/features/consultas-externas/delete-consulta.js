'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { consultasExternas } = require('../../repositories');

// en-CA da el formato YYYY-MM-DD (a diferencia de es-CO) — se necesita la
// fecha de HOY en Bogota, no en la zona horaria del servidor.
function todayBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

// Borra un registro de la bitacora de consultas externas — pero solo si es
// de HOY. Felipe pidio explicitamente que el pasado quede fijo como
// constancia (como una factura ya emitida): si de verdad revisaste un
// proceso un dia dado, borrar esa fila despues le quita valor de prueba a
// la bitacora. Un error del mismo dia si se puede corregir sin friccion.
async function handler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = await consultasExternas.findById(id);
    if (!existing) throw new AppError(404, 'Registro no encontrado.');
    if (existing.fecha_consulta_text !== todayBogota()) {
      throw new AppError(400, 'Solo se pueden eliminar registros del día de hoy — los de días anteriores quedan fijos como constancia.');
    }
    const row = await consultasExternas.remove(id, req.user.sub);
    if (!row) throw new AppError(404, 'Registro no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
