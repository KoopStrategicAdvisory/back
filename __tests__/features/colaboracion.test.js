'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  colaboracion: {
    findEtiquetas:         jest.fn(),
    findEtiquetaById:      jest.fn(),
    createEtiqueta:        jest.fn(),
    updateEtiqueta:        jest.fn(),
    softDeleteEtiqueta:    jest.fn(),
    addEtiquetaEntidad:    jest.fn(),
    removeEtiquetaEntidad: jest.fn(),
    findComentarios:       jest.fn(),
    findComentarioById:    jest.fn(),
    createComentario:      jest.fn(),
    updateComentario:      jest.fn(),
    softDeleteComentario:  jest.fn(),
    findReplies:           jest.fn(),
    addMencion:            jest.fn(),
    removeMencion:         jest.fn(),
    findAdjuntos:          jest.fn(),
    createAdjunto:         jest.fn(),
    softDeleteAdjunto:     jest.fn(),
    findDependencias:      jest.fn(),
    createDependencia:     jest.fn(),
    softDeleteDependencia: jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/colaboracion'));

const ETIQUETA    = { id: 1, nombre: 'Urgente', color: '#FF0000' };
const COMENTARIO  = { id: 10, tipo_entidad: 'tarea', id_entidad: 5, contenido: 'Revisado', id_usuario: 1 };
const ADJUNTO     = { id: 20, tipo_entidad: 'expediente', nombre_archivo: 'doc.pdf' };
const DEPENDENCIA = { id: 30, tipo_dependencia: 'bloqueante', es_bloqueante: true };

// ── Etiquetas ─────────────────────────────────────────────────────────────────

describe('GET /colaboracion/etiquetas', () => {
  it('returns 200 with list', async () => {
    repos.colaboracion.findEtiquetas.mockResolvedValue([ETIQUETA]);

    const res = await request(app).get('/etiquetas').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/etiquetas');
    expect(res.status).toBe(401);
  });
});

