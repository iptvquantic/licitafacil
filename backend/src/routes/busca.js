// src/routes/busca.js
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { buscaHibrida, getStats } = require('../services/busca.service');
const { perguntarIA } = require('../services/ai.service');

const router = express.Router();
router.use(requireAuth);

// POST /api/busca
router.post('/', async (req, res) => {
  try {
    const { consulta, limite = 5 } = req.body;

    if (!consulta || !consulta.trim()) {
      return res.status(400).json({ error: 'Consulta não pode ser vazia' });
    }
    if (consulta.trim().length < 2) {
      return res.status(400).json({ error: 'Consulta muito curta' });
    }

    const resultado = await buscaHibrida(consulta.trim(), req.usuario.id, Math.min(parseInt(limite) || 5, 20));

    res.json(resultado);
  } catch (err) {
    console.error('Erro na busca:', err);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
});

// POST /api/busca/responder
router.post('/responder', async (req, res) => {
  try {
    const { consulta, fornecedor_id } = req.body;

    if (!consulta || !consulta.trim()) {
      return res.status(400).json({ error: 'Consulta não pode ser vazia' });
    }

    const resultado = await perguntarIA(consulta.trim(), req.usuario.id, fornecedor_id || null);
    res.json(resultado);
  } catch (err) {
    console.error('Erro na resposta IA:', err);
    res.status(500).json({ error: 'Erro ao gerar resposta' });
  }
});

// GET /api/busca/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats(req.usuario.id);
    res.json(stats);
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
