'use strict';
const { getDb, withUser } = require('../db/client');

const BASE_SELECT = `
  SELECT
    e.*,
    c.nombre                               AS nombre_cliente,
    COALESCE(e.contraparte, cp.nombre)     AS nombre_contraparte,
    ep.nombre                              AS nombre_estado_proceso,
    cu.calidad                             AS calidad_usuario,
    tp.nombre                              AS nombre_tipo_proceso,
    sp.nombre                              AS nombre_subtipo_proceso,
    pre.nombre                             AS nombre_tipo_pretension,
    u.nombre                               AS nombre_usuario,
    u.email                                AS email_usuario
  FROM expediente e
  LEFT JOIN clientes   c   ON c.id   = e.id_cliente
  LEFT JOIN contraparte cp ON cp.id  = e.id_contraparte
  LEFT JOIN estado_proceso ep ON ep.id = e.id_estado_proceso
  LEFT JOIN calidad_usuario cu ON cu.id = e.id_calidad_usuario
  LEFT JOIN tipo_proc_subtipo_proc_tipo_pre combo ON combo.id = e.id_tipo_proc_subtipo_proc_tipo_pre
  LEFT JOIN tipo_proceso    tp  ON tp.id  = combo.id_tipo_proceso
  LEFT JOIN subtipo_proceso sp  ON sp.id  = combo.id_subtipo_proceso
  LEFT JOIN tipo_pretension pre ON pre.id = combo.id_tipo_pretension
  LEFT JOIN users u ON u.id = e.id_usuario
`;

async function findAll({
  active = true, id_usuario, id_cliente, id_estado_proceso,
  search, limit = 20, offset = 0,
} = {}) {
  const db  = await getDb();
  const vals = [active];
  const conds = ['e.active = $1'];

  if (id_usuario)       { vals.push(id_usuario);       conds.push(`e.id_usuario = $${vals.length}`); }
  if (id_cliente)       { vals.push(id_cliente);       conds.push(`e.id_cliente = $${vals.length}`); }
  if (id_estado_proceso){ vals.push(id_estado_proceso); conds.push(`e.id_estado_proceso = $${vals.length}`); }
  if (search) {
    vals.push(`%${search}%`);
    const p = vals.length;
    conds.push(`(e.numero_de_expediente ILIKE $${p} OR e.numero_radicado_despacho ILIKE $${p} OR c.nombre ILIKE $${p} OR e.contraparte ILIKE $${p} OR cp.nombre ILIKE $${p})`);
  }

  const { rows } = await db.query(
    `${BASE_SELECT} WHERE ${conds.join(' AND ')} ORDER BY e.id DESC LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}`,
    [...vals, limit, offset]
  );
  return rows;
}

async function count({ active = true, id_usuario, id_cliente, id_estado_proceso, search } = {}) {
  const db  = await getDb();
  const vals = [active];
  const conds = ['e.active = $1'];
  if (id_usuario)       { vals.push(id_usuario);       conds.push(`e.id_usuario = $${vals.length}`); }
  if (id_cliente)       { vals.push(id_cliente);       conds.push(`e.id_cliente = $${vals.length}`); }
  if (id_estado_proceso){ vals.push(id_estado_proceso); conds.push(`e.id_estado_proceso = $${vals.length}`); }
  if (search) {
    vals.push(`%${search}%`);
    const p = vals.length;
    conds.push(`(e.numero_de_expediente ILIKE $${p} OR e.numero_radicado_despacho ILIKE $${p} OR c.nombre ILIKE $${p} OR e.contraparte ILIKE $${p} OR cp.nombre ILIKE $${p})`);
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM expediente e
     LEFT JOIN clientes c ON c.id = e.id_cliente
     LEFT JOIN contraparte cp ON cp.id = e.id_contraparte
     WHERE ${conds.join(' AND ')}`,
    vals
  );
  return rows[0].total;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE e.id = $1`, [id]);
  return rows[0] ?? null;
}

async function findByNumero(numero_de_expediente) {
  const db = await getDb();
  const { rows } = await db.query(`${BASE_SELECT} WHERE e.numero_de_expediente = $1`, [numero_de_expediente]);
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO expediente
        (id_usuario, numero_de_expediente, numero_radicado_despacho, id_cliente, id_calidad_usuario,
         id_tipo_proc_subtipo_proc_tipo_pre, contraparte,
         juzgado_o_autoridad_que_conoce, correo_juzgado, direccion_juzgado, id_estado_proceso)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      userId,
      data.numero_de_expediente,
      data.numero_radicado_despacho ?? null,
      data.id_cliente ?? null,
      data.id_calidad_usuario ?? null,
      data.id_tipo_proc_subtipo_proc_tipo_pre ?? null,
      data.contraparte ?? null,
      data.juzgado_o_autoridad_que_conoce ?? null,
      data.correo_juzgado ?? null,
      data.direccion_juzgado ?? null,
      data.id_estado_proceso ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'numero_de_expediente','numero_radicado_despacho',
      'id_cliente','id_calidad_usuario','id_tipo_proc_subtipo_proc_tipo_pre',
      'contraparte','juzgado_o_autoridad_que_conoce','correo_juzgado','direccion_juzgado','id_estado_proceso','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE expediente SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE expediente SET active = FALSE WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Etapas del expediente ──────────────────────────────────────────────────

async function findEtapas(id_expediente, { active = true } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT ee.*,
           ep.nombre_etapa        AS nombre_etapa,
           ie.nombre              AS nombre_instancia,
           est.nombre             AS nombre_estado_etapa,
           u.nombre               AS nombre_responsable
    FROM expediente_etapas ee
    LEFT JOIN etapas_procesales ep ON ep.id = ee.id_etapa
    LEFT JOIN instancias ie        ON ie.id = ee.id_instancia
    LEFT JOIN estado_etapa est     ON est.id = ee.id_estado_etapa
    LEFT JOIN users u              ON u.id  = ee.id_usuario_responsable
    WHERE ee.id_expediente = $1 AND ee.active = $2
    ORDER BY ee.orden NULLS LAST, ee.created_at
  `, [id_expediente, active]);
  return rows;
}

async function findEtapaById(id) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT ee.*,
           ep.nombre_etapa AS nombre_etapa,
           est.nombre      AS nombre_estado_etapa
    FROM expediente_etapas ee
    LEFT JOIN etapas_procesales ep ON ep.id = ee.id_etapa
    LEFT JOIN estado_etapa est     ON est.id = ee.id_estado_etapa
    WHERE ee.id = $1
  `, [id]);
  return rows[0] ?? null;
}

