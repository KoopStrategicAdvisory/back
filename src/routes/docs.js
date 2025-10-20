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

// Helper function to convert string to hex (replaces Buffer.from().toString('hex'))
function stringToHex(str) {
  if (!str) return '';
  return str.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

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
    console.log('[docs] Multer - originalname (hex):', stringToHex(file.originalname || ''));
    console.log('[docs] Multer - originalname (latin1 hex):', stringToHex(file.originalname || ''));
    cb(null, true);
  }
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  console.log('🔧 [docs] requireAuth - URL:', req.url);
  console.log('🔧 [docs] requireAuth - Authorization header:', auth ? 'Presente' : 'Ausente');
  if (!auth.startsWith('Bearer ')) {
    console.log('🔧 [docs] requireAuth - No Bearer token found');
    return res.status(401).json({ message: 'No token' });
  }
  try {
    const token = auth.slice(7);
    console.log('🔧 [docs] requireAuth - Token length:', token.length);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log('🔧 [docs] requireAuth - Token válido para usuario:', payload.sub);
    console.log('🔧 [docs] requireAuth - Token payload completo:', payload);
    console.log('🔧 [docs] requireAuth - Roles en token:', payload.roles);
    req.user = payload;
    next();
  } catch (e) {
    console.log('🔧 [docs] requireAuth - Error verificando token:', e.message);
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
    .slice(0, 120);
}

function sanitizeFolderName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\s-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|^\.+/g, '')
    .slice(0, 120);
}

function isClientesFolder(folder) {
  if (!folder) return false;
  const raw = String(folder).trim();
  return raw.toLowerCase().startsWith('clientes');
}

async function getUserClientDocNumber(userId) {
  if (!userId) return null;
  try {
    console.log('[docs] getUserClientDocNumber - userId:', userId);
    const client = await Client.findOne({ user: userId });
    console.log('[docs] getUserClientDocNumber - client found:', client);
    const docNumber = client?.documentNumber || null;
    console.log('[docs] getUserClientDocNumber - documentNumber:', docNumber);
    return docNumber;
  } catch (e) {
    console.error('[docs] Error getting user client doc number:', e);
    return null;
  }
}

async function clientesPrefixForRequest(req, folder /* sanitized from resolveFolder */) {
  // folder can be: 'clientes' or 'clientes/<doc>' or 'clientes/<doc>/<subfolder>'
  console.log('[clientesPrefixForRequest] Input folder:', folder);
  const parts = String(folder || '').split('/').filter(Boolean);
  console.log('[clientesPrefixForRequest] Parts:', parts);
  const roles = normalizeRoles(req.user?.roles);
  const isAdmin = roles.includes('admin');
  const isClient = roles.includes('client');
  console.log('[clientesPrefixForRequest] User roles:', roles, 'isAdmin:', isAdmin, 'isClient:', isClient);

  if (parts.length === 1) {
    if (isAdmin) {
      const err = new Error('Debe especificar clientes/<cedula>');
      err.status = 400;
      throw err;
    }
    
    if (isClient) {
      // Para clientes, usar su documentNumber directamente
      console.log('[clientesPrefixForRequest] Usuario es cliente, obteniendo documentNumber...');
      const ownDoc = await getUserClientDocNumber(req.user?.sub || req.user?.id);
      console.log('[clientesPrefixForRequest] DocumentNumber obtenido:', ownDoc);
      if (!ownDoc) {
        console.log('[clientesPrefixForRequest] No se encontró documentNumber');
        const err = new Error('No se encontró documento de cliente asociado');
        err.status = 400;
        throw err;
      }
      const result = `clientes/${sanitizeSegment(ownDoc)}/`;
      console.log('[clientesPrefixForRequest] Resultado:', result);
      return result;
    }
    
    // Para usuarios regulares (no clientes), no pueden acceder a carpetas de clientes
    const err = new Error('No tienes permisos para acceder a carpetas de clientes');
    err.status = 403;
    throw err;
  }

  if (parts.length >= 2) {
    console.log('[clientesPrefixForRequest] Processing parts[1]:', parts[1]);
    const doc = sanitizeSegment(parts[1]);
    console.log('[clientesPrefixForRequest] Sanitized doc:', doc);
    if (!doc) {
      const err = new Error('Documento de cliente inválido');
      err.status = 400;
      throw err;
    }
    if (parts.length === 2) {
      const result = `clientes/${doc}/`;
      console.log('[clientesPrefixForRequest] Returning:', result);
      return result;
    }
    const subfolder = parts.slice(2).map(sanitizeFolderName).filter(Boolean).join('/');
    if (!subfolder) {
      return `clientes/${doc}/`;
    }
    return `clientes/${doc}/${subfolder}/`;
  }

  const err = new Error('Formato de carpeta inválido');
  err.status = 400;
  throw err;
}

