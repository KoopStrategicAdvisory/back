'use strict';
const { getDb, withUser } = require('../db/client');

// Lista los expedientes activos con radicado de despacho (los unicos que de
// verdad se pueden buscar en un portal externo) junto con si YA se reviso
// hoy o no — esto es lo que alimenta el checklist diario en el front, para
// que quede a la vista de un vistazo que falta por revisar.
async function findRadicadosActivos({ fecha } = {}) {
  const db = await getDb();
  const hoy = fecha || new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(`
    SELECT
      e.id                          AS id_expediente,
      e.numero_de_expediente,
      e.numero_radicado_despacho,
      c.nombre                      AS nombre_cliente,
      (
        SELECT cd.id FROM consulta_externa_diaria cd
        WHERE cd.id_expediente = e.id AND cd.fecha_consulta = $1
        ORDER BY cd.created_at DESC LIMIT 1
      )                             AS ultima_consulta_hoy_id,
      (
        SELECT cd.resultado FROM consulta_externa_diaria cd
        WHERE cd.id_expediente = e.id AND cd.fecha_consulta = $1
        ORDER BY cd.created_at DESC LIMIT 1
      )                             AS ultimo_resultado_hoy
    FROM expediente e
    LEFT JOIN clientes c ON c.id = e.id_cliente
    WHERE e.active = true AND e.numero_radicado_despacho IS NOT NULL AND e.numero_radicado_despacho <> ''
    ORDER BY (
      SELECT cd.id FROM consulta_externa_diaria cd
      WHERE cd.id_expediente = e.id AND cd.fecha_consulta = $1
      LIMIT 1
    ) NULLS FIRST, e.numero_de_expediente
  `, [hoy]);
  return rows;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO consulta_externa_diaria
        (id_expediente, numero_radicado, portal_consultado, fecha_consulta, resultado, observacion, id_usuario)
      VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7)
      RETURNING *
    `, [
      data.id_expediente ?? null,
      data.numero_radicado,
      data.portal_consultado ?? null,
      data.fecha_consulta ?? null,
      data.resultado ?? 'sin_movimiento',
      data.observacion ?? null,
      userId,
    ]);
    return rows[0];
  });
}

// Trae, ademas del registro de la consulta, todo el contexto del caso que
// hace falta para que la constancia en PDF tenga sentido por si sola: las
// partes (cliente que representamos / contraparte), la materia del
// proceso y el juzgado — sin esto la constancia solo decia un numero de
// radicado suelto, sin explicar de que caso se trataba.
async function findByFecha(fecha) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT
      cd.*,
      e.numero_de_expediente,
      e.juzgado_o_autoridad_que_conoce,
      u.nombre           AS nombre_usuario,
      cli.nombre         AS nombre_cliente,
      cp.nombre          AS nombre_contraparte,
      cu.calidad         AS calidad_cliente,
      tp.nombre          AS nombre_tipo_proceso,
      sp.nombre          AS nombre_subtipo_proceso
    FROM consulta_externa_diaria cd
    LEFT JOIN expediente e ON e.id = cd.id_expediente
    LEFT JOIN users u ON u.id = cd.id_usuario
    LEFT JOIN clientes cli ON cli.id = e.id_cliente
    LEFT JOIN contraparte cp ON cp.id = e.id_contraparte
    LEFT JOIN calidad_usuario cu ON cu.id = e.id_calidad_usuario
    LEFT JOIN tipo_proc_subtipo_proc_tipo_pre combo ON combo.id = e.id_tipo_proc_subtipo_proc_tipo_pre
    LEFT JOIN tipo_proceso tp ON tp.id = combo.id_tipo_proceso
    LEFT JOIN subtipo_proceso sp ON sp.id = combo.id_subtipo_proceso
    WHERE cd.fecha_consulta = $1
    ORDER BY cd.created_at DESC
  `, [fecha]);
  return rows;
}

module.exports = { findRadicadosActivos, create, findByFecha };
