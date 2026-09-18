'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  tareas: {
    findAll:                 jest.fn(),
    findById:                jest.fn(),
    create:                  jest.fn(),
    update:                  jest.fn(),
    softDelete:              jest.fn(),
    findMisTareas:           jest.fn(),
    findProximasVencer:      jest.fn(),
    findChecklist:           jest.fn(),
    createChecklistItem:     jest.fn(),
    updateChecklistItem:     jest.fn(),
    softDeleteChecklistItem: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/tareas'));

const TAREA    = { id: 1, titulo: 'Revisar contrato', id_expediente: 5 };
const CHECKLIST = { id: 10, descripcion: 'Verificar firma', id_tarea: 1, completado: false };

describe('GET /tareas/mis-tareas', () => {
  it('returns 200 with tasks assigned to current user', async () => {
    repos.tareas.findMisTareas.mockResolvedValue([TAREA]);

    const res = await request(app).get('/mis-tareas').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repos.tareas.findMisTareas).toHaveBeenCalledWith('1');
  });
});

describe('GET /tareas/proximas-vencer', () => {
  it('returns 200 with tasks expiring in next N days', async () => {
    repos.tareas.findProximasVencer.mockResolvedValue([TAREA]);

    const res = await request(app).get('/proximas-vencer?dias=5').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.tareas.findProximasVencer).toHaveBeenCalledWith(5);
  });

  it('defaults to 7 days when no param provided', async () => {
    repos.tareas.findProximasVencer.mockResolvedValue([]);

    await request(app).get('/proximas-vencer').set('Authorization', adminToken());

    expect(repos.tareas.findProximasVencer).toHaveBeenCalledWith(7);
  });
});

describe('GET /tareas', () => {
  it('returns 200 with filtered list', async () => {
    repos.tareas.findAll.mockResolvedValue([TAREA]);

    const res = await request(app)
      .get('/?id_expediente=5')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.tareas.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_expediente: 5 })
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('GET /tareas/:id', () => {
  it('returns 200 when found', async () => {
    repos.tareas.findById.mockResolvedValue(TAREA);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.tareas.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /tareas', () => {
  it('returns 201 when tarea created', async () => {
    repos.tareas.create.mockResolvedValue(TAREA);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send({ titulo: 'Revisar contrato', id_expediente: 5 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when titulo is missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_expediente: 5 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to create', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ titulo: 'Test' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /tareas/:id', () => {
  it('returns 200 on update', async () => {
    repos.tareas.update.mockResolvedValue({ ...TAREA, titulo: 'Updated' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ titulo: 'Updated' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.tareas.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /tareas/:id', () => {
  it('returns 204 on success', async () => {
    repos.tareas.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Checklist ──────────────────────────────────────────────────────────────

describe('GET /tareas/:id/checklist', () => {
  it('returns 200 with checklist items', async () => {
    repos.tareas.findChecklist.mockResolvedValue([CHECKLIST]);

    const res = await request(app).get('/1/checklist').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repos.tareas.findChecklist).toHaveBeenCalledWith(1, { active: true });
  });
});

describe('POST /tareas/:id/checklist', () => {
  it('returns 201 when item created', async () => {
    repos.tareas.createChecklistItem.mockResolvedValue(CHECKLIST);

    const res = await request(app)
      .post('/1/checklist')
      .set('Authorization', adminToken())
      .send({ titulo: 'Verificar firma' });

    expect(res.status).toBe(201);
    expect(repos.tareas.createChecklistItem).toHaveBeenCalledWith(
      expect.objectContaining({ id_tarea: 1, titulo: 'Verificar firma' }), '1'
    );
  });

  it('returns 400 when titulo missing', async () => {
    const res = await request(app)
      .post('/1/checklist')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('PUT /tareas/:id/checklist/:itemId', () => {
  it('returns 200 when item updated', async () => {
    repos.tareas.updateChecklistItem.mockResolvedValue({ ...CHECKLIST, completado: true });

    const res = await request(app)
      .put('/1/checklist/10')
      .set('Authorization', adminToken())
      .send({ completado: true });

    expect(res.status).toBe(200);
    expect(res.body.completado).toBe(true);
  });

  it('returns 404 when item not found', async () => {
    repos.tareas.updateChecklistItem.mockResolvedValue(null);

    const res = await request(app)
      .put('/1/checklist/99')
      .set('Authorization', adminToken())
      .send({ completado: true });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /tareas/:id/checklist/:itemId', () => {
  it('returns 204 on success', async () => {
    repos.tareas.softDeleteChecklistItem.mockResolvedValue({ id: 10 });

    const res = await request(app)
      .delete('/1/checklist/10')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });
});
