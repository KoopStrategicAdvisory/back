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
    INSERT INTO roles (nombre) VALUES ('admin'), ('lawyer'), ('client')
    ON CONFLICT (nombre) DO NOTHING
  `);
  const { rows } = await db.query(
    `SELECT id, nombre FROM roles WHERE nombre IN ('admin','lawyer','client')`
  );
  const map = {};
  for (const r of rows) map[r.nombre + 'RoleId'] = Number(r.id);
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

module.exports = { makeApp, seedRoles, seedUser, assignRole, tokenFor, seedEstadoProceso, seedTareasCatalogos };
