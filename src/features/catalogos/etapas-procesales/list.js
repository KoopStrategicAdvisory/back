'use strict';
const { authenticate } = require('../../../middleware/auth');
const { catalogos } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const rows = await catalogos.etapasProcesales.findAll({
      id_tipo_proceso: req.query.id_tipo_proceso ? Number(req.query.id_tipo_proceso) : undefined,
      active: req.query.active !== 'false',
    });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
