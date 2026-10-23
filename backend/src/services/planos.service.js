// src/services/planos.service.js — planos e ativação (somente pelo administrador)
'use strict';
const { query } = require('../utils/db');

const PLANOS = {
  mensal: { dias: 30, nome: 'Mensal', preco: 'R$ 97/mês', link: 'https://pag.ae/81RuUMgB6' },
  trimestral: { dias: 90, nome: 'Trimestral', preco: 'R$ 77/mês (R$ 231)', link: 'https://pag.ae/81RuVe3jn' },
  anual: { dias: 365, nome: 'Anual', preco: 'R$ 57/mês (R$ 684)', link: 'https://pag.ae/81RuVvkg6' }
};

function diasRestantes(u) {
  const agora = Date.now();
  const fim = u.plano === 'trial' ? u.trial_fim : u.plano_fim;
  if (!fim) return null;
  return Math.max(0, Math.ceil((new Date(fim).getTime() - agora) / 86400000));
}

// Ativa ou renova: se ainda houver dias pagos, soma a partir do fim atual
async function ativarPlano(usuarioId, plano) {
  if (!PLANOS[plano]) { const e = new Error('Plano inválido'); e.status = 400; throw e; }
  const r = await query('SELECT id, plano, plano_fim FROM usuarios WHERE id = $1', [usuarioId]);
  if (!r.rows.length) { const e = new Error('Usuário não encontrado'); e.status = 404; throw e; }
  const u = r.rows[0];
  const agora = Date.now();
  const base = (u.plano !== 'trial' && u.plano_fim && new Date(u.plano_fim).getTime() > agora) ? new Date(u.plano_fim).getTime() : agora;
  const fim = new Date(base + PLANOS[plano].dias * 86400000);
  await query(
    "UPDATE usuarios SET plano = $1, plano_inicio = NOW(), plano_fim = $2, status = 'ativo', atualizado_em = NOW() WHERE id = $3",
    [plano, fim, usuarioId]);
  return { plano: plano, plano_fim: fim.toISOString(), msg: 'Plano ' + PLANOS[plano].nome + ' ativo até ' + fim.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) };
}

module.exports = { PLANOS, diasRestantes, ativarPlano };
