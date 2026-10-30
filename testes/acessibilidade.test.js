// Varredura de acessibilidade (axe-core) nas telas principais, temas escuro, claro e Matrix
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SITE = process.env.SITE || 'http://localhost:8080';
const NAVEGADOR = process.env.CHROMIUM || undefined;
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TEMAS = ['dark', 'light', 'matrix'];
// Contraste só vale com a tela parada: espera as animações de entrada (finitas) terminarem
function esperarAnimacoes(pg) {
  return pg.waitForFunction(function () {
    return document.getAnimations().every(function (a) {
      return a.playState !== 'running' || (a.effect && a.effect.getTiming().iterations === Infinity);
    });
  }, null, { timeout: 5000 }).catch(function () { /* segue mesmo assim */ });
}
(async () => {
  const b = await chromium.launch({ executablePath: NAVEGADOR });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, locale: 'pt-BR' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  await p.goto(SITE + '/login.html');
  await p.fill('#email', 'admin@teste.com'); await p.fill('#senha', 'admin123'); await p.click('#btn-login');
  await p.waitForURL(SITE + '/');
  // garante um fornecedor com produtos para as telas
  const fid = await p.evaluate(async () => {
    const h = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('lf_token') };
    const r = await fetch(API_URL + '/api/fornecedores', { method: 'POST', headers: h, body: JSON.stringify({ nome: 'Acessibilidade Ltda', whatsapp: '11999998888', email: 'a@b.com.br' }) });
    const f = (await r.json()).fornecedor;
    await fetch(API_URL + '/api/extracao/texto/' + f.id, { method: 'POST', headers: h, body: JSON.stringify({ texto: 'PRODUTO 1\nNome: Cabo PP 3x2,5mm² 500V\nCódigo: PP-325\nNorma: NBR 13249\nPreço: R$ 8,90\nUnidade: metro\n\nPRODUTO 2\nNome: Cabo flexível 2,5mm²\nCódigo: FX-25\nTensão: 750V' }) });
    return f.id;
  });
  const telas = [
    ['busca', SITE + '/#busca', async () => { await p.fill('#campo-busca', 'cabo PP 3x2,5mm'); await p.click('#btn-buscar'); await p.waitForSelector('#resultados .tabela'); }],
    ['fornecedores', SITE + '/#fornecedores', async () => { await p.waitForSelector('#lista-fornecedores .tabela'); }],
    ['produtos', SITE + '/#fornecedor/' + fid, async () => { await p.waitForSelector('#tbody-produtos tr'); }],
    ['produto à mão (formulário)', SITE + '/#fornecedor/' + fid, async () => {
      await p.waitForSelector('#tbody-produtos tr');
      await p.click('#tbody-produtos [data-acao="editar-produto"]');
      await p.waitForSelector('#modal-produto.open');
      await p.click('#prod-mais summary');
    }, false, async () => {
      await p.click('#modal-produto [data-acao="fechar-modal"]');
    }],
    ['adicionar', SITE + '/#fornecedor/' + fid + '/adicionar', async () => { await p.waitForSelector('#painel-adicionar:not(.hidden)'); }],
    ['config', SITE + '/#config', async () => { await p.waitForSelector('#secao-config:not(.hidden)'); }],
    ['admin', SITE + '/#admin', async () => { await p.waitForSelector('#adm-usuarios .tabela'); }],
    ['importar', SITE + '/#importar', async () => { await p.waitForSelector('#imp-capacidades-importar .cap-linha'); }],
    // conferência de um catálogo lido (PDF já organizado: não gasta IA); um produto desmarcado para checar o contraste da linha riscada
    ['conferencia', SITE + '/#importar', async () => {
      await p.setInputFiles('#input-importar', path.join(__dirname, 'arquivos', 'catalogo-flex-fast-prompt-mestre.pdf'));
      await p.click('#imp-trabalho-importar [data-acao="imp-comecar"]');
      await p.waitForSelector('#imp-btn-salvar', { timeout: 60000 });
      await p.locator('#imp-tbody input.imp-sel').first().uncheck();
    }, false, async () => {
      await p.click('[data-acao="imp-descartar-confirmar"]');
      await p.click('#btn-confirmar-ok');
      await p.waitForSelector('#imp-entrada-importar:not(.hidden)');
    }]
  ];
  let total = 0;
  const anon = await (await b.newContext({ viewport: { width: 1366, height: 860 }, locale: 'pt-BR' })).newPage();
  await anon.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await anon.goto(SITE + '/login.html');
  for (const tema of TEMAS) {
    await anon.evaluate(t => localStorage.setItem('tema', t), tema);
    for (const pub of ['login', 'cadastro', 'planos', 'recuperar']) {
      await anon.goto(SITE + '/' + pub + '.html');
      await esperarAnimacoes(anon);
      await anon.addScriptTag({ content: AXE });
      const r = await anon.evaluate(async () => {
        const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'], resultTypes: ['violations'] });
        return res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | '));
      });
      total += r.length;
      console.log((r.length ? '✗ ' : '✓ ') + 'pública / ' + tema + ' / ' + pub + (r.length ? '\n    ' + r.join('\n    ') : ''));
    }
  }
  await anon.evaluate(() => localStorage.setItem('tema', 'dark'));
  for (const tema of TEMAS) {
    for (const [nome, url, preparar, publica, depois] of telas) {
      if (publica && tema === 'light') continue;
      await p.evaluate(t => localStorage.setItem('tema', t), tema);
      await p.goto(url);
      if (url.indexOf('#') > 0) await p.waitForSelector('.secao:not(.hidden)');
      if (preparar) await preparar();
      await p.waitForTimeout(400);
      await esperarAnimacoes(p);
      await p.addScriptTag({ content: AXE });
      const r = await p.evaluate(async () => {
        const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'], resultTypes: ['violations'] });
        return res.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ') + ' → ' + (v.nodes[0].failureSummary || '').split('\n').slice(1, 2).join(''));
      });
      total += r.length;
      console.log((r.length ? '✗ ' : '✓ ') + tema + ' / ' + nome + (r.length ? '\n    ' + r.join('\n    ') : ''));
      if (depois) await depois();
    }
  }
  await p.evaluate(async (id) => { await fetch(API_URL + '/api/fornecedores/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.getItem('lf_token') } }); localStorage.setItem('tema', 'dark'); }, fid);
  await b.close();
  console.log('\nViolações graves/críticas: ' + total);
})();
