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
        (id_expediente, numero_radicado, fecha_consulta, resultado, observacion, id_usuario)
      VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6)
      RETURNING *
    `, [
      data.id_expediente ?? null,
      data.numero_radicado,
      data.fecha_consulta ?? null,
      data.resultado ?? 'sin_movimiento',
      data.observacion ?? null,
      userId,
    ]);
    return rows[0];
  });
}

async function findByFecha(fecha) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT cd.*, e.numero_de_expediente, u.nombre AS nombre_usuario
    FROM consulta_externa_diaria cd
    LEFT JOIN expediente e ON e.id = cd.id_expediente
    LEFT JOIN users u ON u.id = cd.id_usuario
    WHERE cd.fecha_consulta = $1
    ORDER BY cd.created_at DESC
  `, [fecha]);
  return rows;
}

module.exports = { findRadicadosActivos, create, findByFecha };
