'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  iterProcesal: {
    findAll:                  jest.fn(),
    findById:                 jest.fn(),
    create:                   jest.fn(),
    update:                   jest.fn(),
    softDelete:               jest.fn(),
    findTareasByIter:         jest.fn(),
    createTareaPlantilla:     jest.fn(),
    updateTareaPlantilla:     jest.fn(),
    softDeleteTareaPlantilla: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/iter-procesal'));

const ITER   = { id: 1, nombre: 'Proceso civil ordinario', id_combo: 2 };
const TAREA  = { id: 5, titulo: 'Presentar demanda', id_iter_procesal_plantilla: 1 };

describe('GET /iter-procesal', () => {
  it('returns 200 with list', async () => {
    repos.iterProcesal.findAll.mockResolvedValue([ITER]);

    const res = await request(app).get('/').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('filters by id_combo', async () => {
    repos.iterProcesal.findAll.mockResolvedValue([]);

    await request(app).get('/?id_combo=2').set('Authorization', adminToken());

    expect(repos.iterProcesal.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_combo: 2 })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /iter-procesal/:id', () => {
  it('returns 200 when found', async () => {
    repos.iterProcesal.findById.mockResolvedValue(ITER);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.iterProcesal.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /iter-procesal', () => {
  it('returns 201 when admin creates iter', async () => {
    repos.iterProcesal.create.mockResolvedValue(ITER);

    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ nombre: 'Proceso civil ordinario', id_combo: 2 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when nombre missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_combo: 2 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when lawyer tries to create', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'Test' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /iter-procesal/:id', () => {
  it('returns 200 on update', async () => {
    repos.iterProcesal.update.mockResolvedValue({ ...ITER, nombre: 'Updated' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ nombre: 'Updated' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.iterProcesal.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /iter-procesal/:id', () => {
  it('returns 204 on success', async () => {
    repos.iterProcesal.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Tareas plantilla ───────────────────────────────────────────────────────

describe('GET /iter-procesal/:id/tareas', () => {
  it('returns 200 with list of tareas plantilla', async () => {
    repos.iterProcesal.findTareasByIter.mockResolvedValue([TAREA]);

    const res = await request(app).get('/1/tareas').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repos.iterProcesal.findTareasByIter).toHaveBeenCalledWith(1, { active: true });
  });
});

describe('POST /iter-procesal/:id/tareas', () => {
  it('returns 201 when tarea created', async () => {
    repos.iterProcesal.createTareaPlantilla.mockResolvedValue(TAREA);

    const res = await request(app)
      .post('/1/tareas')
      .set('Authorization', adminToken())
      .send({ titulo: 'Presentar demanda', orden: 1 });

    expect(res.status).toBe(201);
    expect(repos.iterProcesal.createTareaPlantilla).toHaveBeenCalledWith(
      expect.objectContaining({ id_iter_procesal_plantilla: 1 }), '1'
    );
  });

  it('returns 400 when titulo missing', async () => {
    const res = await request(app)
      .post('/1/tareas')
      .set('Authorization', adminToken())
      .send({ orden: 1 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /iter-procesal/:id/tareas/:tareaId', () => {
  it('returns 204 on success', async () => {
    repos.iterProcesal.softDeleteTareaPlantilla.mockResolvedValue({ id: 5 });

    const res = await request(app)
      .delete('/1/tareas/5')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    repos.iterProcesal.softDeleteTareaPlantilla.mockResolvedValue(null);

    const res = await request(app)
      .delete('/1/tareas/99')
      .set('Authorization', adminToken());

    expect(res.status).toBe(404);
  });
});
