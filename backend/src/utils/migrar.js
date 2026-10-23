// src/utils/migrar.js — migrações idempotentes e só aditivas, executadas ao iniciar a API
'use strict';
const db = require('./db');
const T = require('./texto');

const PASSOS = [
  ['usuarios', `CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY, nome VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, senha VARCHAR(255) NOT NULL,
    plano VARCHAR(50) DEFAULT 'trial', status VARCHAR(50) DEFAULT 'ativo', trial_fim TIMESTAMP, plano_inicio TIMESTAMP,
    plano_fim TIMESTAMP, reset_token VARCHAR(255), reset_expiry TIMESTAMP, criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW())`],
  ['fornecedores', `CREATE TABLE IF NOT EXISTS fornecedores (
    id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(50), whatsapp VARCHAR(50), whatsapp_link VARCHAR(255), email VARCHAR(255), observacoes TEXT,
    ativo INTEGER DEFAULT 1, criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW())`],
  ['catalogos', `CREATE TABLE IF NOT EXISTS catalogos (
    id SERIAL PRIMARY KEY, fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE, nome_arquivo VARCHAR(255),
    storage_path VARCHAR(500), texto_extraido TEXT, paginas INTEGER DEFAULT 0, status VARCHAR(50) DEFAULT 'pendente', erro TEXT,
    criado_em TIMESTAMP DEFAULT NOW(), atualizado_em TIMESTAMP DEFAULT NOW())`],
  ['chunks', `CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY, catalogo_id INTEGER NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
    fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE, conteudo TEXT NOT NULL, embedding_json TEXT,
    indice INTEGER DEFAULT 0, criado_em TIMESTAMP DEFAULT NOW())`],
  ['produtos', `CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
    catalogo_id INTEGER NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
    ordem INTEGER DEFAULT 0, nome TEXT NOT NULL, codigo TEXT, marca TEXT, categoria TEXT, descricao TEXT, bitola TEXT, tensao TEXT,
    material TEXT, isolamento TEXT, cobertura TEXT, temperatura TEXT, aplicacao TEXT, norma TEXT, certificacoes TEXT, preco TEXT,
    unidade TEXT, atributos JSONB DEFAULT '{}'::jsonb, texto_norm TEXT, origem VARCHAR(30) DEFAULT 'texto',
    criado_em TIMESTAMP DEFAULT NOW())`],
  ['pagamentos', `CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    plano VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pendente', observacao TEXT,
    criado_em TIMESTAMP DEFAULT NOW(), resolvido_em TIMESTAMP, resolvido_por INTEGER)`],
  ['catalogos.origem', `ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS origem VARCHAR(30)`],
  ['catalogos.total_produtos', `ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS total_produtos INTEGER DEFAULT 0`],
  ['catalogos.formato', `ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS formato VARCHAR(30)`],
  ['catalogos.ia_status', `ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS ia_status VARCHAR(30)`],
  ['catalogos.ia_info', `ALTER TABLE catalogos ADD COLUMN IF NOT EXISTS ia_info TEXT`],
  ['chunks.texto_norm', `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS texto_norm TEXT`],
  ['idx_fornecedores_usuario', `CREATE INDEX IF NOT EXISTS idx_fornecedores_usuario ON fornecedores(usuario_id)`],
  ['idx_catalogos_fornecedor', `CREATE INDEX IF NOT EXISTS idx_catalogos_fornecedor ON catalogos(fornecedor_id)`],
  ['idx_chunks_catalogo', `CREATE INDEX IF NOT EXISTS idx_chunks_catalogo ON chunks(catalogo_id)`],
  ['idx_chunks_fornecedor', `CREATE INDEX IF NOT EXISTS idx_chunks_fornecedor ON chunks(fornecedor_id)`],
  ['idx_produtos_usuario', `CREATE INDEX IF NOT EXISTS idx_produtos_usuario ON produtos(usuario_id)`],
  ['idx_produtos_fornecedor', `CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor ON produtos(fornecedor_id)`],
  ['idx_produtos_catalogo', `CREATE INDEX IF NOT EXISTS idx_produtos_catalogo ON produtos(catalogo_id)`],
  ['idx_pagamentos_status', `CREATE INDEX IF NOT EXISTS idx_pagamentos_status ON pagamentos(status)`]
];

