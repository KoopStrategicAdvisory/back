'use strict';
const { getDb, withUser } = require('../db/client');

// Tabla append-only: no hay update/softDelete, solo registro y consulta.

async function findAll({ tabla, id_registro, id_usuario, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [];
  const conds = [];
  if (tabla)       { vals.push(tabla);       conds.push(`tabla = $${vals.length}`); }
  if (id_registro) { vals.push(id_registro); conds.push(`id_registro = $${vals.length}`); }
  if (id_usuario)  { vals.push(id_usuario);  conds.push(`id_usuario = $${vals.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT a.*, u.nombre AS nombre_usuario
     FROM auditoria a
     LEFT JOIN users u ON u.id = a.id_usuario
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT a.*, u.nombre AS nombre_usuario
     FROM auditoria a
     LEFT JOIN users u ON u.id = a.id_usuario
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// Registra una entrada de auditoria. Uso tipico: dentro de la misma
// transaccion que hizo el INSERT/UPDATE/DELETE que se quiere dejar trazado.
async function record({ tabla, operacion, id_registro, datos_antes = null, datos_despues = null }, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO auditoria (tabla, operacion, id_registro, id_usuario, datos_antes, datos_despues)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [tabla, operacion, id_registro, userId ?? null, datos_antes, datos_despues]
    );
    return rows[0];
  });
}

module.exports = { findAll, findById, record };
