const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRoles } = require('../utils/roles');

const router = express.Router();

// Debug: traza todo lo que entra al router de /api/auth
router.use((req, _res, next) => {
  console.log('[AUTH ROUTER]', req.method, req.originalUrl);
  next();
});

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

// Helper to sign tokens
function signAccessToken(user) {
  const payload = {
    sub: user._id.toString(),
    name: user.name,
    roles: normalizeRoles(user.roles),
    email: user.email,
    active: user.active !== false,
  };
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

function signRefreshToken(user) {
  const payload = {
    sub: user._id.toString(),
    type: 'refresh',
  };
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

// Cookie options for refresh token
function getRefreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: weekMs,
    path: '/',
  };
}

function clearRefreshCookie(res) {
  const opts = getRefreshCookieOptions();
  res.clearCookie('refreshToken', {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, roles } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nombre, email y password son requeridos.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    if (password.length < 8) {
      return res.status(400).json({ message: 'La contrasena debe tener al menos 8 caracteres.' });
    }

    const existing = await User.findOne({ email: normalizedEmail }).lean();
    if (existing) {
      return res.status(409).json({ message: 'El email ya esta registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, ROUNDS);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      roles: Array.isArray(roles) && roles.length ? normalizeRoles(roles) : undefined,
      active: false,
    });

    console.log('[AUTH] register REAL hit:', req.body?.email);
    res.set('X-Handler', 'register-real');
    return res.status(201).json({
      source: 'register-real',
      message: 'Registro recibido. Un administrador debe activar tu cuenta.',
      pendingActivation: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: normalizeRoles(user.roles),
        active: user.active !== false,
      },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ message: 'El email ya esta registrado.' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('[AUTH] login hit:', req.body?.email);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email y password son requeridos.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales invalidas.' });
    }

    if ((user.active === false || user.isActive === false)) {
      return res.status(403).json({ message: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    return res.status(200).json({
      message: 'Login correcto.',
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: normalizeRoles(user.roles),
        active: user.active !== false,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (_req, res) => {
  try {
    clearRefreshCookie(res);
    return res.status(200).json({ message: 'Logout correcto.' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ message: 'Error en el servidor.' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: 'No hay refresh token.' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Refresh token invalido.' });
    }
    if (payload?.type !== 'refresh') {
      return res.status(400).json({ message: 'Tipo de token invalido.' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'Usuario no encontrado.' });
    }
    if ((user.active === false || user.isActive === false)) {
      return res.status(403).json({ message: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    res.set('X-Handler', 'refresh');
    return res.status(200).json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        roles: normalizeRoles(user.roles),
        active: user.active !== false,
      },
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ message: 'Error en el servidor.' });
  }
});

module.exports = router;
