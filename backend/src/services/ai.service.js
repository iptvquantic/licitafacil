// src/services/ai.service.js — IA: Google Gemini (chave grátis, opcional e preferida) + OpenRouter (modelos gratuitos vivos)
'use strict';
const { buscar } = require('./busca.service');
const extrator = require('./extrator.service');

const BASE_OPENROUTER = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const URL_CHAT = BASE_OPENROUTER + '/chat/completions';
const URL_MODELOS = BASE_OPENROUTER + '/models';
const URL_CHAVE = BASE_OPENROUTER + '/key';
const SEIS_HORAS = 6 * 3600 * 1000;
const NA_VERCEL = !!process.env.VERCEL;

// Google Gemini pela API compatível com OpenAI (chave gratuita do Google AI Studio). Quando existe, vem primeiro:
// lê tabelas de imagem com mais precisão e sem a fila dos modelos gratuitos do OpenRouter.
const BASE_GEMINI = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const PREFIXO_GEMINI = 'gemini:';
function geminiConfigurado() { return !!process.env.GEMINI_API_KEY; }
function openrouterConfigurado() { return !!process.env.OPENROUTER_API_KEY; }
function modelosGemini() {
  const lista = String(process.env.GEMINI_MODELOS || 'gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash-lite')
    .split(',').map(function (m) { return m.trim(); }).filter(Boolean);
  return lista.map(function (m) { return PREFIXO_GEMINI + m; });
}
function ehGemini(modelo) { return String(modelo).indexOf(PREFIXO_GEMINI) === 0; }

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

function configurada() { return openrouterConfigurado() || geminiConfigurado(); }

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
  if (geminiConfigurado() && !(estado.geminiDesligadoAte > Date.now())) modelosGemini().forEach(function (m) { lista.push(m); });
  if (openrouterConfigurado()) {
    const fixo = tarefa === 'visao' ? process.env.OPENROUTER_MODEL_VISAO : process.env.OPENROUTER_MODEL;
    if (fixo) lista.push(fixo);
    if (estado.bom[tarefa] && !ehGemini(estado.bom[tarefa])) lista.push(estado.bom[tarefa]);
    const modelos = (await listarModelos()).filter(function (m) { return tarefa !== 'visao' || m.imagem; });
    modelos.slice().sort(function (a, b) { return pontuarModelo(b, tarefa) - pontuarModelo(a, tarefa); })
      .forEach(function (m) { lista.push(m.id); });
    if (!modelos.length) lista.push('openrouter/free');
  }
  const unicos = lista.filter(function (id, i) { return lista.indexOf(id) === i && evitar.indexOf(id) < 0; });
  const agora = Date.now();
  const livres = unicos.filter(function (id) { return !(estado.pausa[id] > agora); });
  // primeiro os modelos sem pausa; os pausados (erro recente) ficam no fim como última chance
  const pausados = unicos.filter(function (id) { return livres.indexOf(id) < 0; });
  const ordem = livres.concat(pausados);
  // o Gemini (até 2 modelos, só os sem pausa) vem antes e não ocupa as vagas dos modelos do OpenRouter
  const doGemini = livres.filter(ehGemini).slice(0, 2);
  return doGemini.concat(ordem.filter(function (id) { return !ehGemini(id); }).slice(0, max || 4));
}

function pausar(modelo, minutos) { estado.pausa[modelo] = Date.now() + minutos * 60000; }

