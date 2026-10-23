// src/routes/fornecedores.js — CRUD de fornecedores, produtos e catálogos (sempre filtrado pelo dono)
'use strict';
const express = require('express');
const multer = require('multer');
const { query } = require('../utils/db');
const { requireAuth, requireAcessoEscrita } = require('../middleware/auth');
const indexacao = require('../services/indexacao.service');
const { deleteFile } = require('../services/storage.service');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(Object.assign(new Error('Envie um arquivo PDF.'), { status: 400 }));
  }
});

router.use(requireAuth, requireAcessoEscrita);

function limpar(v, max) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max || 255) : null;
}

function dadosFornecedor(body) {
  const whatsapp = limpar(body.whatsapp, 50);
  return {
    nome: limpar(body.nome, 255),
    email: limpar(body.email, 255),
    telefone: limpar(body.telefone, 50),
    whatsapp: whatsapp,
    whatsapp_link: indexacao.waLink(whatsapp),
    observacoes: limpar(body.observacoes, 2000)
  };
}

function nomeArquivoUtf8(nome) {
  let n = String(nome || 'catalogo.pdf');
  if (/[ÃÂ]/.test(n)) { try { n = Buffer.from(n, 'latin1').toString('utf8'); } catch (_) { /* mantém */ } }
  return n.slice(0, 255);
}

// Carrega o catálogo garantindo que pertence ao usuário logado (corrige IDOR)
async function catalogoDoUsuario(fornecedorId, catalogoId, usuarioId) {
  const r = await query(
    'SELECT c.* FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id' +
    ' WHERE c.id = $1 AND c.fornecedor_id = $2 AND f.usuario_id = $3 AND f.ativo = 1',
    [catalogoId, fornecedorId, usuarioId]);
  return r.rows[0] || null;
}

// GET /api/fornecedores
router.get('/', async (req, res) => {
  try {
    const busca = limpar(req.query.busca, 100);
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(200, Math.max(1, parseInt(req.query.por_pagina, 10) || 100));
    const params = [req.usuario.id];
    let where = 'WHERE f.usuario_id = $1 AND f.ativo = 1';
    if (busca) {
      params.push('%' + busca.replace(/[\\%_]/g, '\\$&') + '%');
      where += ' AND (f.nome ILIKE $2 OR f.email ILIKE $2 OR f.telefone ILIKE $2 OR f.whatsapp ILIKE $2 OR f.observacoes ILIKE $2)';
    }
    const [dados, total] = await Promise.all([
      query(
        'SELECT f.id, f.nome, f.email, f.telefone, f.whatsapp, f.whatsapp_link, f.observacoes, f.criado_em, f.atualizado_em,' +
        " (SELECT count(*) FROM catalogos c WHERE c.fornecedor_id = f.id AND c.status = 'processado')::int AS total_catalogos," +
        ' (SELECT count(*) FROM chunks ch WHERE ch.fornecedor_id = f.id)::int AS total_chunks,' +
        ' (SELECT count(*) FROM produtos p WHERE p.fornecedor_id = f.id)::int AS total_produtos' +
        ' FROM fornecedores f ' + where + ' ORDER BY lower(f.nome) ASC' +
        ' LIMIT ' + porPagina + ' OFFSET ' + ((pagina - 1) * porPagina), params),
      query('SELECT count(*)::int AS total FROM fornecedores f ' + where, params)
    ]);
    res.json({ fornecedores: dados.rows, total: total.rows[0].total, pagina: pagina, por_pagina: porPagina });
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err.message);
    res.status(500).json({ error: 'Erro ao carregar fornecedores' });
  }
});

