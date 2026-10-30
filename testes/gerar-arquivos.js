// Gera os arquivos de teste: PDF com texto (Prompt Mestre), PDF bruto, PDF escaneado (só imagem) e foto PNG
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'arquivos');
const NAVEGADOR = process.env.CHROMIUM || undefined;
fs.mkdirSync(OUT, { recursive: true });
const pm = fs.readFileSync(path.join(__dirname, 'fixtures', 'prompt_mestre.txt'), 'utf8');
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
(async () => {
  const b = await chromium.launch({ executablePath: NAVEGADOR });
  const p = await b.newPage();
  // 1) PDF digital no formato do Prompt Mestre (como sai do Word)
  await p.setContent('<html><body style="font-family:Arial;font-size:12pt;line-height:1.35;margin:40px"><pre style="font-family:Arial;white-space:pre-wrap">' + esc(pm) + '</pre></body></html>');
  await p.pdf({ path: path.join(OUT, 'catalogo-flex-fast-prompt-mestre.pdf'), format: 'A4' });
  // 2) PDF bruto de fornecedor (tabela, sem o formato do Prompt Mestre)
  const linhas = [['DJ-C10', 'Disjuntor DIN curva C 10A', '220/380V', 'NBR NM 60898', 'R$ 16,90'], ['DJ-C20', 'Disjuntor DIN curva C 20A', '220/380V', 'NBR NM 60898', 'R$ 18,50'],
    ['DR-40', 'Interruptor diferencial residual 40A 30mA', '220V', 'NBR NM 61008', 'R$ 129,00'], ['QD-12', 'Quadro de distribuição 12 disjuntores embutir', '—', 'NBR IEC 60670', 'R$ 89,90']];
  await p.setContent('<html><body style="font-family:Arial;margin:40px"><h1>Elétrica Sul Distribuidora</h1><p>Catálogo 2026 · vendas@eletricasul.com · (51) 3333-4444</p>' +
    '<table border="1" cellpadding="6" style="border-collapse:collapse;font-size:11pt"><tr><th>Código</th><th>Descrição</th><th>Tensão</th><th>Norma</th><th>Preço</th></tr>' +
    linhas.map(l => '<tr>' + l.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</table>' +
    '<p>Linha de proteção para quadros residenciais e prediais. Atendemos licitações em todo o Sul.</p></body></html>');
  await p.pdf({ path: path.join(OUT, 'catalogo-bruto-eletrica-sul.pdf'), format: 'A4' });
  // 3) Imagem com texto (base para o escaneado e para a foto)
  const curto = 'PRODUTO 1\nNome: Luva Isolante Classe 2\nCódigo: LV-C2\nTensão: 17kV\nNorma: NBR 16295\nPreço: R$ 289,00\nUnidade: par\n\nPRODUTO 2\nNome: Capacete Classe B com jugular\nCódigo: CAP-B\nNorma: NBR 8221\nPreço: R$ 45,00\nUnidade: peça';
  await p.setViewportSize({ width: 1240, height: 1754 });
  await p.setContent('<html><body style="margin:0;background:#fff"><pre style="font-family:Arial;font-size:30px;line-height:1.5;margin:90px;color:#111">' + esc(curto) + '</pre></body></html>');
  await p.screenshot({ path: path.join(OUT, 'foto-catalogo-epi.png') });
  const b64 = fs.readFileSync(path.join(OUT, 'foto-catalogo-epi.png')).toString('base64');
  // 4) PDF escaneado: só a imagem, sem camada de texto
  await p.setContent('<html><body style="margin:0"><img src="data:image/png;base64,' + b64 + '" style="width:100%;display:block"></body></html>');
  await p.pdf({ path: path.join(OUT, 'catalogo-escaneado-epi.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  // 5) Catálogo de fábrica com 3 páginas "desenhadas" (só imagem, tabelas), como o da Energy: capa, tabela e contatos
  const estilo = '<style>body{margin:0;background:#fff;font-family:Arial;color:#111}main{padding:70px}h1{font-size:64px;margin:0 0 20px;color:#0a3d91}' +
    'h2{font-size:40px;margin:0 0 24px}table{border-collapse:collapse;width:100%;font-size:26px}td,th{border:2px solid #333;padding:12px;text-align:left}' +
    'th{background:#e8eef9}.rod{position:absolute;bottom:60px;left:70px;right:70px;font-size:24px;border-top:3px solid #0a3d91;padding-top:16px}</style>';
  const paginasEnergy = [
    '<main><h1>ENERGY</h1><p style="font-size:44px;margin:0">Fios e Cabos</p><p style="font-size:30px;margin-top:80px">Catálogo técnico 2026</p>' +
      '<p style="font-size:28px">Fios e cabos elétricos de cobre para baixa tensão</p><p style="font-size:28px">www.energycondutores.com.br</p></main>',
    '<main><h2>Cabo Flexível 750V — ABNT NBR NM 247-3</h2><table><tr><th>Seção (mm²)</th><th>Diâmetro externo (mm)</th><th>Peso (kg/100 m)</th><th>Embalagem</th></tr>' +
      '<tr><td>1,5</td><td>2,9</td><td>1,9</td><td>rolo 100 m</td></tr><tr><td>2,5</td><td>3,4</td><td>3,1</td><td>rolo 100 m</td></tr>' +
      '<tr><td>4</td><td>4,5</td><td>4,6</td><td>rolo 100 m</td></tr></table><p style="font-size:24px">Condutor de cobre nu, têmpera mole, classe 4. Isolação PVC/A antichama 70 °C.</p></main>',
    '<main><h2>Cabo PP 0,6/1 kV — ABNT NBR 7286</h2><table><tr><th>Código</th><th>Formação</th><th>Isolação</th><th>Preço</th></tr>' +
      '<tr><td>PP-325</td><td>3x2,5 mm²</td><td>HEPR 90 °C</td><td>R$ 8,90/m</td></tr></table>' +
      '<div class="rod">Vendas (11) 3456-7890 · WhatsApp (11) 98765-4321 · vendas@energycondutores.com.br · CNPJ 11.222.333/0001-81</div></main>'
  ];
  const imagensEnergy = [];
  for (const conteudo of paginasEnergy) {
    await p.setContent('<html><head>' + estilo + '</head><body style="position:relative;width:1240px;height:1754px">' + conteudo + '</body></html>');
    imagensEnergy.push((await p.screenshot({ type: 'jpeg', quality: 80 })).toString('base64'));
  }
  await p.setContent('<html><body style="margin:0">' + imagensEnergy.map(function (b, i) {
    return '<div style="width:210mm;height:296mm;overflow:hidden' + (i < imagensEnergy.length - 1 ? ';break-after:page' : '') + '">' +
      '<img src="data:image/jpeg;base64,' + b + '" style="width:100%;display:block"></div>';
  }).join('') + '</body></html>');
  await p.pdf({ path: path.join(OUT, 'catalogo-energy-3-paginas.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await b.close();
  console.log(fs.readdirSync(OUT).map(f => f + ' ' + fs.statSync(path.join(OUT, f)).size).join('\n'));
})();
