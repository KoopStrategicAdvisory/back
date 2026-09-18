const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET_NAME;
const BASE_PREFIX = process.env.S3_BASE_PREFIX || 'koop';

function ensureConfigured() {
  if (!BUCKET) {
    throw new Error('S3_BUCKET_NAME no configurado');
  }
  if (!REGION) {
    throw new Error('AWS_REGION no configurado');
  }
}

const client = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

function normalizeUserId(userId) {
  const normalized = String(userId || '').trim();
  if (!normalized) {
    throw new Error('userId requerido para generar keys en S3');
  }
  if (normalized.includes('/')) {
    throw new Error('userId contiene caracteres no permitidos para rutas en S3');
  }
  return normalized;
}

function normalizeRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  if (normalized.includes('..')) {
    throw new Error('relativePath contiene segmentos invalidos (.. no permitido)');
  }
  return normalized.replace(/\+/g, '/');
}

function buildUserKey(userId, relativePath = '') {
  const normalizedUser = normalizeUserId(userId);
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return `${BASE_PREFIX}/${normalizedUser}/`;
  }
  return `${BASE_PREFIX}/${normalizedUser}/${normalizedPath}`;
}

function buildUserPrefix(userId, subPath = '') {
  const key = buildUserKey(userId, subPath);
  return key.endsWith('/') ? key : `${key}/`;
}

async function uploadBuffer({ key, body, contentType, metadata }) {
  ensureConfigured();
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });
  await client.send(command);
  return { key };
}

async function listObjects({ prefix, maxKeys = 50 }) {
  console.log('[listObjects] Input prefix:', prefix, 'maxKeys:', maxKeys);
  ensureConfigured();
  const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: maxKeys });
  console.log('[listObjects] Sending command to S3...');
  const data = await client.send(command);
  console.log('[listObjects] S3 response:', data);
  const contents = data.Contents || [];
  console.log('[listObjects] Returning contents:', contents.length, 'items');
  return contents;
}

async function getSignedDownloadUrl({ key, expiresIn = 600 }) {
  ensureConfigured();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

async function deleteObject({ key }) {
  ensureConfigured();
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await client.send(command);
  return { key };
}

async function deletePrefix({ prefix }) {
  ensureConfigured();
  const normalized = String(prefix || '').replace(/^\/+/, '');
  let continuationToken = undefined;
  let total = 0;
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: normalized,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    const toDelete = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (toDelete.length > 0) {
      await client.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: toDelete, Quiet: true },
      }));
      total += toDelete.length;
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  return { prefix: normalized, deleted: total };
}

// El prefijo de un expediente en S3 se arma con su numero_de_expediente real
// (ej. "KOOP-2026-3"), no con el id numerico interno de la base de datos —
// asi la carpeta en S3 dice lo mismo que ve el abogado en la app, en vez de
// un "expediente-17" que no significa nada fuera del sistema.
function documentoPrefix(numeroExpediente) {
  const safe = String(numeroExpediente || '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `documentos/${safe}`;
}

// Carpeta propia (fuera de documentos/, que es por expediente) para las
// constancias en PDF de la bitacora diaria de consultas externas — una por
// fecha, sobreescrita si se vuelve a generar ese mismo dia.
const CONSTANCIAS_PREFIX = 'constancias-consultas-externas';
function constanciaKey(fecha) {
  const safe = String(fecha || '').replace(/[^0-9-]+/g, '');
  return `${CONSTANCIAS_PREFIX}/${safe}.pdf`;
}

// Copia todos los objetos bajo fromPrefix a toPrefix (preservando la ruta
// relativa) y borra los originales. S3 no tiene "mover/renombrar" nativo —
// es copiar + borrar. Se usa cuando cambia el numero_de_expediente de un
// expediente que ya tenia documentos subidos, para que la carpeta en S3
// seguna llamandose como el expediente.
async function renamePrefix({ fromPrefix, toPrefix }) {
  ensureConfigured();
  const fromNorm = String(fromPrefix || '').replace(/^\/+/, '');
  const toNorm = String(toPrefix || '').replace(/^\/+/, '');
  if (!fromNorm || !toNorm || fromNorm === toNorm) return { renamed: 0, mapping: [] };

  let continuationToken;
  const mapping = [];
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: fromNorm, ContinuationToken: continuationToken, MaxKeys: 1000,
    }));
    for (const obj of list.Contents || []) {
      const relative = obj.Key.slice(fromNorm.length);
      const newKey = `${toNorm}${relative}`;
      await client.send(new CopyObjectCommand({
        Bucket: BUCKET, Key: newKey, CopySource: `${BUCKET}/${obj.Key}`,
      }));
      mapping.push({ from: obj.Key, to: newKey });
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  if (mapping.length) {
    await client.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: mapping.map((m) => ({ Key: m.from })), Quiet: true },
    }));
  }
  return { renamed: mapping.length, mapping };
}

async function claimFolder({ prefix, clientId, documentNumber }) {
  ensureConfigured();
  const normalized = String(prefix || '').replace(/^\/+/, '');
  let continuationToken = undefined;
  let claimed = 0;
  
  do {
    const list = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: normalized,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    
    const objects = list.Contents || [];
    
    // Claim each object by copying it with updated metadata
    for (const obj of objects) {
      try {
        // Skip if it's already a metadata file
        if (obj.Key.endsWith('.claimed') || obj.Key.endsWith('.metadata')) {
          continue;
        }
        
        // Copy object with updated metadata
        const copyCommand = new PutObjectCommand({
          Bucket: BUCKET,
          Key: obj.Key,
          CopySource: `${BUCKET}/${obj.Key}`,
          Metadata: {
            'client-id': clientId,
            'client-document': documentNumber,
            'claimed-at': new Date().toISOString(),
            'original-owner': 'claimed'
          },
          MetadataDirective: 'REPLACE'
        });
        
        await client.send(copyCommand);
        claimed++;
      } catch (e) {
        console.warn(`[S3] Could not claim object ${obj.Key}:`, e?.message || e);
      }
    }
    
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
  
  return { prefix: normalized, claimed };
}

module.exports = {
  uploadBuffer,
  listObjects,
  getSignedDownloadUrl,
  deleteObject,
  deletePrefix,
  renamePrefix,
  documentoPrefix,
  claimFolder,
  buildUserKey,
  buildUserPrefix,
  CONSTANCIAS_PREFIX,
  constanciaKey,
};


