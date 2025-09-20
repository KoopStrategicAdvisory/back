const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
  ensureConfigured();
  const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: maxKeys });
  const data = await client.send(command);
  return data.Contents || [];
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

module.exports = {
  uploadBuffer,
  listObjects,
  getSignedDownloadUrl,
  deleteObject,
  deletePrefix,
  buildUserKey,
  buildUserPrefix,
};


