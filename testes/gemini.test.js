// Testa a leitura com o Google Gemini (simulado no mock, porta 4010): Gemini primeiro, OpenRouter de reserva.
// Sobe a própria API em 3 configurações (portas 3011, 3012, 3013) usando o mesmo banco dos outros testes.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const MOCK = process.env.MOCK || 'http://localhost:4010';
let ok = 0, falhas = 0;
function check(cond, msg, extra) { if (cond) { ok++; console.log('  ✓ ' + msg); } else { falhas++; console.log('  ✗ ' + msg + (extra ? ' → ' + JSON.stringify(extra).slice(0, 500) : '')); } }
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function api(base, method, rota, body, token) {
  const r = await fetch(base + rota, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { s: r.status, j: j || {} };
}

function subirAPI(porta, extra) {
  const env = Object.assign({}, process.env, { PORT: String(porta), OPENROUTER_API_KEY: 'chave-teste', OPENROUTER_BASE_URL: MOCK,
    GEMINI_BASE_URL: MOCK + '/gemini', IA_PARADO_MS: '3000', IA_PRAZO_EXTRACAO_MS: '30000' }, extra);
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'backend', 'src', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  p.stdout.on('data', d => { log += d; });
  p.stderr.on('data', d => { log += d; });
  p.log = () => log;
  return p;
}
async function pronta(base) {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return true; } catch (e) { /* subindo */ }
    await esperar(250);
  }
  return false;
}
// imagem mínima válida (o mock não olha a imagem, só o texto "Página N")
const IMAGEM = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(4);

(async () => {
  const procs = [];
  try {
    const sufixo = Date.now().toString(36);
    console.log('1) Gemini configurado: lê a página primeiro com ele');
    const A = subirAPI(3011, { GEMINI_API_KEY: 'chave-gemini' });
    procs.push(A);
    const baseA = 'http://localhost:3011';
    check(await pronta(baseA), 'API com Gemini no ar', A.log());
    let r = await api(baseA, 'POST', '/api/auth/cadastro', { nome: 'Gemini QA', email: 'gemini' + sufixo + '@teste.com', senha: 'senha123' });
    const T = r.j.token;
    check(!!T, 'cadastro', r);
    r = await api(baseA, 'GET', '/api/extracao/capacidades', null, T);
    check(r.j.ia === true && r.j.visao === true && r.j.provedor === 'gemini' && r.j.cota === null, 'capacidades: provedor gemini e sem limite da cota do OpenRouter', r.j);
    r = await api(baseA, 'POST', '/api/extracao/pagina', { imagem: IMAGEM, texto: '', pagina: 2, total: 3, nome_arquivo: 'catalogo-gemini.pdf' }, T);
    check(r.j.ok === true && /^gemini:/.test(r.j.modelo) && (r.j.produtos || []).length === 3, 'página lida pelo Gemini (3 produtos da tabela)', r.j);
    check(r.j.produtos && r.j.produtos[1] && r.j.produtos[1].bitola === '2,5 mm²' && r.j.produtos[1].tensao === '450/750 V', 'tabela expandida com medida e tensão', r.j.produtos && r.j.produtos[1]);
    r = await api(baseA, 'POST', '/api/extracao/estruturar-bloco', { texto: 'Cabo flexível 1,5mm² 750V rolo 100m; Cabo PP 2x1mm² 500V. Telefone (11) 3333-4444. '.repeat(2) }, T);
    check(r.j.ok === true && /^gemini:/.test(r.j.modelo) && (r.j.produtos || []).length === 2, 'texto organizado pelo Gemini', r.j);

    console.log('2) chave do Gemini errada: segue com o OpenRouter sem derrubar a leitura');
    const B = subirAPI(3012, { GEMINI_API_KEY: 'chave-ruim' });
    procs.push(B);
    const baseB = 'http://localhost:3012';
    check(await pronta(baseB), 'API com chave errada no ar', B.log());
    r = await api(baseB, 'POST', '/api/extracao/pagina', { imagem: IMAGEM, texto: '', pagina: 2, total: 3, nome_arquivo: 'catalogo-reserva.pdf' }, T);
    check(r.j.ok === true && r.j.modelo && !/^gemini:/.test(r.j.modelo) && (r.j.produtos || []).length === 3, 'página lida pelo OpenRouter de reserva', r.j);
    r = await api(baseB, 'GET', '/api/extracao/capacidades', null, T);
    check(r.j.provedor === 'openrouter' && r.j.cota && r.j.cota.limite === 50, 'depois da chave recusada, capacidades mostram o OpenRouter e a cota dele', r.j);

    console.log('3) limite diário do Gemini num modelo: passa para o próximo modelo do Gemini');
    const C = subirAPI(3013, { GEMINI_API_KEY: 'chave-gemini', GEMINI_MODELOS: 'gemini-limite-dia,gemini-flash-latest' });
    procs.push(C);
    const baseC = 'http://localhost:3013';
    check(await pronta(baseC), 'API com 2 modelos do Gemini no ar', C.log());
    r = await api(baseC, 'POST', '/api/extracao/pagina', { imagem: IMAGEM, texto: '', pagina: 3, total: 3, nome_arquivo: 'catalogo-limite.pdf' }, T);
    check(r.j.ok === true && r.j.modelo === 'gemini:gemini-flash-latest' && (r.j.produtos || []).some(p => p.codigo === 'PP-325'), 'segundo modelo do Gemini leu a página', r.j);

    console.log('4) sem resposta de nenhum modelo: devolve os motivos');
    const D = subirAPI(3014, { GEMINI_API_KEY: 'chave-gemini', GEMINI_MODELOS: 'gemini-limite-dia', OPENROUTER_MODEL_VISAO: '', IA_TENTATIVAS: '1' });
    procs.push(D);
    const baseD = 'http://localhost:3014';
    check(await pronta(baseD), 'API com só o modelo esgotado no ar', D.log());
    r = await api(baseD, 'POST', '/api/extracao/pagina', { imagem: IMAGEM, texto: '', pagina: 1, total: 1, nome_arquivo: 'eletrica-sul.pdf' }, T);
    check(r.s === 200 && r.j.ok === false && Array.isArray(r.j.motivos) && r.j.motivos.some(m => /limite diário/.test(m)) && r.j.motivos.length >= 2,
      'falha devolve o motivo de cada tentativa', r.j);
  } catch (e) {
    falhas++;
    console.log('  ✗ erro inesperado: ' + e.message);
  } finally {
    procs.forEach(p => { try { p.kill(); } catch (e) { /* já saiu */ } });
  }
  console.log('\nRESULTADO GEMINI: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})();