describe('GET /colaboracion/etiquetas/:id', () => {
  it('returns 200 when found', async () => {
    repos.colaboracion.findEtiquetaById.mockResolvedValue(ETIQUETA);

    const res = await request(app).get('/etiquetas/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.colaboracion.findEtiquetaById.mockResolvedValue(null);

    const res = await request(app).get('/etiquetas/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /colaboracion/etiquetas', () => {
  it('returns 201 when created', async () => {
    repos.colaboracion.createEtiqueta.mockResolvedValue(ETIQUETA);

    const res = await request(app)
      .post('/etiquetas')
      .set('Authorization', lawyerToken())
      .send({ nombre: 'Urgente' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when nombre missing', async () => {
    const res = await request(app)
      .post('/etiquetas')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('PUT /colaboracion/etiquetas/:id', () => {
  it('returns 200 on update', async () => {
    repos.colaboracion.updateEtiqueta.mockResolvedValue({ ...ETIQUETA, nombre: 'Prioritario' });

    const res = await request(app)
      .put('/etiquetas/1')
      .set('Authorization', adminToken())
      .send({ nombre: 'Prioritario' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.colaboracion.updateEtiqueta.mockResolvedValue(null);

    const res = await request(app).put('/etiquetas/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /colaboracion/etiquetas/:id', () => {
  it('returns 204 on success', async () => {
    repos.colaboracion.softDeleteEtiqueta.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/etiquetas/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

describe('POST /colaboracion/etiquetas/entidad', () => {
  it('returns 201 when etiqueta added to entity', async () => {
    repos.colaboracion.addEtiquetaEntidad.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/etiquetas/entidad')
      .set('Authorization', adminToken())
      .send({ tipo_entidad: 'tarea', id_etiqueta: 1 });

    expect(res.status).toBe(201);
    expect(repos.colaboracion.addEtiquetaEntidad).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/etiquetas/entidad')
      .set('Authorization', adminToken())
      .send({ tipo_entidad: 'tarea' });

    expect(res.status).toBe(400);
  });
});

// ── Comentarios ───────────────────────────────────────────────────────────────

describe('GET /colaboracion/comentarios', () => {
  it('returns 200 with list', async () => {
    repos.colaboracion.findComentarios.mockResolvedValue([COMENTARIO]);

    const res = await request(app)
      .get('/comentarios?tipo_entidad=tarea&id_entidad=5')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
  });
});

describe('GET /colaboracion/comentarios/:id', () => {
  it('returns 200 when found', async () => {
    repos.colaboracion.findComentarioById.mockResolvedValue(COMENTARIO);

    const res = await request(app).get('/comentarios/10').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.colaboracion.findComentarioById.mockResolvedValue(null);

    const res = await request(app).get('/comentarios/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /colaboracion/comentarios', () => {
  it('returns 201 when created', async () => {
    repos.colaboracion.createComentario.mockResolvedValue(COMENTARIO);

    const res = await request(app)
      .post('/comentarios')
      .set('Authorization', lawyerToken())
      .send({ tipo_entidad: 'tarea', contenido: 'Revisado' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when contenido missing', async () => {
    const res = await request(app)
      .post('/comentarios')
      .set('Authorization', adminToken())
      .send({ tipo_entidad: 'tarea' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when tipo_entidad missing', async () => {
    const res = await request(app)
      .post('/comentarios')
      .set('Authorization', adminToken())
      .send({ contenido: 'Test' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /colaboracion/comentarios/:id', () => {
  it('returns 200 on update', async () => {
    repos.colaboracion.updateComentario.mockResolvedValue({ ...COMENTARIO, contenido: 'Updated' });

    const res = await request(app)
      .put('/comentarios/10')
      .set('Authorization', adminToken())
      .send({ contenido: 'Updated' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.colaboracion.updateComentario.mockResolvedValue(null);

    const res = await request(app)
      .put('/comentarios/99')
      .set('Authorization', adminToken())
      .send({ contenido: 'Test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /colaboracion/comentarios/:id', () => {
  it('returns 204 on success', async () => {
    repos.colaboracion.softDeleteComentario.mockResolvedValue({ id: 10 });

    const res = await request(app).delete('/comentarios/10').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

describe('GET /colaboracion/comentarios/:id/replies', () => {
  it('returns 200 with replies', async () => {
    repos.colaboracion.findReplies.mockResolvedValue([{ ...COMENTARIO, id: 11, id_parent: 10 }]);

    const res = await request(app).get('/comentarios/10/replies').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(repos.colaboracion.findReplies).toHaveBeenCalledWith(10, expect.anything());
  });
});

describe('POST /colaboracion/comentarios/:id/menciones', () => {
  it('returns 201 when mencion added', async () => {
    repos.colaboracion.addMencion.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/comentarios/10/menciones')
      .set('Authorization', adminToken())
      .send({ id_usuario: 2 });

    expect(res.status).toBe(201);
  });
});

describe('DELETE /colaboracion/comentarios/:id/menciones/:usuarioId', () => {
  it('returns 204 on success', async () => {
    repos.colaboracion.removeMencion.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .delete('/comentarios/10/menciones/2')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });
});

// ── Adjuntos ──────────────────────────────────────────────────────────────────

describe('GET /colaboracion/adjuntos', () => {
  it('returns 200 with list', async () => {
    repos.colaboracion.findAdjuntos.mockResolvedValue([ADJUNTO]);

    const res = await request(app).get('/adjuntos').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });
});

describe('POST /colaboracion/adjuntos', () => {
  it('returns 201 when created', async () => {
    repos.colaboracion.createAdjunto.mockResolvedValue(ADJUNTO);

    const res = await request(app)
      .post('/adjuntos')
      .set('Authorization', adminToken())
      .send({ tipo_entidad: 'expediente', nombre_archivo: 'doc.pdf' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when nombre_archivo missing', async () => {
    const res = await request(app)
      .post('/adjuntos')
      .set('Authorization', adminToken())
      .send({ tipo_entidad: 'expediente' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /colaboracion/adjuntos/:id', () => {
  it('returns 204 on success', async () => {
    repos.colaboracion.softDeleteAdjunto.mockResolvedValue({ id: 20 });

    const res = await request(app).delete('/adjuntos/20').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Dependencias ──────────────────────────────────────────────────────────────

describe('GET /colaboracion/dependencias', () => {
  it('returns 200 with list', async () => {
    repos.colaboracion.findDependencias.mockResolvedValue([DEPENDENCIA]);

    const res = await request(app).get('/dependencias').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });
});

describe('POST /colaboracion/dependencias', () => {
  it('returns 201 when created', async () => {
    repos.colaboracion.createDependencia.mockResolvedValue(DEPENDENCIA);

    const res = await request(app)
      .post('/dependencias')
      .set('Authorization', adminToken())
      .send({ tipo_dependencia: 'bloqueante', es_bloqueante: true });

    expect(res.status).toBe(201);
  });
});

describe('DELETE /colaboracion/dependencias/:id', () => {
  it('returns 204 on success', async () => {
    repos.colaboracion.softDeleteDependencia.mockResolvedValue({ id: 30 });

    const res = await request(app).delete('/dependencias/30').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});
