const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET_NAME;
const BASE_PREFIX = process.env.S3_BASE_PREFIX || 'koop';

if (!BUCKET) {
  console.warn('[S3] S3_BUCKET_NAME no definido. Las operaciones fallaran si se llaman.');
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
  const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: maxKeys });
  const data = await client.send(command);
  return data.Contents || [];
}

async function getSignedDownloadUrl({ key, expiresIn = 600 }) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

async function deleteObject({ key }) {
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await client.send(command);
  return { key };
}

module.exports = {
  uploadBuffer,
  listObjects,
  getSignedDownloadUrl,
  deleteObject,
  buildUserKey,
  buildUserPrefix,
};


