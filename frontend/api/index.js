// api/index.js — a API do LicitaFácil rodando como função da Vercel, no mesmo domínio do site (/api/*).
// É exatamente o mesmo código do backend (pasta backend/src); o Render continua como reserva.
'use strict';
module.exports = require('../../backend/src/server.js');
