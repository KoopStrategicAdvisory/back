const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET_NAME;

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

module.exports = {
  uploadBuffer,
  listObjects,
  getSignedDownloadUrl,
};