async function assertCanAccessClientes(req, prefix) {
  console.log('[assertCanAccessClientes] Input prefix:', prefix);
  const parts = String(prefix).split('/').filter(Boolean);
  const doc = parts[1] || '';
  console.log('[assertCanAccessClientes] Extracted doc:', doc);
  const roles = normalizeRoles(req.user?.roles);
  const isAdmin = roles.includes('admin');
  const isClient = roles.includes('client');
  console.log('[assertCanAccessClientes] User roles:', roles, 'isAdmin:', isAdmin, 'isClient:', isClient);
  
  if (isAdmin) {
    console.log('[assertCanAccessClientes] Admin access granted');
    return true;
  }
  
  if (isClient) {
    const ownDoc = await getUserClientDocNumber(req.user?.sub || req.user?.id);
    console.log('[assertCanAccessClientes] Own doc:', ownDoc);
    if (ownDoc && sanitizeSegment(ownDoc) === doc) {
      console.log('[assertCanAccessClientes] Own doc access granted');
      return true;
    }
  }
  
  console.log('[assertCanAccessClientes] Access denied');
  const err = new Error('No tienes acceso a esta carpeta');
  err.status = 403;
  throw err;
}

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
  return userId;
}

// Upload endpoint
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    console.log('[docs] Upload request received');
    console.log('[docs] ===== INICIO DEBUG UPLOAD =====');
    const userId = ensureUser(req, res);
    if (!userId) return;
    console.log('[docs] User ID:', userId);
    console.log('[docs] req.body.useExactName:', req.body?.useExactName);
    console.log('[docs] req.body.subfolder:', req.body?.subfolder);
    console.log('[docs] req.body.subfolder (hex):', stringToHex(req.body?.subfolder || ''));
    console.log('[docs] req.body.subfolder (latin1 hex):', stringToHex(req.body?.subfolder || ''));
    const useExactName = req.body?.useExactName === 'true';
    console.log('[docs] useExactName:', useExactName, 'originalname:', req.file.originalname);
    console.log('[docs] originalname (hex):', stringToHex(req.file.originalname || ''));
    console.log('[docs] originalname (latin1 hex):', stringToHex(req.file.originalname || ''));
    
    // LOGS ADICIONALES PARA DEBUG
    console.log('[docs] req.file.mimetype:', req.file.mimetype);
    console.log('[docs] req.file.size:', req.file.size);
    console.log('[docs] req.file.buffer length:', req.file.buffer?.length);
    
    if (!req.file) {
      return res.status(400).json({ message: 'Archivo requerido' });
    }

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

    let key;
    if (isClientesFolder(folder)) {
      const prefix = await clientesPrefixForRequest(req, folder);
      await assertCanAccessClientes(req, prefix);
      const fileName = useExactName ? req.file.originalname : slugName(req.file.originalname);
      key = `${prefix}${fileName}`;
    } else {
      const prefix = buildUserPrefix(userId, folder);
      const fileName = useExactName ? req.file.originalname : slugName(req.file.originalname);
      key = `${prefix}${fileName}`;
    }

    console.log('[docs] Final key to upload:', key);
    console.log('[docs] Final key (hex):', stringToHex(key || ''));
    
    if (!key) {
      console.error('[docs] ERROR: Key is undefined or null');
      return res.status(400).json({ message: 'Error generando clave para el archivo' });
    }

    const downloadURL = await getSignedDownloadUrl({ key, expiresIn: 3600 });
    
    // Save document record
    let documentRecord = null;
    if (isClientesFolder(folder)) {
      const parts = String(folder).split('/').filter(Boolean);
      const clientDoc = parts[1] || '';
      const client = await Client.findOne({ documentNumber: clientDoc });
      if (client) {
        documentRecord = await ClientDocument.create({
          client: client._id,
          documentNumber: client.documentNumber,
          fileName: req.file.originalname,
          originalName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          s3Key: key,
          folder,
          uploadedBy: userId,
        });
      }
    }

    console.log('[docs] About to call uploadBuffer with key:', key);
    console.log('[docs] Key type:', typeof key, 'Key length:', key?.length);
    
    await uploadBuffer({
      key,
      body: req.file.buffer,
      contentType: req.file.mimetype,
      metadata: { 'user-id': userId, folder },
    });

    console.log('[docs] Upload successful');
    return res.status(201).json({
      key,
      downloadURL,
      folder,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype,
        downloadURL,
        documentId: documentRecord?._id
      },
    });
  } catch (err) {
    console.error('[docs] upload error', err);
    return res.status(500).json({ message: err?.message || 'Error al subir archivo' });
  }
});

