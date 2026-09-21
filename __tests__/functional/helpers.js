'use strict';
const path        = require('path');
const express     = require('express');
const cors        = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt      = require('bcrypt');
const jwt         = require('jsonwebtoken');

const SALT_ROUNDS = 1; // fast hashing in tests

/**
 * Builds and returns a fully-wired Express app (all features + error handler).
 * Call this AFTER jest.mock('../../src/db/client', ...) is in place so that
 * all feature modules resolve to the in-memory PGlite.
 */
function makeApp() {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const src = (p) => path.join(__dirname, '../../src', p);

  app.use('/api/auth',           require(src('features/auth')));
  app.use('/api/catalogos',      require(src('features/catalogos')));
  app.use('/api/clientes',       require(src('features/clientes')));
  app.use('/api/users',          require(src('features/users')));
  app.use('/api/expedientes',    require(src('features/expedientes')));
  app.use('/api/iter-procesal',  require(src('features/iter-procesal')));
  app.use('/api/tareas',         require(src('features/tareas')));
  app.use('/api/actuaciones',    require(src('features/actuaciones')));
  app.use('/api/notificaciones', require(src('features/notificaciones')));
  app.use('/api/audiencias',     require(src('features/audiencias')));
  app.use('/api/documentos',     require(src('features/documentos')));
  app.use('/api/financiero',     require(src('features/financiero')));
  app.use('/api/kanban',         require(src('features/kanban')));
  app.use('/api/colaboracion',   require(src('features/colaboracion')));

  app.use(require(src('middleware/error-handler')));
  return app;
}

/**
 * Seeds the minimum catalog entries needed by most test flows.
 * Returns { adminRoleId, lawyerRoleId, clientRoleId }
 */
async function seedRoles(db) {
  await db.query(`
    INSERT INTO roles (nombre) VALUES ('admin'), ('abogado'), ('cliente')
    ON CONFLICT (nombre) DO NOTHING
  `);
  const { rows } = await db.query(
    `SELECT id, nombre FROM roles WHERE nombre IN ('admin','abogado','cliente')`
  );
  const map = {};
  // Los nombres reales del catálogo están en español (ver seed.sql); las claves
  // del resultado conservan lawyer/client para no reescribir todas las pruebas.
  const clave = { admin: 'admin', abogado: 'lawyer', cliente: 'client' };
  for (const r of rows) map[clave[r.nombre] + 'RoleId'] = Number(r.id);
  return map; // { adminRoleId, lawyerRoleId, clientRoleId }
}

/**
 * Creates a user directly in the DB (bypasses bcrypt slow rounds) with active=true.
 * Returns the inserted row including id.
 */
async function seedUser(db, { nombre, email, password = 'Password123!', active = true } = {}) {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const { rows } = await db.query(
    `INSERT INTO users (nombre, email, password_hash, active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nombre, email, active`,
    [nombre, email, hash, active]
  );
  return rows[0];
}

/**
 * Assigns a role to a user.
 */
async function assignRole(db, userId, roleId) {
  await db.query(
    `INSERT INTO user_rol (id_usuario, id_rol) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, roleId]
  );
}

/**
 * Generates a signed JWT access token for a user (without hitting the DB).
 * roles: array of role name strings
 */
function tokenFor({ id, nombre, email, roles = [] }) {
  return jwt.sign(
    { sub: String(id), name: nombre, email, roles, active: true },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Seeds the minimum catalog data for creating expedientes with a status.
 * Returns { estadoActivoId }
 */
async function seedEstadoProceso(db) {
  await db.query(
    `INSERT INTO estado_proceso (nombre) VALUES ('Activo'), ('Cerrado')
     ON CONFLICT (nombre) DO NOTHING`
  );
  const { rows } = await db.query(
    `SELECT id FROM estado_proceso WHERE nombre = 'Activo'`
  );
  return { estadoActivoId: Number(rows[0].id) };
}

/**
 * Seeds catalog entries needed for tareas (prioridad, estado_tarea).
 * Returns { prioridadAltaId, estadoPendienteId, estadoCompletadoId }
 */
async function seedTareasCatalogos(db) {
  await db.query(
    `INSERT INTO prioridad (nombre, nivel) VALUES ('Alta', 1), ('Media', 2), ('Baja', 3)
     ON CONFLICT (nombre) DO NOTHING`
  );
  await db.query(
    `INSERT INTO estado_tarea (nombre) VALUES ('Pendiente'), ('En progreso'), ('Completada')
     ON CONFLICT (nombre) DO NOTHING`
  );
  const { rows: [pa] } = await db.query(`SELECT id FROM prioridad WHERE nombre = 'Alta'`);
  const { rows: [ep] } = await db.query(`SELECT id FROM estado_tarea WHERE nombre = 'Pendiente'`);
  const { rows: [ec] } = await db.query(`SELECT id FROM estado_tarea WHERE nombre = 'Completada'`);
  return {
    prioridadAltaId:     Number(pa.id),
    estadoPendienteId:   Number(ep.id),
    estadoCompletadoId:  Number(ec.id),
  };
}

/**
 * Seeds una materia mínima (tipo de proceso / subtipo / pretensión + su combo).
 * expediente.id_tipo_proc_subtipo_proc_tipo_pre es NOT NULL, así que todo
 * expediente de prueba necesita un combo válido. Devuelve { comboId }.
 */
async function seedMateria(db) {
  await db.query(`INSERT INTO tipo_proceso (id, nombre) VALUES (1, 'Civil') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO subtipo_proceso (id, nombre) VALUES (1, 'General') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO tipo_pretension (id, nombre) VALUES (1, 'General') ON CONFLICT DO NOTHING`);
  await db.query(
    `INSERT INTO tipo_proc_subtipo_proc_tipo_pre (id, id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension)
     VALUES (1, 1, 1, 1) ON CONFLICT DO NOTHING`
  );
  return { comboId: 1 };
}

/**
 * Cuerpo válido para POST /api/expedientes: además del número exige materia,
 * contraparte y correo del juzgado. `extra` sobreescribe/agrega campos.
 */
function datosExpediente(comboId, extra = {}) {
  return {
    id_tipo_proc_subtipo_proc_tipo_pre: comboId,
    contraparte: 'Contraparte de prueba',
    correo_juzgado: 'juzgado@prueba.test',
    ...extra,
  };
}

/** Tipo de actuación mínimo: actuaciones.id_tipo_actuacion es NOT NULL. */
async function seedTipoActuacion(db) {
  await db.query(`INSERT INTO tipo_actuacion (nombre) VALUES ('Memorial') ON CONFLICT (nombre) DO NOTHING`);
  const { rows: [r] } = await db.query(`SELECT id FROM tipo_actuacion WHERE nombre = 'Memorial'`);
  return { tipoActuacionId: Number(r.id) };
}

/** Estado de etapa mínimo: expediente_etapas.id_estado_etapa es NOT NULL. */
async function seedEstadoEtapa(db) {
  await db.query(`INSERT INTO estado_etapa (nombre) VALUES ('Pendiente') ON CONFLICT (nombre) DO NOTHING`);
  const { rows: [r] } = await db.query(`SELECT id FROM estado_etapa WHERE nombre = 'Pendiente'`);
  return { estadoEtapaId: Number(r.id) };
}

module.exports = { seedTipoActuacion, seedEstadoEtapa, makeApp, seedRoles, seedUser, assignRole, tokenFor, seedEstadoProceso, seedTareasCatalogos, seedMateria, datosExpediente };