async function createEtapa(id_expediente, data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO expediente_etapas
        (id_expediente, id_iter_plantilla, id_etapa, orden, id_instancia,
         id_estado_etapa, fecha_inicio, fecha_vencimiento, fecha_fin_real,
         id_usuario_responsable, observaciones, origen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      id_expediente,
      data.id_iter_plantilla ?? null,
      data.id_etapa ?? null,
      data.orden ?? null,
      data.id_instancia ?? null,
      data.id_estado_etapa ?? null,
      data.fecha_inicio ?? null,
      data.fecha_vencimiento ?? null,
      data.fecha_fin_real ?? null,
      data.id_usuario_responsable ?? null,
      data.observaciones ?? null,
      // origen es NOT NULL DEFAULT 'auto' (para etapas generadas desde el iter
      // procesal); pasar NULL explicito viola la restriccion. Creada a mano
      // desde este endpoint, por eso el default aqui es 'manual'.
      data.origen ?? 'manual',
    ]);
    return rows[0];
  });
}

async function updateEtapa(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'id_instancia','id_estado_etapa','fecha_inicio','fecha_vencimiento',
      'fecha_fin_real','id_usuario_responsable','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findEtapaById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE expediente_etapas SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteEtapa(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE expediente_etapas SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// Genera las etapas de un expediente copiando el iter procesal (plantilla)
// del tipo de proceso/subtipo/pretension que le corresponde — asi los
// expedientes nuevos arrancan con el orden real del tramite en vez de que
// cada abogado tenga que ir agregando etapa por etapa a mano y adivinando
// el orden. Idempotente: si ya existe una etapa de una plantilla dada para
// este expediente, no la duplica (indice unico parcial
// uq_exp_etapa_plantilla). Devuelve cuantas etapas (y tareas ligadas a
// ellas, via tareas_plantilla) se crearon.
async function generateEtapasFromPlantilla(id_expediente, userId) {
  return withUser(userId, async (tx) => {
    const exp = await tx.query(`SELECT id_tipo_proc_subtipo_proc_tipo_pre FROM expediente WHERE id = $1`, [id_expediente]);
    const combo = exp.rows[0]?.id_tipo_proc_subtipo_proc_tipo_pre;
    if (!combo) return { etapas: 0, tareas: 0 };

    const { rows: etapasCreadas } = await tx.query(`
      INSERT INTO expediente_etapas
        (id_expediente, id_iter_plantilla, id_etapa, orden, id_instancia, id_estado_etapa, observaciones, origen)
      SELECT
        $1, p.id, p.id_etapa, p.orden, p.id_instancia,
        (SELECT id FROM estado_etapa WHERE nombre = 'Pendiente' LIMIT 1),
        p.observaciones, 'auto'
      FROM iter_procesal_plantilla p
      WHERE p.id_tipo_proc_subtipo_proc_tipo_pre = $2
      ORDER BY p.orden
      ON CONFLICT (id_expediente, id_iter_plantilla) WHERE id_iter_plantilla IS NOT NULL DO NOTHING
      RETURNING id, id_iter_plantilla
    `, [id_expediente, combo]);

    // Tareas plantilla ligadas a las etapas recien creadas (si el iter
    // procesal trae tareas predefinidas para ese paso — ej. "vence termino
    // para excepciones"). No se duplican en reintentos: solo se generan
    // para etapas que se acaban de insertar en esta misma llamada.
    let tareasCreadas = 0;
    if (etapasCreadas.length > 0) {
      const { rows } = await tx.query(`
        INSERT INTO tareas
          (id_expediente, id_expediente_etapa, id_tarea_plantilla, titulo, descripcion, id_estado_tarea, id_prioridad, es_hito_preclusivo, origen)
        SELECT
          $1, ec.id_expediente_etapa, tp.id, tp.titulo, tp.descripcion,
          (SELECT id FROM estado_tarea WHERE nombre = 'Pendiente' LIMIT 1),
          tp.id_prioridad, tp.es_hito_critico, 'auto'
        FROM (SELECT unnest($2::bigint[]) AS id_iter_plantilla, unnest($3::bigint[]) AS id_expediente_etapa) ec
        JOIN tareas_plantilla tp ON tp.id_iter_plantilla = ec.id_iter_plantilla AND tp.active = true
        RETURNING id
      `, [
        id_expediente,
        etapasCreadas.map((e) => e.id_iter_plantilla),
        etapasCreadas.map((e) => e.id),
      ]);
      tareasCreadas = rows.length;
    }

    return { etapas: etapasCreadas.length, tareas: tareasCreadas };
  });
}

module.exports = {
  findAll, count, findById, findByNumero, create, update, softDelete,
  findEtapas, findEtapaById, createEtapa, updateEtapa, softDeleteEtapa,
  generateEtapasFromPlantilla,
};
