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

console.log('\nRESULTADO LEITOR: ' + ok + ' ok, ' + falhas + ' falha(s)');
process.exit(falhas ? 1 : 0);
