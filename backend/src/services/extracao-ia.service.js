// Extração IA via OpenRouter (gratuito)
const fetch = require('node-fetch');

const PROMPT = 'Analise este catálogo e extraia TODOS os produtos. Responda APENAS com JSON: {"supplier":{"name":"nome","phone":"tel ou null","email":"email ou null","categories":[]},"products":[{"name":"nome","code":"cod ou null","description":"desc","price":"preco ou null","unit":"unid ou null"}],"total_products":0}';

async function extrairComOpenRouter(buffer, mimetype) {
  const base64 = buffer.toString('base64');
  const isImage = mimetype.startsWith('image/');
  const isPDF = mimetype === 'application/pdf';

  // Tentar primeiro pdf-parse para PDFs com texto
  if (isPDF) {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 100) {
        return { texto: data.text, metodo: 'pdf-parse', dadosIA: null };
      }
    } catch(e) {}
  }

  // Usar visão via OpenRouter
  const mediaType = isPDF ? 'image/jpeg' : mimetype;

  // Para PDF escaneado, converter primeira página para imagem via base64 direto
  const content = [
    {
      type: 'image_url',
      image_url: {
        url: 'data:' + (isImage ? mimetype : 'application/pdf') + ';base64,' + base64
      }
    },
    { type: 'text', text: PROMPT }
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (process.env.OPENROUTER_API_KEY || ''),
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app',
      'X-Title': 'LicitaFacil'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-exp:free',
      messages: [{ role: 'user', content: content }],
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('OpenRouter Vision error ' + response.status + ': ' + err.substring(0, 200));
  }

  const data = await response.json();
  const texto = data.choices?.[0]?.message?.content || '';

  // Tentar parsear JSON
  let dadosIA = null;
  try {
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) dadosIA = JSON.parse(match[0]);
  } catch(e) {}

  return { texto, dadosIA, metodo: 'openrouter-vision' };
}

module.exports = { extrairComOpenRouter };
// 1783469381
