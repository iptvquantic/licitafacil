// src/routes/extracao.js — Extração IA de catálogos com Claude Vision
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const { requireAuth } = require('../middleware/auth');
const { query } = require('../utils/db');
const { uploadFile, getFileBuffer } = require('../services/storage.service');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf','image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Formato não suportado. Use PDF, JPG, PNG ou WEBP.'));
  }
});

router.use(requireAuth);

// POST /api/extracao/catalogo/:fornecedorId
router.post('/catalogo/:fornecedorId', upload.single('arquivo'), async (req, res) => {
  try {
    const { fornecedorId } = req.params;

    // Verificar ownership
    const forn = await query(
      'SELECT id, nome FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1',
      [fornecedorId, req.usuario.id]
    );
    if (forn.rows.length === 0) return res.status(404).json({ error: 'Fornecedor não encontrado' });

    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });

    // Upload para storage
    const { key, url } = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);

    // Criar registro do catálogo
    const catResult = await query(
      'INSERT INTO catalogos (fornecedor_id, nome_arquivo, storage_path, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [fornecedorId, req.file.originalname, key, 'processando']
    );
    const catalogoId = catResult.rows[0].id;

    // Responder imediatamente — processar em background
    res.status(202).json({ ok: true, catalogo_id: catalogoId, msg: 'Arquivo recebido. Extração IA iniciada...' });

    // Processar em background
    extrairComIA(catalogoId, fornecedorId, req.file.buffer, req.file.mimetype, req.file.originalname, req.usuario.id)
      .catch(err => {
        console.error('Erro na extração IA:', err);
        query('UPDATE catalogos SET status = $1, erro = $2 WHERE id = $3', ['erro', err.message, catalogoId]);
      });

  } catch (err) {
    console.error('Erro ao iniciar extração:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/extracao/catalogo/:fornecedorId/:catalogoId/status
router.get('/catalogo/:fornecedorId/:catalogoId/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.status, c.paginas, c.erro, c.atualizado_em,
        COUNT(ch.id) as total_chunks,
        c.texto_extraido
       FROM catalogos c
       LEFT JOIN chunks ch ON ch.catalogo_id = c.id
       WHERE c.id = $1 AND c.fornecedor_id = $2
       GROUP BY c.id`,
      [req.params.catalogoId, req.params.fornecedorId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Catálogo não encontrado' });
    const cat = result.rows[0];
    res.json({
      id: cat.id, status: cat.status, paginas: cat.paginas, erro: cat.erro,
      total_chunks: parseInt(cat.total_chunks) || 0,
      tem_dados: !!(cat.texto_extraido && cat.texto_extraido.length > 100),
      atualizado_em: cat.atualizado_em
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Extração com IA ─────────────────────────────────────────────────────────

const PROMPT_EXTRACAO = `Você é um especialista em extração de dados de catálogos de fornecedores.
Analise o arquivo enviado e extraia TODOS os produtos, informações do fornecedor e detalhes técnicos.

REGRAS:
- Extraia TODOS os produtos sem exceção
- Preserve medidas EXATAMENTE como aparecem
- Capture códigos, SKUs, referências
- Capture materiais, cores, variações, acabamentos
- Capture preços e unidades de venda
- Identifique nome do fornecedor, CNPJ, contatos
- Nunca invente dados
- Responda APENAS com JSON válido, sem markdown

FORMATO:
{
  "supplier": {
    "name": "Nome do fornecedor ou null",
    "cnpj": "CNPJ ou null",
    "website": "site ou null",
    "email": "email ou null",
    "phone": "telefone ou null",
    "address": "endereço ou null",
    "categories": ["categoria1"],
    "description": "descrição do fornecedor"
  },
  "products": [
    {
      "name": "Nome completo do produto",
      "code": "código/SKU ou null",
      "category": "categoria",
      "description": "descrição técnica completa",
      "dimensions": {"raw": "medidas originais ou null"},
      "material": "material ou null",
      "color": "cor ou null",
      "price": "preço ou null",
      "unit": "unidade de venda ou null",
      "notes": "observações ou null"
    }
  ],
  "total_products": 0,
  "extraction_notes": "observações sobre a extração"
}`;

async function extrairComIA(catalogoId, fornecedorId, buffer, mimetype, filename, usuarioId) {
  try {
    let textoExtraido = '';
    let dadosIA = null;
    let paginas = 0;

    // Converter buffer para base64
    const base64 = buffer.toString('base64');
    const isPDF = mimetype === 'application/pdf';

    // Montar mensagem para Claude
    const mensagem = isPDF
      ? { role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: PROMPT_EXTRACAO }
        ]}
      : { role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimetype, data: base64 } },
          { type: 'text', text: PROMPT_EXTRACAO }
        ]};

    // Chamar Claude API via Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [mensagem]
      })
    });

    if (!response.ok) {
      // Fallback: usar OpenRouter com extração simples se Claude falhar
      throw new Error('Claude API indisponível: ' + response.status);
    }

    const data = await response.json();
    const textoResposta = data.content?.[0]?.text || '';

    // Parsear JSON da resposta
    try {
      const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
      if (jsonMatch) dadosIA = JSON.parse(jsonMatch[0]);
    } catch (e) {
      dadosIA = null;
    }

    // Montar texto extraído para busca
    if (dadosIA) {
      const partes = [];
      if (dadosIA.supplier) {
        partes.push('FORNECEDOR: ' + (dadosIA.supplier.name || ''));
        if (dadosIA.supplier.description) partes.push(dadosIA.supplier.description);
        if (dadosIA.supplier.categories) partes.push('Categorias: ' + dadosIA.supplier.categories.join(', '));
      }
      if (dadosIA.products && Array.isArray(dadosIA.products)) {
        dadosIA.products.forEach(function(p) {
          var linha = p.name || '';
          if (p.code) linha += ' [' + p.code + ']';
          if (p.description) linha += ' - ' + p.description;
          if (p.material) linha += ' - Material: ' + p.material;
          if (p.dimensions && p.dimensions.raw) linha += ' - Dim: ' + p.dimensions.raw;
          if (p.price) linha += ' - Preço: ' + p.price;
          partes.push(linha);
        });
        paginas = Math.ceil(dadosIA.products.length / 10);
      }
      textoExtraido = partes.join('\n');
    } else {
      textoExtraido = textoResposta.substring(0, 50000);
    }

    // Atualizar fornecedor se tiver dados do supplier
    if (dadosIA && dadosIA.supplier) {
      const s = dadosIA.supplier;
      const updates = [];
      const vals = [];
      var idx = 1;
      if (s.phone && s.phone !== 'null') { updates.push('telefone = COALESCE(NULLIF(telefone,\'\'), $' + idx++ + ')'); vals.push(s.phone); }
      if (s.email && s.email !== 'null') { updates.push('email = COALESCE(NULLIF(email,\'\'), $' + idx++ + ')'); vals.push(s.email); }
      if (updates.length > 0) {
        vals.push(fornecedorId);
        await query('UPDATE fornecedores SET ' + updates.join(', ') + ' WHERE id = $' + idx, vals);
      }
    }

    // Salvar dados JSON no texto_extraido
    const textoCompleto = dadosIA
      ? JSON.stringify(dadosIA, null, 2) + '\n\n---TEXTO---\n' + textoExtraido
      : textoExtraido;

    // Criar chunks para busca
    const palavrasPorChunk = 400;
    const palavras = textoExtraido.split(/\s+/).filter(p => p.length > 0);
    const chunks = [];
    for (var i = 0; i < palavras.length; i += palavrasPorChunk - 30) {
      const slice = palavras.slice(i, i + palavrasPorChunk);
      if (slice.length < 10) break;
      chunks.push(slice.join(' '));
    }

    // Limpar chunks antigos
    await query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogoId]);

    // Inserir chunks novos
    for (var j = 0; j < chunks.length; j++) {
      await query(
        'INSERT INTO chunks (catalogo_id, fornecedor_id, conteudo, indice) VALUES ($1, $2, $3, $4)',
        [catalogoId, fornecedorId, chunks[j], j]
      );
    }

    // Atualizar catálogo
    await query(
      'UPDATE catalogos SET status = $1, texto_extraido = $2, paginas = $3, atualizado_em = NOW() WHERE id = $4',
      ['processado', textoCompleto.substring(0, 100000), Math.max(paginas, 1), catalogoId]
    );

    console.log('Extração concluída: ' + chunks.length + ' chunks, ' + (dadosIA ? dadosIA.total_products : 0) + ' produtos');

  } catch (err) {
    console.error('Erro na extração IA, usando fallback:', err.message);

    // Fallback: extrair texto simples com pdf-parse
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const texto = data.text || '';

      if (texto.length > 50) {
        const palavras = texto.split(/\s+/).filter(p => p.length > 0);
        const chunks = [];
        for (var i = 0; i < palavras.length; i += 370) {
          const slice = palavras.slice(i, i + 400);
          if (slice.length < 10) break;
          chunks.push(slice.join(' '));
        }

        await query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogoId]);
        for (var j = 0; j < chunks.length; j++) {
          await query('INSERT INTO chunks (catalogo_id, fornecedor_id, conteudo, indice) VALUES ($1, $2, $3, $4)',
            [catalogoId, fornecedorId, chunks[j], j]);
        }

        await query(
          'UPDATE catalogos SET status = $1, texto_extraido = $2, paginas = $3, atualizado_em = NOW() WHERE id = $4',
          ['processado', texto.substring(0, 100000), data.numpages || 1, catalogoId]
        );
      } else {
        await query('UPDATE catalogos SET status = $1, erro = $2 WHERE id = $3',
          ['erro', 'PDF sem texto extraível. Configure ANTHROPIC_API_KEY para usar IA Vision.', catalogoId]);
      }
    } catch (e2) {
      await query('UPDATE catalogos SET status = $1, erro = $2 WHERE id = $3',
        ['erro', 'Erro na extração: ' + e2.message, catalogoId]);
    }
  }
}

module.exports = router;
