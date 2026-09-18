'use strict';
/**
 * Pruebas funcionales — Gestión de Tareas
 *
 * Flujo cubierto:
 *   1. Abogado crea tareas (con y sin expediente)
 *   2. Listado de tareas con filtros
 *   3. Mis tareas (asignadas al usuario autenticado)
 *   4. Asignación de tarea a otro usuario
 *   5. Actualización de estado de tarea
 *   6. Gestión de checklist (crear, actualizar, eliminar)
 *   7. Proximas a vencer
 *   8. Soft-delete de tarea
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
const {
  makeApp, seedRoles, seedUser, assignRole, tokenFor,
  seedTareasCatalogos,
} = require('./helpers');

let app;
let lawyerToken;
let lawyerId;
let expedienteId;
let tareaId;
let tareaConExpedienteId;
let checklistItemId;
let estadoPendienteId;
let estadoCompletadoId;
let prioridadAltaId;

beforeAll(async () => {
  const db = await getDb();

  const roles = await seedRoles(db);

  const lawyer = await seedUser(db, {
    nombre: 'Abogada Tareas',
    email:  'lawyer-tasks@koop.test',
    password: 'Lawyer1234!',
  });
  await assignRole(db, lawyer.id, roles.lawyerRoleId);
  lawyerId    = Number(lawyer.id);
  lawyerToken = tokenFor({ id: lawyer.id, nombre: lawyer.nombre, email: lawyer.email, roles: ['lawyer'] });

  const cats = await seedTareasCatalogos(db);
  estadoPendienteId  = cats.estadoPendienteId;
  estadoCompletadoId = cats.estadoCompletadoId;
  prioridadAltaId    = cats.prioridadAltaId;

  // Create an expediente directly in the DB for tarea FK tests
  const { rows: [exp] } = await db.query(
    `INSERT INTO expediente (id_usuario, numero_de_expediente)
     VALUES ($1, $2) RETURNING id`,
    [lawyer.id, 'EXP-TAREAS-001']
  );
  expedienteId = Number(exp.id);

  app = makeApp();
}, 30000);

// ---------------------------------------------------------------------------
// Crear tareas
// ---------------------------------------------------------------------------

describe('Crear tareas', () => {
  test('POST /api/tareas — sin auth → 401', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .send({ titulo: 'Sin auth' });

    expect(res.status).toBe(401);
  });

  test('POST /api/tareas — sin título → 400', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ id_expediente: expedienteId });

    expect(res.status).toBe(400);
  });

  test('POST /api/tareas — tarea simple sin expediente → 201', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        titulo:               'Revisar contrato',
        id_prioridad:         prioridadAltaId,
        id_estado_tarea:      estadoPendienteId,
        id_usuario_asignado:  lawyerId,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.titulo).toBe('Revisar contrato');
    tareaId = res.body.id;
  });

  test('POST /api/tareas — tarea vinculada a expediente → 201', async () => {
    const res = await request(app)
      .post('/api/tareas')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({
        titulo:          'Presentar escrito',
        id_expediente:   expedienteId,
        id_prioridad:    prioridadAltaId,
        id_estado_tarea: estadoPendienteId,
        fecha_limite:    '2026-12-31',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.id_expediente)).toBe(expedienteId);
    tareaConExpedienteId = res.body.id;
  });
});

// ---------------------------------------------------------------------------
// Consultar tareas
// ---------------------------------------------------------------------------

describe('Consultar tareas', () => {
  test('GET /api/tareas — lista general → 200', async () => {
    const res = await request(app)
      .get('/api/tareas')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/tareas?id_expediente=X — filtro por expediente → 200', async () => {
    const res = await request(app)
      .get(`/api/tareas?id_expediente=${expedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((t) => Number(t.id_expediente) === expedienteId)).toBe(true);
  });

  test('GET /api/tareas/:id → 200', async () => {
    const res = await request(app)
      .get(`/api/tareas/${tareaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tareaId);
    expect(res.body.titulo).toBe('Revisar contrato');
  });

  test('GET /api/tareas/9999 — inexistente → 404', async () => {
    const res = await request(app)
      .get('/api/tareas/9999')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(404);
  });

  test('GET /api/tareas/mis-tareas — tareas del usuario autenticado → 200', async () => {
    const res = await request(app)
      .get('/api/tareas/mis-tareas')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // The lawyer is assigned to tareaId
    expect(res.body.some((t) => t.id === tareaId)).toBe(true);
  });

  test('GET /api/tareas/proximas-vencer → 200', async () => {
    const res = await request(app)
      .get('/api/tareas/proximas-vencer')
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Actualizar tareas
// ---------------------------------------------------------------------------

describe('Actualizar tareas', () => {
  test('PUT /api/tareas/:id — cambiar estado a completada → 200', async () => {
    const res = await request(app)
      .put(`/api/tareas/${tareaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ id_estado_tarea: estadoCompletadoId });

    expect(res.status).toBe(200);
    expect(Number(res.body.id_estado_tarea)).toBe(estadoCompletadoId);
  });

  test('PUT /api/tareas/:id — actualizar descripción → 200', async () => {
    const res = await request(app)
      .put(`/api/tareas/${tareaId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ descripcion: 'Revisar contrato de arrendamiento actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.descripcion).toBe('Revisar contrato de arrendamiento actualizado');
  });

  test('PUT /api/tareas/9999 — inexistente → 404', async () => {
    const res = await request(app)
      .put('/api/tareas/9999')
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ descripcion: 'No existe' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Checklist de tarea
// ---------------------------------------------------------------------------

describe('Checklist de tarea', () => {
  test('GET /api/tareas/:id/checklist — lista vacía → 200', async () => {
    const res = await request(app)
      .get(`/api/tareas/${tareaId}/checklist`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/tareas/:id/checklist — agregar item → 201', async () => {
    const res = await request(app)
      .post(`/api/tareas/${tareaId}/checklist`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ titulo: 'Verificar fecha de vencimiento' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.titulo).toBe('Verificar fecha de vencimiento');
    expect(res.body.completado).toBe(false);
    checklistItemId = res.body.id;
  });

  test('GET /api/tareas/:id/checklist — ahora tiene 1 item → 200', async () => {
    const res = await request(app)
      .get(`/api/tareas/${tareaId}/checklist`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('PUT /api/tareas/:id/checklist/:itemId — marcar como completado → 200', async () => {
    const res = await request(app)
      .put(`/api/tareas/${tareaId}/checklist/${checklistItemId}`)
      .set('Authorization', `Bearer ${lawyerToken}`)
      .send({ completado: true });

    expect(res.status).toBe(200);
    expect(res.body.completado).toBe(true);
  });

  test('DELETE /api/tareas/:id/checklist/:itemId → 204', async () => {
    const res = await request(app)
      .delete(`/api/tareas/${tareaId}/checklist/${checklistItemId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Eliminar tarea
// ---------------------------------------------------------------------------

describe('Eliminar tarea', () => {
  test('DELETE /api/tareas/:id → 204', async () => {
    const res = await request(app)
      .delete(`/api/tareas/${tareaConExpedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(204);
  });

  test('GET /api/tareas/:id después de eliminar → 200 con active false', async () => {
    const res = await request(app)
      .get(`/api/tareas/${tareaConExpedienteId}`)
      .set('Authorization', `Bearer ${lawyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });
});
