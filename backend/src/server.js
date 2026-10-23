// src/server.js — API LicitaFácil
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { query } = require('./utils/db');
const { migrar } = require('./utils/migrar');
const indexacao = require('./services/indexacao.service');

const VERSAO = '3.0.0';
process.env.APP_VERSION = VERSAO;

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── CORS: só o site oficial, prévias do próprio projeto e desenvolvimento local ─
const origensFixas = [process.env.FRONTEND_URL, 'https://licitafacil-one.vercel.app']
  .concat(String(process.env.ALLOWED_ORIGINS || '').split(','))
  .map(function (o) { return String(o || '').trim().replace(/\/$/, ''); })
  .filter(Boolean);

function origemPermitida(origem) {
  if (!origem) return true;
  if (origensFixas.indexOf(origem) >= 0) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem)) return true;
  if (/^https:\/\/licitafacil[a-z0-9-]*\.vercel\.app$/.test(origem)) return true;
  if (/^https:\/\/licitafacil[a-z0-9-]*\.onrender\.com$/.test(origem)) return true;
  return false;
}

app.use(cors({
  origin: function (origem, cb) { cb(null, origemPermitida(origem)); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  maxAge: 86400
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: function (req) { return req.path === '/api/health'; }
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Saúde: consulta o banco (mantém o Supabase ativo com o UptimeRobot) ─────
let saude = { em: 0, db: null, ms: null };
app.get('/api/health', async function (req, res) {
  if (Date.now() - saude.em > 30000) {
    const t = Date.now();
    try {
      await query('SELECT 1');
      saude = { em: Date.now(), db: 'ok', ms: Date.now() - t };
    } catch (err) {
      saude = { em: Date.now(), db: 'erro', ms: null };
    }
  }
  res.status(saude.db === 'ok' ? 200 : 503).json({
    status: saude.db === 'ok' ? 'ok' : 'degradado', db: saude.db, db_ms: saude.ms, version: VERSAO, timestamp: new Date().toISOString()
  });
});

// Garante que as migrações rodaram antes de atender rotas da API
app.use('/api', function (req, res, next) {
  migrar().then(function () { next(); }, function () { next(); });
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 900, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições em pouco tempo. Aguarde um instante.' }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/fornecedores', apiLimiter, require('./routes/fornecedores'));
app.use('/api/busca', apiLimiter, require('./routes/busca'));
app.use('/api/extracao', apiLimiter, require('./routes/extracao'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));

app.use('/api', function (req, res) { res.status(404).json({ error: 'Rota não encontrada' }); });

// ─── Erros ───────────────────────────────────────────────────────────────────
app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo muito grande. Máximo: ' + (process.env.MAX_FILE_SIZE_MB || 50) + ' MB' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo muito grande para enviar de uma vez.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dados inválidos.' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', function () {
    console.log('🚀 LicitaFácil API v' + VERSAO + ' na porta ' + PORT + ' (' + (process.env.NODE_ENV || 'development') + ')');
    migrar().then(function () { return indexacao.liberarPresos(); }).catch(function (err) {
      console.error('[inicio] ' + err.message);
    });
  });
}

module.exports = app;
