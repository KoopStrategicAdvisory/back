'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  documentos: {
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

const app = makeApp(require('../../src/features/documentos'));

const DOCUMENTO = { id: 1, id_expediente: 4, nombre_archivo: 'demanda.pdf', url_s3: 'https://s3.example.com/demanda.pdf' };

describe('GET /documentos', () => {
  it('returns 200 with list', async () => {
    repos.documentos.findAll.mockResolvedValue([DOCUMENTO]);

    const res = await request(app)
      .get('/?id_expediente=4')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.documentos.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 4 })
    );
  });

  it('filters by visibilidad_cliente when provided', async () => {
    repos.documentos.findAll.mockResolvedValue([]);

    await request(app)
      .get('/?visibilidad_cliente=true')
      .set('Authorization', adminToken());

    expect(repos.documentos.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ visibilidad_cliente: true })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /documentos/:id', () => {
  it('returns 200 when found', async () => {
    repos.documentos.findById.mockResolvedValue(DOCUMENTO);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.nombre_archivo).toBe('demanda.pdf');
  });

  it('returns 404 when not found', async () => {
    repos.documentos.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /documentos', () => {
  it('returns 201 when created', async () => {
    repos.documentos.create.mockResolvedValue(DOCUMENTO);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 4, nombre_archivo: 'demanda.pdf' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when id_expediente missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre_archivo: 'demanda.pdf' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when nombre_archivo missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_expediente: 4 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to upload', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ id_expediente: 4, nombre_archivo: 'test.pdf' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /documentos/:id', () => {
  it('returns 200 on update', async () => {
    repos.documentos.update.mockResolvedValue({ ...DOCUMENTO, nombre_archivo: 'demanda_v2.pdf' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ nombre_archivo: 'demanda_v2.pdf' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.documentos.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /documentos/:id', () => {
  it('returns 204 on success', async () => {
    repos.documentos.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
