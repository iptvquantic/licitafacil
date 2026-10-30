// src/routes/admin.js — painel do dono: usuários, pagamentos, saúde do sistema e backup
'use strict';
const express = require('express');
const crypto = require('crypto');
const { query } = require('../utils/db');
const { requireAuth, requireAdmin, statusAcesso } = require('../middleware/auth');
const { PLANOS, diasRestantes, ativarPlano } = require('../services/planos.service');
const ia = require('../services/ai.service');
const email = require('../services/email.service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/resumo', async (req, res) => {
  try {
    const r = await query(
      'SELECT' +
      ' (SELECT count(*) FROM usuarios)::int AS usuarios,' +
      " (SELECT count(*) FROM usuarios WHERE plano = 'trial')::int AS em_teste," +
      " (SELECT count(*) FROM usuarios WHERE plano <> 'trial' AND plano_fim > NOW())::int AS pagantes," +
      " (SELECT count(*) FROM usuarios WHERE (plano = 'trial' AND trial_fim < NOW()) OR (plano <> 'trial' AND plano_fim < NOW()))::int AS vencidos," +
      ' (SELECT count(*) FROM fornecedores WHERE ativo = 1)::int AS fornecedores,' +
      " (SELECT count(*) FROM catalogos WHERE status = 'processado')::int AS catalogos," +
      ' (SELECT count(*) FROM produtos)::int AS produtos,' +
      " (SELECT count(*) FROM pagamentos WHERE status = 'pendente')::int AS pagamentos_pendentes," +
      " (SELECT count(*) FROM usuarios WHERE criado_em > NOW() - INTERVAL '7 days')::int AS novos_7d");
    res.json(r.rows[0]);
  } catch (err) {
    console.error('[admin] resumo:', err.message);
    res.status(500).json({ error: 'Erro ao carregar o resumo' });
  }
});

