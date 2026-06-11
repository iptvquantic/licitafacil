require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const fornecedoresRoutes = require('./routes/fornecedores');
const buscaRoutes = require('./routes/busca');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'https://licitafacil-one.vercel.app',
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  exposedHeaders: ['set-cookie']
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/fornecedores', apiLimiter, fornecedoresRoutes);
app.use('/api/busca', apiLimiter, buscaRoutes);

app.use('/api/*', (req, res) => { res.status(404).json({ error: 'Rota não encontrada' }); });

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Arquivo muito grande. Máximo: ' + (process.env.MAX_FILE_SIZE_MB || 50) + 'MB' });
  if (err.message === 'Apenas arquivos PDF são aceitos') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 LicitaFácil API rodando na porta ' + PORT);
  console.log('📦 Ambiente: ' + (process.env.NODE_ENV || 'development'));
  console.log('🌐 Frontend: ' + (process.env.FRONTEND_URL || 'http://localhost:3000'));
});

module.exports = app;
