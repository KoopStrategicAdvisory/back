'use strict';
const { getDb, withUser } = require('../db/client');

// ── Etiquetas ──────────────────────────────────────────────────────────────

async function findEtiquetas({ active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT * FROM etiqueta WHERE active = $1 ORDER BY nombre`, [active]
  );
  return rows;
}

async function findEtiquetaById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM etiqueta WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createEtiqueta(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO etiqueta (nombre, color, icono, id_usuario_creador, descripcion)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [data.nombre, data.color ?? null, data.icono ?? null, userId, data.descripcion ?? null]);
    return rows[0];
  });
}

async function updateEtiqueta(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = ['nombre','color','icono','descripcion','active'];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findEtiquetaById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE etiqueta SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`, [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteEtiqueta(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE etiqueta SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

async function findEtiquetasByEntidad({ tipo_entidad, id_tarea, id_expediente_etapa, active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT te.*, e.nombre, e.color, e.icono
    FROM tarea_etiqueta te
    JOIN etiqueta e ON e.id = te.id_etiqueta
    WHERE te.tipo_entidad = $1
      AND ($2::BIGINT IS NULL OR te.id_tarea = $2)
      AND ($3::BIGINT IS NULL OR te.id_expediente_etapa = $3)
      AND te.active = $4
    ORDER BY e.nombre
  `, [tipo_entidad, id_tarea ?? null, id_expediente_etapa ?? null, active]);
  return rows;
}

async function addEtiquetaEntidad(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tarea_etiqueta
        (tipo_entidad, id_tarea, id_expediente_etapa, id_etiqueta, id_usuario_agrego)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT DO NOTHING RETURNING *
    `, [data.tipo_entidad, data.id_tarea ?? null, data.id_expediente_etapa ?? null, data.id_etiqueta, userId]);
    return rows[0] ?? null;
  });
}

async function removeEtiquetaEntidad(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tarea_etiqueta SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Comentarios ────────────────────────────────────────────────────────────

async function findComentarios({ tipo_entidad, id_tarea, id_expediente_etapa, active = true } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['c.active = $1'];
  if (tipo_entidad)        { vals.push(tipo_entidad);        conds.push(`c.tipo_entidad = $${vals.length}`); }
  if (id_tarea)            { vals.push(id_tarea);            conds.push(`c.id_tarea = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`c.id_expediente_etapa = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT c.*, u.nombre AS nombre_autor, u.email AS email_autor,
           COALESCE(
             json_agg(json_build_object('id', m.id_usuario, 'nombre', mu.nombre)) FILTER (WHERE m.id_usuario IS NOT NULL),
             '[]'
           ) AS menciones
    FROM comentario_tarea c
    JOIN users u ON u.id = c.id_usuario_autor
    LEFT JOIN comentario_mencion m ON m.id_comentario = c.id
    LEFT JOIN users mu ON mu.id = m.id_usuario
    WHERE ${conds.join(' AND ')} AND c.id_comentario_padre IS NULL
    GROUP BY c.id, u.nombre, u.email
    ORDER BY c.created_at ASC
  `, vals);
  return rows;
}

async function findReplies(id_comentario_padre, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT c.*, u.nombre AS nombre_autor
    FROM comentario_tarea c
    JOIN users u ON u.id = c.id_usuario_autor
    WHERE c.id_comentario_padre = $1 AND c.active = $2
    ORDER BY c.created_at ASC
  `, [id_comentario_padre, active]);
  return rows;
}

async function findComentarioById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM comentario_tarea WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createComentario(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO comentario_tarea
        (tipo_entidad, id_tarea, id_expediente_etapa, id_usuario_autor, contenido, id_comentario_padre)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [
      data.tipo_entidad,
      data.id_tarea ?? null,
      data.id_expediente_etapa ?? null,
      userId,
      data.contenido,
      data.id_comentario_padre ?? null,
    ]);
    const comentario = rows[0];
    if (data.menciones?.length) {
      for (const id_usuario of data.menciones) {
        await tx.query(
          `INSERT INTO comentario_mencion (id_comentario, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [comentario.id, id_usuario]
        );
      }
    }
    return comentario;
  });
}

async function updateComentario(id, contenido, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      UPDATE comentario_tarea
      SET contenido = $1, editado = TRUE, fecha_edicion = now(), updated_at = now()
      WHERE id = $2 RETURNING *
    `, [contenido, id]);
    return rows[0] ?? null;
  });
}

async function softDeleteComentario(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE comentario_tarea SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

async function addMencion(id_comentario, id_usuario, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO comentario_mencion (id_comentario, id_usuario) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`,
      [id_comentario, id_usuario]
    );
    return rows[0] ?? null;
  });
}

async function removeMencion(id_comentario, id_usuario, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM comentario_mencion WHERE id_comentario = $1 AND id_usuario = $2 RETURNING *`,
      [id_comentario, id_usuario]
    );
    return rows[0] ?? null;
  });
}

// ── Adjuntos ───────────────────────────────────────────────────────────────

async function findAdjuntos({ tipo_entidad, id_tarea, id_expediente_etapa, id_comentario, active = true } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['a.active = $1'];
  if (tipo_entidad)        { vals.push(tipo_entidad);        conds.push(`a.tipo_entidad = $${vals.length}`); }
  if (id_tarea)            { vals.push(id_tarea);            conds.push(`a.id_tarea = $${vals.length}`); }
  if (id_expediente_etapa) { vals.push(id_expediente_etapa); conds.push(`a.id_expediente_etapa = $${vals.length}`); }
  if (id_comentario)       { vals.push(id_comentario);       conds.push(`a.id_comentario = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT a.*, u.nombre AS nombre_usuario
    FROM adjunto_tarea a
    LEFT JOIN users u ON u.id = a.id_usuario_subio
    WHERE ${conds.join(' AND ')}
    ORDER BY a.created_at DESC
  `, vals);
  return rows;
}

async function findAdjuntoById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM adjunto_tarea WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createAdjunto(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO adjunto_tarea
        (tipo_entidad, id_tarea, id_expediente_etapa, id_comentario,
         nombre_archivo, url_archivo, mime_type, tamanio_bytes,
         id_usuario_subio, id_documento_formal, es_privado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      data.tipo_entidad,
      data.id_tarea ?? null,
      data.id_expediente_etapa ?? null,
      data.id_comentario ?? null,
      data.nombre_archivo,
      data.url_archivo ?? null,
      data.mime_type ?? null,
      data.tamanio_bytes ?? null,
      userId,
      data.id_documento_formal ?? null,
      data.es_privado ?? false,
    ]);
    return rows[0];
  });
}

