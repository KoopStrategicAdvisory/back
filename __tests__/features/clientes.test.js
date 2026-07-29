'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  clientes: {
    findAll:    jest.fn(),
    count:      jest.fn(),
    findById:   jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    softDelete: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/clientes'));

const CLIENT = { id: 1, nombre: 'Empresa ABC', tipo_persona: 'juridica', email: 'abc@empresa.com' };

describe('GET /clientes', () => {
  it('returns 200 with paginated data', async () => {
    repos.clientes.findAll.mockResolvedValue([CLIENT]);
    repos.clientes.count.mockResolvedValue(1);

    const res = await request(app).get('/').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });

  it('passes search param to repository', async () => {
    repos.clientes.findAll.mockResolvedValue([]);
    repos.clientes.count.mockResolvedValue(0);

    await request(app).get('/?search=empresa').set('Authorization', adminToken());

    expect(repos.clientes.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'empresa' })
    );
  });
});

describe('GET /clientes/:id', () => {
  it('returns 200 with client data', async () => {
    repos.clientes.findById.mockResolvedValue(CLIENT);

    const res = await request(app).get('/1').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Empresa ABC');
  });

  it('returns 404 when client not found', async () => {
    repos.clientes.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /clientes', () => {
  it('returns 201 when admin creates client', async () => {
    repos.clientes.create.mockResolvedValue(CLIENT);

    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre: 'Empresa ABC', tipo_persona: 'JURIDICA' });

    expect(res.status).toBe(201);
    expect(repos.clientes.create).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Empresa ABC' }), '1'
    );
  });

  it('returns 201 when lawyer creates client', async () => {
    repos.clientes.create.mockResolvedValue(CLIENT);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'Empresa ABC' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when nombre is missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ tipo_persona: 'juridica' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/').send({ nombre: 'ABC' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /clientes/:id', () => {
  it('returns 200 on successful update', async () => {
    repos.clientes.update.mockResolvedValue({ ...CLIENT, nombre: 'ABC Updated' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ nombre: 'ABC Updated' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('ABC Updated');
  });

  it('returns 404 when client not found', async () => {
    repos.clientes.update.mockResolvedValue(null);

    const res = await request(app)
      .put('/99')
      .set('Authorization', adminToken())
      .send({ nombre: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /clientes/:id', () => {
  it('returns 204 on successful delete', async () => {
    repos.clientes.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .delete('/1')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });

  it('returns 404 when client not found', async () => {
    repos.clientes.softDelete.mockResolvedValue(null);

    const res = await request(app)
      .delete('/99')
      .set('Authorization', adminToken());

    expect(res.status).toBe(404);
  });
});
