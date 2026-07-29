'use strict';
const path = require('path');
const fs   = require('fs');

let _db = null;

async function getDb() {
  if (_db) return _db;

  // PGlite es ESM-only; se carga con dynamic import desde CJS
  const { PGlite } = await import('@electric-sql/pglite');

  const dataDir = path.resolve(__dirname, '../../../.pgdata');
  fs.mkdirSync(dataDir, { recursive: true });

  _db = new PGlite({ dataDir });
  await _db.waitReady;

  await _bootstrap(_db);
  return _db;
}

async function _bootstrap(db) {
  const { rows } = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS ready
  `);

  if (rows[0].ready) return;

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(sql);
  console.log('[db] Schema inicializado correctamente');
}

// Ejecuta fn(tx) dentro de una transaccion con el contexto de auditoria del usuario.
// Uso: const row = await withUser(req.user.sub, tx => tx.query(...))
async function withUser(userId, fn) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (userId != null) {
      await tx.query(`SELECT set_config('app.user_id', $1, true)`, [String(userId)]);
    }
    return fn(tx);
  });
}

module.exports = { getDb, withUser };
