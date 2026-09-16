'use strict';
const { getDb, withUser } = require('../db/client');

// Radicados publicos de un expediente: puede tener varios, uno por cada
// organismo externo donde exista el mismo caso (Rama Judicial, Fiscalia,
// Publicaciones Procesales, SIUGJ, SuperFinanciera...).
async function findByExpediente(idExpediente, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT * FROM expediente_radicado_publico
    WHERE id_expediente = $1 AND active = $2
    ORDER BY organismo
  `, [idExpediente, active]);
  return rows;
}

async function create(idExpediente, data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO expediente_radicado_publico (id_expediente, organismo, numero_radicado)
      VALUES ($1, $2, $3)
      ON CONFLICT (id_expediente, organismo, numero_radicado)
        DO UPDATE SET active = true
      RETURNING *
    `, [idExpediente, data.organismo, data.numero_radicado]);
    return rows[0];
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE expediente_radicado_publico SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// Todos los radicados publicos activos de expedientes activos — es lo que
// alimenta el checklist diario: una fila por CADA radicado (no por
// expediente), asi un mismo caso con radicado en Fiscalia Y Rama Judicial
// aparece como dos cosas distintas por revisar.
async function findAllActivos({ fecha } = {}) {
  const db = await getDb();
  const hoy = fecha || new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(`
    SELECT
      rp.id                AS id_radicado_publico,
      rp.organismo,
      rp.numero_radicado,
      e.id                 AS id_expediente,
      e.numero_de_expediente,
      c.nombre             AS nombre_cliente,
      (
        SELECT cd.id FROM consulta_externa_diaria cd
        WHERE cd.id_radicado_publico = rp.id AND cd.fecha_consulta = $1
        ORDER BY cd.created_at DESC LIMIT 1
      )                    AS ultima_consulta_hoy_id,
      (
        SELECT cd.resultado FROM consulta_externa_diaria cd
        WHERE cd.id_radicado_publico = rp.id AND cd.fecha_consulta = $1
        ORDER BY cd.created_at DESC LIMIT 1
      )                    AS ultimo_resultado_hoy
    FROM expediente_radicado_publico rp
    JOIN expediente e ON e.id = rp.id_expediente
    LEFT JOIN clientes c ON c.id = e.id_cliente
    WHERE rp.active = true AND e.active = true
    ORDER BY (
      SELECT cd.id FROM consulta_externa_diaria cd
      WHERE cd.id_radicado_publico = rp.id AND cd.fecha_consulta = $1
      LIMIT 1
    ) NULLS FIRST, e.numero_de_expediente, rp.organismo
  `, [hoy]);
  return rows;
}

module.exports = { findByExpediente, create, softDelete, findAllActivos };
