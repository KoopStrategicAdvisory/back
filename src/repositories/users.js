'use strict';
const { getDb, withUser } = require('../db/client');

async function findAll({ active = true, limit = 50, offset = 0 } = {}) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT u.*, COALESCE(
      json_agg(json_build_object('id', r.id, 'nombre', r.nombre)) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) AS roles
    FROM users u
    LEFT JOIN user_rol ur ON ur.id_usuario = u.id
    LEFT JOIN roles r     ON r.id = ur.id_rol
    WHERE u.active = $1
    GROUP BY u.id
    ORDER BY u.nombre
    LIMIT $2 OFFSET $3
  `, [active, limit, offset]);
  return rows;
}

async function findById(id) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT u.*, COALESCE(
      json_agg(json_build_object('id', r.id, 'nombre', r.nombre)) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) AS roles
    FROM users u
    LEFT JOIN user_rol ur ON ur.id_usuario = u.id
    LEFT JOIN roles r     ON r.id = ur.id_rol
    WHERE u.id = $1
    GROUP BY u.id
  `, [id]);
  return rows[0] ?? null;
}

async function findByEmail(email) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT u.*, COALESCE(
      json_agg(json_build_object('id', r.id, 'nombre', r.nombre)) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) AS roles
    FROM users u
    LEFT JOIN user_rol ur ON ur.id_usuario = u.id
    LEFT JOIN roles r     ON r.id = ur.id_rol
    WHERE u.email = $1
    GROUP BY u.id
  `, [email.toLowerCase().trim()]);
  return rows[0] ?? null;
}

async function create(data, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      INSERT INTO users
        (nombre, email, password_hash, active,
         tipo_documento, numero_documento, telefono_principal, telefono_alterno,
         direccion_notificacion, ciudad, departamento, pais,
         tarjeta_profesional, numero_tarjeta_prof, fecha_expedicion_tp,
         especialidades, cargo, id_supervisor,
         tarifa_hora, moneda_tarifa, zona_horaria, idioma_preferido)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *
    `, [
      data.nombre, data.email?.toLowerCase(), data.password_hash, data.active ?? false,
      data.tipo_documento ?? null, data.numero_documento ?? null,
      data.telefono_principal ?? null, data.telefono_alterno ?? null,
      data.direccion_notificacion ?? null, data.ciudad ?? null,
      data.departamento ?? null, data.pais ?? null,
      data.tarjeta_profesional ?? null, data.numero_tarjeta_prof ?? null,
      data.fecha_expedicion_tp ?? null, data.especialidades ?? null,
      data.cargo ?? null, data.id_supervisor ?? null,
      data.tarifa_hora ?? null, data.moneda_tarifa ?? 'COP',
      data.zona_horaria ?? null, data.idioma_preferido ?? null,
    ]);
    return rows[0];
  });
}

async function update(id, data, userId) {
  return withUser(userId, async (tx) => {
    const allowed = [
      'nombre','tipo_documento','numero_documento','telefono_principal','telefono_alterno',
      'direccion_notificacion','ciudad','departamento','pais','tarjeta_profesional',
      'numero_tarjeta_prof','fecha_expedicion_tp','especialidades','cargo','id_supervisor',
      'fecha_ingreso','fecha_retiro','tarifa_hora','moneda_tarifa','firma_digital_url',
      'foto_url','zona_horaria','idioma_preferido','active','must_change_password',
    ];
    const entries = Object.entries(data).filter(([k]) => allowed.includes(k));
    if (!entries.length) return findById(id);
    const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
    const vals = entries.map(([, v]) => v);
    const { rows } = await tx.query(
      `UPDATE users SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING *`,
      [...vals, id]
    );
    return rows[0] ?? null;
  });
}

async function softDelete(id, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `UPDATE users SET active = FALSE, updated_at = now() WHERE id = $1 RETURNING id`, [id]
    );
    return rows[0] ?? null;
  });
}

async function updateLastLogin(id) {
  const db = await getDb();
  await db.query(
    `UPDATE users SET last_login = now(), failed_login_attempts = 0 WHERE id = $1`, [id]
  );
}

async function incrementFailedAttempts(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `UPDATE users SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1 RETURNING failed_login_attempts`, [id]
  );
  return rows[0]?.failed_login_attempts ?? 0;
}

async function lockUntil(id, until) {
  const db = await getDb();
  await db.query(
    `UPDATE users SET locked_until = $1 WHERE id = $2`, [until, id]
  );
}

async function resetFailedAttempts(id) {
  const db = await getDb();
  await db.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [id]
  );
}

async function setPasswordReset(id, token, expires) {
  const db = await getDb();
  await db.query(
    `UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3`,
    [token, expires, id]
  );
}

async function updatePassword(id, passwordHash, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(`
      UPDATE users SET
        password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL,
        must_change_password = FALSE, updated_at = now()
      WHERE id = $2 RETURNING id
    `, [passwordHash, id]);
    return rows[0] ?? null;
  });
}

async function setEmailVerified(id) {
  const db = await getDb();
  await db.query(
    `UPDATE users SET
       email_verification_token = NULL, email_verification_expires = NULL, active = TRUE
     WHERE id = $1`,
    [id]
  );
}

// user_rol
async function addRole(idUsuario, idRol, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO user_rol (id_usuario, id_rol) VALUES ($1, $2)
       ON CONFLICT (id_usuario, id_rol) DO NOTHING RETURNING *`,
      [idUsuario, idRol]
    );
    return rows[0] ?? null;
  });
}

async function removeRole(idUsuario, idRol, userId) {
  return withUser(userId, async (tx) => {
    const { rows } = await tx.query(
      `DELETE FROM user_rol WHERE id_usuario = $1 AND id_rol = $2 RETURNING *`,
      [idUsuario, idRol]
    );
    return rows[0] ?? null;
  });
}

async function getRoles(idUsuario) {
  const db = await getDb();
  const { rows } = await db.query(`
    SELECT r.* FROM roles r
    JOIN user_rol ur ON ur.id_rol = r.id
    WHERE ur.id_usuario = $1 AND r.active = TRUE
    ORDER BY r.nombre
  `, [idUsuario]);
  return rows;
}

module.exports = {
  findAll, findById, findByEmail, create, update, softDelete,
  updateLastLogin, incrementFailedAttempts, lockUntil, resetFailedAttempts,
  setPasswordReset, updatePassword, setEmailVerified,
  addRole, removeRole, getRoles,
};
