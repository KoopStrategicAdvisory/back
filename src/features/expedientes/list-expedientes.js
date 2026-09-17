'use strict';
const { authenticate } = require('../../middleware/auth');
const { scopeExpedientesQuery } = require('../../middleware/clientScope');
const { expedientes } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { search, id_usuario, id_cliente, id_estado_proceso, active = 'true', limit = '50', offset = '0' } = req.query;
    // req.forcedIdCliente lo pone scopeExpedientesQuery cuando el usuario
    // autenticado es solo-cliente: pisa cualquier id_cliente de la query.
    const idClienteFilter = req.forcedIdCliente ?? (id_cliente ? Number(id_cliente) : undefined);
    const [data, total] = await Promise.all([
      expedientes.findAll({
        con_radicado: req.query.con_radicado === 'true',
        search,
        id_usuario: id_usuario ? Number(id_usuario) : undefined,
        id_cliente: idClienteFilter,
        id_estado_proceso: id_estado_proceso ? Number(id_estado_proceso) : undefined,
        active: active !== 'false',
        limit: Number(limit),
        offset: Number(offset),
      }),
      expedientes.count({
        con_radicado: req.query.con_radicado === 'true',
        search,
        id_usuario: id_usuario ? Number(id_usuario) : undefined,
        id_cliente: idClienteFilter,
        id_estado_proceso: id_estado_proceso ? Number(id_estado_proceso) : undefined,
        active: active !== 'false',
      }),
    ]);
    res.json({ data, total });
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate, scopeExpedientesQuery], handler };
