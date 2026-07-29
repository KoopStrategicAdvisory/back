'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT n.*,
         tn.nombre AS nombre_tipo_notificacion,
         mn.nombre AS nombre_medio_notificacion,
         u.nombre  AS nombre_usuario_registra
  FROM notificaciones n
  LEFT JOIN tipo_notificacion tn  ON tn.id = n.id_tipo_notificacion
  LEFT JOIN medio_notificacion mn ON mn.id = n.id_medio_notificacion
  LEFT JOIN users u               ON u.id  = n.id_usuario_registra
`;

async function findAll({ id_expediente, id_expediente_etapa, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['n.active = $1'];
  if (id_expediente)       { vals.push(id_expediente);       conds.push(`n.id_expediente = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`n.id_expediente_etapa = $${vals.length}`); }
  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY n.fecha_vencimiento ASC NULLS LAST LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE n.id = $1`, [id]);
  return rows[0] ?? null;
}

async function findProximasVencer(diasAntes = 5) {
  const db = await getDb();
  const { rows } = await db.query(`
    ${BASE_SELECT}
    WHERE n.active = TRUE
      AND n.fecha_vencimiento BETWEEN now() AND now() + ($1 || ' days')::INTERVAL
    ORDER BY n.fecha_vencimiento ASC
  `, [diasAntes]);
  return rows;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO notificaciones
        (id_expediente, id_expediente_etapa, id_actuacion, id_tipo_notificacion,
         id_medio_notificacion, parte_notificada, destinatario, direccion_o_correo,
         fecha_realizacion, fecha_surtimiento, dias_plazo, fecha_vencimiento,
         objeto_notificacion, estado, constancia_url, observaciones, id_usuario_registra)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      data.id_expediente,
      data.id_expediente_etapa ?? null,
      data.id_actuacion ?? null,
      data.id_tipo_notificacion ?? null,
      data.id_medio_notificacion ?? null,
      data.parte_notificada ?? null,
      data.destinatario ?? null,
      data.direccion_o_correo ?? null,
      data.fecha_realizacion ?? null,
      data.fecha_surtimiento ?? null,
      data.dias_plazo ?? null,
      data.fecha_vencimiento ?? null,
      data.objeto_notificacion ?? null,
      data.estado ?? null,
      data.constancia_url ?? null,
      data.observaciones ?? null,
      userId,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'id_tipo_notificacion','id_medio_notificacion','parte_notificada','destinatario',
      'direccion_o_correo','fecha_realizacion','fecha_surtimiento','dias_plazo',
      'fecha_vencimiento','objeto_notificacion','estado','constancia_url','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE notificaciones SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE notificaciones SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { findAll, findById, findProximasVencer, create, update, softDelete };