// POST /api/fornecedores (JSON; aceita também multipart com PDF no campo "catalogo")
router.post('/', upload.single('catalogo'), async (req, res) => {
  try {
    const d = dadosFornecedor(req.body);
    if (!d.nome) return res.status(400).json({ error: 'Informe o nome do fornecedor.' });
    const r = await query(
      'INSERT INTO fornecedores (usuario_id, nome, email, telefone, whatsapp, whatsapp_link, observacoes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.usuario.id, d.nome, d.email, d.telefone, d.whatsapp, d.whatsapp_link, d.observacoes]);
    const fornecedor = r.rows[0];
    let catalogo = null;
    if (req.file) {
      try {
        const pdf = await indexacao.extrairTextoPDF(req.file.buffer);
        catalogo = await indexacao.indexarTexto({ usuarioId: req.usuario.id, fornecedorId: fornecedor.id, texto: pdf.texto,
          paginas: pdf.paginas, origem: 'pdf_servidor', nomeArquivo: nomeArquivoUtf8(req.file.originalname) });
      } catch (err) { catalogo = { erro: err.amigavel ? err.message : 'Não foi possível ler o PDF.' }; }
    }
    res.status(201).json({ ok: true, fornecedor: fornecedor, catalogo: catalogo });
  } catch (err) {
    console.error('Erro ao criar fornecedor:', err.message);
    res.status(500).json({ error: 'Erro ao salvar o fornecedor' });
  }
});

// GET /api/fornecedores/:id
router.get('/:id', async (req, res) => {
  try {
    const f = await query('SELECT * FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1', [req.params.id, req.usuario.id]);
    if (!f.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    const cats = await query(
      'SELECT id, nome_arquivo, paginas, status, erro, origem, formato, total_produtos, ia_status, ia_info, criado_em, atualizado_em,' +
      ' (SELECT count(*) FROM chunks WHERE catalogo_id = catalogos.id)::int AS total_chunks,' +
      ' (SELECT count(*) FROM produtos WHERE catalogo_id = catalogos.id)::int AS produtos_gravados' +
      ' FROM catalogos WHERE fornecedor_id = $1 ORDER BY criado_em DESC', [req.params.id]);
    const total = await query('SELECT count(*)::int AS n FROM produtos WHERE fornecedor_id = $1', [req.params.id]);
    res.json(Object.assign({}, f.rows[0], { catalogos: cats.rows, total_produtos: total.rows[0].n }));
  } catch (err) {
    console.error('Erro ao buscar fornecedor:', err.message);
    res.status(500).json({ error: 'Erro ao carregar o fornecedor' });
  }
});

// GET /api/fornecedores/:id/produtos
router.get('/:id/produtos', async (req, res) => {
  try {
    const f = await query('SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1', [req.params.id, req.usuario.id]);
    if (!f.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    const r = await query(
      'SELECT p.id, p.catalogo_id, p.ordem, p.nome, p.codigo, p.marca, p.categoria, p.descricao, p.bitola, p.tensao, p.material,' +
      ' p.isolamento, p.cobertura, p.temperatura, p.aplicacao, p.norma, p.certificacoes, p.preco, p.unidade, p.atributos, p.origem,' +
      ' c.nome_arquivo FROM produtos p LEFT JOIN catalogos c ON c.id = p.catalogo_id' +
      ' WHERE p.fornecedor_id = $1 AND p.usuario_id = $2 ORDER BY p.catalogo_id DESC, p.ordem ASC LIMIT 10000',
      [req.params.id, req.usuario.id]);
    res.json({ produtos: r.rows, total: r.rows.length });
  } catch (err) {
    console.error('Erro ao listar produtos:', err.message);
    res.status(500).json({ error: 'Erro ao carregar os produtos' });
  }
});

// PUT /api/fornecedores/:id
router.put('/:id', async (req, res) => {
  try {
    const d = dadosFornecedor(req.body);
    if (!d.nome) return res.status(400).json({ error: 'Informe o nome do fornecedor.' });
    const r = await query(
      'UPDATE fornecedores SET nome = $1, email = $2, telefone = $3, whatsapp = $4, whatsapp_link = $5, observacoes = $6, atualizado_em = NOW()' +
      ' WHERE id = $7 AND usuario_id = $8 AND ativo = 1 RETURNING *',
      [d.nome, d.email, d.telefone, d.whatsapp, d.whatsapp_link, d.observacoes, req.params.id, req.usuario.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({ ok: true, fornecedor: r.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err.message);
    res.status(500).json({ error: 'Erro ao salvar o fornecedor' });
  }
});

// DELETE /api/fornecedores/:id (exclusão lógica)
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('UPDATE fornecedores SET ativo = 0, atualizado_em = NOW() WHERE id = $1 AND usuario_id = $2 AND ativo = 1 RETURNING id',
      [req.params.id, req.usuario.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir fornecedor:', err.message);
    res.status(500).json({ error: 'Erro ao excluir o fornecedor' });
  }
});

// POST /api/fornecedores/:id/catalogo (legado: PDF no campo "catalogo", lido no servidor)
router.post('/:id/catalogo', upload.single('catalogo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo PDF.' });
    const pdf = await indexacao.extrairTextoPDF(req.file.buffer);
    const out = await indexacao.indexarTexto({ usuarioId: req.usuario.id, fornecedorId: req.params.id, texto: pdf.texto,
      paginas: pdf.paginas, origem: 'pdf_servidor', nomeArquivo: nomeArquivoUtf8(req.file.originalname) });
    res.status(201).json(Object.assign({ ok: true }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao receber catálogo:', err.message);
    res.status(500).json({ error: 'Não foi possível ler o PDF.' });
  }
});

// GET /api/fornecedores/:id/catalogo/:cid/status
router.get('/:id/catalogo/:cid/status', async (req, res) => {
  try {
    const c = await catalogoDoUsuario(req.params.id, req.params.cid, req.usuario.id);
    if (!c) return res.status(404).json({ error: 'Catálogo não encontrado' });
    const n = await query('SELECT (SELECT count(*) FROM chunks WHERE catalogo_id = $1)::int AS chunks, (SELECT count(*) FROM produtos WHERE catalogo_id = $1)::int AS produtos', [c.id]);
    res.json({ id: c.id, status: c.status, paginas: c.paginas, erro: c.erro, ia_status: c.ia_status, ia_info: c.ia_info,
      total_chunks: n.rows[0].chunks, total_produtos: n.rows[0].produtos, atualizado_em: c.atualizado_em });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/fornecedores/:id/catalogo/:cid/reprocessar — relê o texto salvo (não precisa do PDF)
router.post('/:id/catalogo/:cid/reprocessar', async (req, res) => {
  try {
    const c = await catalogoDoUsuario(req.params.id, req.params.cid, req.usuario.id);
    if (!c) return res.status(404).json({ error: 'Catálogo não encontrado' });
    if (!c.texto_extraido || c.texto_extraido.trim().length < 20) {
      return res.status(400).json({ error: 'Este catálogo não tem texto salvo. Envie o arquivo novamente.' });
    }
    const out = await indexacao.indexarTexto({ usuarioId: req.usuario.id, fornecedorId: c.fornecedor_id, catalogoId: c.id,
      texto: c.texto_extraido, paginas: c.paginas, origem: c.origem || 'reprocessado', nomeArquivo: c.nome_arquivo });
    res.json(Object.assign({ ok: true, msg: 'Catálogo reprocessado' }, out));
  } catch (err) {
    if (err.amigavel) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao reprocessar:', err.message);
    res.status(500).json({ error: 'Erro ao reprocessar' });
  }
});

// POST /api/fornecedores/:id/catalogo/:cid/estruturar — pede à IA para montar a tabela de produtos
router.post('/:id/catalogo/:cid/estruturar', async (req, res) => {
  try {
    const c = await catalogoDoUsuario(req.params.id, req.params.cid, req.usuario.id);
    if (!c) return res.status(404).json({ error: 'Catálogo não encontrado' });
    if (!c.texto_extraido) return res.status(400).json({ error: 'Este catálogo não tem texto salvo.' });
    if (!require('../services/ai.service').configurada()) return res.status(503).json({ error: 'A IA não está configurada no servidor.' });
    await indexacao.agendarEstruturacao(c.id);
    res.status(202).json({ ok: true, msg: 'A IA começou a estruturar os produtos. Isso pode levar alguns minutos.' });
  } catch (err) {
    console.error('Erro ao estruturar:', err.message);
    res.status(500).json({ error: 'Erro ao iniciar a estruturação' });
  }
});

// DELETE /api/fornecedores/:id/catalogo/:cid
router.delete('/:id/catalogo/:cid', async (req, res) => {
  try {
    const c = await catalogoDoUsuario(req.params.id, req.params.cid, req.usuario.id);
    if (!c) return res.status(404).json({ error: 'Catálogo não encontrado' });
    if (c.storage_path) await deleteFile(c.storage_path).catch(function () {});
    await query('DELETE FROM catalogos WHERE id = $1', [c.id]); // chunks e produtos saem em cascata
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir catálogo:', err.message);
    res.status(500).json({ error: 'Erro ao excluir o catálogo' });
  }
});

module.exports = router;
