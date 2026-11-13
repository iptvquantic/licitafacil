// src/routes/busca.js — busca por produto, pergunta à IA e estatísticas
'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAcesso } = require('../middleware/auth');
const { buscar, buscarLote, getStats } = require('../services/busca.service');
const { perguntarIA } = require('../services/ai.service');

const router = express.Router();
router.use(requireAuth);

// Limite por usuário na IA (evita gastar a cota gratuita)
const limiteIA = rateLimit({
  windowMs: 10 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: function (req) { return 'u' + req.usuario.id; },
  message: { error: 'Muitas perguntas seguidas para a IA. Aguarde alguns minutos.' }
});

// GET /api/busca/stats (liberado mesmo com plano vencido)
router.get('/stats', async (req, res) => {
  try {
    res.json(await getStats(req.usuario.id));
  } catch (err) {
    console.error('Erro ao buscar stats:', err.message);
    res.status(500).json({ error: 'Erro ao carregar os números' });
  }
});

// POST /api/busca { consulta, limite, fornecedor_id }
router.post('/', requireAcesso, async (req, res) => {
  try {
    const consulta = String(req.body.consulta || '').trim().slice(0, 300); // cabe a linha inteira de um edital
    if (consulta.length < 2) return res.status(400).json({ error: 'Digite pelo menos 2 caracteres.' });
    const out = await buscar(consulta, req.usuario.id, {
      limiteProdutos: req.body.limite_produtos || 40,
      limiteFornecedores: req.body.limite || 10,
      fornecedorId: req.body.fornecedor_id || null
    });
    res.json(out);
  } catch (err) {
    console.error('Erro na busca:', err.message);
    res.status(500).json({ error: 'Erro ao buscar. Tente de novo.' });
  }
});

// POST /api/busca/lote { itens: ["cabo pp 3x2,5mm", …] } — cotação: quem tem cada item (até 40 itens por chamada)
router.post('/lote', requireAcesso, async (req, res) => {
  try {
    // a resposta vem na mesma ordem e com o mesmo tamanho da lista enviada (item em branco volta sem fornecedor)
    const itens = (Array.isArray(req.body.itens) ? req.body.itens : []).slice(0, 40)
      .map(function (v) { return typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 300) : ''; });
    if (!itens.some(function (v) { return v.length >= 2; })) return res.status(400).json({ error: 'Informe pelo menos um item.' });
    res.json({ itens: await buscarLote(itens, req.usuario.id) });
  } catch (err) {
    console.error('Erro na cotação em lista:', err.message);
    res.status(500).json({ error: 'Erro ao conferir os itens. Tente de novo.' });
  }
});

// POST /api/busca/responder { consulta, fornecedor_id }
router.post('/responder', requireAcesso, limiteIA, async (req, res) => {
  try {
    const consulta = String(req.body.consulta || '').trim().slice(0, 300);
    if (consulta.length < 2) return res.status(400).json({ error: 'Digite sua pergunta.' });
    res.json(await perguntarIA(consulta, req.usuario.id, req.body.fornecedor_id || null));
  } catch (err) {
    console.error('Erro na resposta IA:', err.message);
    res.status(500).json({ error: 'Erro ao gerar a resposta. Tente de novo.' });
  }
});

module.exports = router;
