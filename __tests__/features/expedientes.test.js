'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  expedientes: {
    findAll:         jest.fn(),
    count:           jest.fn(),
    findById:        jest.fn(),
    create:          jest.fn(),
    update:          jest.fn(),
    softDelete:      jest.fn(),
    findEtapas:      jest.fn(),
    createEtapa:     jest.fn(),
    updateEtapa:     jest.fn(),
    softDeleteEtapa: jest.fn(),
    generateEtapasFromPlantilla: jest.fn(),
  },
}));

// Borrar un expediente también limpia sus documentos en S3; aquí no se toca S3.
jest.mock('../../src/services/s3', () => ({
  deletePrefix: jest.fn().mockResolvedValue({ deleted: 0 }),
  documentoPrefix: (n) => `documentos/${n}`,
  renamePrefix: jest.fn(),
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken, clientToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/expedientes'));

const EXPEDIENTE = { id: 1, numero_de_expediente: 'EXP-001', active: true };
const ETAPA      = { id: 10, id_expediente: 1, nombre: 'Demanda', active: true };

describe('GET /expedientes', () => {
  it('returns 200 with paginated data', async () => {
    repos.expedientes.findAll.mockResolvedValue([EXPEDIENTE]);
    repos.expedientes.count.mockResolvedValue(1);

    const res = await request(app).get('/').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });

  it('passes filters to repository', async () => {
    repos.expedientes.findAll.mockResolvedValue([]);
    repos.expedientes.count.mockResolvedValue(0);

    await request(app)
      .get('/?id_cliente=5&id_estado_proceso=2&search=exp')
      .set('Authorization', adminToken());

    expect(repos.expedientes.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ id_cliente: 5, id_estado_proceso: 2, search: 'exp' })
    );
  });
});

describe('GET /expedientes/:id', () => {
  it('returns 200 when found', async () => {
    repos.expedientes.findById.mockResolvedValue(EXPEDIENTE);

    const res = await request(app).get('/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
    expect(res.body.numero_de_expediente).toBe('EXP-001');
  });

  it('returns 404 when not found', async () => {
    repos.expedientes.findById.mockResolvedValue(null);

    const res = await request(app).get('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

// Campos obligatorios al crear: número, materia (combo), contraparte y correo del juzgado.
const NUEVO_EXPEDIENTE = {
  numero_de_expediente: 'EXP-001',
  id_tipo_proc_subtipo_proc_tipo_pre: 1,
  contraparte: 'Empresa Demandada S.A.S.',
  correo_juzgado: 'juzgado@rama.gov.co',
};

describe('POST /expedientes', () => {
  it('returns 201 when lawyer creates expediente', async () => {
    repos.expedientes.create.mockResolvedValue(EXPEDIENTE);

    const res = await request(app)
      .post('/')
      .set('Authorization', lawyerToken())
      .send(NUEVO_EXPEDIENTE);

    expect(res.status).toBe(201);
    expect(repos.expedientes.generateEtapasFromPlantilla).toHaveBeenCalledWith(EXPEDIENTE.id, '2');
  });

  it.each([
    ['contraparte', { contraparte: '' }],
    ['correo_juzgado', { correo_juzgado: '' }],
    ['correo_juzgado con formato inválido', { correo_juzgado: 'no-es-un-correo' }],
    ['materia (id_tipo_proc_subtipo_proc_tipo_pre)', { id_tipo_proc_subtipo_proc_tipo_pre: undefined }],
  ])('returns 400 when %s is missing or invalid', async (_campo, cambio) => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ ...NUEVO_EXPEDIENTE, ...cambio });

    expect(res.status).toBe(400);
    expect(repos.expedientes.create).not.toHaveBeenCalled();
  });

  it('returns 400 when numero_de_expediente is missing', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', adminToken())
      .send({ id_cliente: 1 });

    expect(res.status).toBe(400);
  });

  it('returns 403 when client role tries to create', async () => {
    const res = await request(app)
      .post('/')
      .set('Authorization', clientToken())
      .send({ numero_de_expediente: 'EXP-001' });

    expect(res.status).toBe(403);
  });
});

describe('PUT /expedientes/:id', () => {
  it('returns 200 on successful update', async () => {
    repos.expedientes.update.mockResolvedValue({ ...EXPEDIENTE, numero_de_expediente: 'EXP-002' });

    const res = await request(app)
      .put('/1')
      .set('Authorization', adminToken())
      .send({ numero_de_expediente: 'EXP-002' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.expedientes.update.mockResolvedValue(null);

    const res = await request(app).put('/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /expedientes/:id', () => {
  it('returns 204 on success', async () => {
    repos.expedientes.findById.mockResolvedValue(EXPEDIENTE);
    repos.expedientes.softDelete.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    repos.expedientes.findById.mockResolvedValue(null);
    repos.expedientes.softDelete.mockResolvedValue(null);

    const res = await request(app).delete('/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

// ── Etapas ─────────────────────────────────────────────────────────────────

describe('GET /expedientes/:id/etapas', () => {
  it('returns 200 with etapas list', async () => {
    repos.expedientes.findById.mockResolvedValue(EXPEDIENTE);
    repos.expedientes.findEtapas.mockResolvedValue([ETAPA]);

    const res = await request(app).get('/1/etapas').set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(repos.expedientes.findEtapas).toHaveBeenCalledWith(1, { active: true });
  });
});

describe('POST /expedientes/:id/etapas', () => {
  it('returns 201 when etapa created', async () => {
    repos.expedientes.createEtapa.mockResolvedValue(ETAPA);

    const res = await request(app)
      .post('/1/etapas')
      .set('Authorization', adminToken())
      .send({ id_etapa: 1, orden: 1, id_estado_etapa: 1 });

    expect(res.status).toBe(201);
    expect(repos.expedientes.createEtapa).toHaveBeenCalledWith(
      1, expect.objectContaining({ id_etapa: 1, orden: 1 }), '1'
    );
  });
});

describe('PUT /expedientes/:id/etapas/:etapaId', () => {
  it('returns 200 when etapa updated', async () => {
    repos.expedientes.updateEtapa.mockResolvedValue(ETAPA);

    const res = await request(app)
      .put('/1/etapas/10')
      .set('Authorization', adminToken())
      .send({ id_estado_etapa: 2 });

    expect(res.status).toBe(200);
  });

  it('returns 404 when etapa not found', async () => {
    repos.expedientes.updateEtapa.mockResolvedValue(null);

    const res = await request(app)
      .put('/1/etapas/99')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('DELETE /expedientes/:id/etapas/:etapaId', () => {
  it('returns 204 on success', async () => {
    repos.expedientes.softDeleteEtapa.mockResolvedValue({ id: 10 });

    const res = await request(app)
      .delete('/1/etapas/10')
      .set('Authorization', adminToken());

    expect(res.status).toBe(204);
  });
});
