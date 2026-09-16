'use strict';
const { getDb, withUser } = require('../db/client');

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO consulta_externa_diaria
        (id_expediente, id_radicado_publico, numero_radicado, portal_consultado, fecha_consulta, resultado, observacion, id_usuario)
      VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8)
      RETURNING *
    `, [
      data.id_expediente ?? null,
      data.id_radicado_publico ?? null,
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

module.exports = { create, findByFecha };