async function softDeleteAdjunto(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE adjunto_tarea SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Dependencias ───────────────────────────────────────────────────────────

async function findDependencias({ id_tarea_origen, id_etapa_origen, id_tarea_destino, id_etapa_destino, active = true } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['d.active = $1'];
  if (id_tarea_origen)   { vals.push(id_tarea_origen);   conds.push(`d.id_tarea_origen = $${vals.length}`); }
  if (id_etapa_origen)   { vals.push(id_etapa_origen);   conds.push(`d.id_etapa_origen = $${vals.length}`); }
  if (id_tarea_destino)  { vals.push(id_tarea_destino);  conds.push(`d.id_tarea_destino = $${vals.length}`); }
  if (id_etapa_destino)  { vals.push(id_etapa_destino);  conds.push(`d.id_etapa_destino = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT d.*,
           to_orig.titulo  AS titulo_tarea_origen,
           to_dest.titulo  AS titulo_tarea_destino
    FROM tarea_dependencia d
    LEFT JOIN tareas to_orig ON to_orig.id = d.id_tarea_origen
    LEFT JOIN tareas to_dest ON to_dest.id = d.id_tarea_destino
    WHERE ${conds.join(' AND ')}
    ORDER BY d.created_at
  `, vals);
  return rows;
}

async function createDependencia(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO tarea_dependencia
        (id_tarea_origen, id_etapa_origen, id_tarea_destino, id_etapa_destino,
         tipo_dependencia, dias_lag, es_bloqueante, id_usuario_creador, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      data.id_tarea_origen ?? null,
      data.id_etapa_origen ?? null,
      data.id_tarea_destino ?? null,
      data.id_etapa_destino ?? null,
      data.tipo_dependencia ?? null,
      data.dias_lag ?? 0,
      data.es_bloqueante ?? false,
      userId,
      data.observaciones ?? null,
    ]);
    return rows[0];
  });
}

async function softDeleteDependencia(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE tarea_dependencia SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = {
  findEtiquetas, findEtiquetaById, createEtiqueta, updateEtiqueta, softDeleteEtiqueta,
  findEtiquetasByEntidad, addEtiquetaEntidad, removeEtiquetaEntidad,
  findComentarios, findReplies, findComentarioById, createComentario, updateComentario, softDeleteComentario,
  addMencion, removeMencion,
  findAdjuntos, findAdjuntoById, createAdjunto, softDeleteAdjunto,
  findDependencias, createDependencia, softDeleteDependencia,
};
