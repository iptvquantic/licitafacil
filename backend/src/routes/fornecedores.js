// src/routes/fornecedores.js
const express = require('express');
const multer = require('multer');
const { query, transaction } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');
const { uploadFile, deleteFile } = require('../services/storage.service');
const { processarPDF } = require('../services/pdf.service');

const router = express.Router();

// Multer em memória (sem disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas arquivos PDF são aceitos'));
  }
});

// Todas as rotas requerem autenticação
router.use(requireAuth);

// ─── GET /api/fornecedores ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { busca, pagina = 1, por_pagina = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(por_pagina);

    let whereClause = 'WHERE f.usuario_id = $1 AND f.ativo = 1';
    const params = [req.usuario.id];

    if (busca) {
      params.push(`%${busca}%`);
      whereClause += ` AND (f.nome ILIKE $${params.length} OR f.email ILIKE $${params.length} OR f.telefone ILIKE $${params.length})`;
    }

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT 
          f.id, f.nome, f.email, f.telefone, f.whatsapp, f.observacoes,
          f.criado_em, f.atualizado_em,
          COUNT(DISTINCT cat.id) FILTER (WHERE cat.status = 'processado') as total_catalogos,
          COUNT(DISTINCT c.id) as total_chunks
        FROM fornecedores f
        LEFT JOIN catalogos cat ON cat.fornecedor_id = f.id
        LEFT JOIN chunks c ON c.fornecedor_id = f.id
        ${whereClause}
        GROUP BY f.id
        ORDER BY f.nome ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, por_pagina, offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM fornecedores f ${whereClause}`,
        params
      )
    ]);

    res.json({
      fornecedores: dataResult.rows.map(f => ({
        ...f,
        total_catalogos: parseInt(f.total_catalogos) || 0,
        total_chunks: parseInt(f.total_chunks) || 0
      })),
      total: parseInt(countResult.rows[0].total),
      pagina: parseInt(pagina),
      por_pagina: parseInt(por_pagina)
    });
  } catch (err) {
    console.error('Erro ao listar fornecedores:', err);
    res.status(500).json({ error: 'Erro ao buscar fornecedores' });
  }
});

// ─── POST /api/fornecedores ───────────────────────────────────────────────────
router.post('/', upload.single('catalogo'), async (req, res) => {
  try {
    const { nome, email, telefone, whatsapp, observacoes } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });
    }

    const whatsappLink = whatsapp
      ? `https://wa.me/55${whatsapp.replace(/\D/g, '')}`
      : null;

    const result = await query(
      `INSERT INTO fornecedores (usuario_id, nome, email, telefone, whatsapp, whatsapp_link, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.usuario.id, nome.trim(), email || null, telefone || null, whatsapp || null, whatsappLink, observacoes || null]
    );

    const fornecedor = result.rows[0];

    // Se enviou PDF junto, processar
    if (req.file) {
      processarCatalogo(fornecedor.id, req.file).catch(console.error);
    }

    res.status(201).json({ ok: true, fornecedor });
  } catch (err) {
    console.error('Erro ao criar fornecedor:', err);
    res.status(500).json({ error: 'Erro ao criar fornecedor' });
  }
});

// ─── GET /api/fornecedores/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [fornResult, catResult] = await Promise.all([
      query(
        'SELECT * FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1',
        [req.params.id, req.usuario.id]
      ),
      query(
        `SELECT id, nome_arquivo, paginas, status, erro, criado_em, atualizado_em,
          (SELECT COUNT(*) FROM chunks WHERE catalogo_id = catalogos.id) as total_chunks
        FROM catalogos WHERE fornecedor_id = $1 ORDER BY criado_em DESC`,
        [req.params.id]
      )
    ]);

    if (fornResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    res.json({
      ...fornResult.rows[0],
      catalogos: catResult.rows.map(c => ({
        ...c,
        total_chunks: parseInt(c.total_chunks) || 0
      }))
    });
  } catch (err) {
    console.error('Erro ao buscar fornecedor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── PUT /api/fornecedores/:id ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { nome, email, telefone, whatsapp, observacoes } = req.body;

    // Verificar ownership
    const check = await query(
      'SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1',
      [req.params.id, req.usuario.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    const whatsappLink = whatsapp
      ? `https://wa.me/55${whatsapp.replace(/\D/g, '')}`
      : null;

    const result = await query(
      `UPDATE fornecedores SET
        nome = COALESCE($1, nome),
        email = $2,
        telefone = $3,
        whatsapp = $4,
        whatsapp_link = $5,
        observacoes = $6,
        atualizado_em = NOW()
       WHERE id = $7 AND usuario_id = $8
       RETURNING *`,
      [nome?.trim(), email || null, telefone || null, whatsapp || null, whatsappLink, observacoes || null, req.params.id, req.usuario.id]
    );

    res.json({ ok: true, fornecedor: result.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar fornecedor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── DELETE /api/fornecedores/:id ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'UPDATE fornecedores SET ativo = 0, atualizado_em = NOW() WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.usuario.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir fornecedor:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/fornecedores/:id/catalogo ─────────────────────────────────────
router.post('/:id/catalogo', upload.single('catalogo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo PDF obrigatório' });
    }

    // Verificar ownership
    const check = await query(
      'SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1',
      [req.params.id, req.usuario.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }

    // Criar registro do catálogo
    const catResult = await query(
      `INSERT INTO catalogos (fornecedor_id, nome_arquivo, status)
       VALUES ($1, $2, 'pendente')
       RETURNING id`,
      [req.params.id, req.file.originalname]
    );
    const catalogoId = catResult.rows[0].id;

    // Processar em background (não await)
    processarCatalogo(req.params.id, req.file, catalogoId).catch(console.error);

    res.status(202).json({
      ok: true,
      catalogo_id: catalogoId,
      msg: 'PDF recebido. Processando em background...'
    });
  } catch (err) {
    console.error('Erro ao receber catálogo:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── GET /api/fornecedores/:id/catalogo/:cid/status ──────────────────────────
router.get('/:id/catalogo/:cid/status', async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id, c.status, c.paginas, c.erro, c.atualizado_em,
        COUNT(ch.id) as total_chunks
       FROM catalogos c
       LEFT JOIN chunks ch ON ch.catalogo_id = c.id
       WHERE c.id = $1 AND c.fornecedor_id = $2
       GROUP BY c.id`,
      [req.params.cid, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const cat = result.rows[0];
    res.json({
      id: cat.id,
      status: cat.status,
      paginas: cat.paginas,
      erro: cat.erro,
      total_chunks: parseInt(cat.total_chunks) || 0,
      atualizado_em: cat.atualizado_em
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── POST /api/fornecedores/:id/catalogo/:cid/reprocessar ────────────────────
router.post('/:id/catalogo/:cid/reprocessar', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM catalogos WHERE id = $1 AND fornecedor_id = $2',
      [req.params.cid, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const catalogo = result.rows[0];
    if (!catalogo.storage_path) {
      return res.status(400).json({ error: 'Arquivo não encontrado no storage para reprocessar' });
    }

    // Reprocessar em background
    processarPDF(catalogo.id, catalogo.storage_path).catch(console.error);

    res.json({ ok: true, msg: 'Reprocessamento iniciado' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── DELETE /api/fornecedores/:id/catalogo/:cid ───────────────────────────────
router.delete('/:id/catalogo/:cid', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM catalogos WHERE id = $1 AND fornecedor_id = $2',
      [req.params.cid, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Catálogo não encontrado' });
    }

    const catalogo = result.rows[0];

    // Deletar do storage
    if (catalogo.storage_path) {
      await deleteFile(catalogo.storage_path).catch(console.error);
    }

    // Deletar chunks e catálogo
    await query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogo.id]);
    await query('DELETE FROM catalogos WHERE id = $1', [catalogo.id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao deletar catálogo:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ─── Helper interno ───────────────────────────────────────────────────────────
async function processarCatalogo(fornecedorId, file, catalogoId = null) {
  try {
    // 1. Upload para R2
    const { key } = await uploadFile(file.buffer, file.originalname, file.mimetype);

    // 2. Se não tem catalogoId, criar registro
    if (!catalogoId) {
      const result = await query(
        `INSERT INTO catalogos (fornecedor_id, nome_arquivo, storage_path, status)
         VALUES ($1, $2, $3, 'pendente') RETURNING id`,
        [fornecedorId, file.originalname, key]
      );
      catalogoId = result.rows[0].id;
    } else {
      await query(
        'UPDATE catalogos SET storage_path = $1 WHERE id = $2',
        [key, catalogoId]
      );
    }

    // 3. Processar PDF
    await processarPDF(catalogoId, key);
  } catch (err) {
    console.error('Erro no pipeline de catálogo:', err);
    if (catalogoId) {
      await query(
        'UPDATE catalogos SET status = $1, erro = $2 WHERE id = $3',
        ['erro', err.message, catalogoId]
      );
    }
  }
}

module.exports = router;
