'use strict';
const fs = require('fs');
const path = require('path');
jest.mock('../../src/db/client', () => ({ getDb: jest.fn(), withUser: jest.fn() }));
const client = require('../../src/db/client');
const { configurar, agregar } = require('../../src/repositories/seguimientoDiario');
const consultas = require('../../src/repositories/consultasExternas');
const radicados = require('../../src/repositories/radicadosPublicos');
const request = require('supertest');
const express = require('express');
const { adminToken, clientToken } = require('../helpers');
const endpoint = require('../../src/features/consultas-externas/configurar-seguimiento');
const migration = fs.readFileSync(path.join(__dirname, '../../src/db/seguimiento-diario.sql'), 'utf8');
const RAMA = 'Consulta de procesos Rama Judicial';
let db;
beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.waitReady;
  await db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  await db.exec(migration);
  await db.exec(`INSERT INTO tipo_proceso (id, nombre) VALUES (1, 'Civil');
    INSERT INTO subtipo_proceso (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_pretension (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_proc_subtipo_proc_tipo_pre (id, id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension) VALUES (1, 1, 1, 1);`);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  client.getDb.mockResolvedValue(db);
  client.withUser.mockImplementation((id, fn) => db.transaction(fn));
  await db.exec(`TRUNCATE seguimiento_diario, consulta_externa_diaria, expediente_radicado_publico, expediente, users, clientes RESTART IDENTITY CASCADE;
    INSERT INTO users (id, nombre, email, password_hash) VALUES (1, 'Admin', 'admin@test.com', 'hash');
    INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente Uno');
    INSERT INTO expediente (id, id_cliente, numero_de_expediente, numero_radicado_despacho, id_usuario, id_tipo_proc_subtipo_proc_tipo_pre) VALUES (1, 1, 'KOOP-2026-1', '123', 1, 1);
    INSERT INTO expediente_radicado_publico (id, id_expediente, organismo, numero_radicado, created_at)
      VALUES (1, 1, 'Consulta de procesos Rama Judicial', '123', now() - interval '3 days'),
      (2, 1, 'SIUGJ', '456', now() - interval '3 days');
    SELECT setval(pg_get_serial_sequence('expediente_radicado_publico', 'id'), 2);`);
});
test('alta persistente, idempotente y restringida a automatizaciones elegidas', async () => {
  expect(await radicados.findAllActivos()).toHaveLength(0);
  await configurar('1', 'manual', '1');
  await configurar('1', 'manual', '1');
  expect(await radicados.findAllActivos()).toHaveLength(1);
  expect(await radicados.findActivosPorOrganismo(RAMA)).toHaveLength(0);
  await configurar('1', 'automatica', '1');
  expect(await radicados.findActivosPorOrganismo(RAMA)).toHaveLength(1);
  const tomorrow = (await db.query(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date + 1)::text AS fecha`)).rows[0].fecha;
  expect(await radicados.findAllActivos({ fecha: tomorrow })).toHaveLength(1);
});
test('retiro y reincorporación conservan historia y no duplican la lista', async () => {
  await configurar('1', 'automatica', '1');
  await db.exec(`UPDATE seguimiento_diario SET desde = desde - 2;
    INSERT INTO consulta_externa_diaria (id_expediente, id_radicado_publico, numero_radicado, resultado, id_usuario)
    VALUES (1, 1, '123', 'sin_movimiento', 1);`);
  await configurar('1', null, '1');
  expect(await radicados.findAllActivos()).toHaveLength(0);
  expect(await radicados.findActivosPorOrganismo(RAMA)).toHaveLength(0);
  const yesterday = (await db.query(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date - 1)::text AS fecha`)).rows[0].fecha;
  expect(await radicados.findAllActivos({ fecha: yesterday })).toHaveLength(1);
  expect((await db.query('SELECT * FROM consulta_externa_diaria')).rows).toHaveLength(1);
  await configurar('1', 'manual', '1');
  expect(await radicados.findAllActivos()).toHaveLength(1);
  const tomorrow = (await db.query(`SELECT ((now() AT TIME ZONE 'America/Bogota')::date + 1)::text AS fecha`)).rows[0].fecha;
  expect((await radicados.findAllActivos({ fecha: tomorrow }))[0].ultima_consulta_hoy_id).toBeNull();
});
test('rechaza automatización no compatible y expedientes inactivos', async () => {
  await expect(configurar('2', 'automatica', '1')).rejects.toMatchObject({ status: 400 });
  await db.query('UPDATE expediente SET active = false WHERE id = 1');
  await expect(configurar('1', 'manual', '1')).rejects.toMatchObject({ status: 404 });
});
test('automática exige el radicado externo del expediente, nunca el interno ni otro número', async () => {
  await db.query("UPDATE expediente SET numero_radicado_despacho = '   ' WHERE id = 1");
  await expect(configurar('1', 'automatica', '1')).rejects.toMatchObject({ status: 400 });
  await db.query("UPDATE expediente SET numero_radicado_despacho = '987' WHERE id = 1");
  await expect(configurar('1', 'automatica', '1')).rejects.toMatchObject({ status: 400 });
  await db.query("UPDATE expediente SET numero_radicado_despacho = ' 123 ' WHERE id = 1");
  await configurar('1', 'automatica', '1');
  expect(await radicados.findActivosPorOrganismo(RAMA)).toHaveLength(1);
  await db.query('UPDATE expediente SET numero_radicado_despacho = NULL WHERE id = 1');
  expect(await radicados.findActivosPorOrganismo(RAMA)).toHaveLength(0);
});
test('selector filtra radicados vacíos antes de paginar y cuenta solo expedientes elegibles', async () => {
  const expedientes = require('../../src/repositories/expedientes');
  await db.exec(`INSERT INTO expediente (id, numero_de_expediente, numero_radicado_despacho, id_usuario, id_tipo_proc_subtipo_proc_tipo_pre)
    VALUES (2, 'KOOP-2026-2', NULL, 1, 1), (3, 'KOOP-2026-3', '   ', 1, 1);`);
  const lista = await expedientes.findAll({ con_radicado: true, limit: 1 });
  expect(lista).toHaveLength(1);
  expect(lista[0].numero_radicado_despacho).toBe('123');
  expect(await expedientes.count({ con_radicado: true })).toBe(1);
  expect(await expedientes.count()).toBe(3);
});
test('la lista inicia vacía y la migración retira solo altas implícitas', async () => {
  await db.exec('DROP TABLE seguimiento_diario');
  await db.exec(migration);
  expect(await radicados.findAllActivos()).toHaveLength(0);
  await configurar('1', 'manual', '1');
  await db.exec("INSERT INTO seguimiento_diario (id_radicado_publico, modalidad) VALUES (2, 'manual')");
  await db.exec(migration);
  expect(await radicados.findAllActivos()).toHaveLength(1);
  expect((await radicados.findAllActivos())[0].numero_radicado).toBe('123');
});
test('alta por expediente usa siempre su radicado externo y es idempotente', async () => {
  const payload = { id_expediente: '1', organismo: RAMA, modalidad: 'manual', numero_radicado: 'KOOP-2026-1' };
  await agregar(payload, '1'); await agregar(payload, '1');
  const lista = await radicados.findAllActivos();
  expect(lista).toHaveLength(1);
  expect(lista[0].numero_radicado).toBe('123');
  await expect(agregar({ ...payload, organismo: 'Consultas Fiscalía', modalidad: 'automatica' }, '1')).rejects.toMatchObject({ status: 400 });
  await agregar({ ...payload, organismo: 'Consultas Fiscalía' }, '1');
  expect(await radicados.findAllActivos()).toHaveLength(2);
  await db.query('UPDATE expediente SET numero_radicado_despacho = NULL WHERE id = 1');
  await expect(agregar(payload, '1')).rejects.toMatchObject({ status: 400 });
});
test('bitácora exige todos los registros, usa su radicado y toma la última corrección', async () => {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  await expect(consultas.reporteCompleto(fecha)).rejects.toMatchObject({ status: 409 });
  await agregar({ id_expediente: '1', organismo: RAMA, modalidad: 'manual' }, '1');
  const fiscalia = await agregar({ id_expediente: '1', organismo: 'Consultas Fiscalía', modalidad: 'manual' }, '1');
  await consultas.create({ id_radicado_publico: '1', resultado: 'sin_movimiento', numero_radicado: 'KOOP-2026-1', fecha_consulta: fecha }, '1');
  await expect(consultas.reporteCompleto(fecha)).rejects.toMatchObject({ status: 409 });
  await consultas.create({ id_radicado_publico: fiscalia.id_radicado_publico, resultado: 'sin_movimiento' }, '1');
  const corregido = await consultas.create({ id_radicado_publico: '1', resultado: 'actuacion_nueva', observacion: 'Nueva audiencia' }, '1');
  const reporte = await consultas.reporteCompleto(fecha);
  expect(reporte).toHaveLength(2);
  expect(reporte.every((r) => r.numero_radicado === '123')).toBe(true);
  expect(reporte.some((r) => String(r.id) === String(corregido.id))).toBe(true);
  expect((await consultas.findByFecha(fecha))).toHaveLength(3);
  await configurar('1', null, '1');
  await expect(consultas.create({ id_radicado_publico: '1', resultado: 'sin_movimiento' }, '1')).rejects.toMatchObject({ status: 409 });
});
test('API exige autorización y modalidad explícita válida', async () => {
  const app = express(); app.use(express.json());
  app.put(endpoint.path, ...endpoint.middleware, endpoint.handler);
  app.use(require('../../src/middleware/error-handler'));
  const url = '/radicados/1/seguimiento';
  expect((await request(app).put(url).send({ modalidad: 'manual' })).status).toBe(401);
  expect((await request(app).put(url).set('Authorization', clientToken()).send({ modalidad: 'manual' })).status).toBe(403);
  expect((await request(app).put(url).set('Authorization', adminToken()).send({})).status).toBe(400);
  expect((await request(app).put(url).set('Authorization', adminToken()).send({ modalidad: 'manual' })).status).toBe(200);
});
test('API completa: alta en cascada, registro canónico y descarga de PDF solo al completar', async () => {
  const app = express(); app.use(express.json());
  app.use('/', require('../../src/features/consultas-externas'));
  app.use(require('../../src/middleware/error-handler'));
  const token = adminToken();
  expect((await request(app).post('/seguimientos').set('Authorization', token)
    .send({ id_expediente: '1', organismo: RAMA, modalidad: 'automatica' })).status).toBe(201);
  expect((await request(app).get('/pdf').set('Authorization', token)).status).toBe(409);
  const result = await request(app).post('/').set('Authorization', token)
    .send({ id_radicado_publico: '1', resultado: 'sin_movimiento', observacion: 'Sin nuevas actuaciones.' });
  expect(result.status).toBe(201);
  expect(result.body.numero_radicado).toBe('123');
  const pdf = await request(app).get('/pdf').set('Authorization', token);
  expect(pdf.status).toBe(200);
  expect(pdf.headers['content-type']).toContain('application/pdf');
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
});
