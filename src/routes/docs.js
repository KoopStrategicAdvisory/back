const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const {
  uploadBuffer,
  listObjects,
  getSignedDownloadUrl,
  deleteObject,
  buildUserKey,
  buildUserPrefix,
} = require('../services/s3');

const router = express.Router();

const allowedFolders = (process.env.DOCS_ALLOWED_SUBFOLDERS || 'documentos_iniciales')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean);

const DEFAULT_FOLDER = allowedFolders[0] || 'documentos_iniciales';
const MAX_FILE_MB = Number(process.env.DOCS_MAX_FILE_MB || 25);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = payload;
    next();
  } catch (_e) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
}

function slugName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|^\.+/g, '')
    .slice(0, 120);
}

function resolveFolder(input) {
  const needle = String(input || '').trim();
  if (!needle) return DEFAULT_FOLDER;
  const match = allowedFolders.find((f) => f.toLowerCase() === needle.toLowerCase());
  if (!match) return null;
  return match;
}

function ensureUser(req, res) {
  const userId = req.user?.sub || req.user?.id;
  if (!userId) {
    res.status(400).json({ message: 'Usuario no identificado en el token' });
    return null;
  }
  return String(userId);
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    if (!req.file) {
      return res.status(400).json({ message: 'Archivo requerido' });
    }
    const requestedFolder = req.body?.subfolder || DEFAULT_FOLDER;
    const folder = resolveFolder(requestedFolder);
    if (!folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }

    const safeName = slugName(req.file.originalname) || 'archivo';
    const key = buildUserKey(userId, `${folder}/${Date.now()}_${safeName}`);
    await uploadBuffer({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype || 'application/octet-stream',
      metadata: { 'user-id': userId, folder },
    });

    let downloadURL = null;
    try {
      downloadURL = await getSignedDownloadUrl({ key, expiresIn: 600 });
    } catch (err) {
      console.warn('[docs] No se pudo generar URL firmada inmediatamente:', err?.message || err);
    }

    return res.status(201).json({
      file: {
        key,
        name: safeName,
        folder,
        size: req.file.size,
        contentType: req.file.mimetype,
        downloadURL,
      },
    });
  } catch (err) {
    console.error('[docs] upload error', err);
    return res.status(500).json({ message: 'Error al subir archivo' });
  }
});

router.get('/recent', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const requestedFolder = req.query.subfolder;
    const folder = requestedFolder ? resolveFolder(requestedFolder) : null;
    if (requestedFolder && !folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }

    const prefix = folder
      ? buildUserPrefix(userId, folder)
      : buildUserPrefix(userId);

    const objects = await listObjects({ prefix, maxKeys: Math.max(limit * 5, limit) });
    const items = (objects || [])
      .map((obj) => ({
        key: obj.Key,
        name: obj.Key?.split('/')?.pop() || obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
      }))
      .sort((a, b) => {
        const aTime = a.lastModified ? Date.parse(a.lastModified) : 0;
        const bTime = b.lastModified ? Date.parse(b.lastModified) : 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    return res.json({ items, folder: folder || null });
  } catch (err) {
    console.error('[docs] recent error', err);
    return res.status(500).json({ message: 'Error al listar documentos' });
  }
});

router.get('/download-url', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    const { key, expires = 600 } = req.query;
    if (!key) {
      return res.status(400).json({ message: 'Key requerida' });
    }
    const normalizedKey = String(key);
    const expectedPrefix = buildUserPrefix(userId);
    if (!normalizedKey.startsWith(expectedPrefix)) {
      return res.status(403).json({ message: 'No tienes acceso a este recurso' });
    }

    const url = await getSignedDownloadUrl({ key: normalizedKey, expiresIn: Number(expires) || 600 });
    return res.json({ url, key: normalizedKey, expiresIn: Number(expires) || 600 });
  } catch (err) {
    console.error('[docs] download-url error', err);
    return res.status(500).json({ message: 'No se pudo generar URL firmada' });
  }
});

router.delete('/object', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    const key = req.body?.key || req.query?.key;
    if (!key) {
      return res.status(400).json({ message: 'Key requerida' });
    }
    const normalizedKey = String(key);
    const expectedPrefix = buildUserPrefix(userId);
    if (!normalizedKey.startsWith(expectedPrefix)) {
      return res.status(403).json({ message: 'No tienes acceso a este recurso' });
    }

    await deleteObject({ key: normalizedKey });
    return res.status(204).send();
  } catch (err) {
    console.error('[docs] delete error', err);
    return res.status(500).json({ message: 'Error al eliminar archivo' });
  }
});

module.exports = router;
