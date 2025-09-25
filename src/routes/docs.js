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
const Client = require('../models/Client');
const ClientDocument = require('../models/ClientDocument');
const { normalizeRoles } = require('../utils/roles');

const router = express.Router();
// Quick visibility when this router is initialized
try {
  console.log('[docs] AWS_REGION =', process.env.AWS_REGION || '(undefined)');
} catch (_) {}

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
  fileFilter: (req, file, cb) => {
    // TEMPORAL: No aplicar corrección automática en multer
    console.log('[docs] Multer - originalname:', file.originalname);
    console.log('[docs] Multer - originalname (hex):', Buffer.from(file.originalname || '', 'utf8').toString('hex'));
    console.log('[docs] Multer - originalname (latin1 hex):', Buffer.from(file.originalname || '', 'latin1').toString('hex'));
    cb(null, true);
  }
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
  } catch (e) {
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
    .replace(/[^a-zA-Z0-9._\s-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|^\.+/g, '')
    .slice(0, 64); // keep it short
}

function sanitizeFolderName(seg) {
  return String(seg || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\s-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|^\.+/g, '')
    .slice(0, 64); // keep it short, but preserve spaces
}

function isClientesFolder(folder) {
  if (!folder) return false;
  const raw = String(folder).trim();
  return raw.toLowerCase().startsWith('clientes');
}

function ensureTrailingSlash(prefix) {
  const p = String(prefix || '').replace(/^\/+|\/+$/g, '');
  return p ? `${p}/` : '';
}

async function getUserClientDocNumber(userId) {
  if (!userId) return null;
  try {
    const client = await Client.findOne({ user: userId }).select('documentNumber').lean();
    const doc = String(client?.documentNumber || '').trim();
    return doc || null;
  } catch (_e) {
    return null;
  }
}

async function clientesPrefixForRequest(req, folder /* sanitized from resolveFolder */) {
  // folder can be: 'clientes' or 'clientes/<doc>' or 'clientes/<doc>/<subfolder>'
  const parts = String(folder || '').split('/').filter(Boolean);
  const roles = normalizeRoles(req.user?.roles);
  const isAdmin = roles.includes('admin');

  if (parts.length === 1) {
    if (isAdmin) {
      const err = new Error('Debe especificar clientes/<cedula>');
      err.status = 400;
      throw err;
    }
    const doc = await getUserClientDocNumber(req.user?.sub || req.user?.id);
    if (!doc) {
      const err = new Error('No se encontró cédula asociada al usuario');
      err.status = 404;
      throw err;
    }
    return ensureTrailingSlash(`clientes/${sanitizeSegment(doc)}`);
  }
  const cedula = parts[1] ? sanitizeSegment(parts[1]) : '';
  if (!cedula) {
    const err = new Error('Cédula inválida en la ruta de cliente');
    err.status = 400;
    throw err;
  }
  
  // Si hay más partes después de la cédula, incluirlas en la ruta
  if (parts.length > 2) {
    const subfolders = parts.slice(2).map(sanitizeFolderName).filter(Boolean).join('/');
    return ensureTrailingSlash(`clientes/${cedula}/${subfolders}`);
  }
  
  return ensureTrailingSlash(`clientes/${cedula}`);
}

async function assertCanAccessClientes(req, prefix) {
  const parts = String(prefix).split('/').filter(Boolean);
  const doc = parts[1] || '';
  const roles = normalizeRoles(req.user?.roles);
  const isAdmin = roles.includes('admin');
  if (isAdmin) return true;
  const ownDoc = await getUserClientDocNumber(req.user?.sub || req.user?.id);
  if (ownDoc && sanitizeSegment(ownDoc) === doc) return true;
  const err = new Error('No tienes acceso a esta carpeta');
  err.status = 403;
  throw err;
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
  const sanitizedRest = parts.map(sanitizeFolderName).filter(Boolean).join('/');
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
    console.log('[docs] Upload request received');
    console.log('[docs] ===== INICIO DEBUG UPLOAD =====');
    const userId = ensureUser(req, res);
    if (!userId) return;
    console.log('[docs] User ID:', userId);
    if (!req.file) {
      return res.status(400).json({ message: 'Archivo requerido' });
    }
    const requestedFolder = req.body?.subfolder || DEFAULT_FOLDER;
    const folder = resolveFolder(requestedFolder);
    if (!folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }

    console.log('[docs] req.body completo:', req.body);
    console.log('[docs] req.body.useExactName:', req.body?.useExactName);
    console.log('[docs] req.body.subfolder:', req.body?.subfolder);
    console.log('[docs] req.body.subfolder (hex):', Buffer.from(req.body?.subfolder || '', 'utf8').toString('hex'));
    console.log('[docs] req.body.subfolder (latin1 hex):', Buffer.from(req.body?.subfolder || '', 'latin1').toString('hex'));
    const useExactName = req.body?.useExactName === 'true';
    console.log('[docs] useExactName:', useExactName, 'originalname:', req.file.originalname);
    console.log('[docs] originalname (hex):', Buffer.from(req.file.originalname || '', 'utf8').toString('hex'));
    console.log('[docs] originalname (latin1 hex):', Buffer.from(req.file.originalname || '', 'latin1').toString('hex'));
    
    // LOGS ADICIONALES PARA DEBUG
    console.log('[docs] ===== DEBUGGING FILE NAME =====');
    console.log('[docs] req.file.originalname RAW:', JSON.stringify(req.file.originalname));
    console.log('[docs] req.file.originalname LENGTH:', req.file.originalname?.length);
    console.log('[docs] req.file.originalname BYTES:', Array.from(req.file.originalname || '').map(c => c.charCodeAt(0)));
    console.log('[docs] ===== END DEBUGGING =====');
    
    // TEMPORAL: Forzar useExactName para pruebas
    const forceExactName = true;
    console.log('[docs] FORZANDO useExactName a true para pruebas');
    
    // Función de corrección agresiva para nombres de archivo
    const aggressiveUTF8Fix = (str) => {
      if (!str) return str;
      return str
        .replace(/TrÃ¡mite/g, 'Trámite')
        .replace(/TÃºtela/g, 'Tútela')
        .replace(/trÃ¡mite/g, 'trámite')
        .replace(/tÃºtela/g, 'tútela')
        .replace(/ConstituciÃ³n/g, 'Constitución')
        .replace(/PolÃ­tica/g, 'Política')
        .replace(/constituciÃ³n/g, 'constitución')
        .replace(/polÃ­tica/g, 'política')
        .replace(/Ã¡/g, 'á')
        .replace(/Ã©/g, 'é')
        .replace(/Ã­/g, 'í')
        .replace(/Ã³/g, 'ó')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã/g, 'Á')
        .replace(/Ã‰/g, 'É')
        .replace(/Ã/g, 'Í')
        .replace(/Ã"/g, 'Ó')
        .replace(/Ãš/g, 'Ú')
        .replace(/Ã'/g, 'Ñ')
        .replace(/Ã¼/g, 'ü')
        .replace(/Ãœ/g, 'Ü')
        .replace(/Ã‡/g, 'Ç')
        .replace(/Ã§/g, 'ç');
    };
    
    const originalName = req.file.originalname || 'archivo';
    const correctedName = aggressiveUTF8Fix(originalName);
    if (correctedName !== originalName) {
      console.log('[docs] BACKEND FILE NAME FIX - Original:', originalName, 'Corrected:', correctedName);
    }
    
    const safeName = forceExactName ? correctedName : (slugName(correctedName) || 'archivo');
    console.log('[docs] safeName final:', safeName);
    let key;
    if (isClientesFolder(folder)) {
      const prefix = await clientesPrefixForRequest(req, folder);
      await assertCanAccessClientes(req, prefix);
      key = forceExactName ? `${prefix}${safeName}` : `${prefix}${Date.now()}_${safeName}`;
    } else {
      key = forceExactName ? buildUserKey(userId, `${folder}/${safeName}`) : buildUserKey(userId, `${folder}/${Date.now()}_${safeName}`);
    }
    console.log('[docs] key final:', key);
    await uploadBuffer({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype || 'application/octet-stream',
      metadata: { 'user-id': userId, folder },
    });

    // Registrar el documento en la base de datos si es una carpeta de cliente
    let documentRecord = null;
    if (isClientesFolder(folder)) {
      try {
        // Extraer el número de documento del cliente de la ruta
        const parts = folder.split('/');
        const documentNumber = parts[1]; // clientes/1032465160 -> 1032465160
        
        // Buscar el cliente por número de documento
        const client = await Client.findOne({ documentNumber }).select('_id documentNumber').lean();
        
        if (client) {
          documentRecord = await ClientDocument.create({
            client: client._id,
            documentNumber: client.documentNumber,
            fileName: safeName,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype || 'application/octet-stream',
            s3Key: key,
            folder: folder,
            uploadedBy: userId,
            metadata: {
              uploadIP: req.ip,
              userAgent: req.get('User-Agent')
            }
          });
        }
      } catch (dbError) {
        console.error('[docs] Error al registrar documento en BD:', dbError);
        // No fallar la subida si hay error en la BD
      }
    }

    let downloadURL = null;
    try {
      downloadURL = await getSignedDownloadUrl({ key, expiresIn: 600 });
    } catch (err) {
      console.warn('[docs] No se pudo generar URL firmada inmediatamente:', err?.message || err);
    }

    console.log('[docs] ===== FIN DEBUG UPLOAD =====');
    console.log('[docs] Respuesta enviada - key:', key, 'name:', safeName);
    
    return res.status(201).json({
      file: {
        key,
        name: safeName,
        folder,
        size: req.file.size,
        contentType: req.file.mimetype,
        downloadURL,
        documentId: documentRecord?._id
      },
    });
  } catch (err) {
    console.error('[docs] upload error', err);
    return res.status(500).json({ message: 'Error al subir archivo' });
  }
});

