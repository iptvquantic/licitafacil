// Sistema fora do ar: o aviso aparece na coluna do formulário (entre a marca e o cartão),
// sem rolagem lateral, no tema escolhido, sem erros de JS e sem violações graves de acessibilidade.
// Testa 4 páginas de entrada × 3 larguras (celular, tablet, computador) × 3 temas.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SITE = process.env.SITE || 'http://localhost:8080';
const NAVEGADOR = process.env.CHROMIUM || undefined;
const FOTOS = process.env.FOTOS || '';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

(async () => {
  const b = await chromium.launch({ executablePath: NAVEGADOR });
  const casos = [];
  for (const pagina of ['login.html', 'cadastro.html', 'recuperar.html', 'resetar.html?token=teste'])
    for (const largura of [375, 768, 1280])
      for (const tema of ['dark', 'light', 'matrix']) casos.push({ pagina, largura, tema });
  let falhas = 0;
  for (const c of casos) {
    const ctx = await b.newContext({ locale: 'pt-BR', viewport: { width: c.largura, height: 800 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('tema', t); } catch (e) { /* ignora */ } }, c.tema);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/\/api\//, r => r.abort()); // simula a API fora do ar
    const p = await ctx.newPage();
    const erros = [];
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(m.text()); });
    p.on('pageerror', e => erros.push('pageerror: ' + e.message));
    await p.goto(SITE + '/' + c.pagina);
    await p.waitForSelector('#aviso-servidor', { timeout: 30000 });
    await p.waitForTimeout(500);
    const info = await p.evaluate(() => {
      const a = document.getElementById('aviso-servidor');
      const cont = document.querySelector('.auth-container');
      const card = document.querySelector('.auth-card');
      const ra = a.getBoundingClientRect();
      const rc = cont.getBoundingClientRect();
      return {
        naColuna: a.parentNode === cont,
        antesDoCartao: !!(a.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
        mesmaLargura: Math.abs(ra.left - rc.left) < 2 && Math.abs(ra.width - rc.width) < 2,
        semRolagemLateral: document.documentElement.scrollWidth <= window.innerWidth,
        tema: document.documentElement.getAttribute('data-theme')
      };
    });
    await p.addScriptTag({ content: AXE });
    const graves = await p.evaluate(async () => {
      const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => v.id + ': ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | '));
    });
    const ok = info.naColuna && info.antesDoCartao && info.mesmaLargura && info.semRolagemLateral &&
      info.tema === c.tema && !graves.length && !erros.length;
    if (!ok) falhas++;
    console.log((ok ? '✓ ' : '✗ ') + c.pagina + ' ' + c.largura + 'px ' + c.tema +
      (ok ? '' : ' → ' + JSON.stringify({ info, graves, erros })));
    if (FOTOS && c.pagina === 'login.html' && (c.largura === 375 || c.tema === 'dark')) {
      fs.mkdirSync(FOTOS, { recursive: true });
      await p.screenshot({ path: path.join(FOTOS, 'fora-do-ar-' + c.largura + '-' + c.tema + '.png') });
    }
    await ctx.close();
  }
  await b.close();
  console.log('\nRESULTADO FORA DO AR: ' + (casos.length - falhas) + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})();
