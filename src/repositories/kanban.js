'use strict';
const { getDb, withUser } = require('../db/client');

// ── Tableros ───────────────────────────────────────────────────────────────

async function findTableros({ id_usuario, id_expediente, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['tk.active = $1'];
  if (id_expediente) { vals.push(id_expediente); conds.push(`tk.id_expediente = $${vals.length}`); }

  let query = `
    SELECT DISTINCT tk.*, u.nombre AS nombre_propietario
    FROM tablero_kanban tk
    LEFT JOIN users u ON u.id = tk.id_usuario_propietario
  `;

  if (id_usuario) {
    vals.push(id_usuario);
    query += `
      LEFT JOIN tablero_kanban_usuario tku ON tku.id_tablero = tk.id AND tku.id_usuario = $${vals.length}
    `;
    conds.push(`(tk.id_usuario_propietario = $${vals.length} OR tk.es_publico = TRUE OR tku.id_usuario IS NOT NULL)`);
  }

  query += ` WHERE ${conds.join(' AND ')} ORDER BY tk.nombre LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`;
  const { rows } = await db.query(query, [...vals, limit, offset]);
  return rows;
}

async function findTableroById(id) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT tk.*, u.nombre AS nombre_propietario
    FROM tablero_kanban tk
    LEFT JOIN users u ON u.id = tk.id_usuario_propietario
    WHERE tk.id = $1
  `, [id]);
  return rows[0] ?? null;
}

async function createTablero(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tablero_kanban
        (nombre, descripcion, tipo_granularidad, tipo_ambito,
         id_expediente, id_usuario_propietario, es_publico, filtros_default, vista_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      data.nombre, data.descripcion ?? null,
      data.tipo_granularidad ?? null, data.tipo_ambito ?? null,
      data.id_expediente ?? null, userId,
      data.es_publico ?? false,
      data.filtros_default ?? null, data.vista_default ?? null,
    ]);
    return rows[0];
  });
}

async function updateTablero(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = ['nombre','descripcion','tipo_granularidad','tipo_ambito','es_publico','filtros_default','vista_default','active'];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findTableroById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE tablero_kanban SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteTablero(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tablero_kanban SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

async function addUsuarioTablero(id_tablero, id_usuario, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO tablero_kanban_usuario (id_tablero, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`,
      [id_tablero, id_usuario]
    );
    return rows[0] ?? null;
  });
}

async function removeUsuarioTablero(id_tablero, id_usuario, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM tablero_kanban_usuario WHERE id_tablero = $1 AND id_usuario = $2 RETURNING *`,
      [id_tablero, id_usuario]
    );
    return rows[0] ?? null;
  });
}

async function findUsuariosTablero(id_tablero) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT u.id, u.nombre, u.email
    FROM tablero_kanban_usuario tku
    JOIN users u ON u.id = tku.id_usuario
    WHERE tku.id_tablero = $1
    ORDER BY u.nombre
  `, [id_tablero]);
  return rows;
}

// ── Columnas ───────────────────────────────────────────────────────────────

async function findColumnas(id_tablero, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT ck.*,
           COALESCE(
             json_agg(
               json_build_object('id', cke.id, 'id_estado_tarea', cke.id_estado_tarea, 'id_estado_etapa', cke.id_estado_etapa)
             ) FILTER (WHERE cke.id IS NOT NULL), '[]'
           ) AS estados_mapeados
    FROM columna_kanban ck
    LEFT JOIN columna_kanban_estado cke ON cke.id_columna = ck.id
    WHERE ck.id_tablero = $1 AND ck.active = $2
    GROUP BY ck.id
    ORDER BY ck.orden
  `, [id_tablero, active]);
  return rows;
}

async function findColumnaById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM columna_kanban WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createColumna(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO columna_kanban
        (id_tablero, nombre, orden, color, wip_limit, es_inicial, es_final, regla_auto_mover)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      data.id_tablero, data.nombre, data.orden,
      data.color ?? null, data.wip_limit ?? null,
      data.es_inicial ?? false, data.es_final ?? false, data.regla_auto_mover ?? null,
    ]);
    return rows[0];
  });
}

async function updateColumna(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = ['nombre','orden','color','wip_limit','es_inicial','es_final','regla_auto_mover','active'];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findColumnaById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE columna_kanban SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteColumna(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE columna_kanban SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

async function addEstadoColumna(id_columna, { id_estado_tarea, id_estado_etapa }, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO columna_kanban_estado (id_columna, id_estado_tarea, id_estado_etapa)
      VALUES ($1,$2,$3)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [id_columna, id_estado_tarea ?? null, id_estado_etapa ?? null]);
    return rows[0] ?? null;
  });
}

async function removeEstadoColumna(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM columna_kanban_estado WHERE id = $1 RETURNING *`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Posiciones Kanban ──────────────────────────────────────────────────────

async function findPosicionesByColumna(id_columna, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT kp.*,
           t.titulo AS titulo_tarea,
           ee.id_etapa AS id_etapa_ref
    FROM tarea_kanban_position kp
    LEFT JOIN tareas t            ON t.id = kp.id_tarea
    LEFT JOIN expediente_etapas ee ON ee.id = kp.id_expediente_etapa
    WHERE kp.id_columna = $1 AND kp.active = $2
    ORDER BY kp.orden_vertical NULLS LAST
  `, [id_columna, active]);
  return rows;
}

async function upsertPosicion(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tarea_kanban_position
        (id_tablero, id_columna, tipo_entidad, id_tarea, id_expediente_etapa,
         orden_vertical, fecha_movimiento, id_usuario_movio)
      VALUES ($1,$2,$3,$4,$5,$6,now(),$7)
      ON CONFLICT ON CONSTRAINT uq_kanban_pos_tarea DO UPDATE
        SET id_columna = EXCLUDED.id_columna, orden_vertical = EXCLUDED.orden_vertical,
            fecha_movimiento = now(), id_usuario_movio = EXCLUDED.id_usuario_movio, updated_at = now()
      RETURNING *
    `, [
      data.id_tablero, data.id_columna, data.tipo_entidad,
      data.id_tarea ?? null, data.id_expediente_etapa ?? null,
      data.orden_vertical ?? null, userId,
    ]);
    return rows[0];
  });
}

async function removePosicion(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tarea_kanban_position SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = {
  findTableros, findTableroById, createTablero, updateTablero, softDeleteTablero,
  addUsuarioTablero, removeUsuarioTablero, findUsuariosTablero,
  findColumnas, findColumnaById, createColumna, updateColumna, softDeleteColumna,
  addEstadoColumna, removeEstadoColumna,
  findPosicionesByColumna, upsertPosicion, removePosicion,
};
