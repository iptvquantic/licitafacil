// Simula a Vercel localmente: site estático (frontend/public) + API Express em /api/* pela função frontend/api/index.js
// Uso: PORT=8090 DATABASE_URL=... JWT_SECRET=... node testes/servidor-vercel-local.js
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require(path.join(__dirname, '..', 'frontend', 'api', 'index.js'));
const RAIZ = path.join(__dirname, '..', 'frontend', 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.gz': 'application/gzip', '.wasm': 'application/wasm' };
http.createServer(function (req, res) {
  if (req.url === '/api' || req.url.indexOf('/api/') === 0) return app(req, res);
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const arquivo = path.join(RAIZ, path.normalize(p));
  if (arquivo.indexOf(RAIZ) !== 0) { res.statusCode = 403; return res.end(); }
  fs.readFile(arquivo, function (err, dados) {
    if (err) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html'); return res.end('<h1>404</h1>'); }
    res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] || 'application/octet-stream');
    res.end(dados);
  });
}).listen(parseInt(process.env.PORT || '8090', 10), function () { console.log('vercel-local na porta ' + (process.env.PORT || 8090)); });
