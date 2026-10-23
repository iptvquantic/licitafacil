// src/routes/extracao.js — entrada de catálogos (texto lido no navegador, texto colado ou PDF lido no servidor)
'use strict';
const express = require('express');
const multer = require('multer');
const { query } = require('../utils/db');
const { requireAuth, requireAcesso } = require('../middleware/auth');
const indexacao = require('../services/indexacao.service');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'].indexOf(file.mimetype) >= 0;
    ok ? cb(null, true) : cb(Object.assign(new Error('Formato não suportado. Use PDF, JPG, PNG ou WEBP.'), { status: 400 }));
  }
});

router.use(requireAuth, requireAcesso);

function nomeArquivoUtf8(nome) {
  let n = String(nome || 'catalogo.pdf');
  if (/[ÃÂ]/.test(n)) { try { n = Buffer.from(n, 'latin1').toString('utf8'); } catch (_) { /* mantém */ } }
  return n.slice(0, 255);
}

// POST /api/extracao/texto/:fornecedorId  { texto, nome_arquivo, origem, paginas }
router.post('/texto/:fornecedorId', async (req, res) => {
  try {
    const out = await indexacao.indexarTexto({
      usuarioId: req.usuario.id,
      fornecedorId: req.params.fornecedorId,
      texto: req.body.texto,
      nomeArquivo: req.body.nome_arquivo,
      origem: ['texto_colado', 'pdf_navegador', 'ocr_navegador', 'imagem_ocr'].indexOf(req.body.origem) >= 0 ? req.body.origem : 'texto_colado',
      paginas: req.body.paginas
    });
    res.status(201).json(Object.assign({ ok: true }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao indexar texto:', err.message);
    res.status(500).json({ error: 'Não foi possível indexar o catálogo agora. Tente de novo.' });
  }
});

// POST /api/extracao/catalogo/:fornecedorId (multipart "arquivo") — leitura no servidor, sem guardar o arquivo
router.post('/catalogo/:fornecedorId', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo.' });
    if (req.file.mimetype.indexOf('image/') === 0) {
      return res.status(422).json({ error: 'Imagens precisam de leitura com OCR, feita no seu navegador. Recarregue a página (Ctrl+F5) e envie de novo.', code: 'PRECISA_OCR' });
    }
    const pdf = await indexacao.extrairTextoPDF(req.file.buffer);
    if (!pdf.texto || pdf.texto.trim().length < 20) {
      return res.status(422).json({ error: 'Este PDF é escaneado (só imagem). Recarregue a página e envie de novo para ler com OCR no navegador.', code: 'PRECISA_OCR' });
    }
    const out = await indexacao.indexarTexto({ usuarioId: req.usuario.id, fornecedorId: req.params.fornecedorId, texto: pdf.texto,
      paginas: pdf.paginas, origem: 'pdf_servidor', nomeArquivo: nomeArquivoUtf8(req.file.originalname) });
    res.status(201).json(Object.assign({ ok: true }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro na extração no servidor:', err.message);
    res.status(500).json({ error: 'Não foi possível ler este PDF. Se for protegido por senha, salve uma cópia sem senha.' });
  }
});

// GET /api/extracao/catalogo/:fornecedorId/:catalogoId/status
router.get('/catalogo/:fornecedorId/:catalogoId/status', async (req, res) => {
  try {
    const r = await query(
      'SELECT c.id, c.status, c.paginas, c.erro, c.ia_status, c.ia_info, c.atualizado_em,' +
      ' (SELECT count(*) FROM chunks WHERE catalogo_id = c.id)::int AS total_chunks,' +
      ' (SELECT count(*) FROM produtos WHERE catalogo_id = c.id)::int AS total_produtos' +
      ' FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id' +
      ' WHERE c.id = $1 AND c.fornecedor_id = $2 AND f.usuario_id = $3', [req.params.catalogoId, req.params.fornecedorId, req.usuario.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Catálogo não encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
