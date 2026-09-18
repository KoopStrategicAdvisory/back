'use strict';
const path = require('path');
const fs   = require('fs');

let _db = null;

async function getDb() {
  if (_db) return _db;

  const { PGlite } = await import('@electric-sql/pglite');
  _db = new PGlite(); // in-memory, no dataDir
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

  const sql = fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8');
  await db.exec(sql);
}

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
