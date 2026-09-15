'use strict';
const path = require('path');
const fs   = require('fs');
const { Pool } = require('pg');

// Postgres real (contenedor Docker en 127.0.0.1:5432), no PGlite embebido.
// Antes la app escribia sobre un archivo local (.pgdata) via PGlite —
// cada maquina/proceso tenia su propia copia de los datos. Ahora toda
// conexion va a un unico servidor Postgres real, configurable por env vars
// (con estos defaults, que coinciden con el contenedor 'postgres-db').
let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    host:     process.env.PGHOST     || '127.0.0.1',
    port:     Number(process.env.PGPORT || 5432),
    user:     process.env.PGUSER     || 'root',
    password: process.env.PGPASSWORD || 'root',
    database: process.env.PGDATABASE || 'root',
  });
  _pool.on('error', (err) => {
    // Error en un cliente inactivo del pool (p.ej. el servidor cerro la
    // conexion) — no debe tumbar el proceso, solo queda registrado.
    console.error('[db] Error inesperado en el pool de Postgres:', err.message);
  });
  return _pool;
}

let _ready = null;

async function getDb() {
  const pool = getPool();
  if (!_ready) _ready = _bootstrap(pool);
  await _ready;
  return pool; // pool.query(sql, params) devuelve { rows }, igual que antes
}

async function _bootstrap(pool) {
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS ready
  `);

  if (rows[0].ready) return;

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] Schema inicializado correctamente');

  const seedPath = path.join(__dirname, 'seed.sql');
  if (fs.existsSync(seedPath)) {
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await pool.query(seedSql);
    console.log('[db] Datos paramétricos (seed) cargados correctamente');
  }
}

// Ejecuta fn(tx) dentro de una transaccion con el contexto de auditoria del usuario.
// Uso: const row = await withUser(req.user.sub, tx => tx.query(...))
async function withUser(userId, fn) {
  const pool = getPool();
  if (!_ready) _ready = _bootstrap(pool);
  await _ready;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId != null) {
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getDb, withUser };
