// src/services/ai.service.js — IA via OpenRouter com escolha automática de modelo gratuito vivo
'use strict';
const { buscar } = require('./busca.service');

const BASE_OPENROUTER = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const URL_CHAT = BASE_OPENROUTER + '/chat/completions';
const URL_MODELOS = BASE_OPENROUTER + '/models';
const SEIS_HORAS = 6 * 3600 * 1000;

// famílias preferidas (as que existirem e forem gratuitas no momento sobem na fila)
const PREFERIDOS = ['deepseek-chat', 'deepseek-v3', 'deepseek-r1', 'llama-3.3-70b', 'llama-4', 'qwen3', 'qwen-2.5-72b',
  'gpt-oss', 'gemma-3-27b', 'mistral-small', 'glm-4', 'kimi', 'gemini'];

const estado = {
  modelos: [],
  modelosEm: 0,
  modeloBom: null,
  ultimoSucesso: null,
  ultimoErro: null,
  ultimoErroEm: null
};

function configurada() { return !!process.env.OPENROUTER_API_KEY; }

function pontuarModelo(m) {
  const id = m.id.toLowerCase();
  let p = 0;
  PREFERIDOS.forEach(function (k, i) { if (id.indexOf(k) >= 0) p = Math.max(p, 100 - i * 6); });
  if ((m.context_length || 0) >= 32000) p += 8;
  if ((m.context_length || 0) >= 100000) p += 4;
  if (/:free$/.test(id)) p += 2;
  return p;
}

async function listarModelosGratis() {
  if (estado.modelos.length && Date.now() - estado.modelosEm < SEIS_HORAS) return estado.modelos;
  try {
    const r = await fetch(URL_MODELOS, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const lista = (j.data || []).filter(function (m) {
      if (!m || !m.id || !m.pricing) return false;
      if (Number(m.pricing.prompt) !== 0 || Number(m.pricing.completion) !== 0) return false;
      const saida = m.architecture && m.architecture.output_modalities;
      if (Array.isArray(saida) && saida.indexOf('text') < 0) return false;
      return !/embed|tts|whisper|moderation|guard/i.test(m.id);
    });
    lista.sort(function (a, b) { return pontuarModelo(b) - pontuarModelo(a); });
    estado.modelos = lista.map(function (m) { return m.id; });
    estado.modelosEm = Date.now();
  } catch (err) {
    estado.modelosEm = Date.now() - SEIS_HORAS + 10 * 60 * 1000; // tenta de novo em 10 min
    console.warn('[ia] não consegui listar modelos: ' + err.message);
  }
  return estado.modelos;
}

async function candidatos(max) {
  const lista = [];
  if (process.env.OPENROUTER_MODEL) lista.push(process.env.OPENROUTER_MODEL);
  if (estado.modeloBom) lista.push(estado.modeloBom);
  (await listarModelosGratis()).forEach(function (id) { lista.push(id); });
  if (!lista.length) lista.push('openrouter/auto');
  return lista.filter(function (id, i) { return lista.indexOf(id) === i; }).slice(0, max || 4);
}

// Chama a IA tentando vários modelos gratuitos até um responder
async function chamarIA(mensagens, opcoes) {
  opcoes = opcoes || {};
  if (!configurada()) throw new Error('IA não configurada (OPENROUTER_API_KEY ausente)');
  const lista = await candidatos(opcoes.tentativas || 4);
  let ultimo = 'sem resposta';
  for (const modelo of lista) {
    try {
      const r = await fetch(URL_CHAT, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app',
          'X-Title': 'LicitaFacil'
        },
        body: JSON.stringify({
          model: modelo,
          messages: mensagens,
          max_tokens: opcoes.maxTokens || 900,
          temperature: opcoes.temperatura == null ? 0.2 : opcoes.temperatura
        }),
        signal: AbortSignal.timeout(opcoes.timeoutMs || 40000)
      });
      if (r.status === 401 || r.status === 403) {
        ultimo = 'chave do OpenRouter recusada (' + r.status + ')';
        break; // problema da chave: não adianta trocar de modelo
      }
      if (!r.ok) {
        ultimo = modelo + ' respondeu ' + r.status;
        if (estado.modeloBom === modelo) estado.modeloBom = null;
        continue;
      }
      const j = await r.json();
      const texto = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!texto || !String(texto).trim()) { ultimo = modelo + ' respondeu vazio'; continue; }
      estado.modeloBom = modelo;
      estado.ultimoSucesso = new Date().toISOString();
      return { texto: String(texto).replace(/<think>[\s\S]*?<\/think>/g, '').trim(), modelo: modelo };
    } catch (err) {
      ultimo = modelo + ': ' + (err.name === 'TimeoutError' ? 'tempo esgotado' : err.message);
    }
  }
  estado.ultimoErro = ultimo;
  estado.ultimoErroEm = new Date().toISOString();
  throw new Error('IA indisponível: ' + ultimo);
}

