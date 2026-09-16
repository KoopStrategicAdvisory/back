'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { expedientes } = require('../../repositories');
const { deletePrefix } = require('../../services/s3');

async function handler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const row = await expedientes.softDelete(id, req.user.sub);
    if (!row) throw new AppError(404, 'Expediente no encontrado.');
    // Borra en S3 todos los documentos del expediente (misma key-prefix que usa
    // upload-documento.js: documentos/expediente-<id>/) para que eliminar un
    // expediente desde la app tambien lo deje limpio en S3 — antes solo se
    // marcaba inactivo y los archivos quedaban huerfanos, visibles unicamente
    // entrando directo a la consola de S3. Se hace best-effort (no revierte el
    // borrado del expediente si S3 falla) para no dejar el expediente a medio
    // borrar por un problema transitorio de red/credenciales.
    try {
      await deletePrefix({ prefix: `documentos/expediente-${id}/` });
    } catch (e) {
      console.error('[EXPEDIENTES] no se pudo limpiar S3 para expediente', id, ':', e.message);
    }
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
