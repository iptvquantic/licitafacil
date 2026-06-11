// src/services/storage.service.js
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let s3Client = null;

function getClient() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

async function uploadFile(buffer, originalName, mimeType, folder = 'catalogos') {
  const ext = path.extname(originalName).toLowerCase();
  const key = `${folder}/${uuidv4()}${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    Metadata: {
      originalName: encodeURIComponent(originalName),
      uploadedAt: new Date().toISOString(),
    },
  });

  await getClient().send(command);

  return {
    key,
    url: `${process.env.R2_PUBLIC_URL}/${key}`,
    size: buffer.length,
  };
}

async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    });
    await getClient().send(command);
    return true;
  } catch (err) {
    console.error('Erro ao deletar arquivo do R2:', err);
    return false;
  }
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn });
}

async function getFileBuffer(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
  });
  const response = await getClient().send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { uploadFile, deleteFile, getSignedDownloadUrl, getFileBuffer };
