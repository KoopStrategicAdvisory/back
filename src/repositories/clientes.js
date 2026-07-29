'use strict';
const { getDb, withUser } = require('../db/client');

async function findAll({ active = true, search, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  let where = 'active = $1';
  if (search) {
    vals.push(`%${search}%`);
    where += ` AND (nombre ILIKE $${vals.length} OR numero_documento ILIKE $${vals.length} OR email ILIKE $${vals.length})`;
  }
  const { rows } = await db.query(
    `SELECT * FROM clientes WHERE ${where} ORDER BY nombre LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function count({ active = true, search } = {}) {
  const db = await getDb();
  const vals = [active];
  let where = 'active = $1';
  if (search) {
    vals.push(`%${search}%`);
    where += ` AND (nombre ILIKE $${vals.length} OR numero_documento ILIKE $${vals.length} OR email ILIKE $${vals.length})`;
  }
  const { rows } = await db.query(`SELECT COUNT(*)::int AS total FROM clientes WHERE ${where}`, vals);
  return rows[0].total;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM clientes WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function findByDocumento(tipo_documento, numero_documento) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM clientes WHERE tipo_documento = $1 AND numero_documento = $2`,
    [tipo_documento, numero_documento]
  );
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO clientes (nombre, tipo_persona, tipo_documento, numero_documento, email, telefono)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      data.nombre,
      data.tipo_persona ?? null,
      data.tipo_documento ?? null,
      data.numero_documento ?? null,
      data.email ?? null,
      data.telefono ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = ['nombre','tipo_persona','tipo_documento','numero_documento','email','telefono','active'];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE clientes SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE clientes SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { findAll, count, findById, findByDocumento, create, update, softDelete };
