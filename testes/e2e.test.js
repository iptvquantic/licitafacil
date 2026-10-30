// Teste ponta a ponta no navegador (Chromium headless) contra o site local e a API local com o OpenRouter simulado (mock :4010)
// Uso: SITE=http://localhost:8090 node testes/e2e.test.js   (ou :8080 = site estático + API :3000)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SITE = process.env.SITE || 'http://localhost:8080';
const MOCK = process.env.MOCK_IA || 'http://localhost:4010';
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
    falhas++; console.log('  ✗ ' + nome + ' → ' + String(e.message || e).split('\n')[0].slice(0, 400));
    if (page) await page.screenshot({ path: path.join(FOTOS, 'falha-' + nome.replace(/[^a-z0-9]+/gi, '-').slice(0, 50) + '.png'), fullPage: true }).catch(() => {});
  }
}
function esperar(cond, msg) { if (!cond) throw new Error(msg); }
async function texto(page, sel) { return (await page.locator(sel).first().innerText()).trim(); }
async function cotaUsada() {
  try {
    const r = await fetch(MOCK + '/api/v1/key', { headers: { Authorization: 'Bearer chave-teste' } });
    return (await r.json()).data.free_model_daily_requests.used;
  } catch (e) { return null; }
}

function ligarConsole(page, rotulo) {
  page.on('console', m => { if (m.type() === 'error' && !ignorar(m.text(), m.location().url)) errosConsole.push(rotulo + ': ' + m.text() + ' @ ' + (m.location().url || '').replace(SITE, '')); });
  page.on('pageerror', e => errosConsole.push(rotulo + ' (pageerror): ' + e.message));
}

// Lê um catálogo pelo importador (tela do fornecedor ou "Importar catálogo") e espera a tela de conferência
async function lerCatalogo(page, tela, arquivo, opcoes) {
  opcoes = opcoes || {};
  const input = tela === 'fornecedor' ? '#input-arquivo' : '#input-importar';
  const area = tela === 'fornecedor' ? '#imp-trabalho-fornecedor' : '#imp-trabalho-importar';
  await page.setInputFiles(input, arquivo);
  await page.waitForSelector(area + ' [data-acao="imp-comecar"]', { timeout: 30000 });
  if (opcoes.de) await page.fill('#imp-de', String(opcoes.de));
  if (opcoes.semIA) {
    const cb = page.locator('#imp-usar-ia');
    if (await cb.isEnabled() && await cb.isChecked()) await cb.uncheck();
  }
  if (opcoes.antes) await opcoes.antes();
  await page.click(area + ' [data-acao="imp-comecar"]');
  await page.waitForSelector('#imp-btn-salvar', { timeout: opcoes.timeout || 120000 });
  return area;
}
async function salvarCatalogo(page, area) {
  await page.click('#imp-btn-salvar');
  await page.waitForSelector(area + ' .resultado-ok', { timeout: 30000 });
  return texto(page, area + ' .resultado-ok');
}

