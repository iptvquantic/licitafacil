// Simula o OpenRouter: 1º modelo dá 429, 2º responde
const http = require('http');
let chamadas = [];
http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/models')) {
      return res.end(JSON.stringify({ data: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', context_length: 131072, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
        { id: 'deepseek/deepseek-chat-v3:free', context_length: 163840, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
        { id: 'openai/gpt-5', context_length: 400000, pricing: { prompt: '0.00001', completion: '0.00003' } },
        { id: 'black-forest/flux:free', pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['image'] } }
      ] }));
    }
    const j = JSON.parse(body || '{}');
    chamadas.push(j.model);
    if (req.headers.authorization !== 'Bearer chave-teste') { res.statusCode = 401; return res.end('{"error":"bad key"}'); }
    if (j.model.indexOf('deepseek') >= 0) { res.statusCode = 429; return res.end('{"error":"rate"}'); }
    const sistema = (j.messages[0] && j.messages[0].content) || '';
    let content;
    if (/extrai produtos/.test(sistema)) {
      content = 'PRODUTO 1\nNome: Cabo flexível 1,5mm² 750V\nCódigo: não informado\nMedida/Bitola: 1,5mm²\nTensão: 750V\nUnidade: rolo 100m\n\nPRODUTO 2\nNome: Cabo PP 2x1mm² 500V\nMedida/Bitola: 2x1mm²\nTensão: 500V';
    } else {
      content = 'O fornecedor Flex Fast tem o Cabo PP 3x2,5mm² (PP-325) por R$ 8,90/metro. Contato: WhatsApp (11) 95780-8642.';
    }
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 10 } }));
  });
}).listen(4010, () => console.log('mock on 4010'));
process.on('SIGTERM', () => { console.log('chamadas:', chamadas.join(', ')); process.exit(0); });
