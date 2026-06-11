// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Não autenticado', code: 'AUTH_REQUIRED' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Sessão expirada', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Token inválido', code: 'TOKEN_INVALID' });
    }

    const result = await query(
      'SELECT id, nome, email, plano, status, trial_fim, plano_fim FROM usuarios WHERE id = $1 AND status != $2',
      [decoded.id, 'suspenso']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
    }

    const usuario = result.rows[0];

    // Verificar expiração do trial/plano
    const agora = new Date();
    if (usuario.plano === 'trial' && usuario.trial_fim && new Date(usuario.trial_fim) < agora) {
      return res.status(403).json({
        error: 'Período de trial expirado',
        code: 'TRIAL_EXPIRED',
        redirect: '/planos.html'
      });
    }
    if (['mensal', 'trimestral', 'anual'].includes(usuario.plano) && usuario.plano_fim && new Date(usuario.plano_fim) < agora) {
      return res.status(403).json({
        error: 'Plano expirado. Renove para continuar.',
        code: 'PLAN_EXPIRED',
        redirect: '/planos.html'
      });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('Erro no middleware de auth:', err);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers?.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query('SELECT id, nome, email, plano FROM usuarios WHERE id = $1', [decoded.id]);
      if (result.rows.length > 0) req.usuario = result.rows[0];
    }
  } catch (_) {
    // silencioso — auth é opcional
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
