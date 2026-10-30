// Testes da leitura com IA (API com o OpenRouter simulado: node testes/mock-openrouter.js)
// Uso: BASE=http://localhost:3000 node testes/ia.test.js   (API com OPENROUTER_BASE_URL=http://localhost:4010 e OPENROUTER_API_KEY=chave-teste)
'use strict';
const BASE = process.env.BASE || 'http://localhost:3000';
let falhas = 0, ok = 0;
function check(cond, msg, extra) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { falhas++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 500) : '')); }
}
async function api(method, caminho, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + caminho, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) { /* sem corpo */ }
  return { s: r.status, j };
}
// imagem JPEG mínima válida em base64 (a IA simulada não olha o conteúdo)
const IMG = 'data:image/jpeg;base64,' + Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb004300' + '08'.repeat(400) + 'ffd9', 'hex').toString('base64');

(async () => {
  const s = Date.now();
  console.log('1) capacidades');
  let r = await api('POST', '/api/auth/cadastro', { nome: 'Compras IA', email: 'ia' + s + '@teste.com', senha: 'segredo1' });
  const A = r.j.token;
  r = await api('POST', '/api/auth/cadastro', { nome: 'Outra empresa', email: 'ib' + s + '@teste.com', senha: 'segredo1' });
  const B = r.j.token;
  r = await api('GET', '/api/extracao/capacidades', null, A);
  check(r.s === 200 && r.j.ia === true && r.j.visao === true, 'IA e leitura de imagem disponíveis', r.j);
  check(r.j.cota && r.j.cota.limite === 50 && r.j.cota.restante >= 0, 'cota diária gratuita informada', r.j.cota);
  r = await api('GET', '/api/extracao/capacidades');
  check(r.s === 401, 'capacidades exige login', r.s);

  console.log('2) leitura de página (imagem) pela IA');
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 2, total: 3, texto: '' }, A);
  check(r.s === 200 && r.j.produtos.length === 3, 'página 2: 3 produtos da tabela', r.j);
  const p2 = r.j.produtos || [];
  check(p2[1] && p2[1].nome === 'Cabo Flexível 750V 2,5 mm²' && p2[1].bitola === '2,5 mm²' && p2[1].norma === 'ABNT NBR NM 247-3', 'campos técnicos preenchidos', p2[1]);
  check(p2[1] && p2[1].atributos['Diâmetro externo (mm)'] === '3,4', 'colunas extras viram atributos', p2[1] && p2[1].atributos);
  check(r.j.modelo && r.j.modelo.indexOf('nemotron') < 0, 'modelo que responde vazio é evitado (' + r.j.modelo + ')', r.j.modelo);
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 3, total: 3 }, A);
  check(r.s === 200 && r.j.produtos.length === 1 && r.j.produtos[0].tensao === '0,6/1 kV', 'produto repetido na página é juntado', r.j.produtos);
  check(r.j.fornecedor && r.j.fornecedor.cnpj === '11.222.333/0001-81' && r.j.fornecedor.whatsapp === '(11) 98765-4321', 'dados do fornecedor lidos da página', r.j.fornecedor);
  const p3 = r.j.produtos;
  r = await api('POST', '/api/extracao/pagina', { imagem: 'data:text/html;base64,PHNjcmlwdD4=', pagina: 1 }, A);
  check(r.s === 400, 'imagem inválida = 400', r);
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1 });
  check(r.s === 401, 'leitura exige login', r.s);
  // página com produtos demais: a resposta vem cortada; a continuação traz o resto
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1, total: 1, nome_arquivo: 'catalogo-denso.pdf' }, A);
  check(r.s === 200 && r.j.ok === true && r.j.incompleto === true && r.j.produtos.length === 4 && r.j.ultimo === 'Cabo Multiplexado Triplex 3x16 mm²',
    'resposta cortada: 4 produtos e aviso de incompleta', r.j && { incompleto: r.j.incompleto, n: r.j.produtos && r.j.produtos.length, ultimo: r.j.ultimo });
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1, total: 1, nome_arquivo: 'catalogo-denso.pdf', continuar_apos: 'Cabo Multiplexado Triplex 3x16 mm²' }, A);
  check(r.s === 200 && r.j.incompleto === false && r.j.produtos.some(function (p) { return p.nome === 'Cabo Multiplexado Quadruplex 4x16 mm²'; }),
    'continuação traz o resto da página', r.j && r.j.produtos && r.j.produtos.map(function (p) { return p.nome; }));
  // a IA trava no meio da resposta (streaming): o servidor devolve as linhas completas que chegaram e o navegador pede o resto
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1, total: 1, nome_arquivo: 'tabela-lenta.pdf' }, A);
  check(r.s === 200 && r.j.ok === true && r.j.incompleto === true && r.j.produtos.length === 4 && r.j.ultimo === 'Cabo de Controle Blindado 500V 5x0,5 mm²',
    'IA travou: 4 linhas completas da tabela e aviso de incompleta', r.j && { incompleto: r.j.incompleto, n: r.j.produtos && r.j.produtos.length, ultimo: r.j.ultimo, error: r.j.error });
  check(r.j.produtos && r.j.produtos[0] && r.j.produtos[0].bitola === '2x0,5 mm²' && r.j.produtos[0].tensao === '300/500 V' && r.j.produtos[0].atributos['Peso (kg/km)'] === '45',
    'linha da tabela vira produto com medida, dados comuns e colunas', r.j.produtos && r.j.produtos[0]);
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1, total: 1, nome_arquivo: 'tabela-lenta.pdf', continuar_apos: 'Cabo de Controle Blindado 500V 5x0,5 mm²' }, A);
  check(r.s === 200 && r.j.incompleto === false && r.j.produtos.map(function (p) { return p.bitola; }).join(',') === '6x0,5 mm²,8x0,5 mm²',
    'continuação traz as linhas que faltavam', r.j && r.j.produtos && r.j.produtos.map(function (p) { return p.nome; }));
  // a IA de imagem falha (o mock devolve 502 para "eletrica-sul"): resposta 200 com ok:false, sem erro de rede no navegador
  r = await api('POST', '/api/extracao/pagina', { imagem: IMG, pagina: 1, total: 1, nome_arquivo: 'catalogo-bruto-eletrica-sul.pdf' }, A);
  check(r.s === 200 && r.j.ok === false && r.j.code && Array.isArray(r.j.tentados) && r.j.tentados.length >= 1 && /IA/.test(r.j.error),
    'falha da IA de imagem = 200 com ok:false, motivo e modelos tentados', r.j);

  console.log('3) texto bruto organizado pela IA');
  r = await api('POST', '/api/extracao/estruturar-bloco', { texto: 'CABOS FLEXIVEIS 750V\n1,5mm rolo 100m\n2x1mm 500V PP\n'.repeat(3) }, A);
  check(r.s === 200 && r.j.produtos.length === 2, 'bloco de texto vira produtos', r.j);
  r = await api('POST', '/api/extracao/estruturar-bloco', { texto: 'curto' }, A);
  check(r.s === 400, 'texto curto = 400', r.s);

  console.log('3b) PDF já organizado (Prompt Mestre) é lido sem gastar a IA');
  const PM = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'prompt_mestre.txt'), 'utf8');
  const usadasAntes = (await (await fetch((process.env.MOCK_IA || 'http://localhost:4010') + '/api/v1/key', { headers: { Authorization: 'Bearer chave-teste' } })).json()).data.free_model_daily_requests.used;
  r = await api('POST', '/api/extracao/analisar', { texto: PM }, A);
  check(r.s === 200 && r.j.formato === 'prompt_mestre' && r.j.produtos.length === 3 && r.j.produtos[0].codigo === 'PP-325', 'texto do Prompt Mestre vira 3 produtos', r.j && { formato: r.j.formato, n: r.j.produtos && r.j.produtos.length });
  check(r.j.fornecedor && /Flex Fast/.test(r.j.fornecedor.nome) && r.j.fornecedor.email === 'vendas@flexfast.com.br', 'fornecedor do bloco FORNECEDOR', r.j.fornecedor);
  const usadasDepois = (await (await fetch((process.env.MOCK_IA || 'http://localhost:4010') + '/api/v1/key', { headers: { Authorization: 'Bearer chave-teste' } })).json()).data.free_model_daily_requests.used;
  check(usadasDepois === usadasAntes, 'não usou a cota de IA', { usadasAntes, usadasDepois });
  r = await api('POST', '/api/extracao/analisar', { texto: 'Catálogo 2026 da empresa com linha completa de cabos para obras e indústria.' }, A);
  check(r.s === 200 && r.j.formato === 'texto' && r.j.produtos.length === 0, 'texto comum não vira produto', r.j);
  r = await api('POST', '/api/extracao/analisar', { texto: 'oi' }, A);
  check(r.s === 400, 'texto curto = 400', r.s);
  r = await api('POST', '/api/extracao/analisar', { texto: PM });
  check(r.s === 401, 'analisar exige login', r.s);

  console.log('4) fornecedor encontrado no catálogo');
  r = await api('POST', '/api/fornecedores', { nome: 'Flex Fast Fios Elétricos', observacoes: 'fios e cabos elétricos', whatsapp: '(11) 95780-8642' }, A);
  const FLEX = r.j.fornecedor.id;
  r = await api('POST', '/api/fornecedores', { nome: 'Energy Condutores', cnpj: '11222333000181' }, A);
  check(r.s === 201 && r.j.fornecedor.cnpj === '11.222.333/0001-81', 'CNPJ salvo formatado', r.j.fornecedor);
  const ENERGY_ANTIGO = r.j.fornecedor.id;
  r = await api('POST', '/api/fornecedores', { nome: 'X', cnpj: '11.111.111/1111-11' }, A);
  check(r.s === 400, 'CNPJ com dígitos errados = 400', r.j);
  r = await api('POST', '/api/extracao/fornecedor', { fornecedores: [{ nome: 'Energy Fios e Cabos', site: 'www.energycondutores.com.br' }, { cnpj: '11.222.333/0001-81', telefone: '(11) 3456-7890' }],
    texto: 'Contato: vendas@energycondutores.com.br  WhatsApp (11) 98765-4321', nome_arquivo: 'Catálogo-Energy.pdf' }, A);
  check(r.s === 200 && r.j.fornecedor.nome === 'Energy Fios e Cabos' && r.j.fornecedor.email === 'vendas@energycondutores.com.br' && r.j.fornecedor.whatsapp === '(11) 98765-4321',
    'dados da IA + contatos do texto juntos', r.j.fornecedor);
  check(r.j.parecidos.length === 1 && r.j.parecidos[0].id === ENERGY_ANTIGO && r.j.parecidos[0].motivo === 'mesmo CNPJ', 'aponta o fornecedor já cadastrado (mesmo CNPJ)', r.j.parecidos);
  r = await api('POST', '/api/extracao/fornecedor', { fornecedores: [{ cnpj: '11.222.333/0001-81' }] }, B);
  check(r.s === 200 && r.j.parecidos.length === 0, 'não mostra fornecedores de outra conta', r.j.parecidos);

  console.log('5) importar: catálogo primeiro, fornecedor criado sozinho');
  r = await api('POST', '/api/extracao/importar', {
    novo_fornecedor: { nome: 'Energy Fios e Cabos', cnpj: '11.222.333/0001-81', site: 'www.energycondutores.com.br', telefone: '(11) 3456-7890', whatsapp: '(11) 98765-4321', email: 'vendas@energycondutores.com.br', especialidade: 'Fios e cabos de cobre' },
    nome_arquivo: 'Catálogo-Energy.pdf', paginas: 3, origem: 'ia_visao', texto: 'Energy Fios e Cabos\nCatálogo de produtos', resumos: ['Capa', 'Tabela do Cabo Flexível 750V'],
    produtos: p2.concat(p3).concat([{ nome: 'Cabo Flexível 750V 2,5 mm²', bitola: '2,5 mm²', tensao: '450/750 V', preco: 'R$ 3,20' }])
  }, A);
  check(r.s === 201 && r.j.fornecedor_criado === true && r.j.produtos === 4, 'fornecedor criado + 4 produtos (repetido juntado)', r.j);
  const ENERGY = r.j.fornecedor_id, CAT = r.j.catalogo_id;
  r = await api('GET', '/api/fornecedores/' + ENERGY, null, A);
  check(r.j.cnpj === '11.222.333/0001-81' && r.j.site === 'https://www.energycondutores.com.br' && r.j.whatsapp_link === 'https://wa.me/5511987654321', 'fornecedor com CNPJ, site e WhatsApp', r.j);
  check(r.j.catalogos[0].origem === 'ia_visao' && r.j.catalogos[0].formato === 'ia' && r.j.catalogos[0].total_produtos === 4, 'catálogo marcado como lido pela IA', r.j.catalogos[0]);
  r = await api('GET', '/api/fornecedores/' + ENERGY + '/produtos', null, A);
  const flex25 = r.j.produtos.filter(function (p) { return p.nome === 'Cabo Flexível 750V 2,5 mm²'; });
  check(flex25.length === 1 && flex25[0].preco === 'R$ 3,20' && flex25[0].atributos['Peso (kg/100 m)'] === '3,1', 'produto repetido entre páginas foi completado (preço + atributos)', flex25);
  r = await api('POST', '/api/extracao/importar', { novo_fornecedor: { nome: '' }, produtos: [{ nome: 'X' }] }, A);
  check(r.s === 400, 'fornecedor novo sem nome = 400', r.j);
  r = await api('POST', '/api/extracao/importar', { fornecedor_id: ENERGY, produtos: [{ nome: 'Intruso' }] }, B);
  check(r.s === 404, 'não importa em fornecedor de outra conta', r.s);
  r = await api('POST', '/api/extracao/importar/' + CAT + '/produtos', { produtos: [{ nome: 'Intruso' }] }, B);
  check(r.s === 404, 'não acrescenta produtos em catálogo de outra conta', r.s);
  r = await api('POST', '/api/extracao/importar/' + CAT + '/produtos', { produtos: [{ nome: 'Cordão Paralelo 300V 2x1,5 mm²', tensao: '300/300 V' }] }, A);
  check(r.s === 200 && r.j.total_produtos === 5, 'catálogo grande chega em partes', r.j);
  // PDF já organizado: catálogo e produtos ficam marcados como Prompt Mestre (não "organizado pela IA")
  const pm = (await api('POST', '/api/extracao/analisar', { texto: PM }, A)).j;
  r = await api('POST', '/api/extracao/importar', { novo_fornecedor: { nome: 'Flex Fast PM' }, nome_arquivo: 'Flex PM.pdf', paginas: 2, origem: 'pdf_navegador',
    formato: 'prompt_mestre', texto: PM, produtos: pm.produtos }, A);
  check(r.s === 201 && r.j.produtos === 3, 'importa o PDF organizado', r.j);
  const FPM = r.j.fornecedor_id;
  r = await api('GET', '/api/fornecedores/' + FPM, null, A);
  check(r.j.catalogos[0].formato === 'prompt_mestre' && r.j.catalogos[0].origem === 'pdf_navegador' && !r.j.catalogos[0].ia_info, 'catálogo marcado como Prompt Mestre, sem IA', r.j.catalogos[0]);
  r = await api('POST', '/api/extracao/importar/' + r.j.catalogos[0].id + '/produtos', { produtos: [{ nome: 'Cabo extra 10 mm²', bitola: '10 mm²', tensao: '750 V' }] }, A);
  r = await api('GET', '/api/fornecedores/' + FPM, null, A);
  check(r.j.catalogos[0].formato === 'prompt_mestre' && r.j.catalogos[0].total_produtos === 4, 'parte extra mantém o formato do catálogo', r.j.catalogos[0]);
  await api('DELETE', '/api/fornecedores/' + FPM, null, A);

  console.log('6) importar num fornecedor existente completa dados vazios');
  r = await api('POST', '/api/extracao/importar', { fornecedor_id: FLEX, nome_arquivo: 'Flex.pdf', origem: 'ia_visao', paginas: 1,
    fornecedor: { telefone: '(11) 2222-3333', whatsapp: '(11) 90000-0000', site: 'flexfast.com.br', cnpj: '11.222.333/0001-81' }, produtos: [{ nome: 'Cabo PP 2x1 mm²', bitola: '2x1 mm²' }] }, A);
  check(r.s === 201 && r.j.fornecedor_criado === false && r.j.fornecedor_atualizado.indexOf('telefone') >= 0 && r.j.fornecedor_atualizado.indexOf('WhatsApp') < 0,
    'completa só o vazio (telefone, site…) e não troca o WhatsApp digitado', r.j.fornecedor_atualizado);

  console.log('7) busca entende plural e acha fornecedor pela especialidade');
  r = await api('POST', '/api/busca', { consulta: 'cabos flexíveis' }, A);
  check(r.s === 200 && r.j.produtos.some(function (p) { return /Cabo Flexível 750V/.test(p.nome); }), '"cabos flexíveis" acha "Cabo Flexível 750V"', r.j.produtos && r.j.produtos.slice(0, 3).map(function (p) { return p.nome; }));
  r = await api('POST', '/api/fornecedores', { nome: 'Luvas Brasil', observacoes: 'luvas isolantes e EPI elétrico' }, A);
  r = await api('POST', '/api/busca', { consulta: 'luva isolante' }, A);
  check(r.s === 200 && r.j.fornecedores_relacionados.some(function (f) { return f.nome === 'Luvas Brasil' && f.total_catalogos === 0; }), 'fornecedor sem catálogo aparece pela especialidade', r.j.fornecedores_relacionados);
  r = await api('POST', '/api/busca/responder', { consulta: 'luvas isolantes' }, A);
  check(r.s === 200 && r.j.fontes.some(function (f) { return f.nome === 'Luvas Brasil'; }), 'IA cita o fornecedor relacionado', r.j);
  r = await api('POST', '/api/busca', { consulta: 'luva isolante' }, B);
  check(r.j.fornecedores_relacionados.length === 0, 'busca não mostra fornecedores de outra conta', r.j.fornecedores_relacionados);

  console.log('8) "Organizar com IA" parte por parte (texto salvo)');
  r = await api('POST', '/api/extracao/texto/' + FLEX, { texto: 'Catálogo Flex sem formato\n' + 'Cabo flexível 1,5mm 750V rolo 100m linha residencial e predial\n'.repeat(12), nome_arquivo: 'texto.txt', origem: 'texto_colado' }, A);
  check(r.s === 201 && r.j.ia === 'disponivel' && r.j.produtos === 0, 'texto sem formato: IA disponível (o navegador conduz)', r.j);
  const CTX = r.j.catalogo_id;
  r = await api('GET', '/api/fornecedores/' + FLEX + '/catalogo/' + CTX + '/estruturar', null, A);
  check(r.s === 200 && r.j.total >= 1, 'quantas partes a IA vai ler', r.j);
  const total = r.j.total;
  let ultimo = null;
  for (let parte = 0; parte < total; parte++) {
    ultimo = await api('POST', '/api/fornecedores/' + FLEX + '/catalogo/' + CTX + '/estruturar', { parte: parte }, A);
  }
  check(ultimo.s === 200 && ultimo.j.fim === true && ultimo.j.total_produtos >= 2, 'todas as partes lidas e produtos gravados', ultimo.j);
  r = await api('GET', '/api/fornecedores/' + FLEX, null, A);
  const cat = r.j.catalogos.filter(function (c) { return c.id === CTX; })[0];
  check(cat && cat.ia_status === 'concluido' && cat.formato === 'ia', 'catálogo marcado como organizado pela IA', cat);
  r = await api('POST', '/api/fornecedores/' + FLEX + '/catalogo/' + CTX + '/estruturar', { parte: 0 }, B);
  check(r.s === 404, 'outra conta não organiza catálogo alheio', r.s);
  r = await api('POST', '/api/fornecedores/' + FLEX + '/catalogo/' + CTX + '/estruturar', { parte: 99 }, A);
  check(r.s === 400, 'parte inexistente = 400', r.s);

  console.log('9) painel do dono mostra a cota e a leitura de imagem');
  r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'admin123' });
  if (r.s !== 200) r = await api('POST', '/api/auth/cadastro', { nome: 'Admin', email: 'admin@teste.com', senha: 'admin123' });
  const ADM = r.j.token;
  r = await api('GET', '/api/admin/diagnostico?testar_ia=1', null, ADM);
  check(r.s === 200 && r.j.ia.visao === true && r.j.ia.cota && r.j.ia.cota.limite === 50, 'diagnóstico com cota e visão', r.j.ia);
  check(r.j.ia.teste && r.j.ia.teste.ok === true && r.j.ia.teste.modelo.indexOf('nemotron') < 0, '"Testar a IA agora" responde (sem o modelo vazio)', r.j.ia.teste);

  console.log('\nRESULTADO IA: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
