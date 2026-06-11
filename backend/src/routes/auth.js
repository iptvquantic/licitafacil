const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '15');

function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id, email: usuario.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function diasRestantes(usuario) {
  var agora = new Date();
  if (usuario.plano === 'trial' && usuario.trial_fim) {
    var diff = new Date(usuario.trial_fim) - agora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  if (usuario.plano_fim) {
    var diff2 = new Date(usuario.plano_fim) - agora;
    return Math.max(0, Math.ceil(diff2 / (1000 * 60 * 60 * 24)));
  }
  return null;
}

router.post('/cadastro', async (req, res) => {
  try {
    var nome = req.body.nome, email = req.body.email, senha = req.body.senha;
    if (!nome || !email || !senha) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Email inválido' });
    var existe = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (existe.rows.length > 0) return res.status(409).json({ error: 'Este email já está cadastrado' });
    var senhaHash = await bcrypt.hash(senha, 12);
    var trialFim = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    var result = await query(
      'INSERT INTO usuarios (nome, email, senha, plano, status, trial_fim) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nome, email, plano, status, trial_fim',
      [nome.trim(), email.toLowerCase().trim(), senhaHash, 'trial', 'ativo', trialFim]
    );
    var usuario = result.rows[0];
    var token = gerarToken(usuario);
    res.status(201).json({ ok: true, token: token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano, dias_restantes: TRIAL_DAYS } });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro ao criar conta. Tente novamente.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    var email = req.body.email, senha = req.body.senha;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    var result = await query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Email ou senha incorretos' });
    var usuario = result.rows[0];
    if (usuario.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa.' });
    var senhaOk = await bcrypt.compare(senha, usuario.senha);
    if (!senhaOk) return res.status(401).json({ error: 'Email ou senha incorretos' });
    var token = gerarToken(usuario);
    res.json({ ok: true, token: token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano, dias_restantes: diasRestantes(usuario) } });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro ao fazer login. Tente novamente.' });
  }
});

router.post('/logout', (req, res) => { res.json({ ok: true }); });

router.get('/me', requireAuth, async (req, res) => {
  var u = req.usuario;
  res.json({ id: u.id, nome: u.nome, email: u.email, plano: u.plano, status: u.status, dias_restantes: diasRestantes(u) });
});

router.post('/recuperar', async (req, res) => {
  try {
    var email = req.body.email;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });
    var result = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.json({ ok: true, msg: 'Se o email estiver cadastrado, você receberá as instruções.' });
    var token = uuidv4();
    var expiry = new Date(Date.now() + 60 * 60 * 1000);
    await query('UPDATE usuarios SET reset_token = $1, reset_expiry = $2 WHERE email = $3', [token, expiry, email.toLowerCase()]);
    var resetUrl = (process.env.FRONTEND_URL || 'https://licitafacil-one.vercel.app') + '/resetar.html?token=' + token;
    console.log('[RESET] URL para ' + email + ': ' + resetUrl);
    res.json({ ok: true, msg: 'Se o email estiver cadastrado, você receberá as instruções.', _dev_token: process.env.NODE_ENV === 'development' ? token : undefined });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/resetar', async (req, res) => {
  try {
    var token = req.body.token, senha = req.body.senha;
    if (!token || !senha) return res.status(400).json({ error: 'Token e senha obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    var result = await query('SELECT id FROM usuarios WHERE reset_token = $1 AND reset_expiry > NOW()', [token]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Token inválido ou expirado' });
    var senhaHash = await bcrypt.hash(senha, 12);
    await query('UPDATE usuarios SET senha = $1, reset_token = NULL, reset_expiry = NULL WHERE id = $2', [senhaHash, result.rows[0].id]);
    res.json({ ok: true, msg: 'Senha alterada com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/ativar-plano', async (req, res) => {
  try {
    var email = req.body.email, plano = req.body.plano;
    if (!email || !plano) return res.status(400).json({ error: 'Email e plano obrigatórios' });
    var planosValidos = { mensal: 30, trimestral: 90, anual: 365 };
    if (!planosValidos[plano]) return res.status(400).json({ error: 'Plano inválido' });
    var result = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Email não encontrado' });
    var dias = planosValidos[plano];
    var planoInicio = new Date();
    var planoFim = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
    await query('UPDATE usuarios SET plano = $1, plano_inicio = $2, plano_fim = $3, status = $4 WHERE email = $5', [plano, planoInicio, planoFim, 'ativo', email.toLowerCase()]);
    res.json({ ok: true, msg: 'Plano ' + plano + ' ativado até ' + planoFim.toLocaleDateString('pt-BR') });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/perfil', requireAuth, async (req, res) => {
  try {
    var nome = req.body.nome, senha_atual = req.body.senha_atual, senha_nova = req.body.senha_nova;
    var updates = [], values = [], idx = 1;
    if (nome && nome.trim()) { updates.push('nome = $' + idx++); values.push(nome.trim()); }
    if (senha_atual && senha_nova) {
      if (senha_nova.length < 6) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
      var result = await query('SELECT senha FROM usuarios WHERE id = $1', [req.usuario.id]);
      var ok = await bcrypt.compare(senha_atual, result.rows[0].senha);
      if (!ok) return res.status(400).json({ error: 'Senha atual incorreta' });
      updates.push('senha = $' + idx++);
      values.push(await bcrypt.hash(senha_nova, 12));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nenhuma alteração enviada' });
    values.push(req.usuario.id);
    await query('UPDATE usuarios SET ' + updates.join(', ') + ' WHERE id = $' + idx, values);
    res.json({ ok: true, msg: 'Perfil atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
