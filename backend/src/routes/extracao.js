// src/routes/extracao.js — entrada de catálogos (texto lido no navegador, texto colado ou PDF lido no servidor)
'use strict';
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { query } = require('../utils/db');
const { requireAuth, requireAcesso } = require('../middleware/auth');
const indexacao = require('../services/indexacao.service');
const extrator = require('../services/extrator.service');
const leitor = require('../services/leitor.service');
const ia = require('../services/ai.service');

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

// Leitura com IA: protege a cota gratuita (por pessoa)
const limiteLeituraIA = rateLimit({
  windowMs: 60 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  keyGenerator: function (req) { return 'u' + (req.usuario ? req.usuario.id : 'anonimo'); },
  message: { error: 'Muitas leituras com IA em pouco tempo. Aguarde alguns minutos.' }
});

// Falha da IA gratuita (cota do dia, modelo ocupado ou sem resposta) é esperada: responde 200 com ok:false e o motivo,
// e o navegador decide (tenta outro modelo, lê sem IA ou para). Assim o console do navegador não acusa erro de rede.
function respostaErroIA(res, err) {
  if (err && err.amigavel) return res.status(err.status).json({ error: err.message });
  if (err && err.code) return res.json({ ok: false, error: indexacao.mensagemErroIA(err), code: err.code, tentados: err.tentados || [], motivos: err.motivos || [] });
  console.error('Erro na leitura com IA:', err && err.message);
  return res.status(500).json({ error: 'Não foi possível ler esta parte agora.' });
}
const SEM_IA = { ok: false, error: 'A IA não está configurada no servidor.', code: 'SEM_CHAVE', tentados: [] };

// GET /api/extracao/capacidades — o que a leitura pode usar agora (IA de imagem, cota do dia)
router.get('/capacidades', async (req, res) => {
  try {
    res.json(await ia.capacidades());
  } catch (err) {
    res.json({ ia: ia.configurada(), visao: false, cota: null });
  }
});

// POST /api/extracao/pagina  { imagem: data:image/jpeg;base64,…, texto, pagina, total, contexto, nome_arquivo, evitar[], continuar_apos }
// Lê UMA página com a IA de imagem e devolve os produtos (nada é gravado aqui).
// incompleto:true = a resposta foi cortada (página com muitos produtos): o navegador pede o resto com continuar_apos = ultimo
router.post('/pagina', limiteLeituraIA, async (req, res) => {
  try {
    const imagem = String(req.body.imagem || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(imagem.slice(0, 64) + imagem.slice(-8)) || imagem.length < 200) {
      return res.status(400).json({ error: 'Imagem da página inválida.' });
    }
    if (imagem.length > 4200000) return res.status(413).json({ error: 'Imagem da página grande demais.' });
    if (!ia.configurada()) return res.json(SEM_IA);
    const evitar = Array.isArray(req.body.evitar) ? req.body.evitar.slice(0, 10).map(String) : [];
    const r = await ia.extrairPagina({
      imagem: imagem, texto: String(req.body.texto || '').slice(0, 20000), pagina: parseInt(req.body.pagina, 10) || 1,
      total: parseInt(req.body.total, 10) || 0, contexto: String(req.body.contexto || '').slice(0, 500),
      nomeArquivo: String(req.body.nome_arquivo || '').slice(0, 200), evitar: evitar,
      continuarApos: String(req.body.continuar_apos || '').slice(0, 200)
    });
    res.json({ ok: true, produtos: r.produtos, fornecedor: r.fornecedor, resumo: r.resumo, modelo: r.modelo, ms: r.ms,
      incompleto: !!r.incompleto, ultimo: r.ultimo || '' });
  } catch (err) { respostaErroIA(res, err); }
});

// POST /api/extracao/analisar  { texto } — confere, SEM usar a IA, se o texto do PDF já está organizado
// (formato do Prompt Mestre, JSON ou tabela). Assim um PDF já organizado não gasta a cota de IA.
router.post('/analisar', async (req, res) => {
  try {
    const bruto = String(req.body.texto || '');
    if (bruto.replace(/\s/g, '').length < 20) return res.status(400).json({ error: 'Texto curto demais.' });
    const texto = leitor.normalizarTexto(bruto.slice(0, 3000000));
    const est = leitor.estruturar(texto);
    const produtos = est.formato === 'texto' ? [] : extrator.mesclarProdutos([est.produtos]);
    res.json({ formato: est.formato, produtos: produtos, fornecedor: extrator.normalizarFornecedor(est.fornecedor || {}) || null,
      marcadores: leitor.contarMarcadores(texto) });
  } catch (err) {
    console.error('Erro ao analisar texto:', err.message);
    res.status(500).json({ error: 'Não foi possível conferir o texto do catálogo.' });
  }
});

