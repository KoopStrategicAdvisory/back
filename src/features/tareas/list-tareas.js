'use strict';
const { authenticate } = require('../../middleware/auth');
const { tareas } = require('../../repositories');

async function handler(req, res, next) {
  try {
    const { id_expediente, id_expediente_etapa, id_usuario_asignado, id_estado_tarea, vencidas, active = 'true', limit = '50', offset = '0' } = req.query;
    const rows = await tareas.findAll({
      id_expediente: id_expediente ? Number(id_expediente) : undefined,
      id_expediente_etapa: id_expediente_etapa ? Number(id_expediente_etapa) : undefined,
      id_usuario_asignado: id_usuario_asignado ? Number(id_usuario_asignado) : undefined,
      id_estado_tarea: id_estado_tarea ? Number(id_estado_tarea) : undefined,
      vencidas: vencidas === 'true',
      active: active !== 'false',
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { method: 'GET', path: '/', middleware: [authenticate], handler };
