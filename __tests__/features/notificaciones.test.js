'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  notificaciones: {
    findAll:           jest.fn(),
    findById:          jest.fn(),
    create:            jest.fn(),
    update:            jest.fn(),
    softDelete:        jest.fn(),
    findProximasVencer: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/notificaciones'));

const NOTIFICACION = { id: 1, id_expediente: 3, fecha_notificacion: '2026-02-01', descripcion: 'Citación a audiencia' };

describe('GET /notificaciones/proximas-vencer', () => {
  it('returns 200 with upcoming notifications', async () => {
    repos.notificaciones.findProximasVencer.mockResolvedValue([NOTIFICACION]);

    const res = await request(app)
      .get('/proximas-vencer?dias=10')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.notificaciones.findProximasVencer).toHaveBeenCalledWith(10);
  });

  it('defaults to 7 days', async () => {
    repos.notificaciones.findProximasVencer.mockResolvedValue([]);

    await request(app).get('/proximas-vencer').set('Authorization', adminToken());

    expect(repos.notificaciones.findProximasVencer).toHaveBeenCalledWith(7);
  });
});

describe('GET /notificaciones', () => {
  it('returns 200 with list', async () => {
    repos.notificaciones.findAll.mockResolvedValue([NOTIFICACION]);

    const res = await request(app)
      .get('/?id_expediente=3')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.notificaciones.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 3 })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /notificaciones/:id', () => {
  it('returns 200 when found', async () => {
    repos.notificaciones.findById.mockResolvedValue(NOTIFICACION);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.notificaciones.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /notificaciones', () => {
  it('returns 201 when created', async () => {
    repos.notificaciones.create.mockResolvedValue(NOTIFICACION);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 3, fecha_notificacion: '2026-02-01' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when id_expediente missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ fecha_notificacion: '2026-02-01' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fecha_notificacion missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_expediente: 3 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to create', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ id_expediente: 3, fecha_notificacion: '2026-02-01' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /notificaciones/:id', () => {
  it('returns 200 on update', async () => {
    repos.notificaciones.update.mockResolvedValue({ ...NOTIFICACION, descripcion: 'Updated' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ descripcion: 'Updated' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.notificaciones.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /notificaciones/:id', () => {
  it('returns 204 on success', async () => {
    repos.notificaciones.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