// Create an empty "folder" marker in S3 (zero-byte object with trailing slash)
router.post('/folder', requireAuth, async (req, res) => {
  try {
    console.log('[docs] Create folder request received');
    console.log('[docs] req.body completo:', req.body);
    console.log('[docs] req.body.subfolder:', req.body?.subfolder);
    console.log('[docs] req.body.subfolder (hex):', Buffer.from(req.body?.subfolder || '', 'utf8').toString('hex'));
    console.log('[docs] req.body.subfolder (latin1 hex):', Buffer.from(req.body?.subfolder || '', 'latin1').toString('hex'));
    
    // Aplicar corrección agresiva en el backend
    let requestedFolder = req.body?.subfolder;
    
    // Función de corrección agresiva
    const aggressiveUTF8Fix = (str) => {
      if (!str) return str;
      return str
        .replace(/TrÃ¡mite/g, 'Trámite')
        .replace(/TÃºtela/g, 'Tútela')
        .replace(/trÃ¡mite/g, 'trámite')
        .replace(/tÃºtela/g, 'tútela')
        .replace(/ConstituciÃ³n/g, 'Constitución')
        .replace(/PolÃ­tica/g, 'Política')
        .replace(/constituciÃ³n/g, 'constitución')
        .replace(/polÃ­tica/g, 'política')
        .replace(/Ã¡/g, 'á')
        .replace(/Ã©/g, 'é')
        .replace(/Ã­/g, 'í')
        .replace(/Ã³/g, 'ó')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã/g, 'Á')
        .replace(/Ã‰/g, 'É')
        .replace(/Ã/g, 'Í')
        .replace(/Ã"/g, 'Ó')
        .replace(/Ãš/g, 'Ú')
        .replace(/Ã'/g, 'Ñ')
        .replace(/Ã¼/g, 'ü')
        .replace(/Ãœ/g, 'Ü')
        .replace(/Ã‡/g, 'Ç')
        .replace(/Ã§/g, 'ç');
    };
    
    const correctedFolder = aggressiveUTF8Fix(requestedFolder);
    if (correctedFolder !== requestedFolder) {
      console.log('[docs] BACKEND AGGRESSIVE FIX - Original:', requestedFolder, 'Corrected:', correctedFolder);
      requestedFolder = correctedFolder;
    }
    
    console.log('[docs] Using corrected subfolder:', requestedFolder);
    const folder = resolveFolder(requestedFolder);
    if (!folder) {
      return res.status(400).json({ message: 'Subcarpeta no permitida' });
    }
    // Ensure trailing slash to create a folder-like key
    let prefix;
    if (isClientesFolder(folder)) {
      prefix = await clientesPrefixForRequest(req, folder);
      await assertCanAccessClientes(req, prefix);
    } else {
      prefix = buildUserPrefix(userId, folder);
    }
    
    console.log('[docs] Final prefix to create:', prefix);
    console.log('[docs] Final prefix (hex):', Buffer.from(prefix || '', 'utf8').toString('hex'));
    
    await uploadBuffer({
      key: prefix,
      body: Buffer.alloc(0),
      contentType: 'application/x-directory',
      metadata: { 'user-id': userId, folder },
    });
    
    console.log('[docs] Folder created successfully with key:', prefix);
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

    let prefix;
    if (folder && isClientesFolder(folder)) {
      prefix = await clientesPrefixForRequest(req, folder);
      await assertCanAccessClientes(req, prefix);
    } else {
      prefix = folder ? buildUserPrefix(userId, folder) : buildUserPrefix(userId);
    }

    const objects = await listObjects({ prefix, maxKeys: Math.max(limit * 5, limit) });
    
    const items = (objects || [])
      .map((obj) => {
        const key = obj.Key;
        const name = key?.split('/')?.pop() || key;
        const isFolder = key?.endsWith('/');
        
        return {
          key,
          name: isFolder ? name.slice(0, -1) : name, // Remove trailing slash from folder names
          size: obj.Size,
          lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
          isFolder,
        };
      })
      .sort((a, b) => {
        // Sort folders first, then by date
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        
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
    if (normalizedKey.toLowerCase().startsWith('clientes/')) {
      const prefix = ensureTrailingSlash(normalizedKey.split('/').slice(0, 2).join('/'));
      await assertCanAccessClientes(req, prefix);
    } else if (!normalizedKey.startsWith(expectedPrefix)) {
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
    if (normalizedKey.toLowerCase().startsWith('clientes/')) {
      const prefix = ensureTrailingSlash(normalizedKey.split('/').slice(0, 2).join('/'));
      await assertCanAccessClientes(req, prefix);
    } else if (!normalizedKey.startsWith(expectedPrefix)) {
      return res.status(403).json({ message: 'No tienes acceso a este recurso' });
    }

    // Eliminar el objeto de S3
    await deleteObject({ key: normalizedKey });
    
    // Si es un documento de cliente, también eliminar el registro de la base de datos
    if (normalizedKey.toLowerCase().startsWith('clientes/')) {
      try {
        // Buscar y eliminar el registro en ClientDocument
        const deletedDoc = await ClientDocument.findOneAndDelete({ s3Key: normalizedKey });
        if (deletedDoc) {
          console.log('[docs] Documento eliminado de la base de datos:', deletedDoc._id);
        }
      } catch (dbError) {
        console.error('[docs] Error eliminando registro de BD:', dbError);
        // No fallar la eliminación si hay error en la BD
      }
    }
    
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

// Obtener historial de documentos de un cliente
router.get('/client/:documentNumber/history', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    
    const { documentNumber } = req.params;
    const { limit = 50, offset = 0, folder } = req.query;
    
    // Verificar permisos
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');
    
    if (!isAdmin) {
      // Los usuarios normales solo pueden ver sus propios documentos
      const client = await Client.findOne({ user: userId, documentNumber }).select('_id').lean();
      if (!client) {
        return res.status(403).json({ message: 'No tienes acceso a este cliente' });
      }
    }
    
    // Construir filtro de consulta
    const filter = { documentNumber, isActive: true };
    if (folder) {
      filter.folder = folder;
    }
    
    // Obtener documentos con paginación
    const documents = await ClientDocument.find(filter)
      .populate('client', 'fullName documentNumber')
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();
    
    // Contar total de documentos
    const total = await ClientDocument.countDocuments(filter);
    
    return res.json({
      documents,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < total
      }
    });
  } catch (err) {
    console.error('[docs] client history error', err);
    return res.status(500).json({ message: 'Error al obtener historial de documentos' });
  }
});

// Actualizar estadísticas de descarga
router.post('/document/:documentId/download', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    
    const { documentId } = req.params;
    
    // Actualizar contador de descargas y última fecha de acceso
    await ClientDocument.findByIdAndUpdate(documentId, {
      $inc: { downloadCount: 1 },
      $set: { lastAccessed: new Date() }
    });
    
    return res.json({ success: true });
  } catch (err) {
    console.error('[docs] download stats error', err);
    return res.status(500).json({ message: 'Error al actualizar estadísticas' });
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
