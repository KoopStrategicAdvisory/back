'use strict';
const { getDb, withUser } = require('../db/client');

// ── Iter procesal plantilla ────────────────────────────────────────────────

async function findAll({ id_combo, active = true, limit = 200, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  let where = 'p.active = $1';
  if (id_combo) { vals.push(id_combo); where += ` AND p.id_tipo_proc_subtipo_proc_tipo_pre = $${vals.length}`; }
  const { rows } = await db.query(`
    SELECT p.*,
           e.nombre_etapa    AS nombre_etapa,
           i.nombre          AS nombre_instancia,
           tn.nombre         AS nombre_tipo_notificacion,
           ant.orden         AS orden_etapa_anterior
    FROM iter_procesal_plantilla p
    LEFT JOIN etapas_procesales e        ON e.id  = p.id_etapa
    LEFT JOIN instancias i               ON i.id  = p.id_instancia
    LEFT JOIN tipo_notificacion tn       ON tn.id = p.id_tipo_notificacion_esperada
    LEFT JOIN iter_procesal_plantilla ant ON ant.id = p.etapa_anterior_id
    WHERE ${where}
    ORDER BY p.id_tipo_proc_subtipo_proc_tipo_pre, p.orden
    LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
  `, [...vals, limit, offset]);
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT p.*,
           e.nombre_etapa AS nombre_etapa,
           i.nombre       AS nombre_instancia
    FROM iter_procesal_plantilla p
    LEFT JOIN etapas_procesales e ON e.id = p.id_etapa
    LEFT JOIN instancias i        ON i.id = p.id_instancia
    WHERE p.id = $1
  `, [id]);
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO iter_procesal_plantilla
        (id_tipo_proc_subtipo_proc_tipo_pre, id_etapa, orden, id_instancia,
         plazo_dias, dias_habiles, dispara_notificacion,
         id_tipo_notificacion_esperada, etapa_anterior_id, es_obligatoria, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      data.id_tipo_proc_subtipo_proc_tipo_pre,
      data.id_etapa,
      data.orden,
      data.id_instancia ?? null,
      data.plazo_dias ?? null,
      data.dias_habiles ?? true,
      data.dispara_notificacion ?? false,
      data.id_tipo_notificacion_esperada ?? null,
      data.etapa_anterior_id ?? null,
      data.es_obligatoria ?? true,
      data.observaciones ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'orden','id_instancia','plazo_dias','dias_habiles','dispara_notificacion',
      'id_tipo_notificacion_esperada','etapa_anterior_id','es_obligatoria','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE iter_procesal_plantilla SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE iter_procesal_plantilla SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Tareas plantilla ───────────────────────────────────────────────────────

async function findTareasByIter(id_iter_plantilla, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT tp.*,
           p.nombre AS nombre_prioridad,
           r.nombre AS nombre_rol_responsable
    FROM tareas_plantilla tp
    LEFT JOIN prioridad p ON p.id = tp.id_prioridad
    LEFT JOIN roles r     ON r.id = tp.id_rol_responsable
    WHERE tp.id_iter_plantilla = $1 AND tp.active = $2
    ORDER BY tp.id
  `, [id_iter_plantilla, active]);
  return rows;
}

async function findTareaPlantillaById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM tareas_plantilla WHERE id = $1`, [id]
  );
  return rows[0] ?? null;
}

async function createTareaPlantilla(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tareas_plantilla
        (id_iter_plantilla, titulo, descripcion, dias_desde_etapa,
         dias_habiles, id_prioridad, id_rol_responsable, es_hito_critico)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      data.id_iter_plantilla,
      data.titulo,
      data.descripcion ?? null,
      data.dias_desde_etapa ?? null,
      data.dias_habiles ?? true,
      data.id_prioridad ?? null,
      data.id_rol_responsable ?? null,
      data.es_hito_critico ?? false,
    ]);
    return rows[0];
  });
}

async function updateTareaPlantilla(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'titulo','descripcion','dias_desde_etapa','dias_habiles',
      'id_prioridad','id_rol_responsable','es_hito_critico','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findTareaPlantillaById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE tareas_plantilla SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteTareaPlantilla(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tareas_plantilla SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = {
  findAll, findById, create, update, softDelete,
  findTareasByIter, findTareaPlantillaById,
  createTareaPlantilla, updateTareaPlantilla, softDeleteTareaPlantilla,
};
