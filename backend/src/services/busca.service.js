// src/services/busca.service.js
const { query } = require('../utils/db');
const { tokenizar, calcularTFIDF, cosineSimilarity } = require('./pdf.service');

// ─── Busca híbrida ────────────────────────────────────────────────────────────

async function buscaHibrida(consulta, usuarioId, limite = 5) {
  const tokensConsulta = tokenizar(consulta);
  if (tokensConsulta.length === 0) {
    return { resultados: [], total: 0 };
  }

  // Buscar todos os chunks do usuário
  const chunksResult = await query(
    `SELECT 
      c.id, c.conteudo, c.embedding_json, c.indice,
      f.id as fornecedor_id, f.nome as fornecedor_nome,
      f.telefone, f.whatsapp, f.email,
      cat.id as catalogo_id, cat.nome_arquivo
    FROM chunks c
    JOIN fornecedores f ON c.fornecedor_id = f.id
    JOIN catalogos cat ON c.catalogo_id = cat.id
    WHERE f.usuario_id = $1 AND f.ativo = 1
    ORDER BY c.id`,
    [usuarioId]
  );

  if (chunksResult.rows.length === 0) {
    return { resultados: [], total: 0 };
  }

  const chunks = chunksResult.rows;
  const embedding_consulta = calcularTFIDF(consulta, chunks.map(c => c.conteudo));

  // Calcular score para cada chunk
  const scores = chunks.map(chunk => {
    // Score keyword (0-1): proporção de tokens da consulta presentes no chunk
    const tokensChunk = tokenizar(chunk.conteudo);
    const intersecao = tokensConsulta.filter(t => tokensChunk.includes(t)).length;
    const keywordScore = intersecao / Math.max(tokensConsulta.length, 1);

    // Score semântico TF-IDF
    let semanticScore = 0;
    try {
      const embeddingChunk = chunk.embedding_json
        ? JSON.parse(chunk.embedding_json)
        : calcularTFIDF(chunk.conteudo, chunks.map(c => c.conteudo));
      semanticScore = cosineSimilarity(embedding_consulta, embeddingChunk);
    } catch (_) {
      semanticScore = 0;
    }

    // Score híbrido: 60% keyword + 40% semântico
    const scoreTotal = 0.6 * keywordScore + 0.4 * semanticScore;

    return { chunk, keywordScore, semanticScore, scoreTotal };
  });

  // Filtrar scores > 0 e ordenar
  const scoresValidos = scores
    .filter(s => s.scoreTotal > 0.05)
    .sort((a, b) => b.scoreTotal - a.scoreTotal);

  // Agrupar por fornecedor (melhor score por fornecedor)
  const porFornecedor = new Map();
  for (const s of scoresValidos) {
    const fid = s.chunk.fornecedor_id;
    if (!porFornecedor.has(fid) || porFornecedor.get(fid).scoreTotal < s.scoreTotal) {
      porFornecedor.set(fid, s);
    }
  }

  // Montar resultados finais
  const resultados = [];
  for (const [, melhor] of porFornecedor) {
    if (resultados.length >= limite) break;

    const { chunk } = melhor;

    // Pegar os melhores chunks deste fornecedor para o trecho
    const chunksDoFornecedor = scoresValidos
      .filter(s => s.chunk.fornecedor_id === chunk.fornecedor_id)
      .slice(0, 3);

    const trecho = chunksDoFornecedor
      .map(s => destacarTexto(s.chunk.conteudo, tokensConsulta))
      .join(' ... ')
      .substring(0, 600);

    resultados.push({
      fornecedor_id: chunk.fornecedor_id,
      nome: chunk.fornecedor_nome,
      telefone: chunk.telefone,
      whatsapp: chunk.whatsapp,
      email: chunk.email,
      catalogo_id: chunk.catalogo_id,
      nome_arquivo: chunk.nome_arquivo,
      trecho,
      score: Math.round(melhor.scoreTotal * 100),
      relevancia: melhor.scoreTotal > 0.6 ? 'alta' : melhor.scoreTotal > 0.3 ? 'media' : 'baixa'
    });
  }

  return {
    resultados,
    total: resultados.length,
    consulta,
    tokens_usados: tokensConsulta
  };
}

function destacarTexto(texto, tokens) {
  // Encontrar a janela com maior concentração dos tokens buscados
  const palavras = texto.split(/\s+/);
  const JANELA = 40;
  let melhorInicio = 0;
  let melhorScore = 0;

  for (let i = 0; i < palavras.length - JANELA; i++) {
    const janela = palavras.slice(i, i + JANELA).join(' ').toLowerCase();
    const hits = tokens.filter(t => janela.includes(t)).length;
    if (hits > melhorScore) {
      melhorScore = hits;
      melhorInicio = i;
    }
  }

  return palavras.slice(melhorInicio, melhorInicio + JANELA).join(' ');
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function getStats(usuarioId) {
  const result = await query(
    `SELECT
      COUNT(DISTINCT f.id) as total_fornecedores,
      COUNT(DISTINCT cat.id) FILTER (WHERE cat.status = 'processado') as total_catalogos,
      COUNT(c.id) as total_chunks
    FROM fornecedores f
    LEFT JOIN catalogos cat ON cat.fornecedor_id = f.id
    LEFT JOIN chunks c ON c.fornecedor_id = f.id
    WHERE f.usuario_id = $1 AND f.ativo = 1`,
    [usuarioId]
  );

  const row = result.rows[0];
  return {
    total_fornecedores: parseInt(row.total_fornecedores) || 0,
    total_catalogos: parseInt(row.total_catalogos) || 0,
    total_chunks: parseInt(row.total_chunks) || 0,
    indexado: parseInt(row.total_chunks) > 0
  };
}

module.exports = { buscaHibrida, getStats };
