// scripts/setup-db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const SQL = `
-- ============================================================
-- LicitaFácil — Schema PostgreSQL v2.0
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  senha       VARCHAR(255) NOT NULL,
  plano       VARCHAR(50) DEFAULT 'trial',
  status      VARCHAR(50) DEFAULT 'ativo',
  trial_fim   TIMESTAMP,
  plano_inicio TIMESTAMP,
  plano_fim   TIMESTAMP,
  reset_token VARCHAR(255),
  reset_expiry TIMESTAMP,
  criado_em   TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome         VARCHAR(255) NOT NULL,
  telefone     VARCHAR(50),
  whatsapp     VARCHAR(50),
  whatsapp_link VARCHAR(255),
  email        VARCHAR(255),
  observacoes  TEXT,
  ativo        INTEGER DEFAULT 1,
  criado_em    TIMESTAMP DEFAULT NOW(),
  atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Catálogos
CREATE TABLE IF NOT EXISTS catalogos (
  id              SERIAL PRIMARY KEY,
  fornecedor_id   INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  nome_arquivo    VARCHAR(255),
  storage_path    VARCHAR(500),
  texto_extraido  TEXT,
  paginas         INTEGER DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'pendente',
  erro            TEXT,
  criado_em       TIMESTAMP DEFAULT NOW(),
  atualizado_em   TIMESTAMP DEFAULT NOW()
);

-- Chunks de texto (para busca semântica)
CREATE TABLE IF NOT EXISTS chunks (
  id            SERIAL PRIMARY KEY,
  catalogo_id   INTEGER NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
  fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  conteudo      TEXT NOT NULL,
  embedding_json TEXT,
  indice        INTEGER DEFAULT 0,
  criado_em     TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_fornecedores_usuario ON fornecedores(usuario_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo ON fornecedores(ativo);
CREATE INDEX IF NOT EXISTS idx_catalogos_fornecedor ON catalogos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_catalogos_status ON catalogos(status);
CREATE INDEX IF NOT EXISTS idx_chunks_catalogo ON chunks(catalogo_id);
CREATE INDEX IF NOT EXISTS idx_chunks_fornecedor ON chunks(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_reset_token ON usuarios(reset_token) WHERE reset_token IS NOT NULL;
`;

async function setup() {
  console.log('🔧 Configurando banco de dados...');
  const client = await pool.connect();
  try {
    await client.query(SQL);
    console.log('✅ Tabelas criadas com sucesso!');

    // Verificar tabelas criadas
    const result = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    console.log('📋 Tabelas existentes:', result.rows.map(r => r.tablename).join(', '));
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(err => {
  console.error('❌ Erro ao configurar banco:', err.message);
  process.exit(1);
});
