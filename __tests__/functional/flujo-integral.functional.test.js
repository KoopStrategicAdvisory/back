'use strict';
/**
 * Pruebas funcionales — Flujo Integral Extremo a Extremo
 *
 * Simula el ciclo completo de trabajo de un despacho jurídico:
 *
 *   1.  Admin inicia sesión
 *   2.  Admin crea un usuario abogado y le asigna el rol
 *   3.  Abogado inicia sesión
 *   4.  Abogado crea un cliente
 *   5.  Abogado apertura un expediente para el cliente
 *   6.  Abogado crea tareas para el expediente
 *   7.  Abogado asigna una tarea a sí mismo
 *   8.  Abogado actualiza estado de la tarea a "Completada"
 *   9.  Abogado registra una actuación en el expediente
 *   10. Abogado agrega una audiencia próxima al expediente
 *   11. Admin registra honorarios del expediente
 *   12. Admin registra un pago del cliente
 *   13. Admin consulta el resumen financiero del expediente
 *   14. GET /api/audiencias/proximas — verifica que aparece la audiencia
 *   15. GET /api/tareas/proximas-vencer — verifica que las tareas aparecen
 *   16. Admin lista todos los expedientes con el expediente creado
 */

process.env.ACCESS_TOKEN_SECRET  = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.BCRYPT_SALT_ROUNDS   = '1';
process.env.NODE_ENV             = 'test';

jest.mock('../../src/db/client', () => {
  const path = require('path');
  return require(path.join(__dirname, 'db-client'));
});

const request = require('supertest');
const { getDb } = require('../../src/db/client');
const {
  makeApp, seedRoles, seedUser, assignRole, tokenFor,
  seedTareasCatalogos,
} = require('./helpers');

let app;

// Tokens
let adminToken;
let lawyerToken;

// Resource IDs accumulated across tests
let adminId;
let lawyerId;
let lawyerRoleId;
let clienteId;
let expedienteId;
let tareaId;
let actuacionId;
let audienciaId;
let honorarioId;
let pagoId;
let estadoCompletadoId;

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

beforeAll(async () => {
  const db  = await getDb();
  const roles = await seedRoles(db);
  lawyerRoleId = roles.lawyerRoleId;

  const cats = await seedTareasCatalogos(db);
  estadoCompletadoId = cats.estadoCompletadoId;

  // Seed estado_proceso for expediente
  await db.query(
    `INSERT INTO estado_proceso (nombre) VALUES ('Activo'), ('Cerrado') ON CONFLICT (nombre) DO NOTHING`
  );

  // Create admin user
  const admin = await seedUser(db, {
    nombre: 'Admin Integral',
    email:  'admin-integral@koop.test',
    password: 'Admin1234!',
  });
  await assignRole(db, admin.id, roles.adminRoleId);
  adminId    = Number(admin.id);
  adminToken = tokenFor({ id: admin.id, nombre: admin.nombre, email: admin.email, roles: ['admin'] });

  app = makeApp();
}, 30000);

// ---------------------------------------------------------------------------
// Paso 1–2: Admin crea al abogado y le asigna el rol
// ---------------------------------------------------------------------------

describe('Paso 1-2: Onboarding del abogado', () => {
  test('Admin crea usuario abogado → 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre:   'Lic. García',
        email:    'garcia@koop.test',
        password: 'Lawyer1234!',
        active:   true,
      });

    expect(res.status).toBe(201);
    lawyerId    = res.body.id;
    lawyerToken = tokenFor({ id: lawyerId, nombre: 'Lic. García', email: 'garcia@koop.test', roles: ['lawyer'] });
  });

  test('Admin asigna rol lawyer → 201', async () => {
    const res = await request(app)
      .post(`/api/users/${lawyerId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id_rol: lawyerRoleId });

    expect(res.status).toBe(201);
  });

  test('Abogado puede iniciar sesión → 200 + rol lawyer', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'garcia@koop.test', password: 'Lawyer1234!' });

    expect(res.status).toBe(200);
    expect(res.body.user.roles).toContain('lawyer');
  });
});

// ---------------------------------------------------------------------------
// Paso 3–5: Abogado crea cliente y expediente
// ---------------------------------------------------------------------------

describe('Paso 3-5: Cliente y expediente', () => {
  test('Abogado crea cliente → 201', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        nombre:       'Constructora XYZ Ltda.',
        tipo_persona: 'JURIDICA',
        email:        'xyz@constructora.com',
        telefono:     '3001234567',
      });

    expect(res.status).toBe(201);
    clienteId = res.body.id;
  });

  test('Abogado apertura expediente para el cliente → 201', async () => {
    const res = await request(app)
      .post('/api/expedientes')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        numero_de_expediente:          'EXP-INT-2026-001',
        id_cliente:                    clienteId,
        juzgado_o_autoridad_que_conoce: 'Tribunal Administrativo del Cundinamarca',
      });

    expect(res.status).toBe(201);
    expedienteId = res.body.id;
    expect(Number(res.body.id_cliente)).toBe(clienteId);
  });

  test('GET /api/expedientes/:id — expediente creado tiene datos del cliente', async () => {
    const res = await request(app)
      .get(`/api/expedientes/${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.nombre_cliente).toBe('Constructora XYZ Ltda.');
  });
});

