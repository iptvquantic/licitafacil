// src/middleware/auth.js — JWT Bearer, plano ativo e acesso de administrador
'use strict';
const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

function emailsAdmin() {
  return String(process.env.ADMIN_EMAILS || '').split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
}

function ehAdmin(usuario) {
  return !!(usuario && usuario.email && emailsAdmin().indexOf(String(usuario.email).toLowerCase()) >= 0);
}

// 'ativo' | 'expirado' | 'suspenso'
function statusAcesso(u) {
  if (!u) return 'expirado';
  if (u.status === 'suspenso') return 'suspenso';
  if (ehAdmin(u)) return 'ativo';
  const agora = Date.now();
  if (u.plano === 'trial') {
    if (!u.trial_fim) return 'ativo';
    return new Date(u.trial_fim).getTime() > agora ? 'ativo' : 'expirado';
  }
  if (!u.plano_fim) return 'ativo';
  return new Date(u.plano_fim).getTime() > agora ? 'ativo' : 'expirado';
}

function lerToken(req) {
  const h = req.headers || {};
  if (h.authorization && /^Bearer\s+/i.test(h.authorization)) return h.authorization.replace(/^Bearer\s+/i, '').trim();
  return h['x-auth-token'] || null;
}

async function requireAuth(req, res, next) {
  try {
    const token = lerToken(req);
    if (!token) return res.status(401).json({ error: 'Não autenticado', code: 'AUTH_REQUIRED' });
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Sessão expirada. Entre novamente.', code: 'TOKEN_EXPIRED' });
      return res.status(401).json({ error: 'Sessão inválida. Entre novamente.', code: 'TOKEN_INVALID' });
    }
    const result = await query(
      'SELECT id, nome, email, plano, status, trial_fim, plano_inicio, plano_fim, criado_em FROM usuarios WHERE id = $1',
      [decoded.id]);
    if (!result.rows.length) return res.status(401).json({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
    const u = result.rows[0];
    if (u.status === 'suspenso') return res.status(403).json({ error: 'Conta suspensa. Fale com o suporte.', code: 'CONTA_SUSPENSA' });
    u.admin = ehAdmin(u);
    u.acesso = statusAcesso(u);
    req.usuario = u;
    next();
  } catch (err) {
    console.error('Erro no middleware de auth:', err.message);
    res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente de novo em instantes.', code: 'INDISPONIVEL' });
  }
}

// Bloqueia uso quando o teste ou o plano venceu (leitura dos próprios dados continua liberada)
function requireAcesso(req, res, next) {
  if (req.usuario && req.usuario.acesso === 'ativo') return next();
  return res.status(402).json({
    error: 'Seu período de acesso terminou. Escolha um plano para continuar usando a busca e o envio de catálogos.',
    code: 'PLANO_EXPIRADO'
  });
}

function requireAcessoEscrita(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireAcesso(req, res, next);
}

function requireAdmin(req, res, next) {
  if (req.usuario && req.usuario.admin) return next();
  return res.status(403).json({ error: 'Acesso restrito ao administrador', code: 'ADMIN_REQUIRED' });
}

module.exports = { requireAuth, requireAcesso, requireAcessoEscrita, requireAdmin, ehAdmin, statusAcesso };
