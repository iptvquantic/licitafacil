// src/services/pdf.service.js
const pdfParse = require('pdf-parse');
const { query } = require('../utils/db');
const { getFileBuffer } = require('./storage.service');
const aiService = require('./ai.service');

// ─── Extração de texto ────────────────────────────────────────────────────────

async function extrairTexto(buffer) {
  // Tentativa 1: pdf-parse nativo
  try {
    const data = await pdfParse(buffer, { max: 0 });
    const texto = (data.text || '').trim();
    if (texto.length >= 100) {
      return { texto, paginas: data.numpages, metodo: 'nativo' };
    }
  } catch (err) {
    console.warn('pdf-parse falhou:', err.message);
  }

  // Tentativa 2: OCR via API (Anthropic vision / OpenRouter com modelo multimodal)
  // Fallback: retornar texto vazio indicando que precisa OCR
  return { texto: '', paginas: 0, metodo: 'falhou' };
}

// ─── Extração de contatos ────────────────────────────────────────────────────

function extrairContatos(texto) {
  const resultado = { telefones: [], emails: [] };

  // Telefones brasileiros: (11) 99999-9999, 11999999999, +55 11 99999-9999
  const regexTel = /(?:\+55\s?)?(?:\(?\d{2}\)?[\s\-]?)?\d{4,5}[\s\-]?\d{4}/g;
  const telMatches = texto.match(regexTel) || [];
  resultado.telefones = [...new Set(telMatches
    .map(t => t.replace(/\s/g, '').trim())
    .filter(t => t.replace(/\D/g, '').length >= 10)
  )].slice(0, 5);

  // Emails
  const regexEmail = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const emailMatches = texto.match(regexEmail) || [];
  resultado.emails = [...new Set(emailMatches)].slice(0, 5);

  return resultado;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function dividirEmChunks(texto, tamanho = 500, sobreposicao = 50) {
  const palavras = texto.split(/\s+/).filter(p => p.length > 0);
  const chunks = [];

  for (let i = 0; i < palavras.length; i += (tamanho - sobreposicao)) {
    const slice = palavras.slice(i, i + tamanho);
    if (slice.length < 20) break; // chunk muito pequeno, ignorar
    chunks.push(slice.join(' '));
    if (i + tamanho >= palavras.length) break;
  }

  return chunks;
}

// ─── TF-IDF ──────────────────────────────────────────────────────────────────

// ─── Pipeline principal ──────────────────────────────────────────────────────

async function processarPDF(catalogoId, storageKey) {
  // Marcar como processando
  await query(
    'UPDATE catalogos SET status = $1, atualizado_em = NOW() WHERE id = $2',
    ['processando', catalogoId]
  );

  try {
    // 1. Baixar buffer do storage
    const buffer = await getFileBuffer(storageKey);

    // 2. Extrair texto
    const { texto, paginas } = await extrairTexto(buffer);

    if (!texto || texto.length < 50) {
      await query(
        'UPDATE catalogos SET status = $1, erro = $2, atualizado_em = NOW() WHERE id = $3',
        ['erro', 'Não foi possível extrair texto do PDF. O arquivo pode estar protegido ou ser uma imagem sem OCR.', catalogoId]
      );
      return { success: false, erro: 'Texto insuficiente' };
    }

    // 3. Extrair contatos
    const contatos = extrairContatos(texto);

    // 4. Dividir em chunks
    const chunkTextos = dividirEmChunks(texto, 500, 50);

    // 5. Gerar embeddings TF-IDF para cada chunk
    const embeddings = chunkTextos.map(chunk => calcularTFIDF(chunk, chunkTextos));

    // 6. Salvar chunks no banco
    const catalogoResult = await query('SELECT fornecedor_id FROM catalogos WHERE id = $1', [catalogoId]);
    const fornecedorId = catalogoResult.rows[0]?.fornecedor_id;

    // Limpar chunks antigos
    await query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogoId]);

    for (let i = 0; i < chunkTextos.length; i++) {
      await query(
        'INSERT INTO chunks (catalogo_id, fornecedor_id, conteudo, embedding_json, indice) VALUES ($1, $2, $3, $4, $5)',
        [catalogoId, fornecedorId, chunkTextos[i], JSON.stringify(embeddings[i]), i]
      );
    }

    // 7. Atualizar catálogo
    await query(
      `UPDATE catalogos SET 
        status = 'processado',
        texto_extraido = $1,
        paginas = $2,
        atualizado_em = NOW()
       WHERE id = $3`,
      [texto.substring(0, 50000), paginas, catalogoId]
    );

    // 8. Atualizar contatos do fornecedor se extraiu novos
    if (contatos.telefones.length > 0 || contatos.emails.length > 0) {
      const updates = [];
      const values = [];
      let idx = 1;

      if (contatos.telefones[0]) {
        updates.push(`telefone = COALESCE(NULLIF(telefone, ''), $${idx})`);
        values.push(contatos.telefones[0]);
        idx++;
      }
      if (contatos.emails[0]) {
        updates.push(`email = COALESCE(NULLIF(email, ''), $${idx})`);
        values.push(contatos.emails[0]);
        idx++;
      }
      if (updates.length > 0) {
        values.push(fornecedorId);
        await query(
          `UPDATE fornecedores SET ${updates.join(', ')}, atualizado_em = NOW() WHERE id = $${idx}`,
          values
        );
      }
    }

    return {
      success: true,
      chunks: chunkTextos.length,
      paginas,
      contatos
    };

  } catch (err) {
    console.error('Erro ao processar PDF:', err);
    await query(
      'UPDATE catalogos SET status = $1, erro = $2, atualizado_em = NOW() WHERE id = $3',
      ['erro', err.message, catalogoId]
    );
    return { success: false, erro: err.message };
  }
}

const { tokenizar, calcularTFIDF, cosineSimilarity } = require('../utils/texto');

module.exports = {
  processarPDF,
  extrairTexto,
  extrairContatos,
  dividirEmChunks,
  tokenizar,
  calcularTFIDF,
  cosineSimilarity
};
