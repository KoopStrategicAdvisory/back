'use strict';
/**
 * Pruebas de integración — Capa de Repositorios
 *
 * Valida que el SQL de cada repositorio funciona correctamente contra el
 * esquema real de PGlite en memoria: constraints, JOINs, filtros y lógica
 * de negocio que las pruebas unitarias (con mocks) no pueden verificar.
 */

process.env.ACCESS_TOKEN_SECRET  = 'test-int-secret';
process.env.BCRYPT_SALT_ROUNDS   = '1';
process.env.NODE_ENV             = 'test';

jest.mock('../../src/db/client', () => {
  const path = require('path');
  return require(path.join(__dirname, '../functional/db-client'));
});

const bcrypt  = require('bcrypt');
const { getDb } = require('../../src/db/client');
const users      = require('../../src/repositories/users');
const clientes   = require('../../src/repositories/clientes');
const expedientes = require('../../src/repositories/expedientes');
const tareas     = require('../../src/repositories/tareas');
const financiero = require('../../src/repositories/financiero');
const { seedRoles, seedUser, assignRole } = require('../functional/helpers');

let adminId, lawyerId, adminRoleId, lawyerRoleId;
let clienteId, expedienteId;

beforeAll(async () => {
  const db   = await getDb();
  const roles = await seedRoles(db);
  adminRoleId  = roles.adminRoleId;
  lawyerRoleId = roles.lawyerRoleId;

  const admin  = await seedUser(db, { nombre: 'Admin Int', email: 'admin-int@test.com', password: 'Pass1!' });
  const lawyer = await seedUser(db, { nombre: 'Lawyer Int', email: 'lawyer-int@test.com', password: 'Pass1!' });
  await assignRole(db, admin.id, adminRoleId);
  await assignRole(db, lawyer.id, lawyerRoleId);
  adminId  = Number(admin.id);
  lawyerId = Number(lawyer.id);

  await db.query(`INSERT INTO estado_proceso (nombre) VALUES ('Activo') ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO prioridad (nombre, nivel) VALUES ('Alta', 1), ('Baja', 3) ON CONFLICT DO NOTHING`);
  await db.query(`INSERT INTO estado_tarea (nombre) VALUES ('Pendiente'), ('Completada') ON CONFLICT DO NOTHING`);
}, 30000);

// ─── users ─────────────────────────────────────────────────────────────────

