'use strict';
const { authenticate } = require('../../middleware/auth');
const { isClientOnly, assertOwnCliente } = require('../../middleware/clientScope');
const AppError = require('../../errors/AppError');
const { documentos, expedientes } = require('../../repositories');
const { getSignedDownloadUrl } = require('../../services/s3');

async function handler(req, res, next) {
  try {
    const doc = await documentos.findById(Number(req.params.id));
    if (!doc) throw new AppError(404, 'Documento no encontrado.');
    if (isClientOnly(req)) {
      if (!doc.visibilidad_cliente) return res.status(404).json({ message: 'Documento no encontrado.' });
      const exp = await expedientes.findById(doc.id_expediente);
      if (!assertOwnCliente(req, res, exp?.id_cliente)) return;
    }
    const expiresIn = req.query.expires ? Number(req.query.expires) : 600;
    const url = await getSignedDownloadUrl({ key: doc.url_storage, expiresIn });
    res.json({ url, expiresIn });
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/download-url', middleware: [authenticate], handler };