// Create an empty "folder" marker in S3 (zero-byte object with trailing slash)
router.post('/folder', requireAuth, async (req, res) => {
  try {
    console.log('[docs] Create folder request received');
    console.log('[docs] req.body completo:', req.body);
    console.log('[docs] req.body.subfolder:', req.body?.subfolder);
    console.log('[docs] req.body.subfolder (hex):', stringToHex(req.body?.subfolder || ''));
    console.log('[docs] req.body.subfolder (latin1 hex):', stringToHex(req.body?.subfolder || ''));
    
    const userId = ensureUser(req, res);
    if (!userId) return;
    
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
    console.log('[docs] Final prefix (hex):', stringToHex(prefix || ''));
    
    await uploadBuffer({
      key: prefix,
      body: '',
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
    console.log('[docs] ===== INICIO RECENT REQUEST =====');
    console.log('[docs] Recent request - req.user:', req.user);
    const userId = ensureUser(req, res);
    if (!userId) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const subfolder = req.query.subfolder;
    console.log('[docs] Recent request - userId:', userId, 'limit:', limit, 'subfolder:', subfolder);
    
    let prefix;
    if (subfolder) {
      const folder = resolveFolder(subfolder);
      if (!folder) {
        return res.status(400).json({ message: 'Subcarpeta no permitida' });
      }
      if (isClientesFolder(folder)) {
        prefix = await clientesPrefixForRequest(req, folder);
        await assertCanAccessClientes(req, prefix);
      } else {
        prefix = buildUserPrefix(userId, folder);
      }
    } else {
      prefix = buildUserPrefix(userId, DEFAULT_FOLDER);
    }
    
    console.log('[docs] Using prefix for recent:', prefix);
    const objects = await listObjects({ prefix, maxKeys: limit });
    console.log('[docs] Objects from S3:', objects);
    console.log('[docs] Objects count:', objects.length);
    const items = objects
      .filter(obj => obj && (obj.key || obj.Key)) // Filtrar objetos sin key
      .map(obj => {
        const key = obj.key || obj.Key;
        return {
          key: key,
          name: key.split('/').pop() || 'Unknown',
          size: obj.size || obj.Size || 0,
          lastModified: obj.lastModified || obj.LastModified || new Date(),
          isFolder: key.endsWith('/'),
        };
      });
    
    console.log('[docs] Processed items:', items);
    return res.json({ items, prefix });
  } catch (err) {
    console.error('[docs] ===== ERROR EN RECENT REQUEST =====');
    console.error('[docs] recent error:', err);
    console.error('[docs] Error stack:', err.stack);
    console.error('[docs] Error message:', err.message);
    return res.status(500).json({ message: 'Error al obtener archivos recientes' });
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
    const downloadURL = await getSignedDownloadUrl({ key, expiresIn: expires });
    return res.json({ downloadURL });
  } catch (err) {
    console.error('[docs] download-url error', err);
    return res.status(500).json({ message: 'Error al obtener URL de descarga' });
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
    
    // Verificar permisos antes de eliminar
    if (isClientesFolder(key)) {
      await assertCanAccessClientes(req, key);
    } else {
      const userPrefix = buildUserPrefix(userId, DEFAULT_FOLDER);
      if (!key.startsWith(userPrefix)) {
        return res.status(403).json({ message: 'No tienes permisos para eliminar este objeto' });
      }
    }
    
    await deleteObject({ key });
    return res.json({ deleted: true, key });
  } catch (err) {
    console.error('[docs] delete object error', err);
    return res.status(500).json({ message: err?.message || 'Error al eliminar objeto' });
  }
});

router.get('/diag', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    const requestedFolder = req.query.subfolder;
    console.log('[docs] Diag request - userId:', userId, 'subfolder:', requestedFolder);
    
    let prefix;
    let folder = DEFAULT_FOLDER;
    if (requestedFolder) {
      folder = resolveFolder(requestedFolder);
      if (!folder) {
        return res.status(400).json({ message: 'Subcarpeta no permitida' });
      }
      if (isClientesFolder(folder)) {
        prefix = await clientesPrefixForRequest(req, folder);
        await assertCanAccessClientes(req, prefix);
      } else {
        prefix = buildUserPrefix(userId, folder);
      }
    } else {
      prefix = buildUserPrefix(userId, folder);
    }
    
    console.log('[docs] Using prefix for diag:', prefix);
    
    // Test read access
    let readOk = false;
    let writeOk = false;
    let listOk = false;
    
    try {
      await listObjects(prefix, 1);
      readOk = true;
      listOk = true;
    } catch (e) {
      console.log('[docs] Read/list test failed:', e.message);
    }
    
    // Test write access (only if doWrite is true)
    const doWrite = req.query.write === 'true';
    if (doWrite) {
      const testKey = `${prefix}diag_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`;
      try {
        await uploadBuffer({
          key: testKey,
          body: `diag ok ${new Date().toISOString()}`,
          contentType: 'text/plain',
          metadata: { 'user-id': userId, folder: folder || '' },
        });
        writeOk = true;
        try {
          await deleteObject({ key: testKey });
        } catch (e) {
          console.log('[docs] Cleanup failed:', e.message);
        }
      } catch (e) {
        console.log('[docs] Write test failed:', e.message);
      }
    }
    
    return res.json({
      prefix,
      folder,
      permissions: {
        read: readOk,
        write: writeOk,
        list: listOk,
      },
      user: {
        id: userId,
        roles: req.user?.roles,
      },
    });
  } catch (err) {
    console.error('[docs] diag error', err);
    return res.status(500).json({ message: 'Error en diagnóstico' });
  }
});

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
      // Usuario normal solo puede ver su propio historial
      const ownDoc = await getUserClientDocNumber(userId);
      if (!ownDoc || sanitizeSegment(ownDoc) !== sanitizeSegment(documentNumber)) {
        return res.status(403).json({ message: 'No tienes acceso a este historial' });
      }
    }
    
    // Buscar el cliente
    const client = await Client.findOne({ documentNumber: sanitizeSegment(documentNumber) });
    if (!client) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }
    
    // Construir filtro para documentos
    const filter = { clientId: client._id };
    if (folder) {
      filter.folder = folder;
    }
    
    // Obtener documentos con paginación
    const documents = await ClientDocument.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('uploadedBy', 'name email');
    
    const total = await ClientDocument.countDocuments(filter);
    
    return res.json({
      documents,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + documents.length) < total,
    });
  } catch (err) {
    console.error('[docs] client history error', err);
    return res.status(500).json({ message: 'Error al obtener historial del cliente' });
  }
});