function estadoIA() {
  return {
    configurada: configurada(),
    modelo_atual: estado.modeloBom || process.env.OPENROUTER_MODEL || null,
    modelos_gratis_conhecidos: estado.modelos.length,
    ultimo_sucesso: estado.ultimoSucesso,
    ultimo_erro: estado.ultimoErro,
    ultimo_erro_em: estado.ultimoErroEm
  };
}

async function testarIA() {
  const r = await chamarIA([{ role: 'user', content: 'Responda apenas: OK' }], { maxTokens: 10, tentativas: 3, timeoutMs: 25000 });
  return { ok: true, modelo: r.modelo, resposta: r.texto.slice(0, 40) };
}

// ─── Perguntas sobre os catálogos ───────────────────────────────────────────
function linhaProduto(p) {
  const specs = [];
  if (p.codigo) specs.push('código ' + p.codigo);
  if (p.marca) specs.push('marca ' + p.marca);
  if (p.bitola) specs.push(p.bitola);
  if (p.tensao) specs.push(p.tensao);
  if (p.material) specs.push(p.material);
  if (p.norma) specs.push(p.norma);
  if (p.preco) specs.push('preço ' + p.preco + (p.unidade ? '/' + p.unidade : ''));
  return p.nome + (specs.length ? ' (' + specs.join('; ') + ')' : '');
}

function contatoTexto(f) {
  const c = [];
  if (f.whatsapp) c.push('WhatsApp ' + f.whatsapp);
  if (f.telefone && f.telefone !== f.whatsapp) c.push('tel. ' + f.telefone);
  if (f.email) c.push(f.email);
  return c.join(' · ');
}

function respostaSemIA(consulta, r) {
  if (r.produtos.length) {
    const linhas = r.produtos.slice(0, 6).map(function (p, i) {
      const contato = contatoTexto(p.fornecedor);
      return (i + 1) + '. ' + linhaProduto(p) + '\n   Fornecedor: ' + p.fornecedor.nome + (contato ? ' — ' + contato : '');
    });
    return 'Encontrei ' + r.total_produtos + ' produto(s) para "' + consulta + '":\n\n' + linhas.join('\n');
  }
  const linhasF = r.fornecedores.slice(0, 4).map(function (f, i) {
    const contato = contatoTexto(f);
    return (i + 1) + '. ' + f.nome + (contato ? ' — ' + contato : '') + (f.trecho ? '\n   “' + f.trecho.replace(/\s*\n\s*/g, ' · ').slice(0, 220) + '”' : '');
  });
  return 'Encontrei citações de "' + consulta + '" nos catálogos destes fornecedores:\n\n' + linhasF.join('\n');
}

