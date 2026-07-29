'use strict';
const { authenticate } = require('../../middleware/auth');
const { documentos } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { id_expediente, id_expediente_etapa, visibilidad_cliente, active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await documentos.findAll({
      id_expediente: id_expediente ? Number(id_expediente) : undefined,
      id_expediente_etapa: id_expediente_etapa ? Number(id_expediente_etapa) : undefined,
      visibilidad_cliente: visibilidad_cliente != null ? visibilidad_cliente === 'true' : undefined,
      active: active !== 'false',
      limit: Number(limit), offset: Number(offset),
    });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
