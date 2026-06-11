// src/services/ai.service.js
const fetch = require('node-fetch');
const { query } = require('../utils/db');
const { buscaHibrida } = require('./busca.service');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function perguntarIA(consulta, usuarioId, fornecedorId = null) {
  // 1. Buscar contexto relevante
  const { resultados } = await buscaHibrida(consulta, usuarioId, 5);

  if (resultados.length === 0) {
    return {
      resposta: 'Não encontrei nenhum fornecedor com informações relevantes para essa consulta. Tente adicionar catálogos de fornecedores primeiro.',
      fontes: []
    };
  }

  // 2. Filtrar por fornecedor específico se solicitado
  const fontes = fornecedorId
    ? resultados.filter(r => r.fornecedor_id === parseInt(fornecedorId))
    : resultados;

  // 3. Montar contexto para o prompt
  const contexto = fontes.map(f =>
    `--- Fornecedor: ${f.nome} ---\n${f.trecho}`
  ).join('\n\n');

  const prompt = `Você é um assistente especializado em licitações e compras públicas do Brasil.
Analise os catálogos de fornecedores abaixo e responda a pergunta do usuário de forma objetiva e útil.
Se não encontrar a informação, diga claramente que não está no catálogo.
Responda sempre em português brasileiro.

CATÁLOGOS DOS FORNECEDORES:
${contexto}

PERGUNTA: ${consulta}

RESPOSTA:`;

  // 4. Chamar OpenRouter
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://licitafacil.vercel.app',
        'X-Title': 'LicitaFácil'
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const resposta = data.choices?.[0]?.message?.content?.trim() || 'Não foi possível gerar uma resposta.';

    return {
      resposta,
      fontes: fontes.map(f => ({
        fornecedor_id: f.fornecedor_id,
        nome: f.nome,
        score: f.score
      })),
      tokens: data.usage
    };

  } catch (err) {
    console.error('Erro ao chamar OpenRouter:', err.message);
    // Fallback: retornar resumo dos resultados sem IA
    const resumo = fontes.slice(0, 3).map(f =>
      `**${f.nome}**: ${f.trecho.substring(0, 200)}...`
    ).join('\n\n');

    return {
      resposta: `Encontrei os seguintes fornecedores relacionados:\n\n${resumo}`,
      fontes: fontes.map(f => ({ fornecedor_id: f.fornecedor_id, nome: f.nome, score: f.score })),
      fallback: true
    };
  }
}

module.exports = { perguntarIA };
