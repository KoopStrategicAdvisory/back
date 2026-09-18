'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  audiencias: {
    findAll:       jest.fn(),
    findById:      jest.fn(),
    create:        jest.fn(),
    update:        jest.fn(),
    softDelete:    jest.fn(),
    findProximas:  jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/audiencias'));

const AUDIENCIA = { id: 1, id_expediente: 7, fecha_audiencia: '2026-03-10', sala: 'Sala 3' };

describe('GET /audiencias/proximas', () => {
  it('returns 200 with upcoming hearings', async () => {
    repos.audiencias.findProximas.mockResolvedValue([AUDIENCIA]);

    const res = await request(app)
      .get('/proximas?dias=14')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.audiencias.findProximas).toHaveBeenCalledWith(14);
  });

  it('defaults to 30 days', async () => {
    repos.audiencias.findProximas.mockResolvedValue([]);

    await request(app).get('/proximas').set('Authorization', adminToken());

    expect(repos.audiencias.findProximas).toHaveBeenCalledWith(30);
  });
});

describe('GET /audiencias', () => {
  it('returns 200 with list', async () => {
    repos.audiencias.findAll.mockResolvedValue([AUDIENCIA]);

    const res = await request(app)
      .get('/?id_expediente=7')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.audiencias.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 7 })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /audiencias/:id', () => {
  it('returns 200 when found', async () => {
    repos.audiencias.findById.mockResolvedValue(AUDIENCIA);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.sala).toBe('Sala 3');
  });

  it('returns 404 when not found', async () => {
    repos.audiencias.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /audiencias', () => {
  it('returns 201 when created', async () => {
    repos.audiencias.create.mockResolvedValue(AUDIENCIA);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 7, fecha_programada: '2026-03-10T10:00:00' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when id_expediente missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ fecha_programada: '2026-03-10T10:00:00' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when fecha_programada missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_expediente: 7 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to create', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ id_expediente: 7, fecha_programada: '2026-03-10T10:00:00' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /audiencias/:id', () => {
  it('returns 200 on update', async () => {
    repos.audiencias.update.mockResolvedValue({ ...AUDIENCIA, sala: 'Sala 5' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ sala: 'Sala 5' });

    expect(res.status).toBe(200);
    expect(res.body.sala).toBe('Sala 5');
  });

  it('returns 404 when not found', async () => {
    repos.audiencias.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /audiencias/:id', () => {
  it('returns 204 on success', async () => {
    repos.audiencias.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
