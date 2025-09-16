const express = require('express');
const jwt = require('jsonwebtoken');
const PreapprovedEmail = require('../models/PreapprovedEmail');
const User = require('../models/User');
const mongoose = require('mongoose');

const router = express.Router();

function hasAdminRole(payload) {
  if (!payload?.roles) return false;
  return (Array.isArray(payload.roles) ? payload.roles : [payload.roles])
    .map((r) => String(r || '').toLowerCase())
    .includes('admin');
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!hasAdminRole(payload)) {
      return res.status(403).json({ message: 'Se requiere rol ADMIN' });
    }
    req.user = payload;
    next();
  } catch (_e) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
}

// Crear/actualizar preaprobacion
router.post('/preapprovals', requireAdmin, async (req, res) => {
  const { email, roles = ['USER'], daysValid = 30, invitedBy, notes } = req.body || {};
  if (!email) return res.status(400).json({ message: 'email requerido' });
  const normalizedEmail = String(email).toLowerCase().trim();
  const expiresAt = daysValid ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000) : undefined;
  const doc = await PreapprovedEmail.findOneAndUpdate(
    { email: normalizedEmail },
    { email: normalizedEmail, roles, expiresAt, used: false, invitedBy, notes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.status(201).json({
    ok: true,
    preapproval: { email: doc.email, roles: doc.roles, expiresAt: doc.expiresAt, used: doc.used },
  });
});

// Listado de preapprovals
router.get('/preapprovals', requireAdmin, async (_req, res) => {
  const items = await PreapprovedEmail.find().select('email roles expiresAt used createdAt');
  res.json({ items });
});

// Listado de usuarios
router.get('/users', requireAdmin, async (_req, res) => {
  const users = await User.find()
    .select('name email roles active createdAt updatedAt')
    .sort({ createdAt: -1 });
  const items = users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    roles: u.roles,
    active: u.active !== false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json({ items });
});

// Otorgar rol ADMIN a un usuario
router.post('/users/:id/grant-admin', requireAdmin, async (req, res) => {
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ message: 'No puedes modificar tu propio rol' });
  }
  const user = await User.findById(req.params.id).select('name email roles active createdAt updatedAt');
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  const rolesSet = new Set((Array.isArray(user.roles) ? user.roles : []).map((r) => String(r || '').toUpperCase()));
  rolesSet.add('ADMIN');
  user.roles = Array.from(rolesSet);
  await user.save();
  return res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      roles: user.roles,
      active: user.active !== false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// Eliminar un usuario
router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ message: 'Identificador requerido' });
  }
  if (id === req.user?.sub) {
    return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  try {
    const user = await User.findByIdAndDelete(id).select('name email roles active createdAt updatedAt');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    return res.json({
      ok: true,
      id,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        roles: user.roles,
        active: user.active !== false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error('Eliminar usuario error:', err?.message || err);
    return res.status(500).json({ message: 'No se pudo eliminar el usuario' });
  }
});

// Activar/desactivar usuario
router.patch('/users/:id/active', requireAdmin, async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'Campo active requerido' });
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { active },
    { new: true, runValidators: true }
  ).select('name email roles active createdAt updatedAt');
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      roles: user.roles,
      active: user.active !== false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

module.exports = router;
