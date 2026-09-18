'use strict';
const { authenticate } = require('../../middleware/auth');
const { financiero } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const resumen = await financiero.getResumen(Number(req.params.idExpediente));
    res.json(resumen);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/resumen/:idExpediente', middleware: [authenticate], handler };