function textoDaResposta(j) {
  const msg = j && j.choices && j.choices[0] && j.choices[0].message;
  if (!msg) return '';
  let c = msg.content;
  if (Array.isArray(c)) c = c.map(function (p) { return (p && (p.text || p.content)) || ''; }).join('');
  return String(c || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Lê a resposta em streaming (SSE do OpenRouter) guardando tudo o que chegou.
// Para no fim, no prazo (parcial) ou se a IA ficar parada sem mandar nada (travada).
async function lerStream(r, o) {
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let texto = '';
  let motivo = null;
  let erro = null;
  let cortado = null;
  let fim = false;
  // "vivo" = chegou texto da resposta ou do raciocínio do modelo; comentários de "processando" do OpenRouter não contam.
  // Antes do primeiro sinal a espera é maior (fila do modelo gratuito); depois, IA parada por paradoMs = travada.
  const inicioLeitura = Date.now();
  let ultimaAtividade = 0;
  let pendente = null;             // a leitura em andamento continua valendo depois de uma espera sem dados
  while (!fim) {
    const agora = Date.now();
    const resta = o.prazoEm - agora;
    if (resta <= 0) { cortado = 'prazo'; break; }
    const semConteudo = ultimaAtividade ? o.paradoMs - (agora - ultimaAtividade) : (o.primeiroMs || o.paradoMs) - (agora - inicioLeitura);
    if (semConteudo <= 0) { cortado = ultimaAtividade ? 'parado' : 'sem_resposta'; break; }
    let timer = null;
    const espera = new Promise(function (ok) { timer = setTimeout(function () { ok({ tempo: true }); }, Math.min(resta, semConteudo)); });
    let pedaco;
    if (!pendente) pendente = leitor.read().catch(function (e) { return { falha: e }; });
    try {
      pedaco = await Promise.race([pendente, espera]);
    } finally { clearTimeout(timer); }
    if (pedaco.tempo) continue;
    pendente = null;
    if (pedaco.falha) { erro = pedaco.falha; break; }
    if (pedaco.done) break;
    buf += dec.decode(pedaco.value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const linha = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!linha || linha.charAt(0) === ':' || linha.indexOf('data:') !== 0) continue; // comentários e "processando"
      const dado = linha.slice(5).trim();
      if (dado === '[DONE]') { fim = true; break; }
      let j;
      try { j = JSON.parse(dado); } catch (e) { continue; }
      if (j.error) {
        erro = new Error((j.error && j.error.message) || 'erro no meio da resposta');
        erro.status = j.error && j.error.code;
        fim = true;
        break;
      }
      const c = j.choices && j.choices[0];
      if (!c) continue;
      const d = c.delta || c.message || {};
      let novo = '';
      if (typeof d.content === 'string') novo = d.content;
      else if (Array.isArray(d.content)) novo = d.content.map(function (p) { return (p && (p.text || p.content)) || ''; }).join('');
      if (novo) { texto += novo; ultimaAtividade = Date.now(); }
      else if (d.reasoning || d.reasoning_content || (Array.isArray(d.reasoning_details) && d.reasoning_details.length)) ultimaAtividade = Date.now();
      if (c.finish_reason) motivo = c.finish_reason;
    }
  }
  try { await leitor.cancel(); } catch (e) { /* conexão já fechada */ }
  try { o.controle.abort(); } catch (e) { /* idem */ }
  return { texto: texto.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), motivo: motivo, cortado: cortado, erro: erro };
}

function pausarSeFalhou(modelo, tarefa, minutos) {
  pausar(modelo, minutos);
  if (estado.bom[tarefa] === modelo) estado.bom[tarefa] = null;
}

