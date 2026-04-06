const express = require('express');
const jwt = require('jsonwebtoken');
const PreapprovedEmail = require('../models/PreapprovedEmail');
const User = require('../models/User');
const Client = require('../models/Client');
const Task = require('../models/Task');
const ConsultationLog = require('../models/ConsultationLog');
const mongoose = require('mongoose');
const { hasAdminRole, normalizeRoles, getAllowedRoles } = require('../utils/roles');
const { uploadBuffer, deletePrefix, claimFolder } = require('../services/s3');

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

function requireAdminOrLawyer(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const roles = Array.isArray(payload?.roles) ? payload.roles : [payload?.roles];
    const normalized = roles.map((role) => String(role || '').trim().toLowerCase());
    const allowed = normalized.includes('admin') || normalized.includes('lawyer');
    if (!allowed) {
      return res.status(403).json({ message: 'Se requiere rol admin o abogado' });
    }
    req.user = { ...payload, roles: normalized };
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

function buildDateRange(dateQuery) {
  const date = dateQuery ? new Date(String(dateQuery)) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('Fecha inválida');
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, isoDate: start.toISOString().slice(0, 10) };
}

// Listado de registros de consulta diarios
router.get('/consultas', requireAdminOrLawyer, async (req, res) => {
  try {
    const dateQuery = String(req.query.date || '').trim();
    const { start, end } = buildDateRange(dateQuery);
    const records = await ConsultationLog.find({ createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ items: records.map((doc) => ({
      id: doc._id.toString(),
      processNumber: doc.processNumber,
      result: doc.result,
      observation: doc.observation,
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
    })) });
  } catch (err) {
    console.error('Listado de consultas error:', err?.message || err);
    return res.status(400).json({ message: err?.message || 'Fecha inválida' });
  }
});

// Listado de radicados asignados al usuario logueado
router.get('/consultas/radicados', requireAdminOrLawyer, async (req, res) => {
  try {
    const userId = req.user.sub || req.user.id || '';
    if (!userId) {
      return res.status(400).json({ message: 'Usuario no identificado' });
    }

    const items = await Task.aggregate([
      {
        $match: {
          isActive: true,
          radicado: { $exists: true, $ne: '' },
          assignedTo: new mongoose.Types.ObjectId(userId),
        },
      },
      { $group: { _id: '$radicado', count: { $sum: 1 }, lastUpdated: { $max: '$updatedAt' } } },
      { $sort: { _id: 1 } },
      { $limit: 500 },
    ]);

    res.json({
      items: items.map((item) => ({
        radicado: item._id,
        count: item.count,
        lastUpdated: item.lastUpdated,
      })),
    });
  } catch (err) {
    console.error('Listado de radicados error:', err?.message || err);
    return res.status(500).json({ message: 'Error al listar radicados' });
  }
});

// Crear registro de consulta
router.post('/consultas', requireAdminOrLawyer, async (req, res) => {
  try {
    const { processNumber, result, observation } = req.body || {};
    if (!processNumber || !result) {
      return res.status(400).json({ message: 'Proceso y resultado son requeridos.' });
    }

    const allowedResults = ['Sin movimiento', 'Actuación nueva', 'Término corriendo'];
    const normalizedResult = String(result).trim();
    if (!allowedResults.includes(normalizedResult)) {
      return res.status(400).json({ message: 'Resultado inválido.' });
    }

    const record = await ConsultationLog.create({
      processNumber: String(processNumber).trim(),
      result: normalizedResult,
      observation: String(observation || '').trim(),
      createdBy: {
        id: req.user.sub || req.user.id || '',
        name: req.user.name || req.user.email || 'Desconocido',
        email: req.user.email || '',
      },
    });

    return res.status(201).json({
      item: {
        id: record._id.toString(),
        processNumber: record.processNumber,
        result: record.result,
        observation: record.observation,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
      },
    });
  } catch (err) {
    console.error('Crear consulta error:', err?.message || err);
    return res.status(500).json({ message: 'Error guardando el registro.' });
  }
});

