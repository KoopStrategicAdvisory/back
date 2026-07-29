'use strict';
const path = require('path');
const bcrypt = require('bcrypt');
const seedData = require('../data/koop_models_data.json');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Upsert a single catalog document by NOMBRE; returns the saved doc. */
async function upsertByNombre(Model, nombre, extra = {}) {
  return Model.findOneAndUpdate(
    { NOMBRE: nombre },
    { $setOnInsert: { NOMBRE: nombre, ...extra } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Build a lookup map { nombre -> doc } for an array of docs. */
function byNombre(docs) {
  return Object.fromEntries(docs.map((d) => [d.NOMBRE, d]));
}

/* ─── catalog seeders ─────────────────────────────────────────────────────── */

async function seedCatalogs() {
  const {
    TipoProceso, SubtipoProceso, TipoPretension, TipoProcSubtipoProcTipoPre,
    Instancia, TipoActuacion, TipoDocumento, TipoNotificacion,
    MedioNotificacion, EstadoProceso, EstadoEtapa, EstadoTarea, Prioridad,
  } = require('../models/koop.models');

  // ── simple catalogs (upsert by NOMBRE) ───────────────────────────────────
  const [tiposProcMap, subtipoProcMap, tipoPretMap] = await Promise.all([
    Promise.all(seedData.tiposProceso.map((d)    => upsertByNombre(TipoProceso, d.NOMBRE))).then(byNombre),
    Promise.all(seedData.subtiposProceso.map((d) => upsertByNombre(SubtipoProceso, d.NOMBRE))).then(byNombre),
    Promise.all(seedData.tiposPretension.map((d) => upsertByNombre(TipoPretension, d.NOMBRE))).then(byNombre),
    Promise.all(seedData.instancias.map((d)      => upsertByNombre(Instancia, d.NOMBRE))),
    Promise.all(seedData.tiposActuacion.map((d)  => upsertByNombre(TipoActuacion, d.NOMBRE, { DESCRIPCION: d.DESCRIPCION }))),
    Promise.all(seedData.tiposDocumento.map((d)  => upsertByNombre(TipoDocumento, d.NOMBRE))),
    Promise.all(seedData.tiposNotificacion.map((d) =>
      upsertByNombre(TipoNotificacion, d.NOMBRE, {
        FUNDAMENTO_LEGAL: d.FUNDAMENTO_LEGAL,
        DIAS_SURTIMIENTO: d.DIAS_SURTIMIENTO,
        DESCRIPCION: d.DESCRIPCION,
      })
    )),
    Promise.all(seedData.mediosNotificacion.map((d) => upsertByNombre(MedioNotificacion, d.NOMBRE))),
    Promise.all(seedData.estadosProceso.map((d)  => upsertByNombre(EstadoProceso, d.NOMBRE, { DESCRIPCION: d.DESCRIPCION }))),
    Promise.all(seedData.estadosEtapa.map((d)    => upsertByNombre(EstadoEtapa, d.NOMBRE))),
    Promise.all(seedData.estadosTarea.map((d)    => upsertByNombre(EstadoTarea, d.NOMBRE))),
    Promise.all(seedData.prioridades.map((d)     => upsertByNombre(Prioridad, d.NOMBRE, { NIVEL: d.NIVEL }))),
  ]);

  // ── combinaciones TipoProceso × Subtipo × Pretension ─────────────────────
  await Promise.all(
    seedData.combinaciones.map(({ tipoProceso, subtipoProceso, tipoPretension }) => {
      const tp  = tiposProcMap[tipoProceso];
      const stp = subtipoProcMap[subtipoProceso];
      const tpr = tipoPretMap[tipoPretension];
      if (!tp || !stp || !tpr) return null;
      return TipoProcSubtipoProcTipoPre.findOneAndUpdate(
        {
          ID_TIPO_PROCESO:   tp._id,
          ID_SUBTIPO_PROCESO: stp._id,
          ID_TIPO_PRETENSION: tpr._id,
        },
        {
          $setOnInsert: {
            ID_TIPO_PROCESO:       tp._id,
            ID_SUBTIPO_PROCESO:    stp._id,
            ID_TIPO_PRETENSION:    tpr._id,
            NOMBRE_TIPO_PROCESO:   tipoProceso,
            NOMBRE_SUBTIPO_PROCESO: subtipoProceso,
            NOMBRE_TIPO_PRETENSION: tipoPretension,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    })
  );

  console.log('[seeder] Catálogos parametrizados insertados/verificados.');
}

/* ─── users & expedientes seeders ────────────────────────────────────────── */

async function seedUsersAndExpedientes() {
  // Auth system uses the legacy User model (name / passwordHash / string roles)
  const LegacyUser = require('../models/User');
  const { Expediente, TipoProcSubtipoProcTipoPre } = require('../models/koop.models');

  const adminEmail  = (process.env.SEED_ADMIN_EMAIL  || 'admin@koop.co').toLowerCase();
  const user1Email  = (process.env.SEED_USER1_EMAIL  || 'abogado.prueba@koop.co').toLowerCase();
  const user2Email  = (process.env.SEED_USER2_EMAIL  || 'cliente.prueba@koop.co').toLowerCase();
  const defaultPass = process.env.SEED_DEFAULT_PASSWORD || 'Koop2024!';

  // ── admin ─────────────────────────────────────────────────────────────────
  let adminUser = await LegacyUser.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await LegacyUser.create({
      name:         'Administrador Koop',
      email:        adminEmail,
      passwordHash: await bcrypt.hash(defaultPass, BCRYPT_ROUNDS),
      roles:        ['admin'],
      active:       true,
    });
    console.log(`[seeder] Admin creado: ${adminEmail}`);
  } else {
    console.log(`[seeder] Admin ya existe: ${adminEmail}`);
  }

  // ── test user 1 – abogado ─────────────────────────────────────────────────
  let user1 = await LegacyUser.findOne({ email: user1Email });
  if (!user1) {
    user1 = await LegacyUser.create({
      name:         'Abogado Prueba',
      email:        user1Email,
      passwordHash: await bcrypt.hash(defaultPass, BCRYPT_ROUNDS),
      roles:        ['lawyer'],
      active:       true,
    });
    console.log(`[seeder] Usuario 1 creado: ${user1Email}`);
  }

  // ── test user 2 – cliente ─────────────────────────────────────────────────
  let user2 = await LegacyUser.findOne({ email: user2Email });
  if (!user2) {
    user2 = await LegacyUser.create({
      name:         'Cliente Prueba',
      email:        user2Email,
      passwordHash: await bcrypt.hash(defaultPass, BCRYPT_ROUNDS),
      roles:        ['client'],
      active:       true,
    });
    console.log(`[seeder] Usuario 2 creado: ${user2Email}`);
  }

  // ── expedientes de prueba ─────────────────────────────────────────────────
  // Resuelve combinaciones paramétricas para poblar los expedientes
  const [combo1, combo2, combo3, combo4] = await Promise.all([
    TipoProcSubtipoProcTipoPre.findOne({ NOMBRE_TIPO_PROCESO: 'Civil',         NOMBRE_SUBTIPO_PROCESO: 'Ejecutivo Singular',          NOMBRE_TIPO_PRETENSION: 'Cobro de Suma de Dinero' }).lean(),
    TipoProcSubtipoProcTipoPre.findOne({ NOMBRE_TIPO_PROCESO: 'Laboral',       NOMBRE_SUBTIPO_PROCESO: 'Ordinario de Primera Instancia', NOMBRE_TIPO_PRETENSION: 'Reparación de Perjuicios' }).lean(),
    TipoProcSubtipoProcTipoPre.findOne({ NOMBRE_TIPO_PROCESO: 'Familia',       NOMBRE_SUBTIPO_PROCESO: 'Divorcio',                    NOMBRE_TIPO_PRETENSION: 'Liquidación de Sociedad Patrimonial' }).lean(),
    TipoProcSubtipoProcTipoPre.findOne({ NOMBRE_TIPO_PROCESO: 'Administrativo', NOMBRE_SUBTIPO_PROCESO: 'Reparación Directa',          NOMBRE_TIPO_PRETENSION: 'Indemnización de Perjuicios Administrativos' }).lean(),
  ]);

  const expedientesSpec = [
    // Dos expedientes para usuario 1 (abogado)
    {
      numero_de_expediente:           'EXP-2024-001',
      id_usuario:                     user1._id,
      cliente:                        'Empresa Industrial del Norte S.A.S.',
      calidad:                        'Demandante',
      contraparte:                    'Banco Nacional Crédito S.A.',
      juzgado_o_autoridad_que_conoce: 'Juzgado 12 Civil del Circuito de Bogotá',
      ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: combo1?._id,
      NOMBRE_TIPO_PROCESO:            combo1?.NOMBRE_TIPO_PROCESO   || 'Civil',
      NOMBRE_SUBTIPO_PROCESO:         combo1?.NOMBRE_SUBTIPO_PROCESO || 'Ejecutivo Singular',
      NOMBRE_TIPO_PRETENSION:         combo1?.NOMBRE_TIPO_PRETENSION || 'Cobro de Suma de Dinero',
    },
    {
      numero_de_expediente:           'EXP-2024-002',
      id_usuario:                     user1._id,
      cliente:                        'Pedro Rodríguez Mejía',
      calidad:                        'Demandante',
      contraparte:                    'Distribuidora Logística XYZ Ltda.',
      juzgado_o_autoridad_que_conoce: 'Juzgado 5 Laboral del Circuito de Medellín',
      ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: combo2?._id,
      NOMBRE_TIPO_PROCESO:            combo2?.NOMBRE_TIPO_PROCESO   || 'Laboral',
      NOMBRE_SUBTIPO_PROCESO:         combo2?.NOMBRE_SUBTIPO_PROCESO || 'Ordinario de Primera Instancia',
      NOMBRE_TIPO_PRETENSION:         combo2?.NOMBRE_TIPO_PRETENSION || 'Reparación de Perjuicios',
    },
    // Dos expedientes para usuario 2 (cliente)
    {
      numero_de_expediente:           'EXP-2024-003',
      id_usuario:                     user2._id,
      cliente:                        'María Fernanda Ospina',
      calidad:                        'Demandante',
      contraparte:                    'Carlos Alberto Pérez Gómez',
      juzgado_o_autoridad_que_conoce: 'Juzgado 3 de Familia de Bogotá',
      ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: combo3?._id,
      NOMBRE_TIPO_PROCESO:            combo3?.NOMBRE_TIPO_PROCESO   || 'Familia',
      NOMBRE_SUBTIPO_PROCESO:         combo3?.NOMBRE_SUBTIPO_PROCESO || 'Divorcio',
      NOMBRE_TIPO_PRETENSION:         combo3?.NOMBRE_TIPO_PRETENSION || 'Liquidación de Sociedad Patrimonial',
    },
    {
      numero_de_expediente:           'EXP-2024-004',
      id_usuario:                     user2._id,
      cliente:                        'María Fernanda Ospina',
      calidad:                        'Demandante',
      contraparte:                    'Municipio de Bogotá D.C.',
      juzgado_o_autoridad_que_conoce: 'Tribunal Administrativo de Cundinamarca - Sección Tercera',
      ID_TIPO_PROC_SUBTIPO_PROC_TIPO_PRE: combo4?._id,
      NOMBRE_TIPO_PROCESO:            combo4?.NOMBRE_TIPO_PROCESO   || 'Administrativo',
      NOMBRE_SUBTIPO_PROCESO:         combo4?.NOMBRE_SUBTIPO_PROCESO || 'Reparación Directa',
      NOMBRE_TIPO_PRETENSION:         combo4?.NOMBRE_TIPO_PRETENSION || 'Indemnización de Perjuicios Administrativos',
    },
  ];

  for (const spec of expedientesSpec) {
    const exists = await Expediente.findOne({ numero_de_expediente: spec.numero_de_expediente });
    if (!exists) {
      await Expediente.create(spec);
      console.log(`[seeder] Expediente creado: ${spec.numero_de_expediente}`);
    } else {
      console.log(`[seeder] Expediente ya existe: ${spec.numero_de_expediente}`);
    }
  }
}

/* ─── main entry point ────────────────────────────────────────────────────── */

async function runSeeder() {
  try {
    await seedCatalogs();
    await seedUsersAndExpedientes();
    console.log('[seeder] Inicialización completada.');
  } catch (err) {
    console.error('[seeder] Error durante la inicialización:', err.message || err);
  }
}

module.exports = { runSeeder };