(async () => {
  await fetch(MOCK + '/__reiniciar', { method: 'POST' }).catch(() => {});
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
    esperar(await page.locator('#onboarding [data-acao="ir"][data-secao="importar"]').count() === 1, 'atalho para importar catálogo');
    await page.screenshot({ path: path.join(FOTOS, '01-inicio-conta-nova.png') });
  }, page);

  console.log('2) Fornecedor');
  await passo('cadastrar fornecedor pelo modal e abrir Adicionar catálogo', async () => {
    await page.click('#nav-fornecedores');
    await page.waitForSelector('#lista-fornecedores .empty-box', { timeout: 10000 });
    await page.click('#secao-fornecedores .page-head [data-acao="novo-fornecedor"]');
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
    await page.waitForSelector('#imp-capacidades-fornecedor .cap-linha.ok', { timeout: 10000 });
    esperar(/Leitura com IA ativa/.test(await texto(page, '#imp-capacidades-fornecedor')), 'aviso de IA ativa');
    await page.screenshot({ path: path.join(FOTOS, '02-adicionar-catalogo.png') });
  }, page);

  console.log('3) Importador: PDF já organizado (Prompt Mestre) — sem gastar a IA');
  await passo('PDF do Prompt Mestre vira 3 produtos sem usar a cota', async () => {
    const antes = await cotaUsada();
    const area = await lerCatalogo(page, 'fornecedor', { name: 'Catálogo Flex Fast (Prompt Mestre).pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(ARQ, 'catalogo-flex-fast-prompt-mestre.pdf')) });
    const t = await texto(page, area);
    esperar(/Encontrei 3 produtos/.test(t), 'conferência: ' + t.slice(0, 300));
    esperar(/já estava no formato do Prompt Mestre/.test(t), 'aviso de PDF organizado não apareceu');
    esperar((await cotaUsada()) === antes, 'gastou a cota de IA num PDF já organizado');
    const forn = await texto(page, '#imp-forn-card');
    esperar(/E-mail/.test(forn) && /vendas@flexfast\.com\.br/.test(forn) && /vai completar/.test(forn), 'dados do fornecedor: ' + forn);
    esperar(await page.locator('#imp-tbody tr').count() === 3, 'linhas na conferência');
    await page.screenshot({ path: path.join(FOTOS, '03-conferencia-pdf-organizado.png'), fullPage: true });
    const r = await salvarCatalogo(page, area);
    esperar(/3 produtos salvos/.test(r) && /e-mail/.test(r), 'resultado: ' + r);
  }, page);
  await passo('aba Produtos mostra a tabela com os 3 produtos', async () => {
    await page.click('#imp-trabalho-fornecedor [data-acao="aba"][data-aba="produtos"]');
    await page.waitForSelector('#produtos-conteudo:not(.hidden) #tbody-produtos tr', { timeout: 10000 });
    const n = await page.locator('#tbody-produtos tr').count();
    esperar(n === 3, 'linhas = ' + n);
    const primeira = await texto(page, '#tbody-produtos tr');
    esperar(/Cabo PP 3x2,5mm²/.test(primeira) && /PP-325/.test(primeira) && /R\$ 8,90/.test(primeira), 'linha 1: ' + primeira);
    const cab = await texto(page, '#det-header');
    esperar(/vendas@flexfast\.com\.br/.test(cab), 'e-mail não foi completado no fornecedor: ' + cab);
    await page.screenshot({ path: path.join(FOTOS, '04-produtos.png'), fullPage: true });
  }, page);
  await passo('filtro sem piscar, detalhes e planilha dos produtos', async () => {
    await page.fill('#filtro-produtos', 'fotovoltaico');
    await page.waitForFunction(() => document.querySelectorAll('#tbody-produtos tr').length === 1);
    await page.click('#tbody-produtos [data-acao="detalhes-produto"]');
    await page.waitForSelector('#tbody-produtos tr.linha-detalhe dl.detalhes-grid');
    const det = await texto(page, '#tbody-produtos tr.linha-detalhe');
    esperar(/XLPE/.test(det) && /90°C/.test(det), 'detalhes sem isolamento/temperatura: ' + det);
    // digitar números no filtro não pode refazer a animação de entrada (a tela "piscava")
    const campo = await page.$('#filtro-produtos');
    await page.fill('#filtro-produtos', '');
    await page.type('#filtro-produtos', '999', { delay: 60 });
    await page.waitForFunction(() => /Nenhum produto com esse filtro/.test(document.getElementById('painel-produtos').textContent));
    await page.type('#filtro-produtos', '1', { delay: 60 });
    await page.waitForTimeout(300);
    const animados = await page.evaluate(() => document.querySelectorAll('#painel-produtos .fade-in').length);
    esperar(animados === 0, 'elementos com animação de entrada ao filtrar: ' + animados);
    esperar(await campo.evaluate(el => el.isConnected && document.activeElement === el), 'o campo de filtro perdeu o foco');
    await page.fill('#filtro-produtos', '');
    await page.waitForFunction(() => document.querySelectorAll('#tbody-produtos tr').length === 3);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-acao="exportar-produtos"]')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    esperar(csv.charCodeAt(0) === 0xFEFF && /PP-325/.test(csv) && csv.split('\r\n').length === 4, 'CSV inválido');
  }, page);
  await passo('aba Catálogos lista o catálogo lido', async () => {
    await page.click('#aba-catalogos');
    await page.waitForSelector('#lista-catalogos .cat-item');
    const t = await texto(page, '#lista-catalogos .cat-item');
    esperar(/Catálogo Flex Fast/.test(t) && /3 produtos/.test(t) && /PDF lido no navegador/.test(t) && /Prompt Mestre/.test(t), 'catálogo: ' + t);
  }, page);

  console.log('4) Texto colado');
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

  console.log('5) Importador sem IA: PDF escaneado e foto (OCR)');
  await passo('PDF escaneado é lido por OCR e organizado sem IA', async () => {
    await page.click('[data-modo="arquivo"]');
    const antes = await cotaUsada();
    const area = await lerCatalogo(page, 'fornecedor', path.join(ARQ, 'catalogo-escaneado-epi.pdf'), { semIA: true, timeout: 240000 });
    const t = await texto(page, area);
    esperar(/Encontrei 2 produtos/.test(t), 'OCR do PDF: ' + t.slice(0, 300));
    esperar((await cotaUsada()) === antes, 'usou a IA com a opção desmarcada');
    const r = await salvarCatalogo(page, area);
    esperar(/2 produtos salvos/.test(r), 'resultado: ' + r);
  }, page);
  await passo('foto é lida por OCR', async () => {
    const area = await lerCatalogo(page, 'fornecedor', path.join(ARQ, 'foto-catalogo-epi.png'), { semIA: true, timeout: 240000 });
    esperar(/Encontrei 2 produtos/.test(await texto(page, area)), 'OCR da foto');
    await salvarCatalogo(page, area);
    const tabela = await page.evaluate(async () => {
      const id = location.hash.split('/')[1];
      const r = await fetch(API_URL + '/api/fornecedores/' + id + '/produtos', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lf_token') } });
      const j = await r.json();
      return j.produtos.filter(p => /LV-C2|CAP-B/.test(p.codigo || '')).map(p => [p.nome, p.codigo, p.norma, p.preco].join(' | '));
    });
    console.log('     OCR leu: ' + tabela.join(' ; '));
    esperar(tabela.length >= 4, 'códigos LV-C2/CAP-B não lidos pelo OCR (PDF + foto)');
  }, page);

  console.log('6) Importador: a IA de imagem falha e a IA de texto organiza');
  await passo('PDF de tabela: sem resposta da IA de imagem, o texto é organizado pela IA', async () => {
    const area = await lerCatalogo(page, 'fornecedor', path.join(ARQ, 'catalogo-bruto-eletrica-sul.pdf'));
    const t = await texto(page, area);
    esperar(/Encontrei 2 produtos/.test(t), 'conferência: ' + t.slice(0, 300));
    await salvarCatalogo(page, area);
    await page.click('#aba-catalogos');
    await page.waitForFunction(() => /Texto organizado pela IA/.test(document.getElementById('lista-catalogos').textContent), null, { timeout: 10000 });
  }, page);

  console.log('7) Importar catálogo primeiro: a IA acha o fornecedor e cadastra');
  await passo('a IA lê as 3 páginas e preenche o fornecedor novo', async () => {
    await page.click('#nav-importar');
    await page.waitForSelector('#secao-importar:not(.hidden)');
    await page.waitForSelector('#imp-capacidades-importar .cap-linha.ok', { timeout: 10000 });
    const antes = await cotaUsada();
    const area = await lerCatalogo(page, 'importar', path.join(ARQ, 'catalogo-energy-3-paginas.pdf'), {
      antes: async () => {
        esperar(await page.locator('#imp-usar-ia').isChecked(), 'a leitura com IA deveria vir marcada');
        esperar(await page.inputValue('#imp-ate') === '3', 'até a página: ' + await page.inputValue('#imp-ate'));
        await page.screenshot({ path: path.join(FOTOS, '07-importar-preparar.png') });
      }
    });
    const t = await texto(page, area);
    esperar(/Encontrei 4 produtos/.test(t) && /3 lidas pela IA/.test(t), 'conferência: ' + t.slice(0, 300));
    esperar((await cotaUsada()) - antes >= 3, 'deveria usar 1 leitura de IA por página');
    const campos = {};
    for (const c of ['nome', 'cnpj', 'whatsapp', 'telefone', 'email', 'site', 'especialidade']) campos[c] = await page.inputValue('#imp-f-' + c);
    esperar(campos.nome === 'Energy Fios e Cabos' && campos.cnpj === '11.222.333/0001-81' && /98765-4321/.test(campos.whatsapp) &&
      /3456-7890/.test(campos.telefone) && campos.email === 'vendas@energycondutores.com.br' && /energycondutores\.com\.br/.test(campos.site) &&
      /cobre/.test(campos.especialidade), 'fornecedor: ' + JSON.stringify(campos));
    esperar(await page.locator('input[name="imp-modo-forn"][value="novo"]').isChecked(), 'deveria sugerir um fornecedor novo');
    await page.screenshot({ path: path.join(FOTOS, '08-importar-conferencia.png'), fullPage: true });
  }, page);
  await passo('conferência: desmarcar um produto e salvar cria o fornecedor', async () => {
    const linha = page.locator('#imp-tbody tr', { hasText: 'Cabo Flexível 750V 4 mm²' });
    await linha.locator('input.imp-sel').uncheck();
    await page.waitForFunction(() => /Salvar 3 produtos/.test(document.getElementById('imp-btn-salvar').textContent));
    const r = await salvarCatalogo(page, '#imp-trabalho-importar');
    esperar(/3 produtos salvos/.test(r) && /Energy Fios e Cabos/.test(r) && /cadastrado/.test(r), 'resultado: ' + r);
    await page.screenshot({ path: path.join(FOTOS, '09-importar-pronto.png') });
    await page.click('#imp-trabalho-importar [data-acao="ver-fornecedor"]');
    await page.waitForSelector('#secao-detalhe:not(.hidden) #tbody-produtos tr', { timeout: 15000 });
    esperar(await page.locator('#tbody-produtos tr').count() === 3, 'produtos do fornecedor novo');
    const cab = await texto(page, '#det-header');
    esperar(/11\.222\.333\/0001-81/.test(cab) && /energycondutores/.test(cab), 'cabeçalho: ' + cab);
    esperar(!/4 mm²/.test(await texto(page, '#tbody-produtos')), 'o produto desmarcado foi salvo');
  }, page);
  await passo('página com produtos demais: a IA lê em partes e nada se perde', async () => {
    await page.click('#aba-adicionar');
    await page.waitForSelector('#painel-adicionar:not(.hidden) #imp-entrada-fornecedor:not(.hidden)');
    const area = await lerCatalogo(page, 'fornecedor', { name: 'tabela-densa.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(ARQ, 'catalogo-escaneado-epi.pdf')) });
    const t = await texto(page, area);
    esperar(/Encontrei 6 produtos/.test(t), 'conferência: ' + t.slice(0, 300));
    esperar(!/incompleta/.test(t), 'avisou página incompleta mesmo lendo o resto');
    esperar(await page.locator('#imp-tbody tr', { hasText: 'Quadruplex 4x16 mm²' }).count() === 1, 'último produto da tabela não veio');
    const r = await salvarCatalogo(page, area);
    esperar(/6 produtos salvos/.test(r), 'resultado: ' + r);
  }, page);
  await passo('o mesmo catálogo de novo (saindo da tela no meio): avisa que o fornecedor já existe', async () => {
    await page.click('#nav-importar');
    await page.waitForSelector('#imp-entrada-importar:not(.hidden)');
    await fetch(MOCK + '/__demora?ms=1500', { method: 'POST' }).catch(() => {});
    try {
      await page.setInputFiles('#input-importar', path.join(ARQ, 'catalogo-energy-3-paginas.pdf'));
      await page.waitForSelector('#imp-trabalho-importar [data-acao="imp-comecar"]', { timeout: 30000 });
      await page.fill('#imp-de', '3');
      await page.click('#imp-trabalho-importar [data-acao="imp-comecar"]');
      await page.waitForSelector('#imp-status');
      // a pessoa sai da tela durante a leitura: a leitura continua e avisa quando termina, sem bagunçar a outra tela
      await page.click('#nav-fornecedores');
      await page.waitForSelector('#lista-fornecedores .tabela', { timeout: 10000 });
      await page.waitForSelector('.toast:has-text("Volte em Importar catálogo")', { timeout: 30000 });
      esperar(await page.locator('#lista-fornecedores .tabela').count() === 1 && await page.locator('#secao-fornecedores #imp-btn-salvar').count() === 0,
        'a conferência apareceu fora da tela de importar');
    } finally {
      await fetch(MOCK + '/__demora?ms=0', { method: 'POST' }).catch(() => {});
    }
    await page.click('#nav-importar');
    await page.waitForSelector('#imp-btn-salvar', { timeout: 10000 });
    const t = await texto(page, '#imp-forn-card');
    esperar(/Parece ser Energy Fios e Cabos/.test(t) && /mesmo CNPJ/.test(t), 'aviso de repetido: ' + t);
    esperar(await page.locator('input[name="imp-modo-forn"][value="existente"]').isChecked(), 'deveria sugerir o fornecedor já cadastrado');
    await page.click('[data-acao="imp-descartar-confirmar"]');
    await page.waitForSelector('#modal-confirmar.open');
    await page.click('#btn-confirmar-ok');
    await page.waitForSelector('#imp-entrada-importar:not(.hidden)', { timeout: 10000 });
  }, page);
  await passo('fornecedor do ramo sem catálogo', async () => {
    await page.click('#nav-fornecedores');
    await page.click('#secao-fornecedores .page-head [data-acao="novo-fornecedor"]');
    await page.waitForSelector('#modal-fornecedor.open');
    await page.fill('#forn-nome', 'Distribuidora Paulista de Cabos');
    await page.fill('#forn-telefone', '(11) 2222-1111');
    await page.fill('#forn-obs', 'Cabos de cobre e alumínio para obras');
    await page.click('#btn-salvar-fornecedor');
    await page.waitForSelector('#secao-detalhe:not(.hidden)', { timeout: 10000 });
  }, page);

  console.log('8) Busca e IA');
  await passo('busca técnica acha o produto certo', async () => {
    await page.click('#nav-busca');
    await page.waitForSelector('#secao-busca:not(.hidden)');
    await page.fill('#campo-busca', 'cabo pp 3×2.5 mm²');
    await page.click('#btn-buscar');
    await page.waitForSelector('#resultados .tabela tbody tr', { timeout: 15000 });
    const t = await texto(page, '#resultados .tabela tbody tr');
    esperar(/PP-325/.test(t), 'primeiro resultado: ' + t);
    esperar(await page.locator('#resultados mark').count() > 0, 'sem destaque dos termos');
    const linhaFlex = page.locator('#resultados .tabela tbody tr', { hasText: 'Flex Fast' }).first();
    const wa = await linhaFlex.locator('a.btn-whats').first().getAttribute('href');
    esperar(/^https:\/\/wa\.me\/5511957808642\?text=/.test(wa), 'link do WhatsApp: ' + wa);
    await page.screenshot({ path: path.join(FOTOS, '10-busca.png'), fullPage: true });
  }, page);
  await passo('buscar "cabos" (plural) acha os cabos e quem trabalha com isso', async () => {
    await page.fill('#campo-busca', 'cabos');
    await page.click('#btn-buscar');
    await page.waitForSelector('#resultados .tabela tbody tr', { timeout: 15000 });
    const t = await texto(page, '#resultados');
    esperar(/Cabo Flexível 750V/.test(t) && /Energy Fios e Cabos/.test(t), 'cabos: ' + t.slice(0, 400));
    esperar(/Distribuidora Paulista de Cabos/.test(t) && /sem catálogo/.test(t), 'fornecedor do ramo sem catálogo não apareceu');
    await page.screenshot({ path: path.join(FOTOS, '11-busca-cabos.png'), fullPage: true });
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
    await page.screenshot({ path: path.join(FOTOS, '12-ia.png') });
  }, page);

  console.log('9) Fornecedores, edição e configurações');
  await passo('lista de fornecedores com contagens e filtro', async () => {
    await page.click('#nav-fornecedores');
    await page.waitForSelector('#lista-fornecedores .tabela tbody tr');
    esperar(await page.locator('#lista-fornecedores .tabela tbody tr').count() === 3, 'deveria listar 3 fornecedores');
    const t = await texto(page, '#lista-fornecedores .tabela');
    esperar(/Flex Fast/.test(t) && /Energy Fios e Cabos/.test(t) && /Distribuidora Paulista/.test(t), 'linhas: ' + t.slice(0, 300));
    await page.fill('#filtro-fornecedores', 'nada-a-ver');
    await page.waitForSelector('#lista-fornecedores .empty-box');
    await page.fill('#filtro-fornecedores', '11.222.333');
    await page.waitForFunction(() => document.querySelectorAll('#lista-fornecedores .tabela tbody tr').length === 1);
    esperar(/Energy/.test(await texto(page, '#lista-fornecedores .tabela tbody tr')), 'filtro por CNPJ');
    await page.fill('#filtro-fornecedores', '');
    await page.waitForSelector('#lista-fornecedores .tabela');
    await page.screenshot({ path: path.join(FOTOS, '13-fornecedores.png') });
  }, page);
  await passo('editar fornecedor (com CNPJ e site)', async () => {
    const linha = page.locator('#lista-fornecedores .tabela tbody tr', { hasText: 'Flex Fast' });
    await linha.locator('[data-acao="editar-fornecedor"]').click();
    await page.waitForSelector('#modal-fornecedor.open');
    await page.fill('#forn-telefone', '(11) 3333-4444');
    await page.fill('#forn-cnpj', '11.222.333/0001-80');
    await page.click('#btn-salvar-fornecedor');
    await page.waitForFunction(() => /CNPJ/i.test(document.getElementById('forn-erro').textContent), null, { timeout: 5000 });
    await page.fill('#forn-cnpj', '');
    await page.click('#btn-salvar-fornecedor');
    await page.waitForSelector('#modal-fornecedor:not(.open)');
    await page.waitForFunction(() => /3333-4444/.test(document.getElementById('lista-fornecedores').textContent), null, { timeout: 10000 });
  }, page);
  await passo('tema e tamanho do texto', async () => {
    await page.click('.topbar [data-acao="tema"][data-valor="light"]');
    esperar(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'tema claro');
    await page.screenshot({ path: path.join(FOTOS, '14-tema-claro.png') });
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
    await page.screenshot({ path: path.join(FOTOS, '15-configuracoes.png'), fullPage: true });
  }, page);
  await passo('cliente comum não vê o painel do dono', async () => {
    esperar(await page.locator('#nav-admin').isHidden(), 'menu admin visível');
    await page.goto(SITE + '/#admin');
    await page.waitForSelector('#secao-busca:not(.hidden)');
  }, page);

  console.log('10) Exclusões');
  await passo('excluir catálogo pelo modal de confirmação', async () => {
    await page.click('#nav-fornecedores');
    await page.locator('#lista-fornecedores .tabela tbody tr', { hasText: 'Flex Fast' }).locator('[data-acao="ver-fornecedor"]').first().click();
    await page.click('#aba-catalogos');
    await page.waitForSelector('#lista-catalogos .cat-item');
    const antes = await page.locator('#lista-catalogos .cat-item').count();
    await page.locator('#lista-catalogos [data-acao="excluir-catalogo"]').last().click();
    await page.waitForSelector('#modal-confirmar.open');
    await page.click('#btn-confirmar-ok');
    await page.waitForFunction(n => document.querySelectorAll('#lista-catalogos .cat-item').length === n - 1, antes, { timeout: 10000 });
  }, page);

  console.log('11) Painel do dono');
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
    await adm.screenshot({ path: path.join(FOTOS, '16-painel-dono.png'), fullPage: true });
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
  await passo('dono testa a IA, vê a cota e baixa o backup', async () => {
    await adm.click('[data-acao="admin-testar-ia"]');
    await adm.waitForFunction(() => /respondeu/.test(document.getElementById('adm-diagnostico').textContent), null, { timeout: 30000 });
    esperar(/leitura de imagem|imagem/i.test(await texto(adm, '#adm-diagnostico')), 'diagnóstico sem a leitura de imagem');
    const [dl] = await Promise.all([adm.waitForEvent('download'), adm.click('[data-acao="admin-backup"]')]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    esperar(Array.isArray(j.produtos) && j.usuarios.every(u => !('senha' in u)), 'backup');
  }, adm);

  console.log('12) Celular');
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
    await m.screenshot({ path: path.join(FOTOS, '17-celular-busca.png'), fullPage: true });
    await m.click('#btn-menu');
    await m.waitForSelector('#sidebar.mobile-open');
    await m.click('#nav-fornecedores');
    await m.waitForSelector('#sidebar:not(.mobile-open)');
    await m.waitForSelector('#lista-fornecedores .lista-cards .p-card', { state: 'visible' });
    await m.locator('#lista-fornecedores .lista-cards .p-card', { hasText: 'Energy' }).locator('[data-acao="ver-fornecedor"]').first().click();
    await m.waitForSelector('#cards-produtos .p-card', { state: 'visible', timeout: 10000 });
    const largura = await m.evaluate(() => document.documentElement.scrollWidth);
    esperar(largura <= 392, 'rolagem horizontal no celular: ' + largura);
    await m.screenshot({ path: path.join(FOTOS, '18-celular-produtos.png'), fullPage: true });
  }, m);
  await passo('no celular: importar catálogo cabe na tela', async () => {
    await m.click('#btn-menu');
    await m.waitForSelector('#sidebar.mobile-open');
    await m.click('#nav-importar');
    await m.waitForSelector('#secao-importar:not(.hidden)');
    await m.setInputFiles('#input-importar', { name: 'Catálogo Flex Fast (Prompt Mestre).pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(ARQ, 'catalogo-flex-fast-prompt-mestre.pdf')) });
    await m.waitForSelector('#imp-trabalho-importar [data-acao="imp-comecar"]', { timeout: 30000 });
    await m.click('#imp-trabalho-importar [data-acao="imp-comecar"]');
    await m.waitForSelector('#imp-btn-salvar', { timeout: 60000 });
    const largura = await m.evaluate(() => document.documentElement.scrollWidth);
    esperar(largura <= 392, 'rolagem horizontal na conferência: ' + largura);
    await m.screenshot({ path: path.join(FOTOS, '19-celular-conferencia.png'), fullPage: true });
    await m.click('[data-acao="imp-descartar-confirmar"]');
    await m.click('#btn-confirmar-ok');
    await m.waitForSelector('#imp-entrada-importar:not(.hidden)', { timeout: 10000 });
  }, m);

  console.log('13) Exclusão dos fornecedores');
  await passo('excluir fornecedores até a lista ficar vazia', async () => {
    await page.goto(SITE + '/#fornecedores');
    await page.waitForSelector('#lista-fornecedores .tabela');
    for (let i = 0; i < 3; i++) {
      const n = await page.locator('#lista-fornecedores .tabela tbody tr').count();
      await page.locator('#lista-fornecedores .tabela [data-acao="excluir-fornecedor"]').first().click();
      await page.click('#btn-confirmar-ok');
      if (n > 1) await page.waitForFunction(k => document.querySelectorAll('#lista-fornecedores .tabela tbody tr').length === k - 1, n, { timeout: 10000 });
    }
    await page.waitForSelector('#lista-fornecedores .empty-box', { timeout: 10000 });
  }, page);

  await passo('nenhum erro no console', async () => {
    esperar(!errosConsole.length, errosConsole.slice(0, 5).join(' || '));
  });
  await browser.close();
  console.log('\nRESULTADO E2E: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO GERAL', e); process.exit(2); });
