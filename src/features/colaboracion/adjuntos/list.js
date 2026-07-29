'use strict';
const { authenticate } = require('../../../middleware/auth');
const { colaboracion } = require('../../../repositories');

async function handler(req, res, next) {
  try {
    const { tipo_entidad, id_tarea, id_expediente_etapa, id_comentario, active = 'true' } = req.query;
    const rows = await colaboracion.findAdjuntos({
      tipo_entidad,
      id_tarea: id_tarea ? Number(id_tarea) : undefined,
      id_expediente_etapa: id_expediente_etapa ? Number(id_expediente_etapa) : undefined,
      id_comentario: id_comentario ? Number(id_comentario) : undefined,
      active: active !== 'false',
    });
    res.json(rows);
  } catch (err) { next(err); }
}
module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
