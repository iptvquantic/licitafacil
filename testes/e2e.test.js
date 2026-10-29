// Teste ponta a ponta no navegador (Chromium headless) contra o site local :8080 e a API local :3000
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SITE = process.env.SITE || 'http://localhost:8080';
const ARQ = path.join(__dirname, 'arquivos');
const NAVEGADOR = process.env.CHROMIUM || undefined;
const FOTOS = process.env.FOTOS || path.join(__dirname, 'telas');
fs.mkdirSync(FOTOS, { recursive: true });
let ok = 0, falhas = 0;
const errosConsole = [];
function ignorar(txt, url) {
  if (/fonts\.(googleapis|gstatic)/.test(url || '') || /fonts\.(googleapis|gstatic)/.test(txt || '')) return true;
  return /\/api\/health\?sonda=1/.test(url || '') && /404/.test(txt || ''); // site estático local sem a função /api (modo reserva)
}

async function passo(nome, fn, page) {
  try { await fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) {
    falhas++; console.log('  ✗ ' + nome + ' → ' + String(e.message || e).split('\n')[0].slice(0, 300));
    if (page) await page.screenshot({ path: path.join(FOTOS, 'falha-' + nome.replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.png'), fullPage: true }).catch(() => {});
  }
}
function esperar(cond, msg) { if (!cond) throw new Error(msg); }
async function texto(page, sel) { return (await page.locator(sel).first().innerText()).trim(); }

function ligarConsole(page, rotulo) {
  page.on('console', m => { if (m.type() === 'error' && !ignorar(m.text(), m.location().url)) errosConsole.push(rotulo + ': ' + m.text()); });
  page.on('pageerror', e => errosConsole.push(rotulo + ' (pageerror): ' + e.message));
}

(async () => {
  const browser = await chromium.launch({ executablePath: NAVEGADOR });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true, locale: 'pt-BR' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  ligarConsole(page, 'desktop');
  const email = 'qa' + Date.now() + '@teste.com';

  console.log('1) Cadastro e entrada');
  await passo('cadastro cria conta e entra no app', async () => {
    await page.goto(SITE + '/cadastro.html');
    await page.fill('#nome', 'Cliente QA');
    await page.fill('#email', email);
    await page.fill('#senha', 'senha123');
    await page.click('#btn-cadastro');
    await page.waitForURL(SITE + '/', { timeout: 15000 });
    await page.waitForSelector('#secao-busca:not(.hidden)', { timeout: 15000 });
    esperar((await texto(page, '#user-nome')) === 'Cliente QA', 'nome do usuário não apareceu');
    esperar(/Teste grátis/.test(await texto(page, '#user-plano')), 'plano trial não apareceu');
  }, page);
  await passo('primeiros passos aparecem para conta nova', async () => {
    await page.waitForSelector('#onboarding .onboarding', { timeout: 10000 });
    await page.screenshot({ path: path.join(FOTOS, '01-inicio-conta-nova.png') });
  }, page);

  console.log('2) Fornecedor');
  await passo('cadastrar fornecedor pelo modal e abrir Adicionar catálogo', async () => {
    await page.click('#onboarding [data-acao="novo-fornecedor"]');
    await page.waitForSelector('#modal-fornecedor.open');
    await page.click('#btn-salvar-fornecedor');
    esperar(/nome/i.test(await texto(page, '#forn-erro')), 'validação do nome não apareceu');
    await page.fill('#forn-nome', 'Flex Fast Fios Elétricos');
    await page.fill('#forn-whatsapp', '(11) 95780-8642');
    await page.fill('#forn-obs', 'Fios e cabos de baixa tensão');
    await page.click('#btn-salvar-fornecedor');
    await page.waitForSelector('#secao-detalhe:not(.hidden)', { timeout: 10000 });
    await page.waitForSelector('#painel-adicionar:not(.hidden)', { timeout: 10000 });
    esperar(/#fornecedor\/\d+\/adicionar$/.test(page.url()), 'endereço não aponta para adicionar: ' + page.url());
    await page.screenshot({ path: path.join(FOTOS, '02-adicionar-catalogo.png') });
  }, page);

  console.log('3) Leitor: PDF com texto (Prompt Mestre)');
  await passo('PDF digital vira 3 produtos', async () => {
    await page.setInputFiles('#input-arquivo', { name: 'Catálogo Flex Fast (Prompt Mestre).pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(ARQ, 'catalogo-flex-fast-prompt-mestre.pdf')) });
    await page.waitForSelector('#resultado-arquivo .resultado-ok', { timeout: 60000 });
    const t = await texto(page, '#resultado-arquivo');
    esperar(/3 produtos organizados/.test(t), 'resultado inesperado: ' + t);
    esperar(/e-mail/.test(t), 'não completou o e-mail do fornecedor: ' + t);
    await page.screenshot({ path: path.join(FOTOS, '03-pdf-lido.png') });
  }, page);
  await passo('aba Produtos mostra a tabela com os 3 produtos', async () => {
    await page.click('#resultado-arquivo [data-aba="produtos"]');
    await page.waitForSelector('#produtos-conteudo:not(.hidden) #tbody-produtos tr', { timeout: 10000 });
    const n = await page.locator('#tbody-produtos tr').count();
    esperar(n === 3, 'linhas = ' + n);
    const primeira = await texto(page, '#tbody-produtos tr');
    esperar(/Cabo PP 3x2,5mm²/.test(primeira) && /PP-325/.test(primeira) && /R\$ 8,90/.test(primeira), 'linha 1: ' + primeira);
    await page.screenshot({ path: path.join(FOTOS, '04-produtos.png'), fullPage: true });
  }, page);
  await passo('filtro, detalhes e planilha dos produtos', async () => {
    await page.fill('#filtro-produtos', 'fotovoltaico');
    await page.waitForFunction(() => document.querySelectorAll('#tbody-produtos tr').length === 1);
    await page.click('#tbody-produtos [data-acao="detalhes-produto"]');
    await page.waitForSelector('#tbody-produtos tr.linha-detalhe dl.detalhes-grid');
    const det = await texto(page, '#tbody-produtos tr.linha-detalhe');
    esperar(/XLPE/.test(det) && /90°C/.test(det), 'detalhes sem isolamento/temperatura: ' + det);
    await page.fill('#filtro-produtos', '');
    await page.waitForFunction(() => document.querySelectorAll('#tbody-produtos tr').length === 3);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-acao="exportar-produtos"]')]);
    const p = await dl.path();
    const csv = fs.readFileSync(p, 'utf8');
    esperar(csv.charCodeAt(0) === 0xFEFF && /PP-325/.test(csv) && csv.split('\r\n').length === 4, 'CSV inválido');
  }, page);
  await passo('aba Catálogos lista o catálogo lido', async () => {
    await page.click('#aba-catalogos');
    await page.waitForSelector('#lista-catalogos .cat-item');
    const t = await texto(page, '#lista-catalogos .cat-item');
    esperar(/Catálogo Flex Fast/.test(t) && /3 produtos/.test(t) && /PDF lido no navegador/.test(t), 'catálogo: ' + t);
  }, page);

  console.log('4) Leitor: texto colado');
  await passo('colar resposta em markdown detecta e indexa 2 produtos', async () => {
    await page.click('#aba-adicionar');
    await page.click('[data-modo="colar"]');
    await page.fill('#colar-texto', fs.readFileSync(path.join(__dirname, 'fixtures', 'markdown.txt'), 'utf8'));
    await page.waitForFunction(() => /2 produtos detectados/.test(document.getElementById('colar-contador').textContent), null, { timeout: 5000 });
    await page.fill('#colar-nome', 'Disjuntores Elétrica Sul');
    await page.click('#btn-indexar');
    await page.waitForSelector('#resultado-colar .resultado-ok', { timeout: 20000 });
    esperar(/2 produtos organizados/.test(await texto(page, '#resultado-colar')), 'resultado colado');
  }, page);
  await passo('prompt mestre é copiado', async () => {
    await page.click('[data-acao="copiar-prompt"]');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    esperar(/PRODUTO 1/.test(clip) && /Medida\/Bitola/.test(clip), 'clipboard: ' + clip.slice(0, 80));
  }, page);

  console.log('5) Leitor: PDF escaneado e foto (OCR)');
  await passo('PDF escaneado é lido por OCR', async () => {
    await page.click('[data-modo="arquivo"]');
    await page.setInputFiles('#input-arquivo', path.join(ARQ, 'catalogo-escaneado-epi.pdf'));
    await page.waitForSelector('#progresso-leitura:not(.hidden)', { timeout: 10000 });
    await page.waitForSelector('#resultado-arquivo .resultado-ok, #resultado-arquivo .banner.erro', { timeout: 240000 });
    const t = await texto(page, '#resultado-arquivo');
    esperar(/2 produtos organizados/.test(t), 'OCR do PDF: ' + t);
  }, page);
  await passo('foto é lida por OCR', async () => {
    await page.setInputFiles('#input-arquivo', path.join(ARQ, 'foto-catalogo-epi.png'));
    await page.waitForSelector('#resultado-arquivo .resultado-ok, #resultado-arquivo .banner.erro', { timeout: 240000 });
    const t = await texto(page, '#resultado-arquivo');
    esperar(/2 produtos organizados/.test(t), 'OCR da foto: ' + t);
    const tabela = await page.evaluate(async () => {
      const id = location.hash.split('/')[1];
      const r = await fetch(API_URL + '/api/fornecedores/' + id + '/produtos', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lf_token') } });
      const j = await r.json();
      return j.produtos.filter(p => /LV-C2|CAP-B/.test(p.codigo || '')).map(p => [p.nome, p.codigo, p.norma, p.preco].join(' | '));
    });
    console.log('     OCR leu: ' + tabela.join(' ; '));
    esperar(tabela.length >= 2, 'códigos LV-C2/CAP-B não lidos pelo OCR');
  }, page);

  console.log('6) Leitor: PDF bruto + IA organizando');
  await passo('PDF bruto vai para a busca e a IA organiza a tabela', async () => {
    await page.setInputFiles('#input-arquivo', path.join(ARQ, 'catalogo-bruto-eletrica-sul.pdf'));
    await page.waitForSelector('#resultado-arquivo .resultado-ok', { timeout: 60000 });
    const t = await texto(page, '#resultado-arquivo');
    esperar(/a IA está organizando/.test(t), 'deveria mandar para a IA: ' + t);
    await page.click('#aba-catalogos');
    await page.waitForFunction(() => /estruturado\(s\) pela IA/.test(document.getElementById('lista-catalogos').textContent), null, { timeout: 30000 });
  }, page);

  console.log('7) Busca e IA');
  await passo('busca técnica acha o produto certo', async () => {
    await page.click('#nav-busca');
    await page.waitForSelector('#secao-busca:not(.hidden)');
    await page.fill('#campo-busca', 'cabo pp 3×2.5 mm²');
    await page.click('#btn-buscar');
    await page.waitForSelector('#resultados .tabela tbody tr', { timeout: 15000 });
    const t = await texto(page, '#resultados .tabela tbody tr');
    esperar(/PP-325/.test(t) && /Flex Fast/.test(t), 'primeiro resultado: ' + t);
    esperar(await page.locator('#resultados mark').count() > 0, 'sem destaque dos termos');
    const wa = await page.locator('#resultados .tabela tbody tr a.btn-whats').first().getAttribute('href');
    esperar(/^https:\/\/wa\.me\/5511957808642\?text=/.test(wa), 'link do WhatsApp: ' + wa);
    await page.screenshot({ path: path.join(FOTOS, '05-busca.png'), fullPage: true });
  }, page);
  await passo('exemplo vazio mostra mensagem útil', async () => {
    await page.click('.chip-btn:has-text("cimento CP-III")');
    await page.waitForSelector('#resultados .empty-box', { timeout: 15000 });
    esperar(/Nada encontrado/.test(await texto(page, '#resultados')), 'mensagem de vazio');
  }, page);
  await passo('perguntar à IA responde com fornecedor citado', async () => {
    await page.fill('#campo-busca', 'quem tem cabo PP 3x2,5mm?');
    await page.click('#btn-ia');
    await page.waitForSelector('#ia-area .ia-texto', { timeout: 30000 });
    const t = await texto(page, '#ia-area');
    esperar(/Flex Fast/.test(t), 'resposta IA: ' + t);
    await page.screenshot({ path: path.join(FOTOS, '06-ia.png') });
  }, page);

  console.log('8) Fornecedores, edição e configurações');
  await passo('lista de fornecedores com contagens e filtro', async () => {
    await page.click('#nav-fornecedores');
    await page.waitForSelector('#lista-fornecedores .tabela tbody tr');
    const t = await texto(page, '#lista-fornecedores .tabela tbody tr');
    esperar(/Flex Fast/.test(t), 'linha: ' + t);
    await page.fill('#filtro-fornecedores', 'nada-a-ver');
    await page.waitForSelector('#lista-fornecedores .empty-box');
    await page.fill('#filtro-fornecedores', '');
    await page.waitForSelector('#lista-fornecedores .tabela');
    await page.screenshot({ path: path.join(FOTOS, '07-fornecedores.png') });
  }, page);
  await passo('editar fornecedor', async () => {
    await page.click('#lista-fornecedores .tabela [data-acao="editar-fornecedor"]');
    await page.waitForSelector('#modal-fornecedor.open');
    await page.fill('#forn-telefone', '(11) 3333-4444');
    await page.click('#btn-salvar-fornecedor');
    await page.waitForSelector('#modal-fornecedor:not(.open)');
    await page.waitForFunction(() => /3333-4444/.test(document.getElementById('lista-fornecedores').textContent), null, { timeout: 10000 });
  }, page);
  await passo('tema e tamanho do texto', async () => {
    await page.click('.topbar [data-acao="tema"][data-valor="light"]');
    esperar(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'tema claro');
    await page.screenshot({ path: path.join(FOTOS, '08-tema-claro.png') });
    await page.click('.topbar [data-acao="tema"][data-valor="matrix"]');
    esperar(await page.evaluate(() => document.documentElement.dataset.theme) === 'matrix', 'tema matrix');
    await page.click('.topbar [data-acao="tema"][data-valor="dark"]');
    await page.click('.topbar [data-acao="fonte"][data-valor="grande"]');
    esperar(await page.evaluate(() => document.documentElement.dataset.fontSize) === 'grande', 'fonte grande');
    await page.reload();
    await page.waitForSelector('#secao-fornecedores:not(.hidden)');
    esperar(await page.evaluate(() => document.documentElement.dataset.fontSize) === 'grande', 'fonte não ficou salva');
    await page.click('.topbar [data-acao="fonte"][data-valor="padrao"]');
  }, page);
  await passo('configurações: perfil e aviso de pagamento', async () => {
    await page.click('#nav-config');
    await page.waitForSelector('#secao-config:not(.hidden)');
    esperar(/Teste grátis/.test(await texto(page, '#cfg-plano')), 'plano');
    esperar(await page.locator('#cfg-planos .plano-op').count() === 3, 'planos com link');
    await page.fill('#cfg-nome', 'Cliente QA Editado');
    await page.click('#btn-salvar-perfil');
    await page.waitForFunction(() => document.getElementById('user-nome').textContent === 'Cliente QA Editado', null, { timeout: 10000 });
    await page.selectOption('#aviso-plano', 'mensal');
    await page.fill('#aviso-obs', 'paguei por Pix');
    await page.click('#btn-avisar-pagamento');
    await page.waitForSelector('#cfg-pendente .banner', { timeout: 10000 });
    await page.screenshot({ path: path.join(FOTOS, '09-configuracoes.png'), fullPage: true });
  }, page);
  await passo('cliente comum não vê o painel do dono', async () => {
    esperar(await page.locator('#nav-admin').isHidden(), 'menu admin visível');
    await page.goto(SITE + '/#admin');
    await page.waitForSelector('#secao-busca:not(.hidden)');
  }, page);

  console.log('9) Exclusões');
  await passo('excluir catálogo pelo modal de confirmação', async () => {
    await page.click('#nav-fornecedores');
    await page.click('#lista-fornecedores .tabela [data-acao="ver-fornecedor"]');
    await page.click('#aba-catalogos');
    await page.waitForSelector('#lista-catalogos .cat-item');
    const antes = await page.locator('#lista-catalogos .cat-item').count();
    await page.locator('#lista-catalogos [data-acao="excluir-catalogo"]').last().click();
    await page.waitForSelector('#modal-confirmar.open');
    await page.click('#btn-confirmar-ok');
    await page.waitForFunction(n => document.querySelectorAll('#lista-catalogos .cat-item').length === n - 1, antes, { timeout: 10000 });
  }, page);

  console.log('10) Painel do dono');
  const ctxAdm = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true, locale: 'pt-BR' });
  await ctxAdm.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  await ctxAdm.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const adm = await ctxAdm.newPage();
  ligarConsole(adm, 'admin');
  await passo('dono entra e vê o painel', async () => {
    await adm.goto(SITE + '/login.html');
    await adm.fill('#email', 'admin@teste.com');
    await adm.fill('#senha', 'admin123');
    await adm.click('#btn-login');
    await adm.waitForURL(SITE + '/', { timeout: 15000 });
    await adm.waitForSelector('#nav-admin:not(.hidden)');
    await adm.click('#nav-admin');
    await adm.waitForSelector('#adm-kpis .kpi', { timeout: 15000 });
    await adm.waitForSelector('#adm-pagamentos .tabela', { timeout: 15000 });
    await adm.screenshot({ path: path.join(FOTOS, '10-painel-dono.png'), fullPage: true });
  }, adm);
  await passo('dono confirma o pagamento do cliente', async () => {
    const linha = adm.locator('#adm-pagamentos tr', { hasText: email });
    await linha.locator('[data-acao="admin-aprovar"]').click();
    await adm.waitForFunction(e => !document.getElementById('adm-pagamentos').textContent.includes(e), email, { timeout: 15000 });
    const u = adm.locator('#adm-usuarios tr', { hasText: email });
    esperar(/Mensal/.test(await u.innerText()), 'cliente não ficou Mensal');
  }, adm);
  await passo('dono gera link de nova senha', async () => {
    const u = adm.locator('#adm-usuarios tr', { hasText: email });
    await u.locator('[data-acao="admin-link-senha"]').click();
    await adm.waitForSelector('#adm-link-senha-url');
    const url = await adm.inputValue('#adm-link-senha-url');
    esperar(/\/resetar\.html\?token=[a-f0-9]{64}$/.test(url), 'link: ' + url);
    const ctxReset = await browser.newContext({ locale: 'pt-BR' });
    await ctxReset.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    const p2 = await ctxReset.newPage();
    ligarConsole(p2, 'resetar');
    await p2.goto(url.replace(/^https?:\/\/[^/]+/, SITE));
    await p2.fill('#senha', 'novasenha1');
    await p2.fill('#confirmar', 'novasenha1');
    await p2.click('#btn-resetar');
    await p2.waitForURL(/login\.html/, { timeout: 10000 });
    await p2.fill('#email', email);
    await p2.fill('#senha', 'novasenha1');
    await p2.click('#btn-login');
    await p2.waitForURL(SITE + '/', { timeout: 15000 });
    await p2.close();
  }, adm);
  await passo('dono testa a IA e baixa o backup', async () => {
    await adm.click('[data-acao="admin-testar-ia"]');
    await adm.waitForFunction(() => /respondeu/.test(document.getElementById('adm-diagnostico').textContent), null, { timeout: 30000 });
    const [dl] = await Promise.all([adm.waitForEvent('download'), adm.click('[data-acao="admin-backup"]')]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    esperar(Array.isArray(j.produtos) && j.usuarios.every(u => !('senha' in u)), 'backup');
  }, adm);

  console.log('11) Celular');
  const cel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  await cel.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const m = await cel.newPage();
  ligarConsole(m, 'celular');
  await passo('no celular: menu abre, produtos viram cartões', async () => {
    await m.goto(SITE + '/login.html');
    await m.fill('#email', email);
    await m.fill('#senha', 'novasenha1');
    await m.click('#btn-login');
    await m.waitForURL(SITE + '/', { timeout: 15000 });
    await m.waitForSelector('#secao-busca:not(.hidden)');
    await m.screenshot({ path: path.join(FOTOS, '11-celular-busca.png'), fullPage: true });
    await m.click('#btn-menu');
    await m.waitForSelector('#sidebar.mobile-open');
    await m.click('#nav-fornecedores');
    await m.waitForSelector('#sidebar:not(.mobile-open)');
    await m.waitForSelector('#lista-fornecedores .lista-cards .p-card', { state: 'visible' });
    await m.locator('#lista-fornecedores .lista-cards [data-acao="ver-fornecedor"]').first().click();
    await m.waitForSelector('#cards-produtos .p-card', { state: 'visible', timeout: 10000 });
    const largura = await m.evaluate(() => document.documentElement.scrollWidth);
    esperar(largura <= 392, 'rolagem horizontal no celular: ' + largura);
    await m.screenshot({ path: path.join(FOTOS, '12-celular-produtos.png'), fullPage: true });
  }, m);

  console.log('12) Exclusão do fornecedor');
  await passo('excluir fornecedor volta para a lista', async () => {
    await page.goto(SITE + '/#fornecedores');
    await page.waitForSelector('#lista-fornecedores .tabela');
    await page.click('#lista-fornecedores .tabela [data-acao="excluir-fornecedor"]');
    await page.click('#btn-confirmar-ok');
    await page.waitForSelector('#lista-fornecedores .empty-box', { timeout: 10000 });
  }, page);

  await passo('nenhum erro no console', async () => {
    esperar(!errosConsole.length, errosConsole.slice(0, 5).join(' || '));
  });
  await browser.close();
  console.log('\nRESULTADO E2E: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO GERAL', e); process.exit(2); });
