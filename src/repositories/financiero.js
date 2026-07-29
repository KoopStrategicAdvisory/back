'use strict';
const { getDb, withUser } = require('../db/client');

// ── Honorarios ────────────────────────────────────────────────────────────

async function findHonorarios({ id_expediente, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['h.active = $1'];
  if (id_expediente) { vals.push(id_expediente); conds.push(`h.id_expediente = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT h.*, u.nombre AS nombre_usuario
    FROM honorarios h
    LEFT JOIN users u ON u.id = h.id_usuario
    WHERE ${conds.join(' AND ')}
    ORDER BY h.created_at DESC
    LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
  `, [...vals, limit, offset]);
  return rows;
}

async function findHonorarioById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT h.*, u.nombre AS nombre_usuario FROM honorarios h LEFT JOIN users u ON u.id = h.id_usuario WHERE h.id = $1`, [id]
  );
  return rows[0] ?? null;
}

async function createHonorario(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO honorarios
        (id_expediente, id_usuario, modalidad, descripcion_modalidad,
         monto_total_pactado, moneda, porcentaje_cuota_litis,
         fecha_pacto, fecha_inicio, fecha_fin, forma_pago,
         numero_cuotas, valor_cuota, dia_pago_mes,
         incluye_gastos, observaciones, contrato_url, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      data.id_expediente, userId,
      data.modalidad ?? null, data.descripcion_modalidad ?? null,
      data.monto_total_pactado ?? null, data.moneda ?? 'COP',
      data.porcentaje_cuota_litis ?? null,
      data.fecha_pacto ?? null, data.fecha_inicio ?? null, data.fecha_fin ?? null,
      data.forma_pago ?? null, data.numero_cuotas ?? null, data.valor_cuota ?? null,
      data.dia_pago_mes ?? null, data.incluye_gastos ?? false,
      data.observaciones ?? null, data.contrato_url ?? null, data.estado ?? null,
    ]);
    return rows[0];
  });
}

async function updateHonorario(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'modalidad','descripcion_modalidad','monto_total_pactado','moneda','porcentaje_cuota_litis',
      'fecha_pacto','fecha_inicio','fecha_fin','forma_pago','numero_cuotas','valor_cuota',
      'dia_pago_mes','incluye_gastos','observaciones','contrato_url','estado','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findHonorarioById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE honorarios SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteHonorario(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE honorarios SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// ── Pagos ─────────────────────────────────────────────────────────────────

async function findPagos({ id_expediente, id_honorario, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['p.active = $1'];
  if (id_expediente) { vals.push(id_expediente); conds.push(`p.id_expediente = $${vals.length}`); }
  if (id_honorario)  { vals.push(id_honorario);  conds.push(`p.id_honorario = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT p.*, u.nombre AS nombre_usuario
    FROM pagos p
    LEFT JOIN users u ON u.id = p.id_usuario
    WHERE ${conds.join(' AND ')}
    ORDER BY p.fecha_pago DESC
    LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
  `, [...vals, limit, offset]);
  return rows;
}

async function findPagoById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM pagos WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createPago(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO pagos
        (id_expediente, id_honorario, id_usuario, fecha_pago, numero_cuota,
         concepto, monto, moneda, metodo_pago, banco, numero_referencia,
         numero_factura, numero_recibo, comprobante_url, pagado_por, observaciones, estado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      data.id_expediente, data.id_honorario ?? null, userId,
      data.fecha_pago, data.numero_cuota ?? null,
      data.concepto ?? null, data.monto, data.moneda ?? 'COP',
      data.metodo_pago ?? null, data.banco ?? null, data.numero_referencia ?? null,
      data.numero_factura ?? null, data.numero_recibo ?? null,
      data.comprobante_url ?? null, data.pagado_por ?? null,
      data.observaciones ?? null, data.estado ?? null,
    ]);
    return rows[0];
  });
}

async function updatePago(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'fecha_pago','numero_cuota','concepto','monto','moneda','metodo_pago','banco',
      'numero_referencia','numero_factura','numero_recibo','comprobante_url',
      'pagado_por','observaciones','estado','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findPagoById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE pagos SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

// ── Gastos ────────────────────────────────────────────────────────────────

async function findGastos({ id_expediente, active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const vals = [active];
  const conds = ['g.active = $1'];
  if (id_expediente) { vals.push(id_expediente); conds.push(`g.id_expediente = $${vals.length}`); }
  const { rows } = await db.query(`
    SELECT g.*, u.nombre AS nombre_usuario
    FROM gastos_proceso g
    LEFT JOIN users u ON u.id = g.id_usuario
    WHERE ${conds.join(' AND ')}
    ORDER BY g.fecha_gasto DESC
    LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
  `, [...vals, limit, offset]);
  return rows;
}

async function findGastoById(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM gastos_proceso WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function createGasto(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO gastos_proceso
        (id_expediente, id_usuario, fecha_gasto, categoria_gasto, descripcion,
         monto, moneda, proveedor, nit_proveedor, numero_factura, factura_url,
         reembolsable, reembolsado, fecha_reembolso, pagado_por, observaciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      data.id_expediente, userId,
      data.fecha_gasto, data.categoria_gasto ?? null, data.descripcion ?? null,
      data.monto, data.moneda ?? 'COP',
      data.proveedor ?? null, data.nit_proveedor ?? null, data.numero_factura ?? null,
      data.factura_url ?? null, data.reembolsable ?? false, data.reembolsado ?? false,
      data.fecha_reembolso ?? null, data.pagado_por ?? null, data.observaciones ?? null,
    ]);
    return rows[0];
  });
}

async function updateGasto(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'fecha_gasto','categoria_gasto','descripcion','monto','moneda','proveedor',
      'nit_proveedor','numero_factura','factura_url','reembolsable','reembolsado',
      'fecha_reembolso','pagado_por','observaciones','active',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findGastoById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE gastos_proceso SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDeleteGasto(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE gastos_proceso SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

// Resumen financiero de un expediente
async function getResumen(id_expediente) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT
      COALESCE(SUM(h.monto_total_pactado) FILTER (WHERE h.active), 0) AS total_honorarios,
      COALESCE(SUM(p.monto)               FILTER (WHERE p.active), 0) AS total_pagado,
      COALESCE(SUM(g.monto)               FILTER (WHERE g.active), 0) AS total_gastos
    FROM expediente e
    LEFT JOIN honorarios h ON h.id_expediente = e.id
    LEFT JOIN pagos p      ON p.id_expediente = e.id
    LEFT JOIN gastos_proceso g ON g.id_expediente = e.id
    WHERE e.id = $1
  `, [id_expediente]);
  return rows[0];
}

module.exports = {
  findHonorarios, findHonorarioById, createHonorario, updateHonorario, softDeleteHonorario,
  findPagos, findPagoById, createPago, updatePago,
  findGastos, findGastoById, createGasto, updateGasto, softDeleteGasto,
  getResumen,
};
