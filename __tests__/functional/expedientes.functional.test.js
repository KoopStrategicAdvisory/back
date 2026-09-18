'use strict';
/**
 * Pruebas funcionales — Gestión de Expedientes
 *
 * Flujo cubierto:
 *   1. Abogado crea un cliente
 *   2. Abogado crea un expediente (sin y con cliente)
 *   3. Listado + filtros de expedientes
 *   4. Consulta por ID
 *   5. Actualización de expediente
 *   6. Gestión de etapas del expediente (CRUD)
 *   7. Soft-delete del expediente
 *   8. Accesos no autorizados → 401 / 403
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
const { makeApp, seedRoles, seedUser, assignRole, tokenFor, seedEstadoProceso } = require('./helpers');

let app;
let adminToken;
let lawyerToken;
let clienteId;
let expedienteId;
let etapaId;

beforeAll(async () => {
  const db = await getDb();

  const roles = await seedRoles(db);
  const { estadoActivoId } = await seedEstadoProceso(db);

  const admin = await seedUser(db, {
    nombre: 'Admin Exp',
    email:  'admin-exp@koop.test',
    password: 'Admin1234!',
  });
  await assignRole(db, admin.id, roles.adminRoleId);

  const lawyer = await seedUser(db, {
    nombre: 'Abogado Exp',
    email:  'lawyer-exp@koop.test',
    password: 'Lawyer1234!',
  });
  await assignRole(db, lawyer.id, roles.lawyerRoleId);

  adminToken  = tokenFor({ id: admin.id,  nombre: admin.nombre,  email: admin.email,  roles: ['admin'] });
  lawyerToken = tokenFor({ id: lawyer.id, nombre: lawyer.nombre, email: lawyer.email, roles: ['lawyer'] });

  app = makeApp();
}, 30000);

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

describe('Gestión de clientes', () => {
  test('POST /api/clientes — abogado crea cliente → 201', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ nombre: 'Empresa ABC S.A.S', tipo_persona: 'JURIDICA' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.nombre).toBe('Empresa ABC S.A.S');
    clienteId = res.body.id;
  });

  test('GET /api/clientes — lista de clientes → 200', async () => {
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    // list-clientes returns { data: [], total }
    const items = Array.isArray(res.body) ? res.body : res.body.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.some((c) => c.id === clienteId)).toBe(true);
  });

  test('GET /api/clientes — sin token → 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Expedientes — CRUD
// ---------------------------------------------------------------------------

describe('Gestión de expedientes', () => {
  test('POST /api/expedientes — sin auth → 401', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .send({ numero_de_expediente: 'EXP-001' });

    expect(res.status).toBe(401);
  });

  test('POST /api/expedientes — falta numero_de_expediente → 400', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ id_cliente: clienteId });

    expect(res.status).toBe(400);
  });

  test('POST /api/expedientes — abogado crea expediente → 201', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        numero_de_expediente: 'EXP-2026-001',
        id_cliente: clienteId,
        juzgado_o_autoridad_que_conoce: 'Juzgado 5 Civil',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.numero_de_expediente).toBe('EXP-2026-001');
    expedienteId = res.body.id;
  });

  test('POST /api/expedientes — número duplicado → 409', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ numero_de_expediente: 'EXP-2026-001' });

    expect(res.status).toBe(409);
  });

  test('GET /api/expedientes — lista → 200 + contiene el creado', async () => {
    const res = await request(app)
      .get('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((e) => e.id === expedienteId)).toBe(true);
  });

  test('GET /api/expedientes?search=EXP-2026 — filtro por texto → 200', async () => {
    const res = await request(app)
      .get('/api/expedientes?search=EXP-2026')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/expedientes/:id → 200 con datos del cliente', async () => {
    const res = await request(app)
      .get(`/api/expedientes/${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(expedienteId);
    expect(res.body.nombre_cliente).toBe('Empresa ABC S.A.S');
  });

  test('GET /api/expedientes/9999 — inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/expedientes/9999')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(404);
  });

  test('PUT /api/expedientes/:id — actualizar juzgado → 200', async () => {
    const res = await request(app)
      .put(`/api/expedientes/${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ juzgado_o_autoridad_que_conoce: 'Juzgado 10 Civil' });

    expect(res.status).toBe(200);
    expect(res.body.juzgado_o_autoridad_que_conoce).toBe('Juzgado 10 Civil');
  });
});

// ---------------------------------------------------------------------------
// Etapas del expediente
// ---------------------------------------------------------------------------

describe('Etapas del expediente', () => {
  test('POST /api/expedientes/:id/etapas → 201', async () => {
    const res = await request(app)
      .post(`/api/expedientes/${expedienteId}/etapas`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        origen: 'manual',
        observaciones: 'Primera etapa del proceso',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(Number(res.body.id_expediente)).toBe(expedienteId);
    etapaId = res.body.id;
  });

  test('GET /api/expedientes/:id/etapas → 200 + lista', async () => {
    const res = await request(app)
      .get(`/api/expedientes/${expedienteId}/etapas`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((e) => e.id === etapaId)).toBe(true);
  });

  test('PUT /api/expedientes/:id/etapas/:etapaId — actualizar observaciones → 200', async () => {
    const res = await request(app)
      .put(`/api/expedientes/${expedienteId}/etapas/${etapaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ observaciones: 'Etapa actualizada' });

    expect(res.status).toBe(200);
  });

  test('DELETE /api/expedientes/:id/etapas/:etapaId → 204', async () => {
    const res = await request(app)
      .delete(`/api/expedientes/${expedienteId}/etapas/${etapaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Soft-delete del expediente
// ---------------------------------------------------------------------------

describe('Eliminación de expediente', () => {
  test('DELETE /api/expedientes/:id — abogado elimina → 204', async () => {
    const res = await request(app)
      .delete(`/api/expedientes/${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(204);
  });

  test('GET /api/expedientes/:id después de eliminar → 200 con active false', async () => {
    const res = await request(app)
      .get(`/api/expedientes/${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  test('GET /api/expedientes — el eliminado no aparece en la lista activa', async () => {
    const res = await request(app)
      .get('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((e) => e.id !== expedienteId)).toBe(true);
  });
});
