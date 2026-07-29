'use strict';
const { authenticate } = require('../../../middleware/auth');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const { tipo_entidad, id_tarea, id_expediente_etapa, active = 'true' } = req.query;
    const rows = await colaboracion.findComentarios({
      tipo_entidad,
      id_tarea: id_tarea ? Number(id_tarea) : undefined,
      id_expediente_etapa: id_expediente_etapa ? Number(id_expediente_etapa) : undefined,
      active: active !== 'false',
    });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
