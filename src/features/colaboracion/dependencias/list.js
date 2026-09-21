'use strict';
const { authenticate } = require('../../../middleware/auth');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const { id_tarea_origen, id_etapa_origen, id_tarea_destino, id_etapa_destino, active = 'true' } = req.query;
    const rows = await colaboracion.findDependencias({
      id_tarea_origen: id_tarea_origen ? Number(id_tarea_origen) : undefined,
      id_etapa_origen: id_etapa_origen ? Number(id_etapa_origen) : undefined,
      id_tarea_destino: id_tarea_destino ? Number(id_tarea_destino) : undefined,
      id_etapa_destino: id_etapa_destino ? Number(id_etapa_destino) : undefined,
      active: active !== 'false',
    });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