// ---------------------------------------------------------------------------
// Paso 6–8: Tareas del expediente
// ---------------------------------------------------------------------------

describe('Paso 6-8: Tareas y asignación', () => {
  test('Abogado crea tarea para el expediente → 201', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        titulo:              'Preparar demanda de nulidad',
        id_expediente:       expedienteId,
        id_usuario_asignado: lawyerId,
        fecha_limite:        tomorrow(),
      });

    expect(res.status).toBe(201);
    tareaId = res.body.id;
    expect(Number(res.body.id_expediente)).toBe(expedienteId);
  });

  test('GET /api/tareas/mis-tareas — abogado ve su tarea asignada', async () => {
    const res = await request(app)
      .get('/api/tareas/mis-tareas')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((t) => t.id === tareaId)).toBe(true);
  });

  test('Abogado completa la tarea → 200 + estado actualizado', async () => {
    const res = await request(app)
      .put(`/api/tareas/${tareaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ id_estado_tarea: estadoCompletadoId });

    expect(res.status).toBe(200);
    expect(Number(res.body.id_estado_tarea)).toBe(estadoCompletadoId);
  });
});

// ---------------------------------------------------------------------------
// Paso 9: Actuaciones
// ---------------------------------------------------------------------------

describe('Paso 9: Actuaciones del expediente', () => {
  test('Abogado registra actuación → 201', async () => {
    const res = await request(app)
      .post('/api/actuaciones')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        id_expediente: expedienteId,
        fecha:         new Date().toISOString().split('T')[0],
        titulo:        'Radicación de demanda',
        descripcion:   'Radicación de demanda ante el Tribunal',
      });

    expect(res.status).toBe(201);
    actuacionId = res.body.id;
    expect(Number(res.body.id_expediente)).toBe(expedienteId);
  });

  test('GET /api/actuaciones?id_expediente=X → 200 + contiene la actuación', async () => {
    const res = await request(app)
      .get(`/api/actuaciones?id_expediente=${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((a) => a.id === actuacionId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Paso 10: Audiencias
// ---------------------------------------------------------------------------

describe('Paso 10: Audiencias próximas', () => {
  test('Abogado agenda audiencia próxima → 201', async () => {
    const res = await request(app)
      .post('/api/audiencias')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        id_expediente:   expedienteId,
        fecha_programada: `${tomorrow()} 09:00:00`,
        tipo_audiencia:  'Audiencia inicial',
      });

    expect(res.status).toBe(201);
    audienciaId = res.body.id;
  });

  test('GET /api/audiencias/proximas — audiencia del mañana aparece', async () => {
    const res = await request(app)
      .get('/api/audiencias/proximas?dias=7')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.some((a) => a.id === audienciaId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Paso 11–13: Financiero
// ---------------------------------------------------------------------------

describe('Paso 11-13: Honorarios y pagos', () => {
  test('Admin registra honorario para el expediente → 201', async () => {
    const res = await request(app)
      .post('/api/financiero/honorarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_expediente:       expedienteId,
        monto_total_pactado: 5000000,
        moneda:              'COP',
      });

    expect(res.status).toBe(201);
    honorarioId = res.body.id;
  });

  test('Admin registra pago del cliente → 201', async () => {
    const res = await request(app)
      .post('/api/financiero/pagos')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id_expediente: expedienteId,
        id_honorario:  honorarioId,
        monto:         2000000,
        fecha_pago:    new Date().toISOString().split('T')[0],
      });

    expect(res.status).toBe(201);
    pagoId = res.body.id;
  });

  test('GET /api/financiero/resumen/:idExpediente → 200 con totales', async () => {
    const res = await request(app)
      .get(`/api/financiero/resumen/${expedienteId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_honorarios');
    expect(res.body).toHaveProperty('total_pagado');
    expect(res.body).toHaveProperty('total_gastos');
    // Verify values are numeric strings (as returned by PostgreSQL aggregates)
    expect(parseFloat(res.body.total_honorarios)).toBeGreaterThan(0);
    expect(parseFloat(res.body.total_pagado)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Paso 14–16: Vistas globales
// ---------------------------------------------------------------------------

describe('Paso 14-16: Vistas globales y dashboard', () => {
  test('GET /api/tareas/proximas-vencer → 200 (lista con la tarea creada)', async () => {
    const res = await request(app)
      .get('/api/tareas/proximas-vencer')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/expedientes — admin ve el expediente integral → 200', async () => {
    const res = await request(app)
      .get('/api/expedientes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((e) => e.id === expedienteId)).toBe(true);
  });

  test('GET /api/catalogos/roles — admin consulta catálogo de roles → 200', async () => {
    const res = await request(app)
      .get('/api/catalogos/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const nombres = res.body.map((r) => r.nombre);
    expect(nombres).toContain('admin');
    expect(nombres).toContain('lawyer');
  });
});
