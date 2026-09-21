'use strict';
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { expedientes } = require('../../repositories');
const { getDb } = require('../../db/client');
const { renamePrefix, documentoPrefix } = require('../../services/s3');

// Este PUT se usa tanto para el formulario completo de edicion (que siempre manda
// contraparte y correo del juzgado, validados como obligatorios en el frontend) como
// para actualizaciones parciales de un solo campo (p.ej. cambiar solo id_estado_proceso
// desde el detalle del expediente) — por eso aqui solo se valida el formato de los
// campos que vengan, sin exigir que esten presentes.
const rules = [
  body('contraparte').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
    .withMessage('La contraparte no puede superar los 255 caracteres.'),
  body('correo_juzgado').optional({ checkFalsy: true }).trim().isEmail()
    .withMessage('El correo del juzgado/entidad no es válido.'),
  body('direccion_juzgado').optional({ checkFalsy: true }).trim().isLength({ max: 255 })
    .withMessage('La dirección del juzgado no puede superar los 255 caracteres.'),
];

async function handler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const before = await expedientes.findById(id);
    const row = await expedientes.update(id, req.body, req.user.sub);
    if (!row) throw new AppError(404, 'Expediente no encontrado.');

    // La carpeta en S3 se llama como el numero_de_expediente — si ese numero
    // cambio (p.ej. se corrigio un error de tipeo en año/secuencia), los
    // documentos ya subidos quedarian bajo el nombre viejo. Se renombra el
    // prefijo completo y se actualiza url_storage de cada documento afectado.
    // Best-effort: si S3 falla no se revierte el cambio del numero, solo
    // queda para corregir a mano despues.
    if (before && row.numero_de_expediente && before.numero_de_expediente !== row.numero_de_expediente) {
      try {
        const fromPrefix = `${documentoPrefix(before.numero_de_expediente)}/`;
        const toPrefix = `${documentoPrefix(row.numero_de_expediente)}/`;
        const { mapping } = await renamePrefix({ fromPrefix, toPrefix });
        if (mapping.length) {
          const db = await getDb();
          for (const m of mapping) {
            await db.query('UPDATE documentos SET url_storage = $1 WHERE url_storage = $2', [m.to, m.from]);
          }
        }
      } catch (e) {
        console.error('[EXPEDIENTES] no se pudo renombrar la carpeta S3 de', before.numero_de_expediente, 'a', row.numero_de_expediente, ':', e.message);
      }
    }

    res.json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'PUT', path: '/:id',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), ...rules, validate],
  handler,
};