async function perguntarIA(consulta, usuarioId, fornecedorId) {
  const r = await buscar(consulta, usuarioId, { limiteProdutos: 12, limiteFornecedores: 6, fornecedorId: fornecedorId });
  const fontes = r.fornecedores.map(function (f) { return { fornecedor_id: f.fornecedor_id, nome: f.nome, score: f.score }; });
  if (!r.produtos.length && !r.fornecedores.length) {
    return {
      resposta: 'Não encontrei "' + consulta + '" nos catálogos cadastrados. Tente outro termo (ex.: só a medida ou a norma) ou adicione o catálogo do fornecedor.',
      fontes: [], produtos: [], fallback: false, sem_resultado: true
    };
  }
  const contexto = [];
  r.produtos.slice(0, 12).forEach(function (p) {
    contexto.push('- ' + linhaProduto(p) + ' | Fornecedor: ' + p.fornecedor.nome + (contatoTexto(p.fornecedor) ? ' | Contato: ' + contatoTexto(p.fornecedor) : ''));
  });
  r.fornecedores.filter(function (f) { return f.trecho && !f.produtos_encontrados; }).slice(0, 4).forEach(function (f) {
    contexto.push('- Trecho do catálogo de ' + f.nome + (contatoTexto(f) ? ' (' + contatoTexto(f) + ')' : '') + ': ' + f.trecho.replace(/\s*\n\s*/g, ' · '));
  });
  const sistema = 'Você é o assistente de compras e licitações do LicitaFácil. Responda em português do Brasil, direto e curto (até 10 linhas). ' +
    'Use SOMENTE os dados fornecidos; nunca invente produto, preço, norma ou contato. Cite o fornecedor e o contato de cada item recomendado. ' +
    'Se a informação pedida não estiver nos dados, diga exatamente o que falta. Não use tabelas nem markdown pesado.';
  const usuario = 'Pergunta: ' + consulta + '\n\nDados encontrados nos catálogos:\n' + contexto.join('\n');
  try {
    const ia = await chamarIA([{ role: 'system', content: sistema }, { role: 'user', content: usuario }], { maxTokens: 700 });
    return { resposta: ia.texto, modelo: ia.modelo, fontes: fontes, produtos: r.produtos.slice(0, 6), fallback: false };
  } catch (err) {
    console.warn('[ia] resposta automática sem IA: ' + err.message);
    return { resposta: respostaSemIA(consulta, r), fontes: fontes, produtos: r.produtos.slice(0, 6), fallback: true };
  }
}

// ─── Estruturar catálogo bruto em produtos (saída no formato do Prompt Mestre) ─
const PROMPT_ESTRUTURAR = 'Você extrai produtos de catálogos de fornecedores brasileiros. Leia o trecho e liste TODOS os produtos nele, ' +
  'um bloco por produto (cada variação de medida/tensão/cor é um produto), exatamente neste formato:\n\n' +
  'PRODUTO 1\nNome: ...\nCódigo: ...\nMarca: ...\nCategoria: ...\nDescrição técnica: ...\nMedida/Bitola: ...\nTensão: ...\n' +
  'Material: ...\nNorma: ...\nPreço: ...\nUnidade: ...\n\n' +
  'Regras: nunca invente; se não houver o dado escreva "não informado"; copie medidas, códigos, normas e preços exatamente como no texto; ' +
  'outros atributos técnicos vão em linhas extras "Atributo: valor"; sem markdown, sem comentários. ' +
  'Se o trecho não tiver produtos, responda apenas: SEM PRODUTOS.';

function dividirParaIA(texto, tamanho) {
  const linhas = String(texto || '').split('\n');
  const blocos = [];
  let atual = '';
  linhas.forEach(function (l) {
    if ((atual.length + l.length + 1) > tamanho && atual) { blocos.push(atual); atual = ''; }
    atual += (atual ? '\n' : '') + l;
  });
  if (atual.trim()) blocos.push(atual);
  return blocos;
}

async function estruturarComIA(texto, aoProgredir) {
  const blocos = dividirParaIA(texto, 7000).slice(0, parseInt(process.env.IA_MAX_BLOCOS || '10', 10));
  const saidas = [];
  let modelo = null;
  let falhas = 0;
  let ultimoErro = null;
  for (let i = 0; i < blocos.length; i++) {
    if (aoProgredir) await aoProgredir(i + 1, blocos.length);
    try {
      const r = await chamarIA([
        { role: 'system', content: PROMPT_ESTRUTURAR },
        { role: 'user', content: blocos[i] }
      ], { maxTokens: 3500, timeoutMs: 90000, temperatura: 0 });
      modelo = r.modelo;
      if (!/^\s*SEM PRODUTOS\s*$/i.test(r.texto)) saidas.push(r.texto);
    } catch (err) {
      falhas++;
      ultimoErro = err;
      if (i === 0) throw err; // IA fora do ar logo no início: não insiste
    }
  }
  if (falhas === blocos.length && ultimoErro) throw ultimoErro;
  return { texto: saidas.join('\n\n'), modelo: modelo, blocos: blocos.length, falhas: falhas };
}

module.exports = { perguntarIA, chamarIA, estruturarComIA, estadoIA, testarIA, configurada };
