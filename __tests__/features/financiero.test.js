'use strict';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

jest.mock('../../src/repositories', () => ({
  financiero: {
    findHonorarios:      jest.fn(),
    findHonorarioById:   jest.fn(),
    createHonorario:     jest.fn(),
    updateHonorario:     jest.fn(),
    softDeleteHonorario: jest.fn(),
    findPagos:           jest.fn(),
    findPagoById:        jest.fn(),
    createPago:          jest.fn(),
    updatePago:          jest.fn(),
    findGastos:          jest.fn(),
    findGastoById:       jest.fn(),
    createGasto:         jest.fn(),
    updateGasto:         jest.fn(),
    softDeleteGasto:     jest.fn(),
    getResumen:          jest.fn(),
  },
}));

const request = require('supertest');
const { makeApp, adminToken, lawyerToken } = require('../helpers');
const repos = require('../../src/repositories');

const app = makeApp(require('../../src/features/financiero'));

const HONORARIO = { id: 1, id_expediente: 5, monto_total_pactado: 5000, moneda: 'COP' };
const PAGO      = { id: 1, id_expediente: 5, fecha_pago: '2026-01-10', monto: 1000 };
const GASTO     = { id: 1, id_expediente: 5, fecha_gasto: '2026-01-12', monto: 200, concepto: 'Transporte' };
const RESUMEN   = { ingresos: 5000, egresos: 200, saldo: 4800 };

// ── Honorarios ───────────────────────────────────────────────────────────────

describe('GET /financiero/honorarios', () => {
  it('returns 200 with list', async () => {
    repos.financiero.findHonorarios.mockResolvedValue([HONORARIO]);

    const res = await request(app)
      .get('/honorarios')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/honorarios');
    expect(res.status).toBe(401);
  });
});

describe('GET /financiero/honorarios/:id', () => {
  it('returns 200 when found', async () => {
    repos.financiero.findHonorarioById.mockResolvedValue(HONORARIO);

    const res = await request(app).get('/honorarios/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.findHonorarioById.mockResolvedValue(null);

    const res = await request(app).get('/honorarios/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /financiero/honorarios', () => {
  it('returns 201 when created', async () => {
    repos.financiero.createHonorario.mockResolvedValue(HONORARIO);

    const res = await request(app)
      .post('/honorarios')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 5 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when id_expediente missing', async () => {
    const res = await request(app)
      .post('/honorarios')
      .set('Authorization', adminToken())
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 when client tries to create', async () => {
    const { clientToken } = require('../helpers');
    const res = await request(app)
      .post('/honorarios')
      .set('Authorization', clientToken())
      .send({ id_expediente: 5 });

    expect(res.status).toBe(403);
  });
});

describe('PUT /financiero/honorarios/:id', () => {
  it('returns 200 on update', async () => {
    repos.financiero.updateHonorario.mockResolvedValue({ ...HONORARIO, monto_total_pactado: 6000 });

    const res = await request(app)
      .put('/honorarios/1')
      .set('Authorization', adminToken())
      .send({ monto_total_pactado: 6000 });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.updateHonorario.mockResolvedValue(null);

    const res = await request(app).put('/honorarios/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /financiero/honorarios/:id', () => {
  it('returns 204 on success', async () => {
    repos.financiero.softDeleteHonorario.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/honorarios/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Pagos ─────────────────────────────────────────────────────────────────────

describe('GET /financiero/pagos', () => {
  it('returns 200 with list', async () => {
    repos.financiero.findPagos.mockResolvedValue([PAGO]);

    const res = await request(app).get('/pagos').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });
});

describe('GET /financiero/pagos/:id', () => {
  it('returns 200 when found', async () => {
    repos.financiero.findPagoById.mockResolvedValue(PAGO);

    const res = await request(app).get('/pagos/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.findPagoById.mockResolvedValue(null);

    const res = await request(app).get('/pagos/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /financiero/pagos', () => {
  it('returns 201 when created', async () => {
    repos.financiero.createPago.mockResolvedValue(PAGO);

    const res = await request(app)
      .post('/pagos')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 5, fecha_pago: '2026-01-10', monto: 1000 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/pagos')
      .set('Authorization', adminToken())
      .send({ id_expediente: 5 });

    expect(res.status).toBe(400);
  });
});

describe('PUT /financiero/pagos/:id', () => {
  it('returns 200 on update', async () => {
    repos.financiero.updatePago.mockResolvedValue({ ...PAGO, monto: 1500 });

    const res = await request(app)
      .put('/pagos/1')
      .set('Authorization', adminToken())
      .send({ monto: 1500 });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.updatePago.mockResolvedValue(null);

    const res = await request(app).put('/pagos/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

// ── Gastos ────────────────────────────────────────────────────────────────────

describe('GET /financiero/gastos', () => {
  it('returns 200 with list', async () => {
    repos.financiero.findGastos.mockResolvedValue([GASTO]);

    const res = await request(app).get('/gastos').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });
});

describe('GET /financiero/gastos/:id', () => {
  it('returns 200 when found', async () => {
    repos.financiero.findGastoById.mockResolvedValue(GASTO);

    const res = await request(app).get('/gastos/1').set('Authorization', adminToken());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.findGastoById.mockResolvedValue(null);

    const res = await request(app).get('/gastos/99').set('Authorization', adminToken());
    expect(res.status).toBe(404);
  });
});

describe('POST /financiero/gastos', () => {
  it('returns 201 when created', async () => {
    repos.financiero.createGasto.mockResolvedValue(GASTO);

    const res = await request(app)
      .post('/gastos')
      .set('Authorization', lawyerToken())
      .send({ id_expediente: 5, fecha_gasto: '2026-01-12', monto: 200 });

    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/gastos')
      .set('Authorization', adminToken())
      .send({ id_expediente: 5 });

    expect(res.status).toBe(400);
  });
});

describe('PUT /financiero/gastos/:id', () => {
  it('returns 200 on update', async () => {
    repos.financiero.updateGasto.mockResolvedValue({ ...GASTO, monto: 300 });

    const res = await request(app)
      .put('/gastos/1')
      .set('Authorization', adminToken())
      .send({ monto: 300 });

    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    repos.financiero.updateGasto.mockResolvedValue(null);

    const res = await request(app).put('/gastos/99').set('Authorization', adminToken()).send({});
    expect(res.status).toBe(404);
  });
});

describe('DELETE /financiero/gastos/:id', () => {
  it('returns 204 on success', async () => {
    repos.financiero.softDeleteGasto.mockResolvedValue({ id: 1 });

    const res = await request(app).delete('/gastos/1').set('Authorization', adminToken());
    expect(res.status).toBe(204);
  });
});

// ── Resumen ───────────────────────────────────────────────────────────────────

describe('GET /financiero/resumen/:idExpediente', () => {
  it('returns 200 with financial summary', async () => {
    repos.financiero.getResumen.mockResolvedValue(RESUMEN);

    const res = await request(app)
      .get('/resumen/5')
      .set('Authorization', adminToken());

    expect(res.status).toBe(200);
    expect(res.body.saldo).toBe(4800);
    expect(repos.financiero.getResumen).toHaveBeenCalledWith(5);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/resumen/5');
    expect(res.status).toBe(401);
  });
});
