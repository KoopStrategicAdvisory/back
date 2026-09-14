'use strict';
const { authenticate } = require('../../middleware/auth');
const { assertOwnCliente } = require('../../middleware/clientScope');
const { expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const idExpediente = Number(req.params.id);
    const exp = await expedientes.findById(idExpediente);
    if (!exp) return res.status(404).json({ message: 'Expediente no encontrado.' });
    if (!assertOwnCliente(req, res, exp.id_cliente)) return;
    const rows = await expedientes.findEtapas(idExpediente, { active: req.query.active !== 'false' });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/:id/etapas', middleware: [authenticate], handler };
