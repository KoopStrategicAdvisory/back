'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  actuaciones: {
    findAll:    jest.fn(),
    findById:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    softDelete: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/actuaciones'));

const ACTUACION = { id: 1, id_expediente: 5, fecha_actuacion: '2026-01-15', descripcion: 'Presentación de demanda' };

describe('GET /actuaciones', () => {
  it('returns 200 with filtered list', async () => {
    repos.actuaciones.findAll.mockResolvedValue([ACTUACION]);

    const res = await request(app)
      .get('/?id_expediente=5')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.actuaciones.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 5 })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /actuaciones/:id', () => {
  it('returns 200 when found', async () => {
    repos.actuaciones.findById.mockResolvedValue(ACTUACION);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('returns 404 when not found', async () => {
    repos.actuaciones.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /actuaciones', () => {
  it('returns 201 when created', async () => {
    repos.actuaciones.create.mockResolvedValue(ACTUACION);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 5, fecha: '2026-01-15', titulo: 'Demanda presentada' });

    expect(res.status).toBe(201);
    expect(repos.actuaciones.create).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when id_expediente is missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ fecha: '2026-01-15', titulo: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fecha is missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_expediente: 5, titulo: 'Test' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to create', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ id_expediente: 5, fecha: '2026-01-15', titulo: 'Test' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /actuaciones/:id', () => {
  it('returns 200 on update', async () => {
    repos.actuaciones.update.mockResolvedValue({ ...ACTUACION, descripcion: 'Actualizado' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ descripcion: 'Actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.descripcion).toBe('Actualizado');
  });

  it('returns 404 when not found', async () => {
    repos.actuaciones.update.mockResolvedValue(null);

    const res = await request(app)
      .put('/99')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('DELETE /actuaciones/:id', () => {
  it('returns 204 on success', async () => {
    repos.actuaciones.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
