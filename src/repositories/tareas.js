'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT t.*,
         p.nombre  AS nombre_prioridad,
         et.nombre AS nombre_estado_tarea,
         ua.nombre AS nombre_asignado,
         ua.email  AS email_asignado,
         uc.nombre AS nombre_creador,
         e.numero_de_expediente
  FROM tareas t
  LEFT JOIN prioridad p    ON p.id  = t.id_prioridad
  LEFT JOIN estado_tarea et ON et.id = t.id_estado_tarea
  LEFT JOIN users ua        ON ua.id = t.id_usuario_asignado
  LEFT JOIN users uc        ON uc.id = t.id_usuario_creador
  LEFT JOIN expediente e    ON e.id  = t.id_expediente
`;

async function findAll({
  active = true, id_expediente, id_expediente_etapa,
  id_usuario_asignado, id_estado_tarea, vencidas,
  limit = 20, offset = 0,
} = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['t.active = $1'];

  if (id_expediente)       { vals.push(id_expediente);       conds.push(`t.id_expediente = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`t.id_expediente_etapa = $${vals.length}`); }
  if (id_usuario_asignado) { vals.push(id_usuario_asignado); conds.push(`t.id_usuario_asignado = $${vals.length}`); }
  if (id_estado_tarea)     { vals.push(id_estado_tarea);     conds.push(`t.id_estado_tarea = $${vals.length}`); }
  if (vencidas)            { conds.push(`t.fecha_limite < now()`); }

  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY t.fecha_limite ASC NULLS LAST LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function count({ active = true, id_expediente, id_usuario_asignado, id_estado_tarea, vencidas } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['t.active = $1'];
  if (id_expediente)       { vals.push(id_expediente);       conds.push(`t.id_expediente = $${vals.length}`); }
  if (id_usuario_asignado) { vals.push(id_usuario_asignado); conds.push(`t.id_usuario_asignado = $${vals.length}`); }
  if (id_estado_tarea)     { vals.push(id_estado_tarea);     conds.push(`t.id_estado_tarea = $${vals.length}`); }
  if (vencidas)            { conds.push(`t.fecha_limite < now()`); }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM tareas t WHERE ${conds.join(' AND ')}`, vals
  );
  return rows[0].total;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

async function findMisTareas(id_usuario_asignado) {
  const db = await getDb();
  const { rows } = await db.query(`
    ${BASE_SELECT}
    WHERE t.id_usuario_asignado = $1 AND t.active = TRUE
    ORDER BY t.fecha_limite ASC NULLS LAST
  `, [id_usuario_asignado]);
  return rows;
}

async function findProximasVencer(diasAntes = 3) {
  const db = await getDb();
  const { rows } = await db.query(`
    ${BASE_SELECT}
    WHERE t.active = TRUE
      AND t.fecha_limite BETWEEN now() AND now() + ($1 || ' days')::INTERVAL
      AND t.id_estado_tarea NOT IN (SELECT id FROM estado_tarea WHERE nombre ILIKE '%complet%')
    ORDER BY t.fecha_limite ASC
  `, [diasAntes]);
  return rows;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tareas
        (id_expediente, id_expediente_etapa, id_tarea_plantilla, titulo, descripcion,
         id_usuario_asignado, id_usuario_creador, id_prioridad, id_estado_tarea,
         origen, fecha_limite, es_hito_preclusivo, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      data.id_expediente ?? null,
      data.id_expediente_etapa ?? null,
      data.id_tarea_plantilla ?? null,
      data.titulo,
      data.descripcion ?? null,
      data.id_usuario_asignado ?? null,
      userId,
      data.id_prioridad ?? null,
      data.id_estado_tarea ?? null,
      data.origen ?? null,
      data.fecha_limite ?? null,
      data.es_hito_preclusivo ?? false,
      data.observaciones ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'titulo','descripcion','id_usuario_asignado','id_prioridad','id_estado_tarea',
      'fecha_limite','fecha_completado','es_hito_preclusivo','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE tareas SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tareas SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Checklist ──────────────────────────────────────────────────────────────

async function findChecklist(id_tarea, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT cl.*,
           uc.nombre AS nombre_asignado,
           us.nombre AS nombre_completado_por
    FROM checklist_tarea cl
    LEFT JOIN users uc ON uc.id = cl.id_usuario_asignado
    LEFT JOIN users us ON us.id = cl.id_usuario_completo
    WHERE cl.id_tarea = $1 AND cl.active = $2
    ORDER BY cl.orden NULLS LAST, cl.id
  `, [id_tarea, active]);
  return rows;
}

async function findChecklistById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM checklist_tarea WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createChecklistItem(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO checklist_tarea
        (id_tarea, titulo, orden, id_usuario_asignado, fecha_limite)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [data.id_tarea, data.titulo, data.orden ?? null, data.id_usuario_asignado ?? null, data.fecha_limite ?? null]);
    return rows[0];
  });
}

async function updateChecklistItem(id, data, userId) {
  return withUser(userId, async (tx) => {
    const extra = data.completado && !data.id_usuario_completo
      ? `, id_usuario_completo = ${userId}, fecha_completado = now()`
      : data.completado === false ? `, id_usuario_completo = NULL, fecha_completado = NULL` : '';
    const allowed = ['titulo','orden','completado','id_usuario_asignado','fecha_limite'];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findChecklistById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE checklist_tarea SET ${sets}${extra}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteChecklistItem(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE checklist_tarea SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = {
  findAll, count, findById, findMisTareas, findProximasVencer,
  create, update, softDelete,
  findChecklist, findChecklistById, createChecklistItem, updateChecklistItem, softDeleteChecklistItem,
};