// POST /api/extracao/estruturar-bloco  { texto, contexto, evitar[], continuar_apos } — IA organiza um trecho de texto (OCR ou PDF) em produtos
router.post('/estruturar-bloco', limiteLeituraIA, async (req, res) => {
  try {
    const texto = String(req.body.texto || '');
    if (texto.replace(/\s/g, '').length < 30) return res.status(400).json({ error: 'Texto curto demais.' });
    if (!ia.configurada()) return res.json(SEM_IA);
    const r = await ia.estruturarTexto(texto.slice(0, 16000), { contexto: String(req.body.contexto || '').slice(0, 300),
      evitar: Array.isArray(req.body.evitar) ? req.body.evitar.slice(0, 10).map(String) : [],
      continuarApos: String(req.body.continuar_apos || '').slice(0, 200) });
    res.json({ ok: true, produtos: r.produtos, fornecedor: r.fornecedor, resumo: r.resumo, modelo: r.modelo, ms: r.ms,
      incompleto: !!r.incompleto, ultimo: r.ultimo || '' });
  } catch (err) { respostaErroIA(res, err); }
});

// POST /api/extracao/fornecedor  { texto, fornecedor, nome_arquivo } — junta os dados do fornecedor achados no catálogo
// e aponta fornecedores já cadastrados que parecem ser o mesmo
router.post('/fornecedor', async (req, res) => {
  try {
    const texto = String(req.body.texto || '').slice(0, 400000);
    const daIA = Array.isArray(req.body.fornecedores) ? req.body.fornecedores.slice(0, 200) : [req.body.fornecedor];
    const lista = daIA.map(extrator.normalizarFornecedor).filter(Boolean);
    const doTexto = extrator.normalizarFornecedor(extrator.extrairContatos(texto));
    const dados = extrator.mesclarFornecedores(lista.concat(doTexto ? [doTexto] : [])) || {};
    // contatos achados no texto completam o que a IA não viu
    if (doTexto) Object.keys(doTexto).forEach(function (k) { if (!dados[k]) dados[k] = doTexto[k]; });
    if (!dados.nome) dados.nome = extrator.nomePorSiteOuArquivo(dados.site, req.body.nome_arquivo);
    const existentes = await query('SELECT id, nome, email, telefone, whatsapp, cnpj, site FROM fornecedores WHERE usuario_id = $1 AND ativo = 1 LIMIT 3000', [req.usuario.id]);
    res.json({ fornecedor: dados, parecidos: extrator.compararFornecedores(dados, existentes.rows) });
  } catch (err) {
    console.error('Erro ao detectar fornecedor:', err.message);
    res.status(500).json({ error: 'Não foi possível conferir o fornecedor.' });
  }
});

// POST /api/extracao/importar — salva o catálogo lido: { fornecedor_id | novo_fornecedor, fornecedor, nome_arquivo, paginas, origem,
//   texto, produtos[], resumos[], completar_fornecedor, info_ia, formato (prompt_mestre | json | tabela quando o PDF já veio organizado) }
router.post('/importar', async (req, res) => {
  try {
    const out = await indexacao.importarCatalogo({
      usuarioId: req.usuario.id,
      fornecedorId: req.body.fornecedor_id,
      novoFornecedor: req.body.novo_fornecedor,
      fornecedor: req.body.fornecedor,
      nomeArquivo: req.body.nome_arquivo,
      paginas: req.body.paginas,
      origem: req.body.origem,
      texto: req.body.texto,
      produtos: req.body.produtos,
      resumos: req.body.resumos,
      completarFornecedor: req.body.completar_fornecedor !== false,
      infoIA: req.body.info_ia,
      formato: req.body.formato
    });
    res.status(201).json(Object.assign({ ok: true }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao importar catálogo:', err.message);
    res.status(500).json({ error: 'Não foi possível salvar o catálogo agora. Tente de novo.' });
  }
});

// POST /api/extracao/importar/:catalogoId/produtos  { produtos[] } — catálogos muito grandes chegam em partes
router.post('/importar/:catalogoId/produtos', async (req, res) => {
  try {
    const out = await indexacao.acrescentarProdutos({ usuarioId: req.usuario.id, catalogoId: req.params.catalogoId, produtos: req.body.produtos });
    res.json(Object.assign({ ok: true }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao acrescentar produtos:', err.message);
    res.status(500).json({ error: 'Não foi possível salvar esta parte dos produtos.' });
  }
});

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
