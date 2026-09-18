'use strict';
/**
 * Pruebas funcionales — Gestión de Usuarios y Autenticación
 *
 * Flujo cubierto:
 *   1. Login con credenciales de admin (usuario sembrado)
 *   2. Admin crea un usuario abogado
 *   3. Admin asigna rol de abogado
 *   4. Abogado inicia sesión
 *   5. Listado y consulta de usuarios (requiere auth)
 *   6. Auto-registro público → pendiente de activación
 *   7. Login con cuenta inactiva → 403
 *   8. Login con contraseña incorrecta → 401
 */

process.env.ACCESS_TOKEN_SECRET  = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.BCRYPT_SALT_ROUNDS   = '1';
process.env.NODE_ENV             = 'test';

jest.mock('../../src/db/client', () => {
  const path = require('path');
  return require(path.join(__dirname, 'db-client'));
});

const request  = require('supertest');
const { getDb } = require('../../src/db/client');
const { makeApp, seedRoles, seedUser, assignRole } = require('./helpers');

let app;
let adminToken;
let lawyerRoleId;
let lawyerId;
let lawyerToken;

beforeAll(async () => {
  const db = await getDb();

  // Seed roles
  const roles = await seedRoles(db);
  lawyerRoleId = roles.lawyerRoleId;

  // Seed admin user (active = true)
  const admin = await seedUser(db, {
    nombre: 'Administrador',
    email: 'admin@koop.test',
    password: 'Admin1234!',
  });
  await assignRole(db, admin.id, roles.adminRoleId);

  app = makeApp();
}, 30000);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('Autenticación', () => {
  test('POST /api/auth/login — admin correcto → 200 + accessToken', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@koop.test', password: 'Admin1234!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.roles).toContain('admin');
    adminToken = res.body.accessToken;
  });

  test('POST /api/auth/login — contraseña incorrecta → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@koop.test', password: 'WrongPass!' });

    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login — email inexistente → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@koop.test', password: 'Admin1234!' });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — sin token → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — con token admin → 200', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'admin@koop.test');
  });
});

// ---------------------------------------------------------------------------
// Gestión de usuarios (CRUD admin)
// ---------------------------------------------------------------------------

describe('Gestión de usuarios', () => {
  test('GET /api/users — sin token → 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('GET /api/users — admin autenticado → 200 + lista', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/users — admin crea abogado → 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre:   'Abogado Pérez',
        email:    'abogado@koop.test',
        password: 'Lawyer1234!',
        active:   true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('abogado@koop.test');
    lawyerId = res.body.id;
  });

  test('POST /api/users — datos inválidos → 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Sin email', password: 'Pass1234!' });

    expect(res.status).toBe(400);
  });

  test('POST /api/users — email duplicado → 409', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre:   'Duplicado',
        email:    'abogado@koop.test',
        password: 'Pass1234!',
      });

    expect(res.status).toBe(409);
  });

  test('GET /api/users/:id — obtener abogado → 200', async () => {
    const res = await request(app)
      .get(`/api/users/${lawyerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(lawyerId);
    expect(res.body.email).toBe('abogado@koop.test');
  });

  test('POST /api/users/:id/roles — asignar rol lawyer → 201', async () => {
    const res = await request(app)
      .post(`/api/users/${lawyerId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id_rol: lawyerRoleId });

    expect(res.status).toBe(201);
  });

  test('GET /api/users/:id — abogado ahora tiene rol lawyer', async () => {
    const res = await request(app)
      .get(`/api/users/${lawyerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const roleNames = res.body.roles.map((r) => r.nombre);
    expect(roleNames).toContain('lawyer');
  });

  test('GET /api/users/9999 — ID inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/users/9999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('PUT /api/users/:id — admin actualiza abogado → 200', async () => {
    const res = await request(app)
      .put(`/api/users/${lawyerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cargo: 'Abogado Senior' });

    expect(res.status).toBe(200);
    expect(res.body.cargo).toBe('Abogado Senior');
  });
});

// ---------------------------------------------------------------------------
// Login del abogado
// ---------------------------------------------------------------------------

describe('Login de usuario abogado', () => {
  test('POST /api/auth/login — abogado correcto → 200', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'abogado@koop.test', password: 'Lawyer1234!' });

    expect(res.status).toBe(200);
    expect(res.body.user.roles).toContain('lawyer');
    lawyerToken = res.body.accessToken;
  });
});

// ---------------------------------------------------------------------------
// Auto-registro público
// ---------------------------------------------------------------------------

describe('Auto-registro y activación', () => {
  test('POST /api/auth/register — público, cuenta inactiva → 201', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        nombre:   'Nuevo Usuario',
        email:    'nuevo@koop.test',
        password: 'NewPass1234!',
      });

    expect(res.status).toBe(201);
    expect(res.body.pendingActivation).toBe(true);
    expect(res.body.user.active).toBe(false);
  });

  test('POST /api/auth/login — cuenta inactiva → 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nuevo@koop.test', password: 'NewPass1234!' });

    expect(res.status).toBe(403);
  });

  test('POST /api/auth/register — email duplicado → 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        nombre:   'Duplicado',
        email:    'nuevo@koop.test',
        password: 'NewPass1234!',
      });

    expect(res.status).toBe(409);
  });
});
