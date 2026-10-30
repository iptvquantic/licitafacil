// Confere que a versão é a mesma em todo lugar: API (server.js), package.json, app.js (aviso de versão nova) e ?v= dos arquivos
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const api = (ler('backend/src/server.js').match(/const VERSAO = '([\d.]+)'/) || [])[1];
const pkg = JSON.parse(ler('backend/package.json')).version;
const app = (ler('frontend/public/js/app.js').match(/var VERSAO_APP = '([\d.]+)'/) || [])[1];
const htmls = fs.readdirSync(path.join(raiz, 'frontend/public')).filter(f => f.endsWith('.html'));
const vs = new Set();
htmls.forEach(f => (ler('frontend/public/' + f).match(/\?v=[^"']+/g) || []).forEach(v => vs.add(v.slice(3))));
const ok = api && api === pkg && api === app && vs.size === 1 && vs.has(api);
console.log((ok ? '✓' : '✗') + ' versão: API ' + api + ' · package ' + pkg + ' · app.js ' + app + ' · ?v= ' + Array.from(vs).join(','));
console.log('\nRESULTADO VERSAO: ' + (ok ? 1 : 0) + ' ok, ' + (ok ? 0 : 1) + ' falha(s)');
process.exit(ok ? 0 : 1);
