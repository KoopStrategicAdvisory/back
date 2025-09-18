const express = require('express');
const jwt = require('jsonwebtoken');
const PreapprovedEmail = require('../models/PreapprovedEmail');
const User = require('../models/User');
const Client = require('../models/Client');
const mongoose = require('mongoose');
const { hasAdminRole, normalizeRoles } = require('../utils/roles');

const router = express.Router();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!hasAdminRole(payload.roles)) {
      return res.status(403).json({ message: 'Se requiere rol admin' });
    }
    req.user = { ...payload, roles: normalizeRoles(payload.roles) };
    next();
  } catch (_e) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
}

// Crear/actualizar preaprobacion
router.post('/preapprovals', requireAdmin, async (req, res) => {
  const { email, roles, daysValid = 30, invitedBy, notes } = req.body || {};
  if (!email) return res.status(400).json({ message: 'email requerido' });
  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedRoles = normalizeRoles(roles);
  const expiresAt = daysValid ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000) : undefined;
  const doc = await PreapprovedEmail.findOneAndUpdate(
    { email: normalizedEmail },
    { email: normalizedEmail, roles: normalizedRoles, expiresAt, used: false, invitedBy, notes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.status(201).json({
    ok: true,
    preapproval: { email: doc.email, roles: normalizeRoles(doc.roles), expiresAt: doc.expiresAt, used: doc.used },
  });
});

// Listado de preapprovals
router.get('/preapprovals', requireAdmin, async (_req, res) => {
  const items = await PreapprovedEmail.find().select('email roles expiresAt used createdAt');
  res.json({
    items: items.map((doc) => ({
      email: doc.email,
      roles: normalizeRoles(doc.roles),
      expiresAt: doc.expiresAt,
      used: doc.used,
      createdAt: doc.createdAt,
    })),
  });
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
    roles: normalizeRoles(u.roles),
    active: u.active !== false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json({ items });
});

// Listado de clientes activos (excluye admins)
router.get('/clients/active', requireAdmin, async (_req, res) => {
  const users = await User.find({ active: true, roles: { $nin: ['admin'] } })
    .select('name email documentNumber phone roles active createdAt updatedAt')
    .sort({ createdAt: -1 });
  const items = users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    documentNumber: u.documentNumber,
    phone: u.phone,
    roles: normalizeRoles(u.roles),
    active: u.active !== false,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));
  res.json({ items });
});

// Actualizar informacion personal de un cliente
router.patch('/clients/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  const { name, email, documentNumber, phone, active } = req.body || {};
  const update = {};
  if (typeof name === 'string') update.name = name;
  if (typeof email === 'string') update.email = email.toLowerCase().trim();
  if (typeof documentNumber === 'string') update.documentNumber = documentNumber;
  if (typeof phone === 'string') update.phone = phone;
  if (typeof active === 'boolean') update.active = active; // opcional

  try {
    const user = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .select('name email documentNumber phone roles active createdAt updatedAt');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        documentNumber: user.documentNumber,
        phone: user.phone,
        roles: normalizeRoles(user.roles),
        active: user.active !== false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error('Actualizar cliente error:', err?.message || err);
    // error de email duplicado, validaciones, etc.
    return res.status(400).json({ message: err?.message || 'No se pudo actualizar el cliente' });
  }
});

// Crear cliente (contenedor) a partir de un usuario
router.post('/clients/from-user/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const user = await User.findById(id).select('name email');
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

  const exists = await Client.findOne({ user: id }).select('_id');
  if (exists) return res.status(409).json({ message: 'El usuario ya tiene contenedor de cliente' });

  const {
    fullName,
    documentType,
    documentNumber,
    birthDate,
    phone,
    email,
    address,
    contactInfo,
  } = req.body || {};

  try {
    const client = await Client.create({
      user: id,
      fullName: String(fullName || user.name || '').trim(),
      documentType: documentType ? String(documentType).trim() : undefined,
      documentNumber: documentNumber ? String(documentNumber).trim() : undefined,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      phone: phone ? String(phone).trim() : undefined,
      email: String(email || user.email || '').trim().toLowerCase(),
      address: address ? String(address).trim() : undefined,
      contactInfo: contactInfo ? String(contactInfo).trim() : undefined,
    });

    return res.status(201).json({
      client: {
        id: client._id.toString(),
        user: client.user.toString(),
        fullName: client.fullName,
        documentType: client.documentType,
        documentNumber: client.documentNumber,
        birthDate: client.birthDate,
        phone: client.phone,
        email: client.email,
        address: client.address,
        contactInfo: client.contactInfo,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    });
  } catch (err) {
    console.error('Crear cliente error:', err?.message || err);
    return res.status(400).json({ message: err?.message || 'No se pudo crear el cliente' });
  }
});

// Otorgar rol admin a un usuario
router.post('/users/:id/grant-admin', requireAdmin, async (req, res) => {
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ message: 'No puedes modificar tu propio rol' });
  }
  const user = await User.findById(req.params.id).select('name email roles active createdAt updatedAt');
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  user.roles = normalizeRoles('admin', { defaultRole: 'admin' });
  await user.save();
  return res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      roles: normalizeRoles(user.roles),
      active: user.active !== false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// Revocar rol admin a un usuario
router.post('/users/:id/revoke-admin', requireAdmin, async (req, res) => {
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ message: 'No puedes modificar tu propio rol' });
  }
  const user = await User.findById(req.params.id).select('name email roles active createdAt updatedAt');
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  user.roles = normalizeRoles('user', { defaultRole: 'user' });
  await user.save();
  return res.json({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      roles: normalizeRoles(user.roles),
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
        roles: normalizeRoles(user.roles),
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
      roles: normalizeRoles(user.roles),
      active: user.active !== false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

module.exports = router;