router.get('/usuarios', async (req, res) => {
  try {
    const r = await query(
      'SELECT u.id, u.nome, u.email, u.plano, u.status, u.trial_fim, u.plano_fim, u.criado_em,' +
      ' (SELECT count(*) FROM fornecedores f WHERE f.usuario_id = u.id AND f.ativo = 1)::int AS fornecedores,' +
      ' (SELECT count(*) FROM produtos p WHERE p.usuario_id = u.id)::int AS produtos' +
      ' FROM usuarios u ORDER BY u.criado_em DESC LIMIT 500');
    res.json({
      usuarios: r.rows.map(function (u) {
        return Object.assign(u, { dias_restantes: diasRestantes(u), acesso: statusAcesso(u) });
      })
    });
  } catch (err) {
    console.error('[admin] usuarios:', err.message);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

router.get('/pagamentos', async (req, res) => {
  try {
    const status = ['pendente', 'aprovado', 'recusado'].indexOf(req.query.status) >= 0 ? req.query.status : 'pendente';
    const r = await query(
      'SELECT p.id, p.plano, p.status, p.observacao, p.criado_em, p.resolvido_em, u.id AS usuario_id, u.nome, u.email, u.plano AS plano_atual, u.plano_fim' +
      ' FROM pagamentos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.status = $1 ORDER BY p.criado_em DESC LIMIT 200', [status]);
    res.json({ pagamentos: r.rows });
  } catch (err) {
    console.error('[admin] pagamentos:', err.message);
    res.status(500).json({ error: 'Erro ao listar pagamentos' });
  }
});

router.post('/pagamentos/:id/aprovar', async (req, res) => {
  try {
    const r = await query("SELECT id, usuario_id, plano FROM pagamentos WHERE id = $1 AND status = 'pendente'", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Solicitação não encontrada ou já resolvida' });
    const plano = PLANOS[req.body.plano] ? req.body.plano : r.rows[0].plano;
    const out = await ativarPlano(r.rows[0].usuario_id, plano);
    await query("UPDATE pagamentos SET status = 'aprovado', plano = $1, resolvido_em = NOW(), resolvido_por = $2 WHERE id = $3",
      [plano, req.usuario.id, r.rows[0].id]);
    res.json(Object.assign({ ok: true }, out));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao aprovar' });
  }
});

router.post('/pagamentos/:id/recusar', async (req, res) => {
  try {
    const r = await query("UPDATE pagamentos SET status = 'recusado', resolvido_em = NOW(), resolvido_por = $1 WHERE id = $2 AND status = 'pendente' RETURNING id",
      [req.usuario.id, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Solicitação não encontrada ou já resolvida' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao recusar' });
  }
});

router.post('/usuarios/:id/plano', async (req, res) => {
  try {
    const out = await ativarPlano(parseInt(req.params.id, 10), String(req.body.plano || ''));
    await query("UPDATE pagamentos SET status = 'aprovado', resolvido_em = NOW(), resolvido_por = $1 WHERE usuario_id = $2 AND status = 'pendente'",
      [req.usuario.id, req.params.id]).catch(function () {});
    res.json(Object.assign({ ok: true }, out));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao ativar plano' });
  }
});

router.post('/usuarios/:id/status', async (req, res) => {
  try {
    const status = req.body.status === 'suspenso' ? 'suspenso' : 'ativo';
    if (parseInt(req.params.id, 10) === req.usuario.id) return res.status(400).json({ error: 'Você não pode suspender a própria conta' });
    const r = await query('UPDATE usuarios SET status = $1, atualizado_em = NOW() WHERE id = $2 RETURNING id', [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ok: true, status: status });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar status' });
  }
});

// Gera um link de nova senha (vale 24h) para o dono mandar ao cliente pelo WhatsApp, sem depender de e-mail
router.post('/usuarios/:id/link-senha', async (req, res) => {
  try {
    const r = await query('SELECT id, email FROM usuarios WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 24 * 3600 * 1000);
    await query('UPDATE usuarios SET reset_token = $1, reset_expiry = $2 WHERE id = $3',
      [crypto.createHash('sha256').update(token).digest('hex'), expira, r.rows[0].id]);
    const base = (process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app').replace(/\/$/, '');
    res.json({ ok: true, email: r.rows[0].email, url: base + '/resetar.html?token=' + token, expira_em: expira.toISOString() });
  } catch (err) {
    console.error('[admin] link-senha:', err.message);
    res.status(500).json({ error: 'Erro ao gerar o link' });
  }
});

router.get('/diagnostico', async (req, res) => {
  const out = { api: 'ok', versao: process.env.APP_VERSION || '3.0.0', node: process.version, hora: new Date().toISOString() };
  try {
    const t = Date.now();
    await query('SELECT 1');
    out.banco = { ok: true, ms: Date.now() - t };
    const rls = await query("SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY relname");
    out.banco.rls = rls.rows;
  } catch (err) { out.banco = { ok: false, erro: err.message }; }
  out.ia = ia.estadoIA();
  try {
    const cap = await ia.capacidades();
    out.ia.visao = !!cap.visao;
    out.ia.modelos_texto = cap.modelos_texto || 0;
    out.ia.modelos_visao = cap.modelos_visao || 0;
    out.ia.cota = cap.cota || null;
  } catch (err) { out.ia.erro_capacidades = err.message; }
  if (req.query.testar_ia === '1') {
    try { out.ia.teste = await ia.testarIA(); } catch (err) { out.ia.teste = { ok: false, erro: err.message }; }
  }
  out.email = { configurado: email.configurado() };
  out.admin_emails = String(process.env.ADMIN_EMAILS || '').split(',').filter(Boolean).length;
  res.json(out);
});

// Backup em JSON (sem senhas e tokens) — para guardar no computador
router.get('/backup', async (req, res) => {
  try {
    const tabelas = {
      usuarios: 'SELECT id, nome, email, plano, status, trial_fim, plano_inicio, plano_fim, criado_em, atualizado_em FROM usuarios ORDER BY id',
      fornecedores: 'SELECT * FROM fornecedores ORDER BY id',
      catalogos: 'SELECT id, fornecedor_id, nome_arquivo, texto_extraido, paginas, status, erro, origem, formato, total_produtos, criado_em, atualizado_em FROM catalogos ORDER BY id',
      produtos: 'SELECT id, usuario_id, fornecedor_id, catalogo_id, ordem, nome, codigo, marca, categoria, descricao, bitola, tensao, material, isolamento, cobertura, temperatura, aplicacao, norma, certificacoes, preco, unidade, atributos, origem, criado_em FROM produtos ORDER BY id',
      pagamentos: 'SELECT * FROM pagamentos ORDER BY id'
    };
    const dados = { gerado_em: new Date().toISOString(), versao: 1 };
    for (const nome of Object.keys(tabelas)) dados[nome] = (await query(tabelas[nome])).rows;
    res.setHeader('Content-Disposition', 'attachment; filename="licitafacil-backup-' + new Date().toISOString().slice(0, 10) + '.json"');
    res.json(dados);
  } catch (err) {
    console.error('[admin] backup:', err.message);
    res.status(500).json({ error: 'Erro ao gerar backup' });
  }
});

module.exports = router;
