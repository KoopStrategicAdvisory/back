'use strict';
const multer  = require('multer');
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { documentos } = require('../../repositories');
const { uploadBuffer } = require('../../services/s3');

// Subida en lote: en expedientes grandes, subir de a un documento a la vez
// (POST / con un solo 'file') es lento. Aqui se manda un lote de archivos
// bajo el mismo campo 'files' y comparten el resto de metadata (tipo,
// descripcion, fecha, visibilidad) — el titulo de cada uno sale de su propio
// nombre de archivo, no tiene sentido compartir un solo titulo entre varios.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 20 } });

const rules = [
  body('id_expediente').isInt({ min: 1 }).withMessage('id_expediente requerido.'),
  body('id_tipo_documento').isInt({ min: 1 }).withMessage('El tipo de documento es requerido.'),
];

function sanitizeFileName(name) {
  return String(name || 'archivo')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 180);
}

async function handler(req, res, next) {
  try {
    if (!req.files || !req.files.length) throw new AppError(400, 'Al menos un archivo es requerido.');

    const idExpediente = Number(req.body.id_expediente);
    const idTipoDocumento = Number(req.body.id_tipo_documento);
    const idEtapa = req.body.id_expediente_etapa ? Number(req.body.id_expediente_etapa) : undefined;
    const descripcion = req.body.descripcion || undefined;
    const fechaDocumento = req.body.fecha_documento || undefined;
    const visibilidadCliente = req.body.visibilidad_cliente === 'true' || req.body.visibilidad_cliente === true;

    const creados = [];
    const errores = [];
    // Cada archivo se sube y registra por separado — si uno falla a mitad del
    // lote (p.ej. un timeout de red), no se pierde el resto que ya quedo
    // subido; el que fallo se reporta aparte para reintentarlo solo.
    for (const file of req.files) {
      try {
        const safeName = sanitizeFileName(file.originalname);
        const key = `documentos/expediente-${idExpediente}/${Date.now()}-${safeName}`;
        await uploadBuffer({
          key,
          body: file.buffer,
          contentType: file.mimetype,
          metadata: { id_expediente: String(idExpediente), subido_por: String(req.user.sub) },
        });
        const row = await documentos.create({
          id_expediente: idExpediente,
          id_tipo_documento: idTipoDocumento,
          id_expediente_etapa: idEtapa,
          nombre_archivo: file.originalname,
          titulo: file.originalname,
          descripcion,
          url_storage: key,
          mime_type: file.mimetype,
          tamano_bytes: file.size,
          fecha_documento: fechaDocumento,
          visibilidad_cliente: visibilidadCliente,
        }, req.user.sub);
        creados.push(row);
      } catch (e) {
        errores.push({ nombre_archivo: file.originalname, message: e.message });
      }
    }

    res.status(creados.length ? 201 : 400).json({ creados, errores });
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/bulk',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), upload.array('files', 20), ...rules, validate],
  handler,
};