// Chama a IA tentando vários modelos até um responder (e passar na validação, quando houver): Gemini primeiro (se houver chave),
// depois os gratuitos do OpenRouter. opcoes.stream: lê em streaming e, se o prazo acabar no meio, devolve o que já chegou ("parcial").
// O motivo de cada tentativa fica em e.motivos (aparece no Painel do dono e ajuda a entender falhas).
async function chamarIA(mensagens, opcoes) {
  opcoes = opcoes || {};
  if (!configurada()) throw erroIA('IA não configurada (OPENROUTER_API_KEY ou GEMINI_API_KEY ausente)', 'SEM_CHAVE');
  const tarefa = opcoes.tarefa === 'visao' ? 'visao' : 'texto';
  const lista = await candidatos(tarefa, opcoes.tentativas || (NA_VERCEL ? 3 : 4), opcoes.evitar);
  const prazo = Date.now() + (opcoes.prazoMs || (NA_VERCEL ? 50000 : 150000));
  let ultimo = 'sem resposta';
  const tentados = [];
  const motivos = [];
  function falhou(modelo, motivo) { ultimo = modelo + ': ' + motivo; motivos.push(nomeCurto(modelo) + ': ' + motivo); }
  for (const modelo of lista) {
    const resta = prazo - Date.now();
    if (resta < 8000) { motivos.push('tempo da leitura esgotado'); ultimo = ultimo + ' (tempo esgotado)'; break; }
    const gemini = ehGemini(modelo);
    if (gemini && estado.geminiDesligadoAte > Date.now()) continue; // a chave foi recusada nesta mesma leitura
    tentados.push(modelo);
    const info = gemini ? null : infoModelo(modelo);
    const params = info ? info.params : [];
    const corpo = {
      model: gemini ? modelo.slice(PREFIXO_GEMINI.length) : modelo,
      messages: mensagens,
      max_tokens: opcoes.maxTokens || 900,
      temperature: opcoes.temperatura == null ? 0.2 : opcoes.temperatura
    };
    if (opcoes.stream) corpo.stream = true;
    // em streaming o raciocínio também vem (separado do texto): mostra que o modelo está vivo enquanto pensa
    if (params.indexOf('reasoning') >= 0) corpo.reasoning = opcoes.stream ? { effort: 'low' } : { effort: 'low', exclude: true };
    if (opcoes.json && (params.indexOf('response_format') >= 0 || params.indexOf('structured_outputs') >= 0)) corpo.response_format = { type: 'json_object' };
    const inicio = Date.now();
    const controle = new AbortController();
    const limite = opcoes.stream ? resta : Math.min(opcoes.timeoutMs || (NA_VERCEL ? 45000 : 90000), resta);
    const timer = setTimeout(function () { controle.abort(); }, limite);
    try {
      const cabecalhos = gemini
        ? { 'Authorization': 'Bearer ' + process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' }
        : { 'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app', 'X-Title': 'LicitaFacil' };
      const r = await fetch(gemini ? BASE_GEMINI + '/chat/completions' : URL_CHAT, {
        method: 'POST', headers: cabecalhos, body: JSON.stringify(corpo), signal: controle.signal
      });
      if (gemini && (r.status === 401 || r.status === 403 || (r.status === 400 && /api[_ ]?key/i.test(await r.clone().text().catch(function () { return ''; }))))) {
        // chave do Gemini recusada: segue só com o OpenRouter por 10 minutos (sem derrubar a leitura)
        estado.geminiDesligadoAte = Date.now() + 10 * 60000;
        estado.geminiErro = 'chave do Gemini recusada (' + r.status + ')';
        falhou(modelo, estado.geminiErro);
        continue;
      }
      if (!gemini && (r.status === 401 || r.status === 403)) {
        ultimo = 'chave do OpenRouter recusada (' + r.status + ')';
        motivos.push(ultimo);
        estado.ultimoErro = ultimo;
        estado.ultimoErroEm = new Date().toISOString();
        const eChave = erroIA('IA indisponível: ' + ultimo, 'CHAVE');
        eChave.motivos = motivos;
        throw eChave;
      }
      if (r.status === 429) {
        const corpoErro = await r.text().catch(function () { return ''; });
        const diario = /per-day|per day|perday|daily|requests per day|RPD/i.test(corpoErro);
        if (gemini) {
          // limite do Gemini: por minuto (espera 1 min) ou do dia (deixa esse modelo de lado por 3 h)
          pausar(modelo, diario ? 180 : 1);
          if (diario) estado.geminiErro = 'limite diário do Gemini atingido (' + nomeCurto(modelo) + ')';
          falhou(modelo, diario ? 'limite diário atingido' : 'limite por minuto (429)');
          continue;
        }
        if (diario) {
          estado.cota = { restante: 0, limite: estado.cota && estado.cota.limite, em: new Date().toISOString() };
          estado.cotaEm = Date.now();
          ultimo = 'limite diário da IA gratuita atingido';
          motivos.push(ultimo);
          estado.ultimoErro = ultimo;
          estado.ultimoErroEm = new Date().toISOString();
          const eCota = erroIA('IA indisponível: ' + ultimo, 'COTA');
          eCota.motivos = motivos;
          throw eCota;
        }
        falhou(modelo, 'ocupado (429)');
        pausar(modelo, 2);
        continue;
      }
      if (!r.ok) {
        falhou(modelo, 'respondeu ' + r.status);
        pausarSeFalhou(modelo, tarefa, r.status >= 500 ? 5 : 15);
        continue;
      }
      let texto;
      let motivoFim;
      if (opcoes.stream) {
        const lido = await lerStream(r, { controle: controle, prazoEm: prazo - 3000, paradoMs: opcoes.paradoMs || 90000, primeiroMs: opcoes.primeiroMs });
        texto = lido.texto;
        motivoFim = lido.cortado ? 'parcial' : lido.motivo;
        if (lido.erro && !texto) {
          falhou(modelo, lido.erro.message);
          pausarSeFalhou(modelo, tarefa, 5);
          continue;
        }
        if (!texto && lido.cortado) {
          falhou(modelo, lido.cortado === 'sem_resposta' ? 'não começou a responder (fila do modelo gratuito)' : 'parou de responder');
          pausarSeFalhou(modelo, tarefa, 5);
          continue;
        }
        if (lido.erro) motivoFim = 'parcial';
      } else {
        const j = await r.json();
        texto = textoDaResposta(j);
        motivoFim = j && j.choices && j.choices[0] && j.choices[0].finish_reason;
      }
      if (!texto) {
        falhou(modelo, 'respondeu vazio' + (motivoFim ? ' (' + motivoFim + ')' : ''));
        pausarSeFalhou(modelo, tarefa, 10);
        continue;
      }
      let valor = texto;
      if (opcoes.validar) {
        try { valor = opcoes.validar(texto); } catch (errV) {
          falhou(modelo, errV.message + (motivoFim === 'parcial' ? ' (resposta incompleta no prazo)' : ''));
          pausarSeFalhou(modelo, tarefa, motivoFim === 'parcial' ? 3 : 5);
          continue;
        }
      }
      estado.bom[tarefa] = modelo;
      estado.ultimoSucesso = new Date().toISOString();
      if (gemini) { estado.geminiOk = estado.ultimoSucesso; estado.geminiErro = null; }
      else if (estado.cota && estado.cota.restante > 0) estado.cota.restante--;
      // motivo "length" (limite de tokens) ou "parcial" (prazo): a resposta veio cortada (página com muitos produtos)
      return { texto: texto, valor: valor, modelo: modelo, ms: Date.now() - inicio, tentados: tentados, motivo: motivoFim || null, motivos: motivos };
    } catch (err) {
      if (err.code === 'CHAVE' || err.code === 'COTA') throw err;
      falhou(modelo, err.name === 'AbortError' || err.name === 'TimeoutError' ? 'tempo esgotado' : err.message);
      pausarSeFalhou(modelo, tarefa, err.name === 'AbortError' || err.name === 'TimeoutError' ? 3 : 5);
    } finally {
      clearTimeout(timer);
    }
  }
  estado.ultimoErro = ultimo;
  estado.ultimoErroEm = new Date().toISOString();
  estado.ultimosMotivos = motivos.slice(-8);
  const e = erroIA('IA indisponível: ' + ultimo, 'INDISPONIVEL');
  e.tentados = tentados;
  e.motivos = motivos;
  throw e;
}

// Nome curto para mensagens: "google/gemma-4-31b-it:free" → "gemma-4-31b-it"; "gemini:gemini-flash-latest" → "Gemini gemini-flash-latest"
function nomeCurto(modelo) {
  if (ehGemini(modelo)) return 'Gemini ' + modelo.slice(PREFIXO_GEMINI.length);
  return String(modelo).replace(/^[^/]+\//, '').replace(/:free$/, '');
}

// Quantas leituras gratuitas ainda restam hoje (OpenRouter: 50/dia sem créditos comprados; 1000/dia com)
async function statusCota(forcar) {
  if (!openrouterConfigurado()) return null;
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

function geminiAtivo() { return geminiConfigurado() && !(estado.geminiDesligadoAte > Date.now()); }

async function capacidades() {
  if (!configurada()) return { ia: false, visao: false, cota: null };
  const modelos = openrouterConfigurado() ? await listarModelos() : [];
  const cota = await statusCota();
  const gemini = geminiAtivo();
  return {
    ia: true,
    provedor: gemini ? 'gemini' : 'openrouter',
    visao: gemini || modelos.some(function (m) { return m.imagem; }) || !modelos.length,
    modelos_texto: modelos.length,
    modelos_visao: modelos.filter(function (m) { return m.imagem; }).length,
    // com o Gemini a leitura não depende da cota diária do OpenRouter (ela vira só reserva)
    cota: gemini ? null : cota,
    cota_openrouter: cota
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
    ultimos_motivos: estado.ultimosMotivos || [],
    cota: estado.cota,
    gemini: { configurado: geminiConfigurado(), ativo: geminiAtivo(), modelos: geminiConfigurado() ? modelosGemini().map(nomeCurto) : [],
      ultimo_sucesso: estado.geminiOk || null, ultimo_erro: estado.geminiErro || null },
    openrouter: { configurado: openrouterConfigurado() }
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
// Formato compacto: cada tabela vem UMA vez (colunas + linhas) e o sistema transforma cada linha em produto.
// Assim a resposta fica 3 a 5 vezes menor que um objeto por produto: mais rápida e sem estourar o limite.
const FORMATO_JSON = '{"fornecedor":{"nome":"","cnpj":"","telefone":"","whatsapp":"","email":"","site":"","endereco":"","especialidade":""},' +
  '"tabelas":[{"produto":"nome da linha/família, ex.: Cabo Flexível 750V","categoria":"","comum":{"marca":"","descricao":"","tensao":"","material":"",' +
  '"isolamento":"","cobertura":"","temperatura":"","aplicacao":"","norma":"","certificacoes":"","unidade":""},' +
  '"colunas":["Seção (mm²)","Diâmetro externo (mm)","Peso (kg/km)"],"linhas":[["1,5","2,9","19"],["2,5","3,4","31"]]}],' +
  '"produtos":[{"nome":"","codigo":"","marca":"","categoria":"","descricao":"","bitola":"","tensao":"","material":"","isolamento":"",' +
  '"cobertura":"","temperatura":"","aplicacao":"","norma":"","certificacoes":"","preco":"","unidade":"","atributos":{}}],"resumo_pagina":""}';

const REGRAS = [
  'Regras:',
  '1. Extraia TODOS os produtos da página, sem pular nenhum. Cada medida, seção, bitola, cor, tamanho, capacidade, corrente ou modelo é um produto.',
  '2. TABELAS vão em "tabelas": "produto" = nome da linha/família (ex.: "Cabo Flexível 750V", "Disjuntor DIN Curva C", "Luva Isolante Classe 2"); "colunas" = TODOS os cabeçalhos da tabela, na ordem, com a unidade (ex.: "Seção (mm²)", "Código", "Corrente (A)", "Preço (R$)"); "linhas" = os valores de CADA linha, na mesma ordem das colunas (use "" quando a célula estiver vazia). A primeira coluna deve ser a que diferencia os produtos (seção, bitola, modelo, tamanho ou código).',
  '3. O que vale para a família inteira (tensão, norma, material, isolação, cobertura, temperatura, aplicação, marca, descrição, unidade) vai UMA vez em "comum".',
  '4. Produtos que NÃO estão em tabela (cartões, fotos com descrição, listas) vão em "produtos", com o "nome" completo + a variação. Colunas/dados sem campo próprio vão em "atributos" (nome com unidade).',
  '5. Copie números, medidas, códigos, normas e preços EXATAMENTE como impressos (vírgula decimal, mm², kV, NBR). Nunca invente. OMITA os campos sem informação.',
  '6. "fornecedor": só o que estiver escrito (nome/logo da empresa, CNPJ, telefones, WhatsApp, e-mail, site, endereço) e, em "especialidade", 1 frase do que a empresa vende.',
  '7. Página sem produtos (capa, apresentação, índice): "tabelas": [], "produtos": [] e "resumo_pagina" com 1 frase.',
  '8. Siga a ordem da página. Responda SOMENTE o JSON, sem markdown e sem comentários.'
].join('\n');

const PROMPT_VISAO = 'Você extrai dados de catálogos técnicos de fornecedores brasileiros (materiais elétricos, fios e cabos, EPI, ferramentas, hidráulica, construção, informática e outros). ' +
  'Você recebe a IMAGEM de uma página do catálogo e, às vezes, o texto já lido dela (pode ter erros de leitura: confie na imagem).\n\n' +
  'Devolva SOMENTE um objeto JSON válido neste formato:\n' + FORMATO_JSON + '\n\n' + REGRAS;

const PROMPT_TEXTO = 'Você extrai dados de catálogos técnicos de fornecedores brasileiros. Você recebe o TEXTO de uma parte do catálogo ' +
  '(lido por OCR ou copiado do PDF: pode ter erros de leitura e colunas de tabelas misturadas; reconstrua as tabelas com cuidado e não invente).\n\n' +
  'Devolva SOMENTE um objeto JSON válido neste formato:\n' + FORMATO_JSON + '\n\n' + REGRAS;

// Prazos da leitura de catálogo: na Vercel (Fluid compute) a função pode durar até 300 s; o streaming devolve o que
// já chegou se o prazo acabar (o navegador pede o resto). Fora da Vercel (Render/local) o prazo é maior.
const PRAZO_EXTRACAO = parseInt(process.env.IA_PRAZO_EXTRACAO_MS || (NA_VERCEL ? '270000' : '600000'), 10);
const PARADO_EXTRACAO = parseInt(process.env.IA_PARADO_MS || '60000', 10);
// antes do primeiro sinal do modelo (fila do gratuito) a espera é maior
const PRIMEIRO_EXTRACAO = parseInt(process.env.IA_PRIMEIRO_MS || '120000', 10);
const TENTATIVAS_EXTRACAO = parseInt(process.env.IA_TENTATIVAS || '5', 10);

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
  const continuar = String(opcoes.continuarApos || '').trim().slice(0, 200);
  if (continuar) {
    instrucao += '\n\nATENÇÃO: esta página já foi lida em parte e a lista anterior foi cortada no produto "' + continuar + '". ' +
      'Liste SOMENTE os produtos que aparecem DEPOIS dele nesta página, na ordem da página (não repita os anteriores).';
  }
  const textoPagina = String(opcoes.texto || '').trim();
  if (textoPagina) instrucao += '\n\nTexto já lido desta página (use para conferir códigos e números):\n' + textoPagina.slice(0, 12000);
  partes.push({ type: 'text', text: instrucao });
  partes.push({ type: 'image_url', image_url: { url: opcoes.imagem } });
  const r = await chamarIA([{ role: 'system', content: PROMPT_VISAO }, { role: 'user', content: partes }], {
    tarefa: 'visao', json: true, maxTokens: 8192, temperatura: 0, validar: validarExtracao, stream: true,
    prazoMs: PRAZO_EXTRACAO, paradoMs: PARADO_EXTRACAO, primeiroMs: PRIMEIRO_EXTRACAO, tentativas: TENTATIVAS_EXTRACAO, evitar: opcoes.evitar
  });
  const v = r.valor || {};
  const produtos = v.produtos || [];
  const cortada = r.motivo === 'length' || r.motivo === 'parcial';
  if (cortada && !produtos.length) {
    // cortada antes do primeiro produto: não dá para continuar; o navegador tenta de novo com outro modelo
    const e = erroIA('IA indisponível: ' + r.modelo + ' cortou a resposta antes do primeiro produto', 'INDISPONIVEL');
    e.tentados = [r.modelo];
    throw e;
  }
  // resposta cortada pelo limite de tokens: o navegador pede o resto da página a partir do último produto lido
  const incompleto = cortada && produtos.length > 0;
  return Object.assign({ modelo: r.modelo, ms: r.ms, incompleto: incompleto, ultimo: incompleto ? produtos[produtos.length - 1].nome : '' }, v);
}

// Um bloco de texto do catálogo → { fornecedor, produtos, resumo, modelo }
async function estruturarTexto(texto, opcoes) {
  opcoes = opcoes || {};
  let pedido = (opcoes.contexto ? 'Contexto do trecho anterior: ' + String(opcoes.contexto).slice(0, 300) + '\n\n' : '') + String(texto || '').slice(0, 16000);
  const continuar = String(opcoes.continuarApos || '').trim().slice(0, 200);
  if (continuar) {
    pedido = 'ATENÇÃO: este trecho já foi lido em parte e a lista anterior foi cortada no produto "' + continuar + '". ' +
      'Liste SOMENTE os produtos que vêm DEPOIS dele (não repita os anteriores).\n\n' + pedido;
  }
  const r = await chamarIA([
    { role: 'system', content: PROMPT_TEXTO },
    { role: 'user', content: pedido }
  ], {
    tarefa: 'texto', json: true, maxTokens: 8192, temperatura: 0, validar: validarExtracao, stream: true,
    prazoMs: PRAZO_EXTRACAO, paradoMs: PARADO_EXTRACAO, primeiroMs: PRIMEIRO_EXTRACAO, tentativas: TENTATIVAS_EXTRACAO, evitar: opcoes.evitar
  });
  const v = r.valor || {};
  const produtos = v.produtos || [];
  const cortada = r.motivo === 'length' || r.motivo === 'parcial';
  const incompleto = cortada && produtos.length > 0;
  return Object.assign({ modelo: r.modelo, ms: r.ms, incompleto: incompleto, ultimo: incompleto ? produtos[produtos.length - 1].nome : '' }, v);
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
