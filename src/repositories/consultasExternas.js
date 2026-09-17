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
      COALESCE(e.contraparte, cp.nombre) AS nombre_contraparte,
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

// fecha_consulta::text evita cualquier ambiguedad de zona horaria al
// convertir un DATE de Postgres a JS Date (el driver lo arma en la
// medianoche de la zona horaria del proceso, no en UTC) — aqui se necesita
// el texto exacto 'YYYY-MM-DD' tal cual quedo guardado, sin reinterpretar.
async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT *, fecha_consulta::text AS fecha_consulta_text FROM consulta_externa_diaria WHERE id = $1`, [id]
  );
  return rows[0] ?? null;
}

// Esta bitacora no tiene columna 'active' (no sigue el patron de borrado
// logico del resto del sistema) — es un registro de auditoria de que se
// reviso un proceso, no una entidad de negocio con historial que conservar.
// Si alguien marco un radicado equivocado por error EL MISMO DIA, se borra
// de verdad — los dias anteriores quedan fijos (ver delete-consulta.js).
async function remove(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM consulta_externa_diaria WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { create, findByFecha, findById, remove };
