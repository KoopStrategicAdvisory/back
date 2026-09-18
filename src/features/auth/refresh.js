'use strict';
const jwt = require('jsonwebtoken');
const { users } = require('../../repositories');
const { signAccessToken, signRefreshToken, refreshCookieOptions } = require('./_helpers');

async function handler(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: 'No hay refresh token.' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ message: 'Refresh token inválido.' });
    }

    if (payload?.type !== 'refresh')
      return res.status(400).json({ message: 'Tipo de token inválido.' });

    const user = await users.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Usuario no encontrado.' });
    if (!user.active) return res.status(403).json({ message: 'Cuenta desactivada.' });

    const roles = Array.isArray(user.roles)
      ? user.roles.map((r) => (typeof r === 'string' ? r : r.nombre))
      : [];

    res.cookie('refreshToken', signRefreshToken(user), refreshCookieOptions());
    return res.status(200).json({
      accessToken: signAccessToken(user),
      user: { id: user.id, nombre: user.nombre, email: user.email, roles, active: user.active },
    });
  } catch (err) { next(err); }
}

module.exports = { method: 'POST', path: '/refresh', middleware: [], handler };
