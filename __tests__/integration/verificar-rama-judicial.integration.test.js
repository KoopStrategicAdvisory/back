'use strict';
const fs = require('fs');
const path = require('path');
jest.mock('../../src/db/client', () => ({ getDb: jest.fn(), withUser: jest.fn() }));
jest.mock('../../src/services/ramaJudicial');
const client = require('../../src/db/client');
const ramaJudicial = require('../../src/services/ramaJudicial');
const { configurar } = require('../../src/repositories/seguimientoDiario');
const consultas = require('../../src/repositories/consultasExternas');
const { verificarTodos } = require('../../src/services/verificarRamaJudicial');
const migrationSeguimiento = fs.readFileSync(path.join(__dirname, '../../src/db/seguimiento-diario.sql'), 'utf8');
const migrationSistema = fs.readFileSync(path.join(__dirname, '../../src/db/sistema-usuario.sql'), 'utf8');
const RAMA = 'Consulta de procesos Rama Judicial';
const SISTEMA_EMAIL = 'sistema.rama-judicial@koop.internal';
let db;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.waitReady;
  await db.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
  await db.exec(migrationSeguimiento);
  await db.exec(migrationSistema);
  await db.exec(`INSERT INTO tipo_proceso (id, nombre) VALUES (1, 'Civil');
    INSERT INTO subtipo_proceso (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_pretension (id, nombre) VALUES (1, 'General');
    INSERT INTO tipo_proc_subtipo_proc_tipo_pre (id, id_tipo_proceso, id_subtipo_proceso, id_tipo_pretension) VALUES (1, 1, 1, 1);`);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  jest.clearAllMocks();
  client.getDb.mockResolvedValue(db);
  client.withUser.mockImplementation((id, fn) => db.transaction(fn));
  // 'clientes' se limpia con DELETE (no TRUNCATE): users.id_cliente referencia
  // clientes ON DELETE SET NULL, así que un TRUNCATE...CASCADE de clientes se
  // lleva por delante toda la tabla users — incluida la cuenta de sistema que
  // sistema-usuario.sql solo crea una vez en beforeAll. El id 1000 del admin
  // de prueba evita colisionar con el id (autogenerado, variable) de esa cuenta.
  await db.exec(`TRUNCATE seguimiento_diario, consulta_externa_diaria, expediente_radicado_publico, expediente RESTART IDENTITY CASCADE;
    DELETE FROM clientes;
    DELETE FROM users WHERE email <> '${SISTEMA_EMAIL}';
    INSERT INTO users (id, nombre, email, password_hash) VALUES (1000, 'Admin', 'admin@test.com', 'hash');
    INSERT INTO clientes (id, nombre) VALUES (1, 'Cliente Uno');
    INSERT INTO expediente (id, id_cliente, numero_de_expediente, numero_radicado_despacho, id_usuario, id_tipo_proc_subtipo_proc_tipo_pre)
      VALUES (1, 1, 'KOOP-2026-1', '123', 1000, 1);
    INSERT INTO expediente_radicado_publico (id, id_expediente, organismo, numero_radicado)
      VALUES (1, 1, '${RAMA}', '123');
    SELECT setval(pg_get_serial_sequence('expediente_radicado_publico', 'id'), 1);`);
  await configurar('1', 'automatica', '1000');
});

test('genera el registro del dia con fecha de actuacion, actuacion y anotacion, a nombre del sistema', async () => {
  ramaJudicial.buscarPorRadicado.mockResolvedValue({ idProceso: 999 });
  ramaJudicial.ultimaActuacion.mockResolvedValue({
    fechaActuacion: '2026-05-25', actuacion: 'Oficio Enviado Virtualmente', anotacion: 'RADICACION OFICIO 629',
  });

  const resultado = await verificarTodos();
  expect(resultado).toMatchObject({ total: 1, revisados: 1, novedades: 1, registrados: 1, errores: [] });

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const filas = await consultas.findByFecha(hoy);
  expect(filas).toHaveLength(1);
  expect(filas[0].resultado).toBe('actuacion_nueva');
  expect(filas[0].observacion).toBe(
    'Generado automáticamente (Rama Judicial) — Fecha de actuación: 2026-05-25 — Actuación: Oficio Enviado Virtualmente — Anotación: RADICACION OFICIO 629'
  );
  const sistema = (await db.query(`SELECT id FROM users WHERE email = '${SISTEMA_EMAIL}'`)).rows[0];
  expect(String(filas[0].id_usuario)).toBe(String(sistema.id));
  expect(sistema).toBeTruthy();
  // La cuenta de sistema nunca debe servir para iniciar sesion.
  const activo = (await db.query(`SELECT active FROM users WHERE id = $1`, [sistema.id])).rows[0];
  expect(activo.active).toBe(false);
});

test('una segunda pasada el mismo dia sin cambios no duplica el registro', async () => {
  ramaJudicial.buscarPorRadicado.mockResolvedValue({ idProceso: 999 });
  ramaJudicial.ultimaActuacion.mockResolvedValue({
    fechaActuacion: '2026-05-25', actuacion: 'Oficio Enviado Virtualmente', anotacion: 'RADICACION OFICIO 629',
  });

  const primera = await verificarTodos();
  expect(primera.registrados).toBe(1);
  const segunda = await verificarTodos();
  expect(segunda.registrados).toBe(0);
  expect(segunda.novedades).toBe(0);

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  expect(await consultas.findByFecha(hoy)).toHaveLength(1);
});

test('una actuacion nueva genera una correccion aunque hoy ya tuviera registro', async () => {
  ramaJudicial.buscarPorRadicado.mockResolvedValue({ idProceso: 999 });
  ramaJudicial.ultimaActuacion.mockResolvedValueOnce({
    fechaActuacion: '2026-05-25', actuacion: 'Oficio Enviado Virtualmente', anotacion: 'RADICACION OFICIO 629',
  });
  await verificarTodos();

  ramaJudicial.ultimaActuacion.mockResolvedValueOnce({
    fechaActuacion: '2026-05-26', actuacion: 'Auto admisorio', anotacion: 'NOTIFICACION POR ESTADO',
  });
  const segunda = await verificarTodos();
  expect(segunda.registrados).toBe(1);
  expect(segunda.novedades).toBe(1);

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const filas = await consultas.findByFecha(hoy);
  expect(filas).toHaveLength(2);
  expect(filas[0].observacion).toContain('2026-05-26');
});

test('sin actuaciones en el portal igual genera el registro del dia como sin movimiento', async () => {
  ramaJudicial.buscarPorRadicado.mockResolvedValue({ idProceso: 999 });
  ramaJudicial.ultimaActuacion.mockResolvedValue(null);

  const resultado = await verificarTodos();
  expect(resultado).toMatchObject({ revisados: 1, novedades: 0, registrados: 1 });

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const filas = await consultas.findByFecha(hoy);
  expect(filas[0].resultado).toBe('sin_movimiento');
  expect(filas[0].observacion).toBe('Generado automáticamente (Rama Judicial) — sin actuaciones registradas en el portal.');
});

test('un radicado no encontrado en el portal no genera registro y queda en errores', async () => {
  ramaJudicial.buscarPorRadicado.mockResolvedValue(null);

  const resultado = await verificarTodos();
  expect(resultado.registrados).toBe(0);
  expect(resultado.errores).toHaveLength(1);
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  expect(await consultas.findByFecha(hoy)).toHaveLength(0);
});
