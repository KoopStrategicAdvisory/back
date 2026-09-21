'use strict';
// API de consultas externas de punta a punta (Express + PGlite real, sin mocks
// de base de datos): borrado solo del día, registro solo de hoy, y la constancia
// en PDF con su copia en S3. S3 se simula; nunca se toca el bucket real.
const fs = require('fs');
const path = require('path');
jest.mock('../../src/db/client', () => ({ getDb: jest.fn(), withUser: jest.fn() }));
jest.mock('../../src/services/s3', () => ({
  uploadBuffer: jest.fn(),
  constanciaKey: (fecha) => `constancias-consultas-externas/${fecha}.pdf`,
}));
const client = require('../../src/db/client');
const s3 = require('../../src/services/s3');
const request = require('supertest');
const express = require('express');
const { configurar } = require('../../src/repositories/seguimientoDiario');
const { adminToken, clientToken } = require('../helpers');

const RAMA = 'Consulta de procesos Rama Judicial';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
let db;
let app;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.waitReady;
  await db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/seguimiento-diario.sql'), 'utf8'));
  await db.exec(`INSERT INTO tipo_proceso (id, nombre) VALUES (1, 'Civil');
    INSERT INTO subtipo_proceso (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_pretension (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_proc_subtipo_proc_tipo_pre (id, id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension) VALUES (1, 1, 1, 1);`);
  app = express();
  app.use(express.json());
  app.use('/', require('../../src/features/consultas-externas'));
  app.use(require('../../src/middleware/error-handler'));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  jest.clearAllMocks();
  s3.uploadBuffer.mockResolvedValue({ key: 'ok' });
  client.getDb.mockResolvedValue(db);
  client.withUser.mockImplementation((id, fn) => db.transaction(fn));
  await db.exec(`TRUNCATE seguimiento_diario, consulta_externa_diaria, expediente_radicado_publico, expediente, users, clientes RESTART IDENTITY CASCADE;
    INSERT INTO users (id, nombre, email, password_hash) VALUES (1, 'Admin', 'admin@test.com', 'hash');
    INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente Uno');
    INSERT INTO expediente (id, id_cliente, numero_de_expediente, numero_radicado_despacho, id_usuario, id_tipo_proc_subtipo_proc_tipo_pre)
      VALUES (1, 1, 'KOOP-2026-1', '123', 1, 1);
    INSERT INTO expediente_radicado_publico (id, id_expediente, organismo, numero_radicado, created_at)
      VALUES (1, 1, '${RAMA}', '123', now() - interval '3 days');`);
  await configurar('1', 'manual', '1');
  await db.exec(`UPDATE seguimiento_diario SET desde = desde - 2`);
});

const registrarHoy = (resultado = 'sin_movimiento') =>
  request(app).post('/').set('Authorization', adminToken()).send({ id_radicado_publico: 1, resultado });

describe('Registrar la revisión', () => {
  test('sin sesión → 401', async () => {
    expect((await request(app).post('/').send({ id_radicado_publico: 1, resultado: 'sin_movimiento' })).status).toBe(401);
  });

  test('no se puede registrar una revisión de un día pasado', async () => {
    const ayer = (await db.query(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date - 1)::text AS d`)).rows[0].d;
    const res = await request(app).post('/').set('Authorization', adminToken())
      .send({ id_radicado_publico: 1, resultado: 'sin_movimiento', fecha_consulta: ayer });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Solo puedes registrar o corregir la revisión de hoy.');
  });
});

describe('Eliminar un registro (solo el del día de hoy)', () => {
  test('el registro de hoy se puede eliminar → 204', async () => {
    const creado = await registrarHoy();
    expect(creado.status).toBe(201);

    const res = await request(app).delete(`/${creado.body.id}`).set('Authorization', adminToken());
    expect(res.status).toBe(204);
    expect((await db.query('SELECT 1 FROM consulta_externa_diaria WHERE id = $1', [creado.body.id])).rows).toHaveLength(0);
  });

  test('un registro de un día anterior queda fijo como constancia → 400 y sigue ahí', async () => {
    const { rows: [viejo] } = await db.query(`INSERT INTO consulta_externa_diaria
      (id_expediente, id_radicado_publico, numero_radicado, fecha_consulta, resultado, id_usuario)
      VALUES (1, 1, '123', ((now() AT TIME ZONE 'America/Bogota')::date - 1), 'sin_movimiento', 1) RETURNING id`);

    const res = await request(app).delete(`/${viejo.id}`).set('Authorization', adminToken());

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Solo se pueden eliminar registros del día de hoy');
    expect((await db.query('SELECT 1 FROM consulta_externa_diaria WHERE id = $1', [viejo.id])).rows).toHaveLength(1);
  });

  test('un registro inexistente → 404', async () => {
    expect((await request(app).delete('/9999').set('Authorization', adminToken())).status).toBe(404);
  });

  test('un cliente del portal no puede eliminar → 403', async () => {
    const creado = await registrarHoy();
    const res = await request(app).delete(`/${creado.body.id}`).set('Authorization', clientToken());
    expect(res.status).toBe(403);
    expect((await db.query('SELECT 1 FROM consulta_externa_diaria WHERE id = $1', [creado.body.id])).rows).toHaveLength(1);
  });
});

describe('Constancia en PDF y su copia en S3', () => {
  const pdf = () => request(app).get('/pdf').set('Authorization', adminToken())
    .buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

  test('con todos los procesos revisados devuelve el PDF y lo archiva en su carpeta de S3', async () => {
    await registrarHoy();

    const res = await pdf();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`bitacora-diaria-${hoy()}.pdf`);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(s3.uploadBuffer).toHaveBeenCalledTimes(1);
    const arg = s3.uploadBuffer.mock.calls[0][0];
    expect(arg.key).toBe(`constancias-consultas-externas/${hoy()}.pdf`);
    expect(arg.contentType).toBe('application/pdf');
    expect(arg.body.subarray(0, 4).toString()).toBe('%PDF');
    // Lo archivado es exactamente lo que se descargó.
    expect(Buffer.compare(arg.body, res.body)).toBe(0);
  });

  test('si S3 falla, el abogado igual recibe su PDF', async () => {
    await registrarHoy();
    s3.uploadBuffer.mockRejectedValue(new Error('S3 caído'));
    const errores = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await pdf();

    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(errores).toHaveBeenCalled();
    errores.mockRestore();
  });

  test('con procesos sin revisar → 409 y no se archiva nada', async () => {
    const res = await request(app).get('/pdf').set('Authorization', adminToken());
    expect(res.status).toBe(409);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  test('sin sesión → 401', async () => {
    expect((await request(app).get('/pdf')).status).toBe(401);
  });
});
