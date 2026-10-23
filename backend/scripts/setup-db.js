// scripts/setup-db.js — cria/atualiza o banco (mesmas migrações que a API roda ao iniciar)
require('dotenv').config();
const { migrar } = require('../src/utils/migrar');
const { pool } = require('../src/utils/db');

migrar().then(function (r) {
  console.log(r.ok ? '✅ Banco pronto' : '⚠️ Migração com falhas', r);
  return pool.end().then(function () { process.exit(r.ok ? 0 : 1); });
});
