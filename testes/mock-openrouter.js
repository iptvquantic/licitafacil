// Simula o OpenRouter (porta 4010) com o cenário real de out/2026:
// - modelos gratuitos com e sem leitura de imagem; um deles responde vazio (raciocínio estourou) e outro dá 429
// - /key informa a cota diária de modelos gratuitos
// - leitura de página (imagem) devolve o JSON compacto (tabelas + produtos); texto bruto também; perguntas recebem texto
// - responde em streaming (SSE) quando o pedido tem "stream": true, como o OpenRouter
// - cenários: "eletrica-sul" (IA de imagem falha), "densa" (resposta cortada pelo limite de tokens),
//   "lenta" (a IA trava no meio da resposta: o servidor devolve o que chegou e o navegador pede o resto)
// - POST /__reiniciar recomeça a cota; POST /__demora?ms=N deixa as respostas lentas (para ver a tela de progresso)
const http = require('http');
const PORTA = parseInt(process.env.PORTA_MOCK || '4010', 10);
const chamadas = [];
let usadas = 3;
let demora = 0;

const MODELOS = [
  { id: 'nvidia/nemotron-3.5-super-vl:free', context_length: 1000000, pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, supported_parameters: ['reasoning', 'response_format', 'structured_outputs'] },
  { id: 'google/gemma-4-31b-it:free', context_length: 262144, pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['image', 'text'], output_modalities: ['text'] }, supported_parameters: ['reasoning', 'response_format'] },
  { id: 'deepseek/deepseek-chat-v3:free', context_length: 163840, pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: [] },
  { id: 'google/lyria-3-pro-preview', context_length: 1048576, pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text', 'audio'] }, supported_parameters: ['response_format'] },
  { id: 'openai/gpt-5', context_length: 400000, pricing: { prompt: '0.00001', completion: '0.00003' } },
  { id: 'black-forest/flux:free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } }
];

// Página "densa": a 1ª resposta vem cortada pelo limite de tokens; a continuação traz o resto
const DENSOS = ['Duplex 2x10', 'Duplex 2x16', 'Triplex 3x10', 'Triplex 3x16', 'Quadruplex 4x10', 'Quadruplex 4x16'].map(function (f) {
  const bitola = f.split(' ')[1] + ' mm²';
  return { nome: 'Cabo Multiplexado ' + f.split(' ')[0] + ' ' + bitola, bitola: bitola, tensao: '0,6/1 kV', material: 'alumínio', norma: 'ABNT NBR 8182' };
});
function respostaDensa(texto) {
  if (/cortada no produto/.test(texto)) {
    // repete o último já lido (o sistema tira repetidos) e traz os que faltavam
    return { content: JSON.stringify({ produtos: DENSOS.slice(3), resumo_pagina: 'Fim da tabela de multiplexados.' }), fim: 'stop' };
  }
  const completo = JSON.stringify({ fornecedor: { nome: 'Energy Fios e Cabos' }, produtos: DENSOS, resumo_pagina: 'Tabela de multiplexados.' });
  const corte = completo.indexOf(DENSOS[4].nome) + 6; // corta no meio do 5º produto
  return { content: completo.slice(0, corte), fim: 'length' };
}

// Página "lenta": tabela de cabos de controle; a IA trava depois da 4ª linha (o servidor corta por falta de resposta)
const LINHAS_LENTA = [['2x0,5', '6,2', '45'], ['3x0,5', '6,6', '55'], ['4x0,5', '7,1', '66'], ['5x0,5', '7,7', '78'], ['6x0,5', '8,3', '90'], ['8x0,5', '9,2', '115']];
function respostaLenta(texto) {
  const tabela = { produto: 'Cabo de Controle Blindado 500V', comum: { tensao: '300/500 V', norma: 'ABNT NBR 7289' }, colunas: ['Formação (mm²)', 'Diâmetro externo (mm)', 'Peso (kg/km)'] };
  if (/cortada no produto/.test(texto)) {
    return { content: JSON.stringify({ tabelas: [Object.assign({}, tabela, { linhas: LINHAS_LENTA.slice(4) })], resumo_pagina: 'Fim da tabela.' }), fim: 'stop' };
  }
  const completo = JSON.stringify({ fornecedor: { nome: 'Energy Fios e Cabos' }, tabelas: [Object.assign({}, tabela, { linhas: LINHAS_LENTA })], resumo_pagina: 'Cabos de controle.' });
  const corte = completo.indexOf('"' + LINHAS_LENTA[4][0] + '"') + 3; // trava no meio da 5ª linha
  return { content: completo.slice(0, corte), fim: null, trava: true };
}

// Páginas do catálogo de teste (o navegador envia "Página N de M")
function paginaJSON(n) {
  if (n === 1) {
    return { fornecedor: { nome: 'Energy Fios e Cabos', site: 'www.energycondutores.com.br', especialidade: 'Fios e cabos elétricos de cobre para baixa tensão' },
      tabelas: [], produtos: [], resumo_pagina: 'Capa e apresentação da Energy Fios e Cabos.' };
  }
  if (n === 2) {
    // formato compacto: a tabela vem uma vez e cada linha vira um produto
    return {
      fornecedor: { nome: 'Energy Fios e Cabos' },
      tabelas: [{
        produto: 'Cabo Flexível 750V', categoria: 'Cabos flexíveis',
        comum: { tensao: '450/750 V', material: 'cobre nu têmpera mole, classe 4', isolamento: 'PVC/A antichama', temperatura: '70 °C', norma: 'ABNT NBR NM 247-3' },
        colunas: ['Seção (mm²)', 'Diâmetro externo (mm)', 'Peso (kg/100 m)', 'Embalagem'],
        linhas: [['1,5', '2,9', '1,9', 'rolo 100 m'], ['2,5', '3,4', '3,1', 'rolo 100 m'], ['4', '4,5', '4,6', '']]
      }],
      produtos: [],
      resumo_pagina: 'Tabela do Cabo Flexível 750V.'
    };
  }
  return {
    fornecedor: { nome: 'Energy Fios e Cabos', telefone: '(11) 3456-7890', whatsapp: '(11) 98765-4321', email: 'vendas@energycondutores.com.br', cnpj: '11.222.333/0001-81' },
    produtos: [
      { nome: 'Cabo PP 3x2,5 mm² 0,6/1 kV', codigo: 'PP-325', bitola: '3x2,5 mm²', tensao: '0,6/1 kV', isolamento: 'HEPR 90 °C', cobertura: 'PVC/ST2',
        norma: 'ABNT NBR 7286', preco: 'R$ 8,90', unidade: 'metro' },
      // repetido de propósito: o extrator junta os dois
      { name: 'Cabo PP 3x2,5 mm² 0,6/1 kV', code: 'PP-325', voltage: '0,6/1 kV', price: 'R$ 8,90' }
    ],
    resumo_pagina: 'Cabos de potência HEPR e contatos.'
  };
}

// Responde como o OpenRouter: JSON normal ou streaming (SSE) em pedaços
function responder(res, pedido, content, fim, trava) {
  if (!pedido.stream) {
    const corpo = JSON.stringify({ choices: [{ message: { content }, finish_reason: fim || 'stop' }], usage: { total_tokens: 10 } });
    if (demora) setTimeout(function () { res.end(corpo); }, demora); else res.end(corpo);
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.write(': OPENROUTER PROCESSING\n\n');
  const pedacos = content.match(/[\s\S]{1,40}/g) || [];
  let i = 0;
  const passo = Math.max(1, Math.round(demora / Math.max(1, pedacos.length)));
  function enviar() {
    if (res.destroyed) return;
    if (i < pedacos.length) {
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: pedacos[i++] } }] }) + '\n\n');
      return setTimeout(enviar, passo);
    }
    if (trava) {
      // fica "pensando" para sempre (só comentários de keep-alive); o servidor corta e usa o que chegou
      const vivo = setInterval(function () { if (res.destroyed) return clearInterval(vivo); res.write(': OPENROUTER PROCESSING\n\n'); }, 500);
      res.on('close', function () { clearInterval(vivo); });
      return;
    }
    res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: fim || 'stop' }], usage: { total_tokens: 10 } }) + '\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  }
  enviar();
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/__reiniciar') { usadas = 3; demora = 0; chamadas.length = 0; return res.end('{"ok":true}'); }
    if (req.url.indexOf('/__demora') === 0) { demora = parseInt(new URL(req.url, 'http://mock').searchParams.get('ms') || '0', 10) || 0; return res.end('{"ok":true}'); }
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: MODELOS }));
    if (req.url.endsWith('/key')) {
      if (req.headers.authorization !== 'Bearer chave-teste') { res.statusCode = 401; return res.end('{"error":"bad key"}'); }
      return res.end(JSON.stringify({ data: { is_free_tier: true, free_model_daily_requests: { used: usadas, limit: 50, remaining: 50 - usadas } } }));
    }
    let j = {};
    try { j = JSON.parse(body || '{}'); } catch (e) { res.statusCode = 400; return res.end('{"error":"json"}'); }
    chamadas.push(j.model);
    if (req.headers.authorization !== 'Bearer chave-teste') { res.statusCode = 401; return res.end('{"error":"bad key"}'); }
    if (/deepseek/.test(j.model)) { res.statusCode = 429; return res.end('{"error":{"message":"Provider returned error: rate-limited upstream","code":429}}'); }
    if (/nemotron/.test(j.model)) return responder(res, j, '', 'length'); // o raciocínio consumiu todos os tokens: conteúdo vazio
    usadas++;
    const sistema = String((j.messages[0] && j.messages[0].content) || '');
    const ultima = j.messages[j.messages.length - 1] || {};
    const partes = Array.isArray(ultima.content) ? ultima.content : [{ type: 'text', text: String(ultima.content || '') }];
    const temImagem = partes.some(p => p.type === 'image_url');
    const texto = partes.filter(p => p.type === 'text').map(p => p.text).join('\n');
    // catálogo "eletrica-sul": a leitura por imagem falha de propósito → o navegador cai para o texto + IA de texto
    if (temImagem && /eletrica-sul/i.test(texto)) {
      res.statusCode = 502;
      return res.end('{"error":{"message":"Provider returned error","code":502}}');
    }
    if (temImagem && /dens[ao]/i.test(texto)) { const d = respostaDensa(texto); return responder(res, j, d.content, d.fim); }
    if (temImagem && /lent[ao]/i.test(texto)) { const l = respostaLenta(texto); return responder(res, j, l.content, l.fim, l.trava); }
    if (temImagem) {
      const n = parseInt((texto.match(/P[aá]gina (\d+)/) || [0, 1])[1], 10);
      return responder(res, j, '```json\n' + JSON.stringify(paginaJSON(n)) + '\n```', 'stop');
    }
    if (/extrai dados de cat/.test(sistema)) {
      return responder(res, j, JSON.stringify({ fornecedor: { telefone: '(11) 3333-4444' }, produtos: [
        { nome: 'Cabo flexível 1,5mm² 750V', bitola: '1,5mm²', tensao: '750V', unidade: 'rolo 100m' },
        { nome: 'Cabo PP 2x1mm² 500V', bitola: '2x1mm²', tensao: '500V' }
      ], resumo_pagina: 'Trecho com cabos.' }), 'stop');
    }
    return responder(res, j, 'O fornecedor Flex Fast tem o Cabo PP 3x2,5mm² (PP-325) por R$ 8,90/metro. Contato: WhatsApp (11) 95780-8642.', 'stop');
  });
}).listen(PORTA, () => console.log('mock OpenRouter na porta ' + PORTA));
process.on('SIGTERM', () => { console.log('chamadas:', chamadas.join(', ')); process.exit(0); });