const TABELAS_PROTEGIDAS = ['usuarios', 'fornecedores', 'catalogos', 'chunks', 'produtos', 'pagamentos'];

// Liga RLS (sem policies) para fechar a Data API do Supabase. O backend usa o dono das tabelas, que não é afetado.
// Segurança extra: só liga se o usuário atual for dono/bypass e confere a contagem antes e depois.
async function protegerTabelas() {
  const info = await db.query(
    `SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS dono, current_user AS eu,
            COALESCE((SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user), false) AS ignora
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`, [TABELAS_PROTEGIDAS]);
  const feitas = [];
  for (const row of info.rows) {
    if (row.relrowsecurity) continue;
    if (TABELAS_PROTEGIDAS.indexOf(row.relname) < 0) continue;
    if (row.dono !== row.eu && !row.ignora) {
      console.warn('[migracao] RLS não ligado em ' + row.relname + ': dono é ' + row.dono);
      continue;
    }
    const antes = await db.query('SELECT count(*)::int AS n FROM ' + row.relname);
    await db.query('ALTER TABLE ' + row.relname + ' ENABLE ROW LEVEL SECURITY');
    const depois = await db.query('SELECT count(*)::int AS n FROM ' + row.relname);
    if (depois.rows[0].n !== antes.rows[0].n) {
      await db.query('ALTER TABLE ' + row.relname + ' DISABLE ROW LEVEL SECURITY');
      console.error('[migracao] RLS revertido em ' + row.relname + ' (contagem mudou)');
    } else {
      feitas.push(row.relname);
    }
  }
  if (feitas.length) console.log('[migracao] RLS ligado em: ' + feitas.join(', '));
}

// Preenche texto_norm de trechos antigos (busca rápida e sem acento)
async function preencherTextoNorm() {
  for (let volta = 0; volta < 50; volta++) {
    const r = await db.query('SELECT id, conteudo FROM chunks WHERE texto_norm IS NULL LIMIT 500');
    if (!r.rows.length) return;
    for (const row of r.rows) {
      await db.query('UPDATE chunks SET texto_norm = $1 WHERE id = $2', [T.normalizarBusca(row.conteudo), row.id]);
    }
  }
}

let promessa = null;

function migrar() {
  if (promessa) return promessa;
  promessa = (async function () {
    const inicio = Date.now();
    try {
      await db.query('SELECT 1');
    } catch (err) {
      promessa = null; // banco fora do ar: tenta de novo na próxima requisição
      console.error('[migracao] banco indisponível: ' + err.message);
      return { ok: false, erro: err.message };
    }
    let falhas = 0;
    for (const passo of PASSOS) {
      try { await db.query(passo[1]); } catch (err) { falhas++; console.error('[migracao] falhou: ' + passo[0] + ' — ' + err.message); }
    }
    if (falhas >= PASSOS.length) {
      // banco fora do ar: tenta de novo na próxima requisição
      promessa = null;
      console.error('[migracao] banco indisponível; nova tentativa na próxima requisição');
      return { ok: false, falhas: falhas };
    }
    try { await protegerTabelas(); } catch (err) { console.error('[migracao] RLS: ' + err.message); }
    try { await preencherTextoNorm(); } catch (err) { console.error('[migracao] texto_norm: ' + err.message); }
    console.log('[migracao] concluída em ' + (Date.now() - inicio) + ' ms' + (falhas ? ' (' + falhas + ' falha(s))' : ''));
    return { ok: falhas === 0, falhas: falhas };
  })().catch(function (err) {
    console.error('[migracao] erro geral: ' + err.message);
    promessa = null; // tenta de novo na próxima chamada
    return { ok: false, erro: err.message };
  });
  return promessa;
}

module.exports = { migrar };
