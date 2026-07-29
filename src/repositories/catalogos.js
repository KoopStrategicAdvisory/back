'use strict';
const { getDb, withUser } = require('../db/client');

// Factory para catalogo simple: findAll / findById / create / update / softDelete
function makeCatalog(table) {
  return {
    async findAll({ active = true, limit = 200, offset = 0 } = {}) {
      const db = await getDb();
      const { rows } = await db.query(
        `SELECT * FROM ${table} WHERE active = $1 ORDER BY id LIMIT $2 OFFSET $3`,
        [active, limit, offset]
      );
      return rows;
    },

    async findById(id) {
      const db = await getDb();
      const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return rows[0] ?? null;
    },

    async create(data, userId) {
      return withUser(userId, async (tx) => {
        const cols = Object.keys(data);
        const vals = Object.values(data);
        const ph   = cols.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await tx.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`,
          vals
        );
        return rows[0];
      });
    },

    async update(id, data, userId) {
      return withUser(userId, async (tx) => {
        const entries = Object.entries(data);
        const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
        const vals = entries.map(([, v]) => v);
        const { rows } = await tx.query(
          `UPDATE ${table} SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
          [...vals, id]
        );
        return rows[0] ?? null;
      });
    },

    async softDelete(id, userId) {
      return withUser(userId, async (tx) => {
        const { rows } = await tx.query(
          `UPDATE ${table} SET active = FALSE WHERE id = $1 RETURNING id`,
          [id]
        );
        return rows[0] ?? null;
      });
    },
  };
}

const roles             = makeCatalog('roles');
const tipoProceso       = makeCatalog('tipo_proceso');
const subtipoProceso    = makeCatalog('subtipo_proceso');
const tipoPretension    = makeCatalog('tipo_pretension');
const instancias        = makeCatalog('instancias');
const tipoActuacion     = makeCatalog('tipo_actuacion');
const tipoDocumento     = makeCatalog('tipo_documento');
const tipoNotificacion  = makeCatalog('tipo_notificacion');
const medioNotificacion = makeCatalog('medio_notificacion');
const estadoProceso     = makeCatalog('estado_proceso');
const estadoEtapa       = makeCatalog('estado_etapa');
const estadoTarea       = makeCatalog('estado_tarea');
const prioridad         = makeCatalog('prioridad');
const calidadUsuario    = makeCatalog('calidad_usuario');
const contraparte       = makeCatalog('contraparte');

// Combinacion tipo_proceso + subtipo + pretension
const tipoProcSubtipo = {
  async findAll({ active = true } = {}) {
    const db = await getDb();
    const { rows } = await db.query(`
      SELECT c.*,
             tp.nombre  AS nombre_tipo_proceso,
             sp.nombre  AS nombre_subtipo_proceso,
             pre.nombre AS nombre_tipo_pretension
      FROM tipo_proc_subtipo_proc_tipo_pre c
      JOIN tipo_proceso    tp  ON tp.id  = c.id_tipo_proceso
      JOIN subtipo_proceso sp  ON sp.id  = c.id_subtipo_proceso
      JOIN tipo_pretension pre ON pre.id = c.id_tipo_pretension
      WHERE c.active = $1
      ORDER BY tp.nombre, sp.nombre, pre.nombre
    `, [active]);
    return rows;
  },

  async findById(id) {
    const db = await getDb();
    const { rows } = await db.query(`
      SELECT c.*,
             tp.nombre  AS nombre_tipo_proceso,
             sp.nombre  AS nombre_subtipo_proceso,
             pre.nombre AS nombre_tipo_pretension
      FROM tipo_proc_subtipo_proc_tipo_pre c
      JOIN tipo_proceso    tp  ON tp.id  = c.id_tipo_proceso
      JOIN subtipo_proceso sp  ON sp.id  = c.id_subtipo_proceso
      JOIN tipo_pretension pre ON pre.id = c.id_tipo_pretension
      WHERE c.id = $1
    `, [id]);
    return rows[0] ?? null;
  },

  async create({ id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension }, userId) {
    return withUser(userId, async (tx) => {
      const { rows } = await tx.query(`
        INSERT INTO tipo_proc_subtipo_proc_tipo_pre
          (id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension]);
      return rows[0];
    });
  },

  async softDelete(id, userId) {
    return withUser(userId, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE tipo_proc_subtipo_proc_tipo_pre SET active = FALSE WHERE id = $1 RETURNING id`,
        [id]
      );
      return rows[0] ?? null;
    });
  },
};

// Etapas procesales (filtrable por tipo_proceso)
const etapasProcesales = {
  async findAll({ id_tipo_proceso, active = true, limit = 200, offset = 0 } = {}) {
    const db = await getDb();
    const vals = [active];
    let where = 'e.active = $1';
    if (id_tipo_proceso) { vals.push(id_tipo_proceso); where += ` AND e.id_tipo_proceso = $${vals.length}`; }
    const { rows } = await db.query(`
      SELECT e.*, tp.nombre AS nombre_tipo_proceso
      FROM etapas_procesales e
      JOIN tipo_proceso tp ON tp.id = e.id_tipo_proceso
      WHERE ${where}
      ORDER BY tp.nombre, e.nombre_etapa
      LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
    `, [...vals, limit, offset]);
    return rows;
  },

  async findById(id) {
    const db = await getDb();
    const { rows } = await db.query(`
      SELECT e.*, tp.nombre AS nombre_tipo_proceso
      FROM etapas_procesales e
      JOIN tipo_proceso tp ON tp.id = e.id_tipo_proceso
      WHERE e.id = $1
    `, [id]);
    return rows[0] ?? null;
  },

  async create({ id_tipo_proceso, nombre_etapa, descripcion, fundamento_legal }, userId) {
    return withUser(userId, async (tx) => {
      const { rows } = await tx.query(`
        INSERT INTO etapas_procesales (id_tipo_proceso, nombre_etapa, descripcion, fundamento_legal)
        VALUES ($1, $2, $3, $4) RETURNING *
      `, [id_tipo_proceso, nombre_etapa, descripcion ?? null, fundamento_legal ?? null]);
      return rows[0];
    });
  },

  async update(id, data, userId) {
    return withUser(userId, async (tx) => {
      const { rows } = await tx.query(`
        UPDATE etapas_procesales SET
          id_tipo_proceso  = COALESCE($1, id_tipo_proceso),
          nombre_etapa     = COALESCE($2, nombre_etapa),
          descripcion      = COALESCE($3, descripcion),
          fundamento_legal = COALESCE($4, fundamento_legal)
        WHERE id = $5 RETURNING *
      `, [data.id_tipo_proceso, data.nombre_etapa, data.descripcion, data.fundamento_legal, id]);
      return rows[0] ?? null;
    });
  },

  async softDelete(id, userId) {
    return withUser(userId, async (tx) => {
      const { rows } = await tx.query(
        `UPDATE etapas_procesales SET active = FALSE WHERE id = $1 RETURNING id`, [id]
      );
      return rows[0] ?? null;
    });
  },
};

module.exports = {
  roles,
  tipoProceso,
  subtipoProceso,
  tipoPretension,
  instancias,
  tipoActuacion,
  tipoDocumento,
  tipoNotificacion,
  medioNotificacion,
  estadoProceso,
  estadoEtapa,
  estadoTarea,
  prioridad,
  calidadUsuario,
  contraparte,
  tipoProcSubtipo,
  etapasProcesales,
};
