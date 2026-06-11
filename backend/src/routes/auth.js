// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || '15');
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
};

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function diasRestantes(usuario) {
  const agora = new Date();
  if (usuario.plano === 'trial' && usuario.trial_fim) {
    const diff = new Date(usuario.trial_fim) - agora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  if (usuario.plano_fim) {
    const diff = new Date(usuario.plano_fim) - agora;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  return null;
}

// POST /api/auth/cadastro
router.post('/cadastro', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Verificar se email já existe
    const existe = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Este email já está cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const trialFim = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const result = await query(
      `INSERT INTO usuarios (nome, email, senha, plano, status, trial_fim)
       VALUES ($1, $2, $3, 'trial', 'ativo', $4)
       RETURNING id, nome, email, plano, status, trial_fim`,
      [nome.trim(), email.toLowerCase().trim(), senhaHash, trialFim]
    );

    const usuario = result.rows[0];
    const token = gerarToken(usuario);

    res.cookie('token', token, COOKIE_OPTS);
    res.status(201).json({
      ok: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        plano: usuario.plano,
        dias_restantes: TRIAL_DAYS
      }
    });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro ao criar conta. Tente novamente.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const usuario = result.rows[0];

    if (usuario.status === 'suspenso') {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });
    }

    const senhaOk = await bcrypt.compare(senha, usuario.senha);
    if (!senhaOk) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = gerarToken(usuario);
    res.cookie('token', token, COOKIE_OPTS);

    res.json({
      ok: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        plano: usuario.plano,
        dias_restantes: diasRestantes(usuario)
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro ao fazer login. Tente novamente.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const u = req.usuario;
  res.json({
    id: u.id,
    nome: u.nome,
    email: u.email,
    plano: u.plano,
    status: u.status,
    dias_restantes: diasRestantes(u)
  });
});

// POST /api/auth/recuperar
router.post('/recuperar', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });

    const result = await query('SELECT id, nome FROM usuarios WHERE email = $1', [email.toLowerCase()]);

    // Sempre retornar sucesso para não revelar emails cadastrados
    if (result.rows.length === 0) {
      return res.json({ ok: true, msg: 'Se o email estiver cadastrado, você receberá as instruções.' });
    }

    const token = uuidv4();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await query(
      'UPDATE usuarios SET reset_token = $1, reset_expiry = $2 WHERE email = $3',
      [token, expiry, email.toLowerCase()]
    );

    const resetUrl = `${process.env.FRONTEND_URL || 'https://licitafacil.vercel.app'}/resetar.html?token=${token}`;
    console.log(`[RESET] Token para ${email}: ${resetUrl}`);

    // TODO: enviar email real com nodemailer
    // await emailService.enviarResetSenha(email, resetUrl);

    res.json({ ok: true, msg: 'Se o email estiver cadastrado, você receberá as instruções.', _dev_token: process.env.NODE_ENV === 'development' ? token : undefined });
  } catch (err) {
    console.error('Erro ao recuperar senha:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/resetar
router.post('/resetar', async (req, res) => {
  try {
    const { token, senha } = req.body;
    if (!token || !senha) return res.status(400).json({ error: 'Token e senha obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const result = await query(
      'SELECT id FROM usuarios WHERE reset_token = $1 AND reset_expiry > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    await query(
      'UPDATE usuarios SET senha = $1, reset_token = NULL, reset_expiry = NULL WHERE id = $2',
      [senhaHash, result.rows[0].id]
    );

    res.json({ ok: true, msg: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('Erro ao resetar senha:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/ativar-plano
router.post('/ativar-plano', async (req, res) => {
  try {
    const { email, plano } = req.body;
    if (!email || !plano) return res.status(400).json({ error: 'Email e plano obrigatórios' });

    const planosValidos = { mensal: 30, trimestral: 90, anual: 365 };
    if (!planosValidos[plano]) {
      return res.status(400).json({ error: 'Plano inválido. Use: mensal, trimestral ou anual' });
    }

    const result = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }

    const dias = planosValidos[plano];
    const planoInicio = new Date();
    const planoFim = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);

    await query(
      'UPDATE usuarios SET plano = $1, plano_inicio = $2, plano_fim = $3, status = $4 WHERE email = $5',
      [plano, planoInicio, planoFim, 'ativo', email.toLowerCase()]
    );

    res.json({ ok: true, msg: `Plano ${plano} ativado até ${planoFim.toLocaleDateString('pt-BR')}` });
  } catch (err) {
    console.error('Erro ao ativar plano:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/auth/perfil
router.put('/perfil', requireAuth, async (req, res) => {
  try {
    const { nome, senha_atual, senha_nova } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (nome && nome.trim()) {
      updates.push(`nome = $${idx++}`);
      values.push(nome.trim());
    }

    if (senha_atual && senha_nova) {
      if (senha_nova.length < 6) {
        return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
      }
      const result = await query('SELECT senha FROM usuarios WHERE id = $1', [req.usuario.id]);
      const ok = await bcrypt.compare(senha_atual, result.rows[0].senha);
      if (!ok) return res.status(400).json({ error: 'Senha atual incorreta' });
      updates.push(`senha = $${idx++}`);
      values.push(await bcrypt.hash(senha_nova, 12));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nenhuma alteração enviada' });

    values.push(req.usuario.id);
    await query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );

    res.json({ ok: true, msg: 'Perfil atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
