'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT a.*,
         u.nombre AS nombre_responsable
  FROM audiencias a
  LEFT JOIN users u ON u.id = a.id_usuario_responsable
`;

async function findAll({ id_expediente, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['a.active = $1'];
  if (id_expediente) { vals.push(id_expediente); conds.push(`a.id_expediente = $${vals.length}`); }
  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY a.fecha_programada ASC NULLS LAST LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

async function findProximas(diasAntes = 7) {
  const db = await getDb();
  const { rows } = await db.query(`
    ${BASE_SELECT}
    WHERE a.active = TRUE
      AND a.fecha_programada BETWEEN now() AND now() + ($1 || ' days')::INTERVAL
    ORDER BY a.fecha_programada ASC
  `, [diasAntes]);
  return rows;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO audiencias
        (id_expediente, id_expediente_etapa, tipo_audiencia, fecha_programada,
         modalidad, enlace_virtual, juzgado_o_autoridad, direccion_fisica,
         asistentes, id_usuario_responsable, estado, resultado,
         proxima_fecha, id_acta_documento, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      data.id_expediente,
      data.id_expediente_etapa ?? null,
      data.tipo_audiencia ?? null,
      data.fecha_programada ?? null,
      data.modalidad ?? null,
      data.enlace_virtual ?? null,
      data.juzgado_o_autoridad ?? null,
      data.direccion_fisica ?? null,
      data.asistentes ?? null,
      data.id_usuario_responsable ?? userId,
      data.estado ?? null,
      data.resultado ?? null,
      data.proxima_fecha ?? null,
      data.id_acta_documento ?? null,
      data.observaciones ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'tipo_audiencia','fecha_programada','modalidad','enlace_virtual','juzgado_o_autoridad',
      'direccion_fisica','asistentes','id_usuario_responsable','estado','resultado',
      'proxima_fecha','id_acta_documento','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE audiencias SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE audiencias SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { findAll, findById, findProximas, create, update, softDelete };
