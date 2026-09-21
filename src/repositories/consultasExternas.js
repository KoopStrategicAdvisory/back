'use strict';
const { getDb, withUser } = require('../db/client');
const AppError = require('../errors/AppError');

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    if (data.fecha_consulta && data.fecha_consulta !== hoy) throw new AppError(400, 'Solo puedes registrar o corregir la revisión de hoy.');
    const { rows: procesos } = await tx.query(`SELECT rp.* FROM expediente_radicado_publico rp
      JOIN expediente e ON e.id = rp.id_expediente
      WHERE rp.id = $1 AND rp.active AND e.active
        AND EXISTS (SELECT 1 FROM seguimiento_diario s WHERE s.id_radicado_publico = rp.id
          AND s.hasta IS NULL AND s.desde <= $2::date)
      FOR UPDATE OF rp`, [data.id_radicado_publico, hoy]);
    const proceso = procesos[0];
    if (!proceso) throw new AppError(409, 'El proceso ya no está en la lista diaria. Actualiza la página.');
    const { rows } = await tx.query(`
      INSERT INTO consulta_externa_diaria
        (id_expediente, id_radicado_publico, numero_radicado, portal_consultado, fecha_consulta, resultado, observacion, id_usuario)
      VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8)
      RETURNING *
    `, [
      proceso.id_expediente,
      proceso.id,
      proceso.numero_radicado,
      proceso.organismo,
      hoy,
      data.resultado ?? 'sin_movimiento',
      data.observacion ?? null,
      userId,
    ]);
    return rows[0];
  });
}

// Trae, ademas del registro de la consulta, todo el contexto del caso que
// hace falta para que la constancia en PDF tenga sentido por si sola: las
// partes (cliente que representamos / contraparte), la materia del
// proceso y el juzgado — sin esto la constancia solo decia un numero de
// radicado suelto, sin explicar de que caso se trataba.
async function findByFecha(fecha) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT
      cd.*,
      e.numero_de_expediente,
      e.juzgado_o_autoridad_que_conoce,
      u.nombre           AS nombre_usuario,
      cli.nombre         AS nombre_cliente,
      COALESCE(e.contraparte, cp.nombre) AS nombre_contraparte,
      cu.calidad         AS calidad_cliente,
      tp.nombre          AS nombre_tipo_proceso,
      sp.nombre          AS nombre_subtipo_proceso
    FROM consulta_externa_diaria cd
    LEFT JOIN expediente e ON e.id = cd.id_expediente
    LEFT JOIN users u ON u.id = cd.id_usuario
    LEFT JOIN clientes cli ON cli.id = e.id_cliente
    LEFT JOIN contraparte cp ON cp.id = e.id_contraparte
    LEFT JOIN calidad_usuario cu ON cu.id = e.id_calidad_usuario
    LEFT JOIN tipo_proc_subtipo_proc_tipo_pre combo ON combo.id = e.id_tipo_proc_subtipo_proc_tipo_pre
    LEFT JOIN tipo_proceso tp ON tp.id = combo.id_tipo_proceso
    LEFT JOIN subtipo_proceso sp ON sp.id = combo.id_subtipo_proceso
    WHERE cd.fecha_consulta = $1
    ORDER BY cd.created_at DESC, cd.id DESC
  `, [fecha]);
  return rows;
}

// La constancia incluye un resultado final por proceso y conserva en la
// base de datos las versiones anteriores de las correcciones del día.
async function reporteCompleto(fecha) {
  const lista = await require('./radicadosPublicos').findAllActivos({ fecha });
  if (!lista.length) throw new AppError(409, 'No hay procesos en seguimiento para esta fecha.');
  if (lista.some((r) => !r.ultima_consulta_hoy_id))
    throw new AppError(409, 'Registra la revisión de todos los procesos antes de generar la bitácora.');
  const registros = await findByFecha(fecha);
  const ids = new Set(lista.map((r) => String(r.ultima_consulta_hoy_id)));
  const rows = registros.filter((r) => ids.has(String(r.id)));
  if (rows.length !== lista.length) throw new AppError(409, 'La lista cambió. Actualiza la página y vuelve a generar la bitácora.');
  return rows;
}

// fecha_consulta::text evita cualquier ambiguedad de zona horaria al
// convertir un DATE de Postgres a JS Date (el driver lo arma en la
// medianoche de la zona horaria del proceso, no en UTC) — aqui se necesita
// el texto exacto 'YYYY-MM-DD' tal cual quedo guardado, sin reinterpretar.
async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT *, fecha_consulta::text AS fecha_consulta_text FROM consulta_externa_diaria WHERE id = $1`, [id]
  );
  return rows[0] ?? null;
}

// Esta bitacora no tiene columna 'active' (no sigue el patron de borrado
// logico del resto del sistema) — es un registro de auditoria de que se
// reviso un proceso, no una entidad de negocio con historial que conservar.
// Si alguien marco un radicado equivocado por error EL MISMO DIA, se borra
// de verdad — los dias anteriores quedan fijos (ver delete-consulta.js).
async function remove(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM consulta_externa_diaria WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

module.exports = { create, findByFecha, findById, remove, reporteCompleto };
