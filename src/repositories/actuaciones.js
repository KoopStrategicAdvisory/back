'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT a.*,
         ta.nombre AS nombre_tipo_actuacion,
         u.nombre  AS nombre_usuario_registra
  FROM actuaciones a
  LEFT JOIN tipo_actuacion ta ON ta.id = a.id_tipo_actuacion
  LEFT JOIN users u           ON u.id  = a.id_usuario_registra
`;

async function findAll({ id_expediente, id_expediente_etapa, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['a.active = $1'];
  if (id_expediente)       { vals.push(id_expediente);       conds.push(`a.id_expediente = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`a.id_expediente_etapa = $${vals.length}`); }
  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY a.fecha DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO actuaciones
        (id_expediente, id_expediente_etapa, fecha, id_tipo_actuacion,
         titulo, descripcion, autoridad_emite, id_usuario_registra,
         id_documento, es_hito, url_rama_judicial)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      data.id_expediente,
      data.id_expediente_etapa ?? null,
      data.fecha,
      data.id_tipo_actuacion ?? null,
      data.titulo,
      data.descripcion ?? null,
      data.autoridad_emite ?? null,
      userId,
      data.id_documento ?? null,
      data.es_hito ?? false,
      data.url_rama_judicial ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'fecha','id_tipo_actuacion','titulo','descripcion',
      'autoridad_emite','id_documento','es_hito','url_rama_judicial','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE actuaciones SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE actuaciones SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { findAll, findById, create, update, softDelete };
