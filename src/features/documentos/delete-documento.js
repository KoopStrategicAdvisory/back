'use strict';
const { authenticate, requireRoles } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { documentos } = require('../../repositories');
const { deleteObject } = require('../../services/s3');

async function handler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existing = await documentos.findById(id);
    if (!existing) throw new AppError(404, 'Documento no encontrado.');
    // Antes esto solo marcaba el documento inactivo — el archivo real seguia
    // ocupando espacio en S3 para siempre, invisible desde la app (solo se
    // veia entrando directo a la consola de S3). Se borra el objeto primero:
    // si S3 falla, la fila se queda como estaba (mejor un documento "de mas"
    // que uno que desaparece de la app pero sigue vivo en S3).
    if (existing.url_storage) {
      await deleteObject({ key: existing.url_storage });
    }
    const row = await documentos.softDelete(id, req.user.sub);
    if (!row) throw new AppError(404, 'Documento no encontrado.');
    res.status(204).send();
  } catch (err) { next(err); }
}

module.exports = {
  method: 'DELETE', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer')],
  handler,
};