describe('Repositorio users', () => {
  test('findAll devuelve solo usuarios activos por defecto', async () => {
    const rows = await users.findAll();
    expect(rows.every((u) => u.active === true)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('findByEmail retorna el usuario con sus roles', async () => {
    const u = await users.findByEmail('admin-int@test.com');
    expect(u).not.toBeNull();
    expect(Array.isArray(u.roles)).toBe(true);
    expect(u.roles.some((r) => r.nombre === 'admin')).toBe(true);
  });

  test('findByEmail es case-insensitive', async () => {
    const u = await users.findByEmail('ADMIN-INT@TEST.COM');
    expect(u).not.toBeNull();
  });

  test('findById retorna null para ID inexistente', async () => {
    const u = await users.findById(99999);
    expect(u).toBeNull();
  });

  test('create respeta constraint UNIQUE en email', async () => {
    const hash = await bcrypt.hash('x', 1);
    await expect(
      users.create({ nombre: 'Dup', email: 'admin-int@test.com', password_hash: hash }, null)
    ).rejects.toThrow();
  });

  test('addRole asigna rol y getRoles lo devuelve', async () => {
    const db    = await getDb();
    const { rows: [r] } = await db.query(`SELECT id FROM roles WHERE nombre = 'lawyer'`);
    await users.addRole(adminId, Number(r.id), adminId);
    const roles = await users.getRoles(adminId);
    expect(roles.some((x) => x.nombre === 'lawyer')).toBe(true);
  });

  test('removeRole elimina el rol', async () => {
    const db    = await getDb();
    const { rows: [r] } = await db.query(`SELECT id FROM roles WHERE nombre = 'lawyer'`);
    await users.removeRole(adminId, Number(r.id), adminId);
    const roles = await users.getRoles(adminId);
    expect(roles.some((x) => x.nombre === 'lawyer')).toBe(false);
  });

  test('update modifica campos permitidos', async () => {
    const updated = await users.update(lawyerId, { cargo: 'Asociado Senior' }, adminId);
    expect(updated.cargo).toBe('Asociado Senior');
  });

  test('softDelete desactiva al usuario', async () => {
    const db   = await getDb();
    const hash = await bcrypt.hash('t', 1);
    const { rows: [tmp] } = await db.query(
      `INSERT INTO users (nombre, email, password_hash) VALUES ('Tmp','tmp-del@t.com',$1) RETURNING id`, [hash]
    );
    await users.softDelete(Number(tmp.id), adminId);
    const u = await users.findById(Number(tmp.id));
    expect(u.active).toBe(false);
  });
});

// ─── clientes ──────────────────────────────────────────────────────────────

describe('Repositorio clientes', () => {
  test('create inserta un cliente y retorna la fila', async () => {
    const row = await clientes.create({ nombre: 'Corp Integración', tipo_persona: 'JURIDICA' }, adminId);
    expect(row).toHaveProperty('id');
    expect(row.nombre).toBe('Corp Integración');
    clienteId = Number(row.id);
  });

  test('findAll pagina correctamente', async () => {
    const rows = await clientes.findAll({ limit: 1, offset: 0 });
    expect(rows.length).toBe(1);
  });

  test('findAll filtra por búsqueda de texto', async () => {
    const rows = await clientes.findAll({ search: 'Corp Integración' });
    expect(rows.some((c) => Number(c.id) === clienteId)).toBe(true);
  });

  test('count devuelve el total de clientes activos', async () => {
    const total = await clientes.count();
    expect(total).toBeGreaterThanOrEqual(1);
  });
});

// ─── expedientes ────────────────────────────────────────────────────────────

describe('Repositorio expedientes', () => {
  test('create inserta expediente con FK a usuario', async () => {
    const row = await expedientes.create({
      numero_de_expediente: 'INT-EXP-001',
      id_cliente: clienteId,
    }, lawyerId);
    expect(row).toHaveProperty('id');
    expect(row.numero_de_expediente).toBe('INT-EXP-001');
    expedienteId = Number(row.id);
  });

  test('create rechaza número de expediente duplicado', async () => {
    await expect(
      expedientes.create({ numero_de_expediente: 'INT-EXP-001' }, lawyerId)
    ).rejects.toThrow();
  });

  test('findById devuelve JOIN con nombre_cliente', async () => {
    const row = await expedientes.findById(expedienteId);
    expect(row).not.toBeNull();
    expect(row.nombre_cliente).toBe('Corp Integración');
  });

  test('findAll filtra por id_usuario y respeta active=true', async () => {
    const rows = await expedientes.findAll({ id_usuario: lawyerId });
    expect(rows.every((e) => e.id_usuario == lawyerId)).toBe(true);
  });

  test('findAll filtro search busca por numero_de_expediente', async () => {
    const rows = await expedientes.findAll({ search: 'INT-EXP' });
    expect(rows.some((e) => Number(e.id) === expedienteId)).toBe(true);
  });

  test('update modifica campo permitido', async () => {
    const updated = await expedientes.update(expedienteId, {
      juzgado_o_autoridad_que_conoce: 'Juzgado 7 Civil',
    }, lawyerId);
    expect(updated.juzgado_o_autoridad_que_conoce).toBe('Juzgado 7 Civil');
  });

  test('createEtapa inserta etapa y retorna fila', async () => {
    const etapa = await expedientes.createEtapa(expedienteId, { origen: 'manual' }, lawyerId);
    expect(etapa).toHaveProperty('id');
    expect(Number(etapa.id_expediente)).toBe(expedienteId);
  });

  test('findEtapas devuelve etapas del expediente', async () => {
    const rows = await expedientes.findEtapas(expedienteId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test('softDelete desactiva el expediente', async () => {
    const result = await expedientes.softDelete(expedienteId, lawyerId);
    expect(result).toHaveProperty('id');
    const row = await expedientes.findById(expedienteId);
    expect(row.active).toBe(false);
  });

  test('findAll no devuelve expedientes eliminados (active=true)', async () => {
    const rows = await expedientes.findAll();
    expect(rows.every((e) => e.active === true)).toBe(true);
  });
});

// ─── tareas ────────────────────────────────────────────────────────────────

describe('Repositorio tareas', () => {
  let tareaId, checklistItemId;
  let estadoPendienteId, estadoCompletadaId, prioridadAltaId;

  beforeAll(async () => {
    const db = await getDb();
    // Necesitamos un expediente activo para las tareas con FK
    const { rows: [exp] } = await db.query(
      `INSERT INTO expediente (id_usuario, numero_de_expediente) VALUES ($1,'INT-TAREA-EXP') RETURNING id`,
      [lawyerId]
    );
    expedienteId = Number(exp.id);

    const { rows: [ep] } = await db.query(`SELECT id FROM estado_tarea WHERE nombre = 'Pendiente'`);
    const { rows: [ec] } = await db.query(`SELECT id FROM estado_tarea WHERE nombre = 'Completada'`);
    const { rows: [pa] } = await db.query(`SELECT id FROM prioridad WHERE nombre = 'Alta'`);
    estadoPendienteId  = Number(ep.id);
    estadoCompletadaId = Number(ec.id);
    prioridadAltaId    = Number(pa.id);
  });

  test('create inserta tarea y retorna fila con JOIN', async () => {
    const row = await tareas.create({
      titulo:              'Tarea integración',
      id_expediente:       expedienteId,
      id_prioridad:        prioridadAltaId,
      id_estado_tarea:     estadoPendienteId,
      id_usuario_asignado: lawyerId,
      fecha_limite:        '2026-12-31',
    }, lawyerId);
    expect(row).toHaveProperty('id');
    expect(row.titulo).toBe('Tarea integración');
    tareaId = Number(row.id);
    // JOIN columns only available via findById, not INSERT RETURNING *
    const full = await tareas.findById(tareaId);
    expect(full.nombre_prioridad).toBe('Alta');
  });

  test('findAll filtra por id_expediente', async () => {
    const rows = await tareas.findAll({ id_expediente: expedienteId });
    expect(rows.some((t) => Number(t.id) === tareaId)).toBe(true);
  });

  test('findMisTareas devuelve solo las del usuario asignado', async () => {
    const rows = await tareas.findMisTareas(String(lawyerId));
    expect(rows.some((t) => Number(t.id) === tareaId)).toBe(true);
  });

  test('update cambia estado a Completada', async () => {
    const updated = await tareas.update(tareaId, { id_estado_tarea: estadoCompletadaId }, lawyerId);
    expect(Number(updated.id_estado_tarea)).toBe(estadoCompletadaId);
  });

  test('createChecklistItem inserta item en tarea', async () => {
    const item = await tareas.createChecklistItem({ id_tarea: tareaId, titulo: 'Subitem 1' }, lawyerId);
    expect(item).toHaveProperty('id');
    expect(item.titulo).toBe('Subitem 1');
    expect(item.completado).toBe(false);
    checklistItemId = Number(item.id);
  });

  test('updateChecklistItem marca como completado', async () => {
    const updated = await tareas.updateChecklistItem(checklistItemId, { completado: true }, lawyerId);
    expect(updated.completado).toBe(true);
  });

  test('softDeleteChecklistItem desactiva el item', async () => {
    const result = await tareas.softDeleteChecklistItem(checklistItemId, lawyerId);
    expect(result).toHaveProperty('id');
  });

  test('findChecklist no devuelve items inactivos', async () => {
    const items = await tareas.findChecklist(tareaId);
    expect(items.every((i) => i.active !== false)).toBe(true);
  });
});

// ─── financiero ────────────────────────────────────────────────────────────

describe('Repositorio financiero', () => {
  let honorarioId;

  test('createHonorario inserta con FK a expediente', async () => {
    const row = await financiero.createHonorario({
      id_expediente:       expedienteId,
      monto_total_pactado: 8000000,
      moneda:              'COP',
    }, adminId);
    expect(row).toHaveProperty('id');
    honorarioId = Number(row.id);
  });

  test('createPago registra pago vinculado al honorario', async () => {
    const row = await financiero.createPago({
      id_expediente: expedienteId,
      id_honorario:  honorarioId,
      monto:         3000000,
      fecha_pago:    '2026-07-10',
    }, adminId);
    expect(row).toHaveProperty('id');
    expect(parseFloat(row.monto)).toBe(3000000);
  });

  test('getResumen agrega totales correctamente', async () => {
    const resumen = await financiero.getResumen(expedienteId);
    expect(parseFloat(resumen.total_honorarios)).toBe(8000000);
    expect(parseFloat(resumen.total_pagado)).toBe(3000000);
    expect(parseFloat(resumen.total_gastos)).toBe(0);
  });

  test('findHonorarios lista los honorarios del expediente', async () => {
    const rows = await financiero.findHonorarios({ id_expediente: expedienteId });
    expect(rows.some((h) => Number(h.id) === honorarioId)).toBe(true);
  });
});
