// Simula o OpenRouter (porta 4010) com o cenário real de out/2026:
// - modelos gratuitos com e sem leitura de imagem; um deles responde vazio (raciocínio estourou) e outro dá 429
// - /key informa a cota diária de modelos gratuitos
// - leitura de página (imagem) devolve JSON de produtos; texto bruto também; perguntas recebem texto
const http = require('http');
const PORTA = parseInt(process.env.PORTA_MOCK || '4010', 10);
const chamadas = [];
let usadas = 3;

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

// Páginas do catálogo de teste (o navegador envia "Página N de M")
function paginaJSON(n) {
  if (n === 1) {
    return { fornecedor: { nome: 'Energy Fios e Cabos', site: 'www.energycondutores.com.br', especialidade: 'Fios e cabos elétricos de cobre para baixa tensão' },
      produtos: [], resumo_pagina: 'Capa e apresentação da Energy Fios e Cabos.' };
  }
  if (n === 2) {
    return {
      fornecedor: { nome: 'Energy Fios e Cabos' },
      produtos: [
        { nome: 'Cabo Flexível 750V 1,5 mm²', categoria: 'Cabos flexíveis', bitola: '1,5 mm²', tensao: '450/750 V', material: 'cobre nu têmpera mole, classe 4',
          isolamento: 'PVC/A antichama', temperatura: '70 °C', norma: 'ABNT NBR NM 247-3', atributos: { 'Diâmetro externo (mm)': '2,9', 'Peso (kg/100 m)': '1,9', Embalagem: 'rolo 100 m' } },
        { nome: 'Cabo Flexível 750V 2,5 mm²', categoria: 'Cabos flexíveis', bitola: '2,5 mm²', tensao: '450/750 V', material: 'cobre nu têmpera mole, classe 4',
          isolamento: 'PVC/A antichama', temperatura: '70 °C', norma: 'ABNT NBR NM 247-3', atributos: { 'Diâmetro externo (mm)': '3,4', 'Peso (kg/100 m)': '3,1', Embalagem: 'rolo 100 m' } },
        { nome: 'Cabo Flexível 750V 4 mm²', categoria: 'Cabos flexíveis', bitola: '4 mm²', tensao: '450/750 V', material: 'cobre nu têmpera mole, classe 4',
          isolamento: 'PVC/A antichama', temperatura: '70 °C', norma: 'ABNT NBR NM 247-3', atributos: { 'Diâmetro externo (mm)': '4,5', 'Peso (kg/100 m)': '4,6' } }
      ],
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

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
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
    if (/nemotron/.test(j.model)) {
      // o raciocínio consumiu todos os tokens: conteúdo vazio
      return res.end(JSON.stringify({ choices: [{ message: { content: '', reasoning: 'pensando…' }, finish_reason: 'length' }] }));
    }
    usadas++;
    const sistema = String((j.messages[0] && j.messages[0].content) || '');
    const ultima = j.messages[j.messages.length - 1] || {};
    const partes = Array.isArray(ultima.content) ? ultima.content : [{ type: 'text', text: String(ultima.content || '') }];
    const temImagem = partes.some(p => p.type === 'image_url');
    const texto = partes.filter(p => p.type === 'text').map(p => p.text).join('\n');
    let content;
    if (temImagem) {
      const n = parseInt((texto.match(/P[aá]gina (\d+)/) || [0, 1])[1], 10);
      content = '```json\n' + JSON.stringify(paginaJSON(n)) + '\n```';
    } else if (/extrai dados de cat/.test(sistema)) {
      content = JSON.stringify({ fornecedor: { telefone: '(11) 3333-4444' }, produtos: [
        { nome: 'Cabo flexível 1,5mm² 750V', bitola: '1,5mm²', tensao: '750V', unidade: 'rolo 100m' },
        { nome: 'Cabo PP 2x1mm² 500V', bitola: '2x1mm²', tensao: '500V' }
      ], resumo_pagina: 'Trecho com cabos.' });
    } else {
      content = 'O fornecedor Flex Fast tem o Cabo PP 3x2,5mm² (PP-325) por R$ 8,90/metro. Contato: WhatsApp (11) 95780-8642.';
    }
    res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { total_tokens: 10 } }));
  });
}).listen(PORTA, () => console.log('mock OpenRouter na porta ' + PORTA));
process.on('SIGTERM', () => { console.log('chamadas:', chamadas.join(', ')); process.exit(0); });
