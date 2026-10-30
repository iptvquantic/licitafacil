// src/services/ai.service.js — IA via OpenRouter: escolhe sozinha os modelos gratuitos vivos (texto e leitura de imagem)
'use strict';
const { buscar } = require('./busca.service');
const extrator = require('./extrator.service');

const BASE_OPENROUTER = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const URL_CHAT = BASE_OPENROUTER + '/chat/completions';
const URL_MODELOS = BASE_OPENROUTER + '/models';
const URL_CHAVE = BASE_OPENROUTER + '/key';
const SEIS_HORAS = 6 * 3600 * 1000;
const NA_VERCEL = !!process.env.VERCEL;

// Famílias preferidas por tarefa: as que estiverem gratuitas no momento sobem na fila
const PREFERIDOS = {
  texto: ['gemma-4-31b', 'nemotron-3-ultra', 'nemotron-3.5-super', 'gemma-4-26b', 'inkling', 'dots-3', 'deepseek', 'llama-4',
    'llama-3.3-70b', 'qwen3', 'gpt-oss', 'glm', 'kimi', 'mistral', 'xing', 'flint', 'laguna-s', 'nemotron-3.5-lightning', 'openrouter/free'],
  visao: ['gemma-4-31b', 'nemotron-3.5-super-vl', 'gemma-4-26b', 'dots-3', 'inkling', 'qwen', 'llama-4', 'mistral-small',
    'nemotron-3-nano-omni', 'openrouter/free']
};
// Não servem para texto/JSON: música, moderação, embeddings, voz, geração de imagem
const RE_EXCLUIR = /lyria|safety|guard|embed|tts|whisper|moderation|transcri|flux|sdxl|veo|image-gen|imagen/i;

const estado = {
  modelos: [],
  modelosEm: 0,
  bom: { texto: null, visao: null },
  pausa: {},             // modelo → horário até quando não tentar de novo
  ultimoSucesso: null,
  ultimoErro: null,
  ultimoErroEm: null,
  cota: null,
  cotaEm: 0
};

function configurada() { return !!process.env.OPENROUTER_API_KEY; }

function erroIA(msg, code) { const e = new Error(msg); e.code = code || 'INDISPONIVEL'; return e; }

function pontuarModelo(m, tarefa) {
  const id = m.id.toLowerCase();
  let p = 0;
  PREFERIDOS[tarefa].forEach(function (k, i) { if (id.indexOf(k) >= 0) p = Math.max(p, 100 - i * 5); });
  if (m.contexto >= 64000) p += 6;
  if (m.contexto >= 200000) p += 3;
  if (m.params.indexOf('response_format') >= 0 || m.params.indexOf('structured_outputs') >= 0) p += 4;
  if (/preview|beta|code|nano|mini|lfm|2\.6b|small:free$/.test(id)) p -= 8;
  return p;
}

