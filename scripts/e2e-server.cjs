'use strict';
// Levanta una instancia AISLADA del backend para las pruebas E2E de Playwright
// (ver v2/front/apps/koop/playwright.config.js). Nunca toca la base de datos
// real de la firma ni S3 ni el correo:
//  - Recrea desde cero una base propia (koop_e2e) en el mismo Postgres.
//  - Deja S3 y Resend sin configurar (los servicios ya toleran su ausencia).
//  - Siembra unos pocos usuarios de prueba con contraseña conocida.
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB = process.env.E2E_DB_NAME || 'koop_e2e';
// Protección: este script hace DROP DATABASE — solo puede apuntar a una base
// cuyo nombre empiece por koop_e2e, jamás a la real.
if (!/^koop_e2e[a-z0-9_]*$/.test(DB)) {
  throw new Error(`E2E_DB_NAME inválido (${DB}): debe empezar por koop_e2e`);
}

process.env.PGDATABASE = DB;
process.env.PORT = process.env.E2E_BACKEND_PORT || '4100';
process.env.NODE_ENV = 'development';
process.env.S3_BUCKET_NAME = '';
process.env.AWS_ACCESS_KEY_ID = '';
process.env.AWS_SECRET_ACCESS_KEY = '';
process.env.RESEND_API_KEY = '';

const PASSWORD = 'E2eTest12345!';
const USERS = [
  { nombre: 'E2E Admin', email: 'e2e.admin@koop.test', rol: 'admin' },
  { nombre: 'E2E Abogado', email: 'e2e.abogado@koop.test', rol: 'abogado' },
  { nombre: 'E2E Cliente', email: 'e2e.cliente@koop.test', rol: 'cliente' },
];

async function recreateDatabase() {
  const admin = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'root',
    password: process.env.PGPASSWORD || 'root',
    database: 'postgres',
  });
  await admin.connect();
  await admin.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [DB]
  );
  await admin.query(`DROP DATABASE IF EXISTS "${DB}"`);
  await admin.query(`CREATE DATABASE "${DB}"`);
  await admin.end();
}

async function seedUsers() {
  const bcrypt = require('bcrypt');
  const usersRepo = require('../src/repositories/users');
  const catalogos = require('../src/repositories/catalogos');
  const roles = await catalogos.roles.findAll();
  const password_hash = await bcrypt.hash(PASSWORD, 4);
  for (const u of USERS) {
    const user = await usersRepo.create({ nombre: u.nombre, email: u.email, password_hash, active: true }, null);
    const rol = roles.find((r) => r.nombre === u.rol);
    if (!rol) throw new Error(`Rol ${u.rol} no existe en el catálogo`);
    await usersRepo.addRole(user.id, rol.id, null);
  }
}

(async () => {
  await recreateDatabase();
  await require('../src/db/client').getDb(); // crea schema + seed + migraciones
  await seedUsers();
  console.log(`[e2e] base ${DB} lista, arrancando API en el puerto ${process.env.PORT}`);
  require('../src/index.js');
})().catch((e) => { console.error('[e2e] no se pudo preparar el entorno:', e); process.exit(1); });
