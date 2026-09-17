'use strict';
const { withUser } = require('../db/client');
const AppError = require('../errors/AppError');
const RAMA = 'Consulta de procesos Rama Judicial';
const PORTALES = [RAMA, 'Publicaciones Procesales Rama Judicial', 'SIUGJ', 'Consultas Fiscalía', 'Consultas Jurisdiccionales SuperFinanciera'];

async function guardarPeriodo(tx, id, modalidad, userId) {
  const { rows } = await tx.query('SELECT * FROM seguimiento_diario WHERE id_radicado_publico = $1 AND hasta IS NULL', [id]);
  if (rows[0]?.modalidad === modalidad) return rows[0];
  await tx.query(`UPDATE seguimiento_diario
    SET hasta = (now() AT TIME ZONE 'America/Bogota')::date, id_usuario_retiro = $2
    WHERE id_radicado_publico = $1 AND hasta IS NULL`, [id, userId]);
  if (modalidad === null) return { retirado: true };
  const result = await tx.query(`INSERT INTO seguimiento_diario
    (id_radicado_publico, modalidad, id_usuario) VALUES ($1, $2, $3) RETURNING *`, [id, modalidad, userId]);
  return result.rows[0];
}

// El radicado se obtiene de la base de datos, nunca de un campo editable del alta.
async function agregar({ id_expediente, organismo, modalidad }, userId) {
  if (!PORTALES.includes(organismo)) throw new AppError(400, 'Selecciona un portal de consulta válido.');
  if (!['manual', 'automatica'].includes(modalidad) || (modalidad === 'automatica' && organismo !== RAMA))
    throw new AppError(400, 'Este portal solo permite revisión manual.');
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`SELECT * FROM expediente WHERE id = $1 AND active FOR UPDATE`, [id_expediente]);
    const exp = rows[0];
    if (!exp) throw new AppError(404, 'Expediente no encontrado.');
    if (!exp.id_cliente) throw new AppError(400, 'El expediente debe tener un cliente asociado.');
    const numero = exp.numero_radicado_despacho?.trim();
    if (!numero) throw new AppError(400, 'Registra el radicado del juzgado/despacho en el expediente antes de agregarlo.');
    const result = await tx.query(`INSERT INTO expediente_radicado_publico (id_expediente, organismo, numero_radicado)
      VALUES ($1, $2, $3) ON CONFLICT (id_expediente, organismo, numero_radicado)
      DO UPDATE SET active = true RETURNING id`, [id_expediente, organismo, numero]);
    return guardarPeriodo(tx, result.rows[0].id, modalidad, userId);
  });
}

async function configurar(id, modalidad, userId) {
  return withUser(userId, async (tx) => {
    // Serializa altas/retiros simultáneos del mismo radicado.
    const { rows: radicados } = await tx.query(`
      SELECT rp.*, e.numero_radicado_despacho FROM expediente_radicado_publico rp
      JOIN expediente e ON e.id = rp.id_expediente
      WHERE rp.id = $1 AND rp.active AND e.active FOR UPDATE OF rp
    `, [id]);
    if (!radicados.length) throw new AppError(404, 'El radicado o su expediente ya no está activo.');
    if (modalidad === 'automatica' && radicados[0].organismo !== RAMA)
      throw new AppError(400, 'La revisión automática solo está disponible para Rama Judicial.');
    if (modalidad !== null) {
      const externo = radicados[0].numero_radicado_despacho?.trim();
      if (!externo) throw new AppError(400, 'El expediente no tiene radicado del juzgado/despacho. Regístralo en el expediente antes de activar la revisión automática.');
      if (radicados[0].numero_radicado.trim() !== externo)
        throw new AppError(400, 'La revisión automática debe usar el radicado del juzgado/despacho registrado en el expediente.');
    }
    return guardarPeriodo(tx, id, modalidad, userId);
  });
}

module.exports = { configurar, agregar };
