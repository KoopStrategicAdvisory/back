'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  kanban: {
    findTableros:           jest.fn(),
    findTableroById:        jest.fn(),
    createTablero:          jest.fn(),
    updateTablero:          jest.fn(),
    softDeleteTablero:      jest.fn(),
    addUsuarioTablero:      jest.fn(),
    removeUsuarioTablero:   jest.fn(),
    findColumnas:           jest.fn(),
    createColumna:          jest.fn(),
    updateColumna:          jest.fn(),
    softDeleteColumna:      jest.fn(),
    addEstadoColumna:       jest.fn(),
    removeEstadoColumna:    jest.fn(),
    findPosicionesByColumna: jest.fn(),
    upsertPosicion:         jest.fn(),
    removePosicion:         jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/kanban'));

const TABLERO = { id: 1, nombre: 'Sprint 1', id_creador: 1 };
const COLUMNA = { id: 10, nombre: 'En progreso', id_tablero: 1, orden: 1 };
const POSICION = { id: 100, id_tablero: 1, id_columna: 10, tipo_entidad: 'tarea', id_entidad: 5 };

// ── Tableros ──────────────────────────────────────────────────────────────────

describe('GET /kanban/tableros', () => {
  it('returns 200 with list', async () => {
    repos.kanban.findTableros.mockResolvedValue([TABLERO]);

    const res = await request(app).get('/tableros').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/tableros');
    expect(res.status).toBe(401);
  });
});

describe('GET /kanban/tableros/:id', () => {
  it('returns 200 when found', async () => {
    repos.kanban.findTableroById.mockResolvedValue(TABLERO);

    const res = await request(app).get('/tableros/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('Sprint 1');
  });

  it('returns 404 when not found', async () => {
    repos.kanban.findTableroById.mockResolvedValue(null);

    const res = await request(app).get('/tableros/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /kanban/tableros', () => {
  it('returns 201 when created', async () => {
    repos.kanban.createTablero.mockResolvedValue(TABLERO);

    const res = await request(app)
      .post('/tableros')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'Sprint 1' });

    expect(res.status).toBe(201);
    expect(repos.kanban.createTablero).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when nombre missing', async () => {
    const res = await request(app)
      .post('/tableros')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('PUT /kanban/tableros/:id', () => {
  it('returns 200 on update', async () => {
    repos.kanban.updateTablero.mockResolvedValue({ ...TABLERO, nombre: 'Sprint 2' });

    const res = await request(app)
      .put('/tableros/1')
      .set('Authorization', adminToken())
      .send({ nombre: 'Sprint 2' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.kanban.updateTablero.mockResolvedValue(null);

    const res = await request(app).put('/tableros/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /kanban/tableros/:id', () => {
  it('returns 204 on success', async () => {
    repos.kanban.softDeleteTablero.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/tableros/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

describe('POST /kanban/tableros/:id/usuarios', () => {
  it('returns 201 when user added', async () => {
    repos.kanban.addUsuarioTablero.mockResolvedValue({ id_tablero: 1, id_usuario: 2 });

    const res = await request(app)
      .post('/tableros/1/usuarios')
      .set('Authorization', adminToken())
      .send({ id_usuario: 2 });

    expect(res.status).toBe(201);
    expect(repos.kanban.addUsuarioTablero).toHaveBeenCalledWith(1, 2, '1');
  });

  it('returns 400 when id_usuario missing', async () => {
    const res = await request(app)
      .post('/tableros/1/usuarios')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /kanban/tableros/:id/usuarios/:usuarioId', () => {
  it('returns 204 on success', async () => {
    repos.kanban.removeUsuarioTablero.mockResolvedValue({ id_tablero: 1, id_usuario: 2 });

    const res = await request(app)
      .delete('/tableros/1/usuarios/2')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });
});

// ── Columnas ──────────────────────────────────────────────────────────────────

describe('GET /kanban/tableros/:id/columnas', () => {
  it('returns 200 with columns', async () => {
    repos.kanban.findColumnas.mockResolvedValue([COLUMNA]);

    const res = await request(app)
      .get('/tableros/1/columnas')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.kanban.findColumnas).toHaveBeenCalledWith(1, expect.anything());
  });
});

describe('POST /kanban/tableros/:id/columnas', () => {
  it('returns 201 when columna created', async () => {
    repos.kanban.createColumna.mockResolvedValue(COLUMNA);

    const res = await request(app)
      .post('/tableros/1/columnas')
      .set('Authorization', adminToken())
      .send({ nombre: 'En progreso', orden: 1 });

    expect(res.status).toBe(201);
    expect(repos.kanban.createColumna).toHaveBeenCalledWith(
      expect.objectContaining({ id_tablero: 1, nombre: 'En progreso' }),
      '1'
    );
  });

  it('returns 400 when nombre or orden missing', async () => {
    const res = await request(app)
      .post('/tableros/1/columnas')
      .set('Authorization', adminToken())
      .send({ nombre: 'Test' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /kanban/columnas/:id', () => {
  it('returns 200 on update', async () => {
    repos.kanban.updateColumna.mockResolvedValue({ ...COLUMNA, nombre: 'Done' });

    const res = await request(app)
      .put('/columnas/10')
      .set('Authorization', adminToken())
      .send({ nombre: 'Done' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.kanban.updateColumna.mockResolvedValue(null);

    const res = await request(app).put('/columnas/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /kanban/columnas/:id', () => {
  it('returns 204 on success', async () => {
    repos.kanban.softDeleteColumna.mockResolvedValue({ id: 10 });

    const res = await request(app).delete('/columnas/10').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Posiciones ────────────────────────────────────────────────────────────────

describe('GET /kanban/columnas/:id/posiciones', () => {
  it('returns 200 with positions', async () => {
    repos.kanban.findPosicionesByColumna.mockResolvedValue([POSICION]);

    const res = await request(app)
      .get('/columnas/10/posiciones')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(repos.kanban.findPosicionesByColumna).toHaveBeenCalledWith(10, expect.anything());
  });
});

describe('POST /kanban/posiciones', () => {
  it('returns 200 when upserted', async () => {
    repos.kanban.upsertPosicion.mockResolvedValue(POSICION);

    const res = await request(app)
      .post('/posiciones')
      .set('Authorization', adminToken())
      .send({ id_tablero: 1, id_columna: 10, tipo_entidad: 'tarea' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/posiciones')
      .set('Authorization', adminToken())
      .send({ id_tablero: 1 });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /kanban/posiciones/:id', () => {
  it('returns 204 on success', async () => {
    repos.kanban.removePosicion.mockResolvedValue({ id: 100 });

    const res = await request(app).delete('/posiciones/100').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
