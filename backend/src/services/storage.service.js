// src/services/storage.service.js — Supabase Storage
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let supabase = null;

function getClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabase;
}

async function uploadFile(buffer, originalName, mimeType, folder) {
  folder = folder || 'catalogos';
  const ext = path.extname(originalName).toLowerCase();
  const key = folder + '/' + uuidv4() + ext;

  const { data, error } = await getClient()
    .storage
    .from('catalogos')
    .upload(key, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error('Erro ao fazer upload: ' + error.message);

  const { data: urlData } = getClient()
    .storage
    .from('catalogos')
    .getPublicUrl(key);

  return { key: key, url: urlData.publicUrl, size: buffer.length };
}

async function deleteFile(key) {
  try {
    const { error } = await getClient().storage.from('catalogos').remove([key]);
    if (error) console.error('Erro ao deletar:', error.message);
    return !error;
  } catch (err) {
    console.error('Erro ao deletar arquivo:', err);
    return false;
  }
}

async function getFileBuffer(key) {
  const { data, error } = await getClient().storage.from('catalogos').download(key);
  if (error) throw new Error('Erro ao baixar arquivo: ' + error.message);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getSignedDownloadUrl(key, expiresIn) {
  expiresIn = expiresIn || 3600;
  const { data, error } = await getClient().storage.from('catalogos').createSignedUrl(key, expiresIn);
  if (error) throw new Error('Erro ao gerar URL: ' + error.message);
  return data.signedUrl;
}

module.exports = { uploadFile, deleteFile, getSignedDownloadUrl, getFileBuffer };
