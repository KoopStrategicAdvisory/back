'use strict';
const { authenticate } = require('../../middleware/auth');
const { isClientOnly, assertOwnCliente } = require('../../middleware/clientScope');
const AppError = require('../../errors/AppError');
const { documentos, expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const row = await documentos.findById(Number(req.params.id));
    if (!row) throw new AppError(404, 'Documento no encontrado.');
    if (isClientOnly(req)) {
      if (!row.visibilidad_cliente) return res.status(404).json({ message: 'Documento no encontrado.' });
      const exp = await expedientes.findById(row.id_expediente);
      if (!assertOwnCliente(req, res, exp?.id_cliente)) return;
    }
    res.json(row);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id', middleware: [authenticate], handler };
