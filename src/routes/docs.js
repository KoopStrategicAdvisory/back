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

// Allow multiple roots by env. Default now includes a client-specific root "clientes".
const allowedFolders = (process.env.DOCS_ALLOWED_SUBFOLDERS || 'documentos_iniciales,clientes')
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

function sanitizeSegment(seg) {
  return String(seg || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|^\.+/g, '')
    .slice(1, 64); // keep it short
}

// Accept either an exact allowed root (e.g., "documentos_iniciales")
// or a nested path starting with an allowed root (e.g., "clientes/123456").
function resolveFolder(input) {
  const raw = String(input || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return DEFAULT_FOLDER;
  // exact match
  const exact = allowedFolders.find((f) => f.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  // hierarchical: root + optional segments
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0) return DEFAULT_FOLDER;
  const root = parts.shift();
  const rootMatch = allowedFolders.find((f) => f.toLowerCase() === root.toLowerCase());
  if (!rootMatch) return null;
  if (parts.length === 0) return rootMatch;
  const sanitizedRest = parts.map(sanitizeSegment).filter(Boolean).join('/');
  if (!sanitizedRest) return rootMatch;
  return `${rootMatch}/${sanitizedRest}`;
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

// Create an empty "folder" marker in S3 (zero-byte object with trailing slash)
router.post('/folder', requireAuth, async (req, res) => {
  try {console.log("si entro")
    const userId = ensureUser(req, res);
    if (!userId) return;
    const requestedFolder = req.body?.subfolder;
    const folder = resolveFolder(requestedFolder);
    if (!folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }
    // Ensure trailing slash to create a folder-like key
    const prefix = buildUserPrefix(userId, folder);
    await uploadBuffer({
      key: prefix,
      body: Buffer.alloc(0),
      contentType: 'application/x-directory',
      metadata: { 'user-id': userId, folder },
    });
    return res.status(201).json({ folder, key: prefix, created: true });
  } catch (err) {
    console.error('[docs] create folder error', err);
    return res.status(500).json({ message: 'Error al crear carpeta' });
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

// Diagnóstico rápido de S3 y configuración de documentos
router.get('/diag', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    const requestedFolder = req.query.subfolder;
    const folder = requestedFolder ? resolveFolder(requestedFolder) : null;
    if (requestedFolder && !folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }
    const prefix = folder ? buildUserPrefix(userId, folder) : buildUserPrefix(userId);

    let listOk = false;
    let itemCount = 0;
    let listError = null;
    try {
      const items = await listObjects({ prefix, maxKeys: 1 });
      listOk = true;
      itemCount = (items || []).length;
    } catch (e) {
      listError = e?.message || String(e);
    }

    // Optional write test: ?write=1
    const doWrite = String(req.query.write || '').toLowerCase() === '1' || String(req.query.write || '').toLowerCase() === 'true';
    let writeOk = false;
    let signedUrl = null;
    let deleteOk = false;
    let writeError = null;
    if (doWrite) {
      const testKey = `${prefix}diag_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
      try {
        await uploadBuffer({
          key: testKey,
          body: Buffer.from(`diag ok ${new Date().toISOString()}`),
          contentType: 'text/plain',
          metadata: { 'user-id': userId, folder: folder || '' },
        });
        writeOk = true;
        try {
          signedUrl = await getSignedDownloadUrl({ key: testKey, expiresIn: 120 });
        } catch (e) {
          writeError = `SignedURL error: ${e?.message || e}`;
        }
      } catch (e) {
        writeError = e?.message || String(e);
      } finally {
        try {
          await deleteObject({ key: testKey });
          deleteOk = true;
        } catch (_) {}
      }
    }

    return res.json({
      ok: true,
      env: {
        AWS_REGION: !!process.env.AWS_REGION,
        S3_BUCKET_NAME: !!process.env.S3_BUCKET_NAME,
        S3_BASE_PREFIX: process.env.S3_BASE_PREFIX || 'koop',
        DOCS_ALLOWED_SUBFOLDERS: allowedFolders,
        DEFAULT_FOLDER,
      },
      test: { prefix, listOk, itemCount, listError },
      testWrite: doWrite ? { writeOk, signedUrl, deleteOk, writeError } : undefined,
    });
  } catch (err) {
    return res.status(500).json({ message: err?.message || 'Diag error' });
  }
});

// Quick connectivity check to the bucket using the current user prefix
router.get('/health', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    // Try list on base prefix for this user (no folder required)
    const prefix = buildUserPrefix(userId);
    await listObjects({ prefix, maxKeys: 1 });
    return res.json({ connected: true, prefix });
  } catch (err) {
    console.error('[docs] health error', err);
    return res.status(500).json({ connected: false, message: err?.message || 'S3 error' });
  }
});

module.exports = router;
