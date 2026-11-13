// Testa a leitura da lista de itens da Cotação (funções puras de frontend/public/js/cotacao.js)
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'frontend', 'public', 'js', 'cotacao.js'));
let ok = 0, falhas = 0;
function check(cond, msg, extra) { if (cond) { ok++; console.log('  ✓ ' + msg); } else { falhas++; console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function linha(l) { const r = C.interpretarLinhaCotacao(l); return r ? r.texto + ' | ' + r.quantidade : null; }

console.log('1) uma linha → item e quantidade');
const casos = [
  ['cabo flexível 2,5mm 750V', 'cabo flexível 2,5mm 750V | '],
  ['cabo flexível 2,5mm 750V - 300 m', 'cabo flexível 2,5mm 750V | 300 m'],
  ['cabo PP 3x2,5mm, 2 rolos', 'cabo PP 3x2,5mm | 2 rolos'],
  ['300 m cabo flexível 2,5mm', 'cabo flexível 2,5mm | 300 m'],
  ['2 rolos de cabo PP 3x2,5mm', 'cabo PP 3x2,5mm | 2 rolos'],
  ['15 un. disjuntor 20A curva C', 'disjuntor 20A curva C | 15 un'],
  ['1. Cabo PP 3x2,5mm² 500V', 'Cabo PP 3x2,5mm² 500V | '],
  ['Item 4: luva isolante classe 2 (10 pares)', 'luva isolante classe 2 | 10 pares'],
  ['3) disjuntor 20A - Qtd: 15', 'disjuntor 20A | 15'],
  ['• eletroduto 3/4 - 50 barras', 'eletroduto 3/4 | 50 barras'],
  // medidas que NÃO são quantidade
  ['cabo 2,5 m', 'cabo 2,5 m | '],
  ['2,5mm cabo flexível', '2,5mm cabo flexível | '],
  ['3x2,5mm cabo PP', '3x2,5mm cabo PP | '],
  ['20A disjuntor', '20A disjuntor | '],
  ['Cabo fotovoltaico 6mm² 1,8kV (rolo 100 m)', 'Cabo fotovoltaico 6mm² 1,8kV (rolo 100 m) | '],
  ['cabo PP-325 - 2 rolos', 'cabo PP-325 | 2 rolos'],
  // colado da planilha (colunas separadas por tabulação)
  ['1\tCABO FLEXÍVEL 2,5MM² 750V\tM\t300', 'CABO FLEXÍVEL 2,5MM² 750V | 300 m'],
  ['2\tDisjuntor 20A curva C\t15\tun', 'Disjuntor 20A curva C | 15 un'],
  ['Cabo PP 3x2,5mm\t2 rolos', 'Cabo PP 3x2,5mm | 2 rolos'],
  ['7\tLuva isolante classe 2', 'Luva isolante classe 2 | '],
  // linhas que não são itens
  ['', null], ['   ', null], ['ITEM\tDESCRIÇÃO\tUNID\tQTD', null], ['Item Descrição Unidade Quantidade', null], ['---', null]
];
casos.forEach(([entrada, esperado]) => check(linha(entrada) === esperado, JSON.stringify(entrada) + ' → ' + JSON.stringify(esperado), linha(entrada)));

console.log('2) lista inteira');
const itens = C.interpretarItensCotacao('ITEM\tDESCRIÇÃO\tUNID\tQTD\n1\tCabo flexível 2,5mm\tm\t300\n\n2\tcabo flexível 2,5mm\tm\t100\n3\tDisjuntor 20A\tun\t15\r\n');
check(itens.length === 2 && itens[0].quantidade === '300 m' && itens[1].texto === 'Disjuntor 20A', 'cabeçalho e repetidos ficam de fora', itens);
const muitos = C.interpretarItensCotacao(Array.from({ length: 12 }, (_, i) => 'item ' + (i + 1) + ' parafuso M' + (i + 1)).join('\n'), 10);
check(muitos.length === 10 && muitos.cortados === 2, 'limite de itens avisa quantos ficaram de fora', [muitos.length, muitos.cortados]);

console.log('3) pedido por fornecedor');
const conferidos = [
  { texto: 'cabo flexível 2,5mm 750V', quantidade: '300 m', tem: [{ fornecedor_id: 1, nome: 'Energy', melhor: { codigo: 'FX-25' } }, { fornecedor_id: 2, nome: 'Flex Fast', melhor: { codigo: '' } }] },
  { texto: 'cabo PP 3x2,5mm', quantidade: '', tem: [{ fornecedor_id: 2, nome: 'Flex Fast', melhor: { codigo: 'PP-325' } }] },
  { texto: 'disjuntor 20A', quantidade: '15 un', tem: [] }
];
const grupos = C.agruparPorFornecedor(conferidos);
check(grupos.length === 2 && grupos[0].fornecedor.nome === 'Flex Fast' && grupos[0].itens.length === 2 && grupos[1].itens.length === 1, 'quem cobre mais itens vem primeiro', grupos.map(g => [g.fornecedor.nome, g.itens.length]));
const msg = C.textoPedidoFornecedor(grupos[0], 'Guilherme');
check(/destes itens:\n\n1\. cabo flexível 2,5mm 750V — 300 m\n2\. cabo PP 3x2,5mm \(ref\. PP-325\)\n\nQuantidade: \nPrazo de entrega: /.test(msg) && /Obrigado,\nGuilherme$/.test(msg), 'mensagem com itens numerados, quantidade e referência do catálogo', msg);
const msg1 = C.textoPedidoFornecedor(grupos[1], '');
check(/deste item:\n\n1\. cabo flexível 2,5mm 750V — 300 m \(ref\. FX-25\)\n\nPrazo de entrega: /.test(msg1) && !/Quantidade:/.test(msg1) && /Obrigado!$/.test(msg1), 'um item com quantidade: sem linha "Quantidade"', msg1);

console.log('\nRESULTADO COTACAO: ' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
