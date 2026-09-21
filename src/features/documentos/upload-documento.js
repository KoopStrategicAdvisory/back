'use strict';
const multer  = require('multer');
const { body } = require('express-validator');
const { authenticate, requireRoles } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../errors/AppError');
const { documentos, expedientes } = require('../../repositories');
const { uploadBuffer, documentoPrefix } = require('../../services/s3');

// Antes este endpoint solo creaba la fila en `documentos` esperando que el
// cliente ya hubiera subido el archivo a algun lado y mandara 'url_storage'
// a mano — no habia ningun sitio real que hiciera esa subida (el unico
// servicio S3 del proyecto solo lo usaban rutas muertas de la version Mongo,
// nunca montadas en index.js). Aqui se sube el archivo de verdad: multipart
// -> buffer -> S3 (bajo una key por expediente) -> fila en `documentos` con
// la key como 'url_storage'.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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
    if (!req.file) throw new AppError(400, 'Archivo requerido.');

    const idExpediente = Number(req.body.id_expediente);
    const expediente = await expedientes.findById(idExpediente);
    if (!expediente) throw new AppError(404, 'Expediente no encontrado.');
    const safeName = sanitizeFileName(req.file.originalname);
    const key = `${documentoPrefix(expediente.numero_de_expediente)}/${Date.now()}-${safeName}`;

    await uploadBuffer({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype,
      metadata: { id_expediente: String(idExpediente), subido_por: String(req.user.sub) },
    });

    const row = await documentos.create({
      id_expediente: idExpediente,
      id_tipo_documento: Number(req.body.id_tipo_documento),
      id_expediente_etapa: req.body.id_expediente_etapa ? Number(req.body.id_expediente_etapa) : undefined,
      nombre_archivo: req.file.originalname,
      titulo: req.body.titulo || undefined,
      descripcion: req.body.descripcion || undefined,
      url_storage: key,
      mime_type: req.file.mimetype,
      tamano_bytes: req.file.size,
      fecha_documento: req.body.fecha_documento || undefined,
      visibilidad_cliente: req.body.visibilidad_cliente === 'true' || req.body.visibilidad_cliente === true,
    }, req.user.sub);

    res.status(201).json(row);
  } catch (err) { next(err); }
}

module.exports = {
  method: 'POST', path: '/',
  middleware: [authenticate, requireRoles('admin', 'lawyer'), upload.single('file'), ...rules, validate],
  handler,
};