// Generar PDF diario de consultas
router.get('/consultas/pdf', requireAdminOrLawyer, async (req, res) => {
  try {
    const dateQuery = String(req.query.date || '').trim();
    const { start, end, isoDate } = buildDateRange(dateQuery);
    const records = await ConsultationLog.find({ createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: 1 })
      .lean();

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bitacora-diaria-${isoDate}.pdf"`);

    doc.pipe(res);

    doc.fontSize(18).text('Bitácora diaria de revisión de procesos', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Fecha de la bitácora: ${isoDate}`);
    doc.text(`Generado por: ${req.user.name || req.user.email || 'Desconocido'}`);
    doc.text(`Correo: ${req.user.email || 'N/A'}`);
    doc.moveDown(1);

    if (!records.length) {
      doc.text('No hay registros para esta fecha.', { align: 'left' });
      doc.end();
      return;
    }

    records.forEach((record, index) => {
      doc.fontSize(12).fillColor('#111827').text(`${index + 1}. Proceso: ${record.processNumber}`, { continued: false });
      doc.fontSize(11).fillColor('#334155').text(`   Resultado: ${record.result}`);
      doc.text(`   Observación: ${record.observation || 'Sin observación'}`);
      doc.text(`   Registrado por: ${record.createdBy?.name || record.createdBy?.email || 'N/A'}`);
      doc.text(`   Fecha/hora: ${new Date(record.createdAt).toLocaleString('es-CO')}`);
      doc.moveDown(0.5);
      if (index < records.length - 1) {
        doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).strokeColor('#e2e8f0').stroke();
        doc.moveDown(0.5);
      }
    });

    doc.end();
  } catch (err) {
    console.error('Generar PDF de consultas error:', err?.message || err);
    return res.status(500).json({ message: 'Error generando el PDF.' });
  }
});

// Listado de clientes activos (excluye admins) — datos desde Client + User
router.get('/clients/active', requireAdmin, async (_req, res) => {
  const clients = await Client.find()
    .populate({
      path: 'user',
      select: 'name email roles active createdAt',
      match: { active: true, roles: { $nin: ['admin'] } },
    })
    .populate({ path: 'assignedAdmin', select: 'name email roles active' })
    .sort({ createdAt: -1 });
  const items = clients
    .filter((c) => !!c.user)
    .map((c) => ({
      id: c._id.toString(),
      userId: c.user._id.toString(),
      name: c.fullName || c.user.name,
      email: c.email || c.user.email,
      documentNumber: c.documentNumber,
      phone: c.phone,
      assignedAdmin: c.assignedAdmin
        ? { id: c.assignedAdmin._id.toString(), name: c.assignedAdmin.name, email: c.assignedAdmin.email }
        : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  res.json({ items });
});

// Actualizar informacion personal de un cliente (en coleccion Client)
router.patch('/clients/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }
  const { name, documentNumber, phone, email, address, contactInfo, birthDate } = req.body || {};
  const update = {};
  if (typeof name === 'string') update.fullName = name;
  if (typeof documentNumber === 'string') update.documentNumber = documentNumber;
  if (typeof phone === 'string') update.phone = phone;
  if (typeof email === 'string') update.email = email.toLowerCase().trim();
  if (typeof address === 'string') update.address = address;
  if (typeof contactInfo === 'string') update.contactInfo = contactInfo;
  if (typeof birthDate === 'string' || birthDate instanceof Date) {
    const d = birthDate ? new Date(birthDate) : undefined;
    if (!isNaN(d?.getTime?.())) update.birthDate = d;
  }

  try {
    const client = await Client.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .populate({ path: 'user', select: 'name email' })
      .populate({ path: 'assignedAdmin', select: 'name email roles active' });
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
    return res.json({
      client: {
        id: client._id.toString(),
        userId: client.user?._id?.toString(),
        name: client.fullName || client.user?.name,
        email: client.email || client.user?.email,
        documentNumber: client.documentNumber,
        phone: client.phone,
        assignedAdmin: client.assignedAdmin
          ? { id: client.assignedAdmin._id.toString(), name: client.assignedAdmin.name, email: client.assignedAdmin.email }
          : null,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    });
  } catch (err) {
    console.error('Actualizar cliente error:', err?.message || err);
    return res.status(400).json({ message: err?.message || 'No se pudo actualizar el cliente' });
  }
});

// Verificar si existe carpeta S3 para una cédula
router.get('/clients/check-folder/:documentNumber', requireAdmin, async (req, res) => {
  const documentNumber = String(req.params.documentNumber || '').trim();
  if (!documentNumber) {
    return res.status(400).json({ message: 'Número de documento requerido' });
  }

  try {
    const cleaned = documentNumber.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$|^\.+/g, '').slice(0, 64);
    const key = `clientes/${cleaned}/`;
    
    const { listObjects } = require('../services/s3');
    const existingObjects = await listObjects({ prefix: key, maxKeys: 10 });
    
    return res.json({
      documentNumber: cleaned,
      folderPath: key,
      exists: existingObjects.length > 0,
      objectCount: existingObjects.length,
      objects: existingObjects.map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified
      }))
    });
  } catch (e) {
    console.error('Check folder error:', e?.message || e);
    return res.status(500).json({ message: 'Error verificando carpeta' });
  }
});

// Crear cliente (contenedor) a partir de un usuario
router.post('/clients/from-user/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }

  const user = await User.findById(id).select('name email roles');
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

    // Best-effort: create or claim S3 folder clientes/<cedula>/ if cedula is available
    (async () => {
      try {
        const cedulaRaw = client.documentNumber || '';
        const cedula = String(cedulaRaw).trim();
        if (cedula) {
          const cleaned = cedula.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$|^\.+/g, '').slice(0, 64);
          if (cleaned) {
            const key = `clientes/${cleaned}/`;
            
            // Check if folder already exists
            const { listObjects } = require('../services/s3');
            const existingObjects = await listObjects({ prefix: key, maxKeys: 1 });
            
            if (existingObjects.length > 0) {
              // Folder exists - claim it by updating metadata of all files
              console.log('[admin] S3 folder already exists, claiming for client:', key);
              
              const claimResult = await claimFolder({
                prefix: key,
                clientId: client._id.toString(),
                documentNumber: cleaned
              });
              
              console.log(`[admin] S3 folder claimed for client: ${key}, claimed ${claimResult.claimed} objects`);
            } else {
              // Folder doesn't exist - create new one
              await uploadBuffer({
                key,
                body: Buffer.alloc(0),
                contentType: 'application/x-directory',
                metadata: { 
                  'client-id': client._id.toString(), 
                  'client-document': cleaned,
                  'created-at': new Date().toISOString()
                },
              });
              console.log('[admin] S3 folder created for client:', key);
            }
          }
        }
      } catch (e) {
        console.warn('[admin] Could not create/claim S3 folder for client:', e?.message || e);
      }
    })();

    // Ensure the user obtained the client role unless already admin
    try {
      const roles = normalizeRoles(user.roles);
      if (!roles.includes('admin') && !roles.includes('client')) {
        user.roles = normalizeRoles('client', { defaultRole: 'client' });
        await user.save();
      }
    } catch (roleErr) {
      console.warn('[admin] No se pudo actualizar rol del usuario a client:', roleErr?.message || roleErr);
    }

    return res.status(201).json({
      client: {
        id: client._id.toString(),
        user: client.user.toString(),
        fullName: client.fullName,
        documentType: client.documentType,
        documentNumber: client.documentNumber,
        birthDate: client.birthDate,
        phone: client.phone,
        assignedAdmin: null,
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

// Asignar/desasignar admin a un cliente
router.patch('/clients/:id/assign', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  const adminUserId = String(req.body?.adminUserId || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }

  // Permitir desasignar si viene vacío
  let assignedAdmin = null;
  if (adminUserId) {
    if (!mongoose.Types.ObjectId.isValid(adminUserId)) {
      return res.status(400).json({ message: 'adminUserId inválido' });
    }
    const adminUser = await User.findById(adminUserId).select('name email roles active');
    if (!adminUser) return res.status(404).json({ message: 'Admin no encontrado' });
    if (!normalizeRoles(adminUser.roles).includes('admin')) {
      return res.status(400).json({ message: 'El usuario seleccionado no es admin' });
    }
    assignedAdmin = adminUser._id;
  }

  const client = await Client.findByIdAndUpdate(
    id,
    { assignedAdmin },
    { new: true }
  ).populate({ path: 'assignedAdmin', select: 'name email roles active' });

  if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });
  return res.json({
    client: {
      id: client._id.toString(),
      assignedAdmin: client.assignedAdmin
        ? { id: client.assignedAdmin._id.toString(), name: client.assignedAdmin.name, email: client.assignedAdmin.email }
        : null,
    },
  });
});

// Eliminar un cliente (contenedor) y su carpeta S3 clientes/<cedula>/
router.delete('/clients/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ message: 'Identificador requerido' });
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }
  try {
    // Password gate for destructive delete
    const provided = req.headers['x-delete-pass'] || req.body?.pass || req.query?.pass;
    const expected = process.env.ADMIN_DELETE_CLIENT_PASS || 'eliminarclientekoop';
    if (!provided || String(provided) !== String(expected)) {
      return res.status(403).json({ message: 'Contraseña de eliminación inválida' });
    }

    const client = await Client.findById(id).select('documentNumber');
    if (!client) return res.status(404).json({ message: 'Cliente no encontrado' });

    // Try delete S3 folder first (best-effort)
    let s3 = { prefix: null, deleted: 0 };
    const cedula = String(client.documentNumber || '').trim();
    if (cedula) {
      const cleaned = cedula.replace(/[^0-9A-Za-z._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$|^\.+/g, '').slice(0, 64);
      if (cleaned) {
        const prefix = `clientes/${cleaned}/`;
        try {
          s3 = await deletePrefix({ prefix });
        } catch (e) {
          console.warn('[admin] delete clients prefix failed:', prefix, e?.message || e);
        }
      }
    }

    await Client.findByIdAndDelete(id);
    return res.json({ ok: true, id, s3 });
  } catch (err) {
    console.error('Eliminar cliente error:', err?.message || err);
    return res.status(500).json({ message: 'No se pudo eliminar el cliente' });
  }
});

function mapUserResponse(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    roles: normalizeRoles(user.roles),
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function applySingleRoleToUser(user, roleName) {
  const normalizedRole = String(roleName || '').trim().toLowerCase();
  const allowed = getAllowedRoles();
  if (!normalizedRole || !allowed.includes(normalizedRole)) {
    const err = new Error('Rol no permitido');
    err.statusCode = 400;
    throw err;
  }
  user.roles = normalizeRoles(normalizedRole, { defaultRole: normalizedRole });
  await user.save();
  return user;
}

async function setUserRoleHandler(req, res, roleName) {
  if (req.params.id === req.user?.sub) {
    return res.status(400).json({ message: 'No puedes modificar tu propio rol' });
  }
  try {
    const user = await User.findById(req.params.id).select('name email roles active createdAt updatedAt');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    await applySingleRoleToUser(user, roleName);
    return res.json({ user: mapUserResponse(user) });
  } catch (err) {
    if (err?.statusCode === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[admin] set role error:', err?.message || err);
    return res.status(500).json({ message: 'No se pudo actualizar el rol' });
  }
}

// Otorgar rol admin a un usuario
router.post('/users/:id/grant-admin', requireAdmin, async (req, res) => {
  return setUserRoleHandler(req, res, 'admin');
});

// Revocar rol admin a un usuario (lo deja como user)
router.post('/users/:id/revoke-admin', requireAdmin, async (req, res) => {
  return setUserRoleHandler(req, res, 'user');
});

// Asignar un rol arbitrario permitido (admin, lawyer, user, etc.)
router.post('/users/:id/role', requireAdmin, async (req, res) => {
  const requestedRole = String(req.body?.role || '').trim().toLowerCase();
  if (!requestedRole) {
    return res.status(400).json({ message: 'Rol requerido' });
  }
  return setUserRoleHandler(req, res, requestedRole);
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