router.post('/document/:documentId/download', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    
    const { documentId } = req.params;
    
    // Buscar el documento
    const document = await ClientDocument.findById(documentId).populate('clientId');
    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }
    
    // Verificar permisos
    const roles = normalizeRoles(req.user?.roles);
    const isAdmin = roles.includes('admin');
    
    if (!isAdmin) {
      // Usuario normal solo puede descargar sus propios documentos
      const ownDoc = await getUserClientDocNumber(userId);
      if (!ownDoc || sanitizeSegment(ownDoc) !== sanitizeSegment(document.clientId.documentNumber)) {
        return res.status(403).json({ message: 'No tienes acceso a este documento' });
      }
    }
    
    // Actualizar estadísticas de descarga
    document.downloadCount = (document.downloadCount || 0) + 1;
    document.lastDownloadedAt = new Date();
    await document.save();
    
    return res.json({ 
      message: 'Estadísticas de descarga actualizadas',
      downloadCount: document.downloadCount 
    });
  } catch (err) {
    console.error('[docs] document download stats error', err);
    return res.status(500).json({ message: 'Error al actualizar estadísticas de descarga' });
  }
});

router.get('/health', requireAuth, async (req, res) => {
  try {
    const userId = ensureUser(req, res);
    if (!userId) return;
    // Try list on base prefix for this user (no folder required)
    const prefix = buildUserPrefix(userId, DEFAULT_FOLDER);
    await listObjects(prefix, 1);
    return res.json({ status: 'ok', userId, prefix });
  } catch (err) {
    console.error('[docs] health error', err);
    return res.status(500).json({ message: 'Error en health check' });
  }
});

module.exports = router;