async function listarModelos() {
  if (estado.modelos.length && Date.now() - estado.modelosEm < SEIS_HORAS) return estado.modelos;
  try {
    const r = await fetch(URL_MODELOS, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    estado.modelos = (j.data || []).filter(function (m) {
      if (!m || !m.id || !m.pricing) return false;
      if (Number(m.pricing.prompt) !== 0 || Number(m.pricing.completion) !== 0) return false;
      const saida = m.architecture && m.architecture.output_modalities;
      if (Array.isArray(saida) && saida.indexOf('text') < 0) return false;
      return !RE_EXCLUIR.test(m.id);
    }).map(function (m) {
      const entrada = (m.architecture && m.architecture.input_modalities) || [];
      return {
        id: m.id,
        contexto: m.context_length || 0,
        imagem: entrada.indexOf('image') >= 0,
        params: m.supported_parameters || []
      };
    });
    estado.modelosEm = Date.now();
  } catch (err) {
    estado.modelosEm = Date.now() - SEIS_HORAS + 10 * 60 * 1000; // tenta de novo em 10 min
    console.warn('[ia] não consegui listar modelos: ' + err.message);
  }
  return estado.modelos;
}

function infoModelo(id) {
  for (let i = 0; i < estado.modelos.length; i++) if (estado.modelos[i].id === id) return estado.modelos[i];
  return null;
}

async function candidatos(tarefa, max, evitar) {
  evitar = evitar || [];
  const lista = [];
  const fixo = tarefa === 'visao' ? process.env.OPENROUTER_MODEL_VISAO : process.env.OPENROUTER_MODEL;
  if (fixo) lista.push(fixo);
  if (estado.bom[tarefa]) lista.push(estado.bom[tarefa]);
  const modelos = (await listarModelos()).filter(function (m) { return tarefa !== 'visao' || m.imagem; });
  modelos.slice().sort(function (a, b) { return pontuarModelo(b, tarefa) - pontuarModelo(a, tarefa); })
    .forEach(function (m) { lista.push(m.id); });
  if (!lista.length) lista.push('openrouter/free');
  const unicos = lista.filter(function (id, i) { return lista.indexOf(id) === i && evitar.indexOf(id) < 0; });
  const agora = Date.now();
  const livres = unicos.filter(function (id) { return !(estado.pausa[id] > agora); });
  return (livres.length ? livres : unicos).slice(0, max || 4);
}

function pausar(modelo, minutos) { estado.pausa[modelo] = Date.now() + minutos * 60000; }

function textoDaResposta(j) {
  const msg = j && j.choices && j.choices[0] && j.choices[0].message;
  if (!msg) return '';
  let c = msg.content;
  if (Array.isArray(c)) c = c.map(function (p) { return (p && (p.text || p.content)) || ''; }).join('');
  return String(c || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Chama a IA tentando vários modelos gratuitos até um responder (e passar na validação, quando houver)
async function chamarIA(mensagens, opcoes) {
  opcoes = opcoes || {};
  if (!configurada()) throw erroIA('IA não configurada (OPENROUTER_API_KEY ausente)', 'SEM_CHAVE');
  const tarefa = opcoes.tarefa === 'visao' ? 'visao' : 'texto';
  const lista = await candidatos(tarefa, opcoes.tentativas || (NA_VERCEL ? 3 : 4), opcoes.evitar);
  const prazo = Date.now() + (opcoes.prazoMs || (NA_VERCEL ? 50000 : 150000));
  let ultimo = 'sem resposta';
  const tentados = [];
  for (const modelo of lista) {
    const resta = prazo - Date.now();
    if (resta < 4000) { ultimo = ultimo + ' (tempo esgotado)'; break; }
    tentados.push(modelo);
    const info = infoModelo(modelo);
    const params = info ? info.params : [];
    const corpo = {
      model: modelo,
      messages: mensagens,
      max_tokens: opcoes.maxTokens || 900,
      temperature: opcoes.temperatura == null ? 0.2 : opcoes.temperatura
    };
    if (params.indexOf('reasoning') >= 0) corpo.reasoning = { effort: 'low', exclude: true };
    if (opcoes.json && (params.indexOf('response_format') >= 0 || params.indexOf('structured_outputs') >= 0)) corpo.response_format = { type: 'json_object' };
    const inicio = Date.now();
    try {
      const r = await fetch(URL_CHAT, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app',
          'X-Title': 'LicitaFacil'
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(Math.min(opcoes.timeoutMs || (NA_VERCEL ? 45000 : 90000), resta))
      });
      if (r.status === 401 || r.status === 403) {
        ultimo = 'chave do OpenRouter recusada (' + r.status + ')';
        estado.ultimoErro = ultimo;
        estado.ultimoErroEm = new Date().toISOString();
        throw erroIA('IA indisponível: ' + ultimo, 'CHAVE');
      }
      if (r.status === 429) {
        const corpoErro = await r.text().catch(function () { return ''; });
        if (/per-day|per day|daily/i.test(corpoErro)) {
          estado.cota = { restante: 0, limite: estado.cota && estado.cota.limite, em: new Date().toISOString() };
          estado.cotaEm = Date.now();
          ultimo = 'limite diário da IA gratuita atingido';
          estado.ultimoErro = ultimo;
          estado.ultimoErroEm = new Date().toISOString();
          throw erroIA('IA indisponível: ' + ultimo, 'COTA');
        }
        ultimo = modelo + ' ocupado (429)';
        pausar(modelo, 2);
        continue;
      }
      if (!r.ok) {
        ultimo = modelo + ' respondeu ' + r.status;
        pausar(modelo, r.status >= 500 ? 5 : 15);
        if (estado.bom[tarefa] === modelo) estado.bom[tarefa] = null;
        continue;
      }
      const j = await r.json();
      const texto = textoDaResposta(j);
      if (!texto) {
        const motivo = j && j.choices && j.choices[0] && j.choices[0].finish_reason;
        ultimo = modelo + ' respondeu vazio' + (motivo ? ' (' + motivo + ')' : '');
        pausar(modelo, 10);
        if (estado.bom[tarefa] === modelo) estado.bom[tarefa] = null;
        continue;
      }
      let valor = texto;
      if (opcoes.validar) {
        try { valor = opcoes.validar(texto); } catch (errV) {
          ultimo = modelo + ': ' + errV.message;
          pausar(modelo, 5);
          if (estado.bom[tarefa] === modelo) estado.bom[tarefa] = null;
          continue;
        }
      }
      estado.bom[tarefa] = modelo;
      estado.ultimoSucesso = new Date().toISOString();
      if (estado.cota && estado.cota.restante > 0) estado.cota.restante--;
      return { texto: texto, valor: valor, modelo: modelo, ms: Date.now() - inicio, tentados: tentados };
    } catch (err) {
      if (err.code === 'CHAVE' || err.code === 'COTA') throw err;
      ultimo = modelo + ': ' + (err.name === 'TimeoutError' ? 'tempo esgotado' : err.message);
      pausar(modelo, err.name === 'TimeoutError' ? 3 : 5);
    }
  }
  estado.ultimoErro = ultimo;
  estado.ultimoErroEm = new Date().toISOString();
  const e = erroIA('IA indisponível: ' + ultimo, 'INDISPONIVEL');
  e.tentados = tentados;
  throw e;
}

// Quantas leituras gratuitas ainda restam hoje (OpenRouter: 50/dia sem créditos comprados; 1000/dia com)
async function statusCota(forcar) {
  if (!configurada()) return null;
  if (!forcar && estado.cotaEm && Date.now() - estado.cotaEm < 60000) return estado.cota;
  try {
    const r = await fetch(URL_CHAVE, { headers: { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('status ' + r.status);
    const j = await r.json();
    const d = (j && j.data) || {};
    const diario = d.free_model_daily_requests || null;
    estado.cota = {
      restante: diario && diario.remaining != null ? Number(diario.remaining) : null,
      limite: diario && diario.limit != null ? Number(diario.limit) : null,
      usado: diario && diario.used != null ? Number(diario.used) : null,
      gratis: d.is_free_tier != null ? !!d.is_free_tier : null,
      em: new Date().toISOString()
    };
    estado.cotaEm = Date.now();
  } catch (err) {
    estado.cotaEm = Date.now();
    console.warn('[ia] não consegui ler a cota: ' + err.message);
  }
  return estado.cota;
}

async function capacidades() {
  if (!configurada()) return { ia: false, visao: false, cota: null };
  const modelos = await listarModelos();
  const cota = await statusCota();
  return {
    ia: true,
    visao: modelos.some(function (m) { return m.imagem; }) || !modelos.length,
    modelos_texto: modelos.length,
    modelos_visao: modelos.filter(function (m) { return m.imagem; }).length,
    cota: cota
  };
}

function estadoIA() {
  return {
    configurada: configurada(),
    modelo_atual: estado.bom.texto || process.env.OPENROUTER_MODEL || null,
    modelo_visao: estado.bom.visao || process.env.OPENROUTER_MODEL_VISAO || null,
    modelos_gratis_conhecidos: estado.modelos.length,
    modelos_visao: estado.modelos.filter(function (m) { return m.imagem; }).length,
    ultimo_sucesso: estado.ultimoSucesso,
    ultimo_erro: estado.ultimoErro,
    ultimo_erro_em: estado.ultimoErroEm,
    cota: estado.cota
  };
}

async function testarIA() {
  const r = await chamarIA([{ role: 'user', content: 'Responda apenas com a palavra OK.' }],
    { maxTokens: 400, tentativas: 3, timeoutMs: 30000, prazoMs: 50000 });
  return { ok: true, modelo: r.modelo, resposta: r.texto.slice(0, 40), ms: r.ms };
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
  if (r.fornecedores.length) {
    const linhasF = r.fornecedores.slice(0, 4).map(function (f, i) {
      const contato = contatoTexto(f);
      return (i + 1) + '. ' + f.nome + (contato ? ' — ' + contato : '') + (f.trecho ? '\n   “' + f.trecho.replace(/\s*\n\s*/g, ' · ').slice(0, 220) + '”' : '');
    });
    return 'Encontrei citações de "' + consulta + '" nos catálogos destes fornecedores:\n\n' + linhasF.join('\n');
  }
  const rel = (r.fornecedores_relacionados || []).slice(0, 5).map(function (f, i) {
    const contato = contatoTexto(f);
    return (i + 1) + '. ' + f.nome + (f.observacoes ? ' (' + f.observacoes.slice(0, 80) + ')' : '') + (contato ? ' — ' + contato : '');
  });
  return 'Nenhum catálogo cadastrado cita "' + consulta + '", mas estes fornecedores trabalham com isso:\n\n' + rel.join('\n') +
    '\n\nAdicione o catálogo deles para ver produtos, medidas e preços.';
}

async function perguntarIA(consulta, usuarioId, fornecedorId) {
  const r = await buscar(consulta, usuarioId, { limiteProdutos: 12, limiteFornecedores: 6, fornecedorId: fornecedorId });
  const relacionados = r.fornecedores_relacionados || [];
  const fontes = r.fornecedores.map(function (f) { return { fornecedor_id: f.fornecedor_id, nome: f.nome, score: f.score }; })
    .concat(relacionados.filter(function (f) { return !r.fornecedores.some(function (x) { return x.fornecedor_id === f.id; }); })
      .map(function (f) { return { fornecedor_id: f.id, nome: f.nome, score: f.score }; }));
  if (!r.produtos.length && !r.fornecedores.length && !relacionados.length) {
    return {
      resposta: 'Não encontrei "' + consulta + '" nos catálogos nem nos fornecedores cadastrados. Tente outro termo (ex.: só a medida ou a norma) ou adicione o catálogo do fornecedor.',
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
  relacionados.slice(0, 5).forEach(function (f) {
    contexto.push('- Fornecedor cadastrado que trabalha com o tema: ' + f.nome + (f.observacoes ? ' — ' + f.observacoes.slice(0, 160) : '') +
      (contatoTexto(f) ? ' (' + contatoTexto(f) + ')' : '') + (f.total_catalogos ? '' : ' [ainda sem catálogo no sistema]'));
  });
  const sistema = 'Você é o assistente de compras e licitações do LicitaFácil. Responda em português do Brasil, direto e curto (até 10 linhas). ' +
    'Use SOMENTE os dados fornecidos; nunca invente produto, preço, norma ou contato. Cite o fornecedor e o contato de cada item recomendado. ' +
    'Se a informação pedida não estiver nos dados, diga exatamente o que falta. Não use tabelas nem markdown.';
  const usuario = 'Pergunta: ' + consulta + '\n\nDados encontrados:\n' + contexto.join('\n');
  try {
    const ia = await chamarIA([{ role: 'system', content: sistema }, { role: 'user', content: usuario }], { maxTokens: 1200 });
    return { resposta: ia.texto, modelo: ia.modelo, fontes: fontes, produtos: r.produtos.slice(0, 6), fallback: false };
  } catch (err) {
    console.warn('[ia] resposta automática sem IA: ' + err.message);
    return { resposta: respostaSemIA(consulta, r), fontes: fontes, produtos: r.produtos.slice(0, 6), fallback: true };
  }
}

// ─── Extração de catálogos ──────────────────────────────────────────────────
const FORMATO_JSON = '{"fornecedor":{"nome":"","cnpj":"","telefone":"","whatsapp":"","email":"","site":"","endereco":"","especialidade":""},' +
  '"produtos":[{"nome":"","codigo":"","marca":"","categoria":"","descricao":"","bitola":"","tensao":"","material":"","isolamento":"",' +
  '"cobertura":"","temperatura":"","aplicacao":"","norma":"","certificacoes":"","preco":"","unidade":"","atributos":{}}],"resumo_pagina":""}';

const REGRAS = [
  'Regras:',
  '1. Liste TODOS os produtos. Em tabelas, CADA LINHA é um produto separado (cada medida, seção, cor, capacidade ou tamanho).',
  '2. "nome": nome completo do produto + a variação da linha. Ex.: "Cabo Flexível 750V 2,5 mm²", "Disjuntor DIN Curva C 20A", "Luva Isolante Classe 2 Tam. 10".',
  '3. Informações que valem para a tabela ou família inteira (tensão, temperatura, norma, material, isolação, cobertura, aplicação, marca) vão em TODOS os produtos dela.',
  '4. Colunas sem campo próprio (diâmetro externo, espessura, peso, embalagem, cores disponíveis, corrente, resistência, código de cor etc.) vão em "atributos", com o nome da coluna e a unidade. Ex.: {"Diâmetro externo (mm)":"3,4","Peso (kg/100 m)":"3,1","Embalagem":"rolo 100 m","Cores":"preto, azul, verde"}.',
  '5. Copie números, medidas, códigos, normas e preços EXATAMENTE como impressos (vírgula decimal, mm², kV, NBR). Nunca invente; campo sem informação fica "".',
  '6. "fornecedor": só o que estiver escrito (nome/logo da empresa, CNPJ, telefones, WhatsApp, e-mail, site, endereço) e, em "especialidade", 1 frase do que a empresa vende.',
  '7. Sem produtos (capa, apresentação, índice): "produtos": [] e "resumo_pagina" com 1 frase.',
  '8. Não repita produtos. Responda SOMENTE o JSON, sem markdown e sem comentários.'
].join('\n');

const PROMPT_VISAO = 'Você extrai dados de catálogos técnicos de fornecedores brasileiros (materiais elétricos, fios e cabos, EPI, ferramentas, hidráulica, construção, informática e outros). ' +
  'Você recebe a IMAGEM de uma página do catálogo e, às vezes, o texto já lido dela (pode ter erros de leitura: confie na imagem).\n\n' +
  'Devolva SOMENTE um objeto JSON válido neste formato:\n' + FORMATO_JSON + '\n\n' + REGRAS;

const PROMPT_TEXTO = 'Você extrai dados de catálogos técnicos de fornecedores brasileiros. Você recebe o TEXTO de uma parte do catálogo ' +
  '(lido por OCR ou copiado do PDF: pode ter erros de leitura e colunas de tabelas misturadas; reconstrua as tabelas com cuidado e não invente).\n\n' +
  'Devolva SOMENTE um objeto JSON válido neste formato:\n' + FORMATO_JSON + '\n\n' + REGRAS;

function validarExtracao(texto) {
  const r = extrator.normalizarResultadoIA(texto);
  if (!r) throw new Error('resposta fora do formato JSON');
  return r;
}

// Uma página (imagem JPEG/PNG em data URL) → { fornecedor, produtos, resumo, modelo }
async function extrairPagina(opcoes) {
  const partes = [];
  let instrucao = 'Página ' + (opcoes.pagina || 1) + (opcoes.total ? ' de ' + opcoes.total : '') + ' do catálogo' +
    (opcoes.nomeArquivo ? ' "' + String(opcoes.nomeArquivo).slice(0, 120) + '"' : '') + '.';
  if (opcoes.contexto) instrucao += '\nContexto da página anterior (família/tabela que pode continuar nesta página): ' + String(opcoes.contexto).slice(0, 400);
  const textoPagina = String(opcoes.texto || '').trim();
  if (textoPagina) instrucao += '\n\nTexto já lido desta página (use para conferir códigos e números):\n' + textoPagina.slice(0, 12000);
  partes.push({ type: 'text', text: instrucao });
  partes.push({ type: 'image_url', image_url: { url: opcoes.imagem } });
  const r = await chamarIA([{ role: 'system', content: PROMPT_VISAO }, { role: 'user', content: partes }], {
    tarefa: 'visao', json: true, maxTokens: 8192, temperatura: 0, validar: validarExtracao,
    timeoutMs: NA_VERCEL ? 48000 : 120000, prazoMs: NA_VERCEL ? 54000 : 180000, tentativas: 3, evitar: opcoes.evitar
  });
  return Object.assign({ modelo: r.modelo, ms: r.ms }, r.valor);
}

// Um bloco de texto do catálogo → { fornecedor, produtos, resumo, modelo }
async function estruturarTexto(texto, opcoes) {
  opcoes = opcoes || {};
  const r = await chamarIA([
    { role: 'system', content: PROMPT_TEXTO },
    { role: 'user', content: (opcoes.contexto ? 'Contexto do trecho anterior: ' + String(opcoes.contexto).slice(0, 300) + '\n\n' : '') + String(texto || '').slice(0, 16000) }
  ], {
    tarefa: 'texto', json: true, maxTokens: 8192, temperatura: 0, validar: validarExtracao,
    timeoutMs: NA_VERCEL ? 48000 : 120000, prazoMs: NA_VERCEL ? 54000 : 180000, tentativas: 3, evitar: opcoes.evitar
  });
  return Object.assign({ modelo: r.modelo, ms: r.ms }, r.valor);
}

// Compatibilidade com a fila antiga (Render): estrutura o texto inteiro em blocos e devolve no formato do Prompt Mestre
async function estruturarComIA(texto, aoProgredir) {
  const maxBlocos = parseInt(process.env.IA_MAX_BLOCOS || (NA_VERCEL ? '1' : '12'), 10);
  const blocos = extrator.dividirBlocos(texto, 6000).slice(0, maxBlocos);
  const listas = [];
  const fornecedores = [];
  let modelo = null;
  let falhas = 0;
  let ultimoErro = null;
  for (let i = 0; i < blocos.length; i++) {
    if (aoProgredir) await aoProgredir(i + 1, blocos.length);
    try {
      const r = await estruturarTexto(blocos[i]);
      modelo = r.modelo;
      listas.push(r.produtos);
      if (r.fornecedor) fornecedores.push(r.fornecedor);
    } catch (err) {
      falhas++;
      ultimoErro = err;
      if (i === 0 || err.code === 'COTA' || err.code === 'CHAVE') throw err;
    }
  }
  if (falhas === blocos.length && ultimoErro) throw ultimoErro;
  return { produtos: extrator.mesclarProdutos(listas), fornecedor: extrator.mesclarFornecedores(fornecedores), modelo: modelo, blocos: blocos.length, falhas: falhas };
}

module.exports = {
  perguntarIA, chamarIA, estruturarComIA, estruturarTexto, extrairPagina, estadoIA, testarIA, configurada, capacidades, statusCota
};
