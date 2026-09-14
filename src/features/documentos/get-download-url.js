'use strict';
const { authenticate } = require('../../middleware/auth');
const AppError = require('../../errors/AppError');
const { documentos } = require('../../repositories');
const { getSignedDownloadUrl } = require('../../services/s3');

async function handler(req, res, next) {
  try {
    const doc = await documentos.findById(Number(req.params.id));
    if (!doc) throw new AppError(404, 'Documento no encontrado.');
    const expiresIn = req.query.expires ? Number(req.query.expires) : 600;
    const url = await getSignedDownloadUrl({ key: doc.url_storage, expiresIn });
    res.json({ url, expiresIn });
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/download-url', middleware: [authenticate], handler };
