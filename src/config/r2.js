const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
  console.warn('[R2] Missing R2 config — file uploads will fail. Set all R2_* env vars.');
}

const s3Config = {
  region: 'auto',
  credentials: { accessKeyId, secretAccessKey },
};
if (endpoint) s3Config.endpoint = endpoint;

const s3 = new S3Client(s3Config);

const uploadFile = async ({ buffer, key, mimeType, metadata = {} }) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    Metadata: metadata,
  });

  await s3.send(command);

  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  return publicBase ? `${publicBase}/${key}` : `${endpoint}/${bucketName}/${key}`;
};

const buildPublicUrl = (key) => {
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  return publicBase ? `${publicBase}/${key}` : `${endpoint}/${bucketName}/${key}`;
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const getFile = async (key) => {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3.send(command);
  return {
    buffer: await streamToBuffer(response.Body),
    mimeType: response.ContentType,
    size: response.ContentLength,
  };
};

const getSignedDownloadUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
};

const deleteFile = async (key) => {
  const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
  await s3.send(command);
};

module.exports = {
  s3,
  bucketName,
  uploadFile,
  buildPublicUrl,
  getFile,
  getSignedDownloadUrl,
  deleteFile,
};
