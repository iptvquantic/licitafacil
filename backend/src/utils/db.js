// src/utils/db.js — pool PostgreSQL (Supabase Transaction Pooler :6543)
'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' || process.env.VERCEL) ? { rejectUnauthorized: false } : false,
  // na Vercel cada instância abre poucas conexões (o Transaction Pooler do Supabase multiplexa)
  max: parseInt(process.env.DB_POOL_MAX || (process.env.VERCEL ? '3' : '8'), 10),
  idleTimeoutMillis: 30000,
  // o Supabase pode demorar alguns segundos para responder na primeira conexão
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '15000', 10),
  keepAlive: true
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool de banco de dados:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development' && process.env.DB_LOG === '1') {
      console.log('Query', { text: text.substring(0, 60), ms: Date.now() - start, rows: res.rowCount });
    }
    return res;
  } catch (err) {
    console.error('Erro na query:', { text: text.substring(0, 100), error: err.message });
    throw err;
  }
}

async function getClient() {
  return pool.connect();
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexão já perdida */ }
    throw err;
  } finally {
    client.release();
  }
}

// INSERT de várias linhas em lotes (evita o limite de parâmetros do Postgres)
async function inserirEmLote(executor, tabela, colunas, linhas, tamanhoLote) {
  if (!linhas.length) return 0;
  tamanhoLote = tamanhoLote || Math.max(1, Math.floor(3000 / colunas.length));
  let total = 0;
  for (let i = 0; i < linhas.length; i += tamanhoLote) {
    const lote = linhas.slice(i, i + tamanhoLote);
    const valores = [];
    const marcadores = lote.map((linha, li) => {
      return '(' + colunas.map((_, ci) => {
        valores.push(linha[ci]);
        return '$' + (li * colunas.length + ci + 1);
      }).join(', ') + ')';
    });
    const sql = 'INSERT INTO ' + tabela + ' (' + colunas.join(', ') + ') VALUES ' + marcadores.join(', ');
    const r = await executor.query(sql, valores);
    total += r.rowCount;
  }
  return total;
}

module.exports = { query, getClient, transaction, inserirEmLote, pool };
