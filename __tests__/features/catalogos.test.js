'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => {
  const mockCat = () => ({
    findAll: jest.fn(), findById: jest.fn(),
    create: jest.fn(), update: jest.fn(), softDelete: jest.fn(),
  });
  return {
    catalogos: {
      roles:           mockCat(),
      tipoProceso:     mockCat(),
      subtipoProceso:  mockCat(),
      tipoPretension:  mockCat(),
      instancias:      mockCat(),
      tipoActuacion:   mockCat(),
      tipoDocumento:   mockCat(),
      tipoNotificacion: mockCat(),
      medioNotificacion: mockCat(),
      estadoProceso:   mockCat(),
      estadoEtapa:     mockCat(),
      estadoTarea:     mockCat(),
      prioridad:       mockCat(),
      calidadUsuario:  mockCat(),
      contraparte:     mockCat(),
      tipoProcSubtipo: { findAll: jest.fn(), create: jest.fn(), softDelete: jest.fn() },
      etapasProcesales: { ...mockCat() },
    },
  };
});

const request  = require('supertest');
const { makeApp, adminToken, lawyerToken, clientToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/catalogos'));

// ── Catálogos simples (usando 'roles' como representativo) ─────────────────

describe('GET /catalogos/roles', () => {
  it('returns 200 with list when authenticated', async () => {
    repos.catalogos.roles.findAll.mockResolvedValue([{ id: 1, nombre: 'admin' }]);

    const res = await request(app).get('/roles').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repos.catalogos.roles.findAll).toHaveBeenCalledWith({ active: true });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/roles');
    expect(res.status).toBe(401);
  });

  it('respects ?active=false query param', async () => {
    repos.catalogos.roles.findAll.mockResolvedValue([]);
    await request(app).get('/roles?active=false').set('Authorization', adminToken());
    expect(repos.catalogos.roles.findAll).toHaveBeenCalledWith({ active: false });
  });
});

describe('GET /catalogos/roles/:id', () => {
  it('returns 200 when found', async () => {
    repos.catalogos.roles.findById.mockResolvedValue({ id: 1, nombre: 'admin' });

    const res = await request(app).get('/roles/1').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('admin');
  });

  it('returns 404 when not found', async () => {
    repos.catalogos.roles.findById.mockResolvedValue(null);

    const res = await request(app).get('/roles/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /catalogos/roles', () => {
  it('returns 201 when admin creates a catalog entry', async () => {
    repos.catalogos.roles.create.mockResolvedValue({ id: 2, nombre: 'lawyer' });

    const res = await request(app)
      .post('/roles')
      .set('Authorization', adminToken())
      .send({ nombre: 'lawyer' });

    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('lawyer');
  });

  it('returns 403 when a non-admin tries to create', async () => {
    const res = await request(app)
      .post('/roles')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'lawyer' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/roles').send({ nombre: 'lawyer' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /catalogos/roles/:id', () => {
  it('returns 200 when update succeeds', async () => {
    repos.catalogos.roles.update.mockResolvedValue({ id: 1, nombre: 'admin-updated' });

    const res = await request(app)
      .put('/roles/1')
      .set('Authorization', adminToken())
      .send({ nombre: 'admin-updated' });

    expect(res.status).toBe(200);
    expect(repos.catalogos.roles.update).toHaveBeenCalledWith(1, { nombre: 'admin-updated' }, '1');
  });

  it('returns 404 when entry not found', async () => {
    repos.catalogos.roles.update.mockResolvedValue(null);

    const res = await request(app)
      .put('/roles/99')
      .set('Authorization', adminToken())
      .send({ nombre: 'x' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /catalogos/roles/:id', () => {
  it('returns 204 on success', async () => {
    repos.catalogos.roles.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .delete('/roles/1')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });

  it('returns 404 when entry not found', async () => {
    repos.catalogos.roles.softDelete.mockResolvedValue(null);

    const res = await request(app)
      .delete('/roles/99')
      .set('Authorization', adminToken());

    expect(res.status).toBe(404);
  });
});

// ── tipo-proc-combo ────────────────────────────────────────────────────────

describe('POST /catalogos/tipo-proc-combo', () => {
  it('returns 201 when valid data provided', async () => {
    repos.catalogos.tipoProcSubtipo.create.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/tipo-proc-combo')
      .set('Authorization', adminToken())
      .send({ id_tipo_proceso: 1, id_subtipo_proceso: 2 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when ids are missing', async () => {
    const res = await request(app)
      .post('/tipo-proc-combo')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── etapas-procesales ──────────────────────────────────────────────────────

describe('GET /catalogos/etapas-procesales', () => {
  it('returns 200 with filtered list', async () => {
    repos.catalogos.etapasProcesales.findAll.mockResolvedValue([{ id: 1, nombre: 'Demanda' }]);

    const res = await request(app)
      .get('/etapas-procesales?id_tipo_proceso=1')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.catalogos.etapasProcesales.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_tipo_proceso: 1 })
    );
  });
});
