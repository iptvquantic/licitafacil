// src/routes/auth.js — cadastro, login, sessão, senha e plano
'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { query } = require('../utils/db');
const { requireAuth, requireAdmin, statusAcesso, ehAdmin } = require('../middleware/auth');
const { PLANOS, diasRestantes, ativarPlano } = require('../services/planos.service');
const email = require('../services/email.service');

const router = express.Router();
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '15', 10);
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Limite só nas rotas sensíveis (login, cadastro e senha); /me fica livre
const limiteSensivel = rateLimit({
  windowMs: 15 * 60 * 1000, max: 25, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }
});

function gerarToken(u) {
  return jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function hashToken(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }

function resumoUsuario(u) {
  return {
    id: u.id, nome: u.nome, email: u.email, plano: u.plano, status: u.status,
    dias_restantes: diasRestantes(u), acesso: statusAcesso(u), admin: ehAdmin(u),
    trial_fim: u.trial_fim || null, plano_fim: u.plano_fim || null
  };
}

router.post('/cadastro', limiteSensivel, async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim().slice(0, 120);
    const mail = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    if (!nome || !mail || !senha) return res.status(400).json({ error: 'Preencha nome, e-mail e senha.' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    if (!RE_EMAIL.test(mail)) return res.status(400).json({ error: 'E-mail inválido.' });
    const existe = await query('SELECT id FROM usuarios WHERE email = $1', [mail]);
    if (existe.rows.length) return res.status(409).json({ error: 'Este e-mail já tem conta. Use "Entrar" ou "Esqueceu a senha?".', code: 'EMAIL_EXISTE' });
    const senhaHash = await bcrypt.hash(senha, 12);
    const trialFim = new Date(Date.now() + TRIAL_DAYS * 86400000);
    const result = await query(
      "INSERT INTO usuarios (nome, email, senha, plano, status, trial_fim) VALUES ($1, $2, $3, 'trial', 'ativo', $4) RETURNING *",
      [nome, mail, senhaHash, trialFim]);
    const u = result.rows[0];
    res.status(201).json({ ok: true, token: gerarToken(u), usuario: resumoUsuario(u) });
  } catch (err) {
    console.error('Erro no cadastro:', err.message);
    res.status(500).json({ error: 'Não foi possível criar a conta agora. Tente de novo em instantes.' });
  }
});

router.post('/login', limiteSensivel, async (req, res) => {
  try {
    const mail = String(req.body.email || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');
    if (!mail || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });
    const result = await query('SELECT * FROM usuarios WHERE email = $1', [mail]);
    if (!result.rows.length) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    const u = result.rows[0];
    const ok = await bcrypt.compare(senha, u.senha);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    if (u.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa. Fale com o suporte.' });
    res.json({ ok: true, token: gerarToken(u), usuario: resumoUsuario(u) });
  } catch (err) {
    console.error('Erro no login:', err.message);
    res.status(500).json({ error: 'Não foi possível entrar agora. Tente de novo em instantes.' });
  }
});

router.post('/logout', (req, res) => { res.json({ ok: true }); });

router.get('/me', requireAuth, async (req, res) => {
  const u = req.usuario;
  let pendente = null;
  try {
    const p = await query("SELECT id, plano, criado_em FROM pagamentos WHERE usuario_id = $1 AND status = 'pendente' ORDER BY id DESC LIMIT 1", [u.id]);
    pendente = p.rows[0] || null;
  } catch (_) { /* tabela ainda sendo criada */ }
  const r = resumoUsuario(u);
  r.pagamento_pendente = pendente;
  r.planos = PLANOS;
  res.json(r);
});

router.post('/recuperar', limiteSensivel, async (req, res) => {
  const resposta = { ok: true, msg: 'Se o e-mail estiver cadastrado, você vai receber o link para criar uma nova senha.' };
  try {
    const mail = String(req.body.email || '').trim().toLowerCase();
    if (!mail) return res.status(400).json({ error: 'Informe o e-mail.' });
    const result = await query('SELECT id, nome FROM usuarios WHERE email = $1', [mail]);
    if (!result.rows.length) return res.json(resposta);
    const token = crypto.randomBytes(32).toString('hex');
    await query('UPDATE usuarios SET reset_token = $1, reset_expiry = $2 WHERE id = $3',
      [hashToken(token), new Date(Date.now() + 3600000), result.rows[0].id]);
    const url = (process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app') + '/resetar.html?token=' + token;
    let enviado = false;
    try {
      enviado = await email.enviarEmail(mail, 'Crie sua nova senha — LicitaFácil',
        '<p>Olá, ' + String(result.rows[0].nome).replace(/[<>&]/g, '') + '.</p><p>Para criar uma nova senha, clique no link abaixo (vale por 1 hora):</p>' +
        '<p><a href="' + url + '">' + url + '</a></p><p>Se não foi você, ignore este e-mail.</p>',
        'Para criar uma nova senha, acesse (vale por 1 hora): ' + url);
    } catch (err) { console.error('[recuperar] falha ao enviar e-mail: ' + err.message); }
    if (!enviado) console.log('[recuperar] e-mail não configurado; link gerado para usuário ' + result.rows[0].id);
    if (process.env.NODE_ENV === 'development') resposta._dev_url = url;
    res.json(resposta);
  } catch (err) {
    console.error('Erro em recuperar:', err.message);
    res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
});

router.post('/resetar', limiteSensivel, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const senha = String(req.body.senha || '');
    if (!token || !senha) return res.status(400).json({ error: 'Link inválido ou senha vazia.' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    const result = await query('SELECT id FROM usuarios WHERE reset_token = $1 AND reset_expiry > NOW()', [hashToken(token)]);
    if (!result.rows.length) return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
    await query('UPDATE usuarios SET senha = $1, reset_token = NULL, reset_expiry = NULL, atualizado_em = NOW() WHERE id = $2',
      [await bcrypt.hash(senha, 12), result.rows[0].id]);
    res.json({ ok: true, msg: 'Senha alterada. Entre com a nova senha.' });
  } catch (err) {
    console.error('Erro em resetar:', err.message);
    res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
});

// Cliente avisa que pagou → fica pendente até o administrador confirmar
router.post('/plano/solicitar', requireAuth, async (req, res) => {
  try {
    const plano = String(req.body.plano || '');
    if (!PLANOS[plano]) return res.status(400).json({ error: 'Escolha um plano válido.' });
    const obs = String(req.body.observacao || '').trim().slice(0, 500) || null;
    const aberto = await query("SELECT id FROM pagamentos WHERE usuario_id = $1 AND status = 'pendente'", [req.usuario.id]);
    if (aberto.rows.length) {
      await query('UPDATE pagamentos SET plano = $1, observacao = $2, criado_em = NOW() WHERE id = $3', [plano, obs, aberto.rows[0].id]);
    } else {
      await query("INSERT INTO pagamentos (usuario_id, plano, status, observacao) VALUES ($1, $2, 'pendente', $3)", [req.usuario.id, plano, obs]);
    }
    res.json({ ok: true, msg: 'Recebemos seu aviso. Assim que o pagamento for confirmado, o plano ' + PLANOS[plano].nome + ' é liberado (até 24h).' });
  } catch (err) {
    console.error('Erro ao solicitar plano:', err.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente de novo.' });
  }
});

// Ativação manual: SOMENTE administrador
router.post('/ativar-plano', requireAuth, requireAdmin, async (req, res) => {
  try {
    const plano = String(req.body.plano || '');
    let usuarioId = parseInt(req.body.usuario_id, 10) || null;
    if (!usuarioId && req.body.email) {
      const r = await query('SELECT id FROM usuarios WHERE email = $1', [String(req.body.email).trim().toLowerCase()]);
      if (!r.rows.length) return res.status(404).json({ error: 'E-mail não encontrado' });
      usuarioId = r.rows[0].id;
    }
    if (!usuarioId) return res.status(400).json({ error: 'Informe o usuário' });
    const out = await ativarPlano(usuarioId, plano);
    await query("UPDATE pagamentos SET status = 'aprovado', resolvido_em = NOW(), resolvido_por = $1 WHERE usuario_id = $2 AND status = 'pendente'",
      [req.usuario.id, usuarioId]).catch(function () {});
    res.json(Object.assign({ ok: true }, out));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno' });
  }
});

router.put('/perfil', requireAuth, async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim().slice(0, 120);
    const atual = String(req.body.senha_atual || '');
    const nova = String(req.body.senha_nova || '');
    const sets = [];
    const vals = [];
    if (nome) { vals.push(nome); sets.push('nome = $' + vals.length); }
    if (atual || nova) {
      if (!atual || !nova) return res.status(400).json({ error: 'Para trocar a senha, preencha a atual e a nova.' });
      if (nova.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      const r = await query('SELECT senha FROM usuarios WHERE id = $1', [req.usuario.id]);
      if (!(await bcrypt.compare(atual, r.rows[0].senha))) return res.status(400).json({ error: 'Senha atual incorreta.' });
      vals.push(await bcrypt.hash(nova, 12));
      sets.push('senha = $' + vals.length);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para salvar.' });
    vals.push(req.usuario.id);
    await query('UPDATE usuarios SET ' + sets.join(', ') + ', atualizado_em = NOW() WHERE id = $' + vals.length, vals);
    res.json({ ok: true, msg: 'Dados atualizados.' });
  } catch (err) {
    console.error('Erro no perfil:', err.message);
    res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  }
});

module.exports = router;
