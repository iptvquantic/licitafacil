// Testes do leitor de catálogos (sem banco): node testes/leitor.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const L = require(path.join(__dirname, '..', 'backend', 'src', 'services', 'leitor.service.js'));
const T = require(path.join(__dirname, '..', 'backend', 'src', 'utils', 'texto.js'));
let ok = 0, falhas = 0;
function check(cond, msg, extra) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { falhas++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function ler(nome) { return fs.readFileSync(path.join(__dirname, 'fixtures', nome), 'utf8'); }

console.log('Formatos de entrada');
let r = L.estruturar(ler('prompt_mestre.txt'));
check(r.formato === 'prompt_mestre' && r.produtos.length === 3, 'Prompt Mestre v1: 3 produtos', r.produtos.length);
check(r.fornecedor && r.fornecedor.email === 'vendas@flexfast.com.br', 'bloco FORNECEDOR lido', r.fornecedor);
check(r.produtos[0].codigo === 'PP-325' && r.produtos[0].bitola === '3x2,5mm²' && r.produtos[0].preco === 'R$ 8,90', 'campos do produto 1', r.produtos[0]);
check(r.produtos[2].codigo === '', '"não informado" vira vazio', r.produtos[2].codigo);
r = L.estruturar(ler('markdown.txt'));
check(r.produtos.length === 2 && r.produtos[0].atributos['Corrente nominal'] === '20A', 'markdown com negrito e atributo extra', r.produtos[0]);
r = L.estruturar(ler('word_pdf.txt'));
check(r.produtos.length === 2 && /SPDA/.test(r.produtos[0].nome), 'linhas quebradas do Word são juntadas', r.produtos[0].nome);
r = L.estruturar(ler('sem_marcador.txt'));
check(r.produtos.length === 2 && r.fornecedor && r.fornecedor.cnpj, 'sem "PRODUTO N" e sem cabeçalho FORNECEDOR', r);
r = L.estruturar(ler('tabela.txt'));
check(r.formato === 'tabela' && r.produtos.length === 2, 'tabela markdown', r.formato);
r = L.estruturar(ler('json.txt'));
check(r.formato === 'json' && r.produtos.length === 2 && r.fornecedor.nome === 'Cimentos Norte', 'JSON de IA', r);
r = L.estruturar('FORNECEDOR Nome: Flex CNPJ: 12.345.678/0001-90 Telefone: (11) 3333-4444 --- PRODUTOS PRODUTO 1 Nome: Cabo PP 3x2,5mm² 750V Código/Referência: PP-325 Tensão: 750V Preço: R$ 8,90 Unidade de venda: metro PRODUTO 2 Nome: Cabo flexível 2,5mm² Código/Referência: FX-25 Tensão: 750V Descrição técnica: Cabo unipolar para instalações internas residenciais e prediais em geral.');
check(r.produtos.length === 2 && r.produtos[1].codigo === 'FX-25' && r.fornecedor.telefone === '(11) 3333-4444', 'texto numa linha só (PDF achatado)', r);
r = L.estruturar('PRODUTO 1\nNome: Luva isolante\nUnidade: par\n\nCONTINUA\n\nPRODUTO 2\nNome: Capacete\nUnidade: peça\n(continua...)');
check(r.produtos.length === 2 && r.produtos[0].unidade === 'par' && r.produtos[1].unidade === 'peça', 'avisos "CONTINUA" da IA são ignorados', r.produtos);
r = L.estruturar('Catálogo geral 2026\nCabo flexível 1,5mm 750V rolo 100m\nLinha residencial e predial.');
check(r.formato === 'texto' && r.produtos.length === 0, 'texto livre não inventa produtos', r.formato);

console.log('Trechos de busca');
const trechos = L.gerarTrechos('linha\n'.repeat(5) + 'palavra '.repeat(2000), [], null);
check(trechos.length > 3 && trechos.every(function (t) { return t.length <= 1000; }), 'texto grande vira trechos de até ~900 caracteres', trechos.map(function (t) { return t.length; }));

console.log('Normalização técnica');
check(T.normalizarBusca('Cabo 3 × 2,5 mm²') === 'cabo 3x2.5mm2', '3 × 2,5 mm² = 3x2.5mm2', T.normalizarBusca('Cabo 3 × 2,5 mm²'));
const g = T.gruposBusca('ABNT NBR 6148');
check(g.some(function (x) { return x.termo === '6148'; }), 'norma vira termo técnico', g);

console.log('Busca entende plural e feminino');
check(T.raizes('cabos').indexOf('cabo') >= 0 && T.raizes('disjuntores').indexOf('disjuntor') >= 0, 'cabos → cabo, disjuntores → disjuntor', [T.raizes('cabos'), T.raizes('disjuntores')]);
check(T.raizes('flexiveis').indexOf('flexivel') >= 0 && T.raizes('conexoes').indexOf('conexao') >= 0, 'flexíveis → flexível, conexões → conexão');
const docCabo = T.tokensDoc('Cabo Flexível Elétrica 750V');
check(T.gruposBusca('cabos elétricos').every(function (gr) { return gr.variantes.some(function (v) { return docCabo.has(v); }); }), '"cabos elétricos" casa com "Cabo ... Elétrica"');
check(T.raizes('3x2.5mm').length === 1 && T.raizes('pp').length === 1, 'medidas e siglas não viram raiz');

console.log('Extrator (saída da IA → produtos)');
const E = require(path.join(__dirname, '..', 'backend', 'src', 'services', 'extrator.service.js'));
let pr = E.normalizarProduto({ name: 'Cabo Flexível 750V', size: '2,5 mm²', voltage: '450/750 V', price: 'R$ 3,20', 'Diâmetro externo (mm)': '3,4', atributos: { 'Peso (kg/100 m)': '3,1' } });
check(pr && pr.nome === 'Cabo Flexível 750V 2,5 mm²' && pr.bitola === '2,5 mm²' && pr.tensao === '450/750 V' && pr.preco === 'R$ 3,20', 'chaves em inglês viram campos; medida entra no nome', pr);
check(pr && pr.atributos['Diâmetro externo (mm)'] === '3,4' && pr.atributos['Peso (kg/100 m)'] === '3,1', 'colunas extras viram atributos', pr && pr.atributos);
check(E.normalizarProduto({ nome: 'não informado', codigo: '' }) === null, 'produto sem nome é descartado');
check(E.normalizarProduto({ nome: 'Cabo Flexível 2,5 mm²', bitola: '2,5mm²' }).nome === 'Cabo Flexível 2,5 mm²', 'não repete a medida que já está no nome');
let rj = E.normalizarResultadoIA('Aqui está:\n```json\n{"fornecedor":{"nome":"Energy","site":"WWW.energycondutores.com.br","email":"Vendas@Energy.com.br"},"produtos":[{"nome":"Cabo A","bitola":"1,5 mm²"},{"nome":"Cabo A","bitola":"1,5 mm²","norma":"NBR 247-3"}],"resumo_pagina":"Tabela"}\n```');
check(rj && rj.produtos.length === 1 && rj.produtos[0].norma === 'NBR 247-3', 'JSON com cercas de código; repetido é juntado e completado', rj);
check(rj && rj.fornecedor.site === 'https://www.energycondutores.com.br' && rj.fornecedor.email === 'vendas@energy.com.br', 'site e e-mail do fornecedor normalizados', rj && rj.fornecedor);
rj = E.normalizarResultadoIA('{"produtos":[{"nome":"Cabo 1","bitola":"1 mm²"},{"nome":"Cabo 2","bitola":"2 mm²"},{"nome":"Cabo 3","bit');
check(rj && rj.produtos.length === 2, 'resposta cortada no meio: aproveita os produtos completos', rj);
check(E.normalizarResultadoIA('não sei') === null, 'texto sem JSON é recusado');

console.log('Extrator (contatos do fornecedor no texto)');
const ct = E.extrairContatos('Energy Fios e Cabos\nCNPJ 11.222.333/0001-81\nVendas: (11) 3456-7890  WhatsApp (11) 98765-4321\nvendas@energycondutores.com.br\nAcesse WWW.energycondutores.com.br\nRua das Indústrias, 1500 - Distrito Industrial - CEP 13000-000\nTabela 3000 1,2 1500 3,1');
check(ct.cnpj === '11.222.333/0001-81', 'CNPJ válido (dígitos conferidos)', ct.cnpj);
check(ct.telefone === '(11) 3456-7890' && ct.whatsapp === '(11) 98765-4321', 'telefone e WhatsApp separados', ct);
check(ct.email === 'vendas@energycondutores.com.br' && ct.site === 'https://www.energycondutores.com.br', 'e-mail e site', ct);
check(/Rua das Indústrias, 1500/.test(ct.endereco || ''), 'endereço com número/CEP', ct.endereco);
check(!E.extrairContatos('CNPJ 11.111.111/1111-11 Tabela 3000 1,2 1500 3,1 100 3500').cnpj, 'CNPJ inválido e números de tabela são ignorados');
const mf = E.mesclarFornecedores([{ nome: 'Energy Fios e Cabos' }, { nome: 'Energy Fios e Cabos', telefone: '(11) 3456-7890' }, { nome: 'Energg' }]);
check(mf.nome === 'Energy Fios e Cabos' && mf.telefone === '(11) 3456-7890', 'dados de várias páginas: vale o mais frequente', mf);
const parecidos = E.compararFornecedores({ nome: 'Energy Fios e Cabos', cnpj: '11.222.333/0001-81' },
  [{ id: 1, nome: 'flex fast fios eletricos' }, { id: 2, nome: 'ENERGY CONDUTORES', cnpj: '11222333000181' }]);
check(parecidos.length === 1 && parecidos[0].id === 2 && parecidos[0].motivo === 'mesmo CNPJ', 'acha fornecedor já cadastrado pelo CNPJ', parecidos);
check(E.compararFornecedores({ nome: 'Energy Fios e Cabos' }, [{ id: 3, nome: 'Energy' }])[0].motivo === 'nome parecido', 'acha pelo nome parecido');
check(E.nomePorSiteOuArquivo('https://www.energycondutores.com.br', 'x.pdf') === 'Energycondutores' && E.nomePorSiteOuArquivo('', 'Catálogo-Energy.pdf') === 'Energy', 'nome provável pelo site ou pelo arquivo');
check(E.dividirBlocos('a'.repeat(50) + '\n' + 'b'.repeat(50), 60).length === 2, 'texto dividido em blocos por linha');

console.log('\nRESULTADO LEITOR: ' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
