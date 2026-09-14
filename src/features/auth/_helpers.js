'use strict';
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_EXPIRES_IN  = process.env.ACCESS_TOKEN_EXPIRES_IN  || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

function signAccessToken(user) {
  const roles = Array.isArray(user.roles)
    ? user.roles.map((r) => (typeof r === 'string' ? r : r.nombre))
    : [];
  return jwt.sign(
    {
      sub: String(user.id), name: user.nombre, email: user.email, roles, active: user.active !== false,
      // id_cliente: si esta cuenta esta vinculada a un cliente (auto-claim al
      // registrarse), el middleware de alcance la usa para que un usuario con
      // solo el rol 'cliente' unicamente vea su propio expediente.
      id_cliente: user.id_cliente ?? null,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user.id), type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function clearRefreshCookie(res) {
  const { httpOnly, secure, sameSite, path } = refreshCookieOptions();
  res.clearCookie('refreshToken', { httpOnly, secure, sameSite, path });
}

module.exports = { signAccessToken, signRefreshToken, refreshCookieOptions, clearRefreshCookie };
