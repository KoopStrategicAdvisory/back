'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT d.*,
         td.nombre AS nombre_tipo_documento,
         u.nombre  AS nombre_usuario_carga
  FROM documentos d
  LEFT JOIN tipo_documento td ON td.id = d.id_tipo_documento
  LEFT JOIN users u           ON u.id  = d.id_usuario_carga
`;

async function findAll({ id_expediente, id_expediente_etapa, visibilidad_cliente, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['d.active = $1'];
  if (id_expediente)       { vals.push(id_expediente);       conds.push(`d.id_expediente = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`d.id_expediente_etapa = $${vals.length}`); }
  if (visibilidad_cliente != null) { vals.push(visibilidad_cliente); conds.push(`d.visibilidad_cliente = $${vals.length}`); }
  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY d.fecha_carga DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO documentos
        (id_expediente, id_tipo_documento, nombre_archivo, titulo, descripcion,
         url_storage, mime_type, tamano_bytes, fecha_documento,
         id_usuario_carga, id_expediente_etapa, visibilidad_cliente)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      data.id_expediente,
      data.id_tipo_documento ?? null,
      data.nombre_archivo,
      data.titulo ?? null,
      data.descripcion ?? null,
      data.url_storage ?? null,
      data.mime_type ?? null,
      data.tamano_bytes ?? null,
      data.fecha_documento ?? null,
      userId,
      data.id_expediente_etapa ?? null,
      data.visibilidad_cliente ?? false,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'id_tipo_documento','titulo','descripcion','url_storage','fecha_documento',
      'visibilidad_cliente','id_expediente_etapa','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE documentos SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE documentos SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { findAll, findById, create, update, softDelete };
