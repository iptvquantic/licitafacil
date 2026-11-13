// Testes de API ponta a ponta contra a API local
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3000';
let falhas = 0, ok = 0;
function check(cond, msg, extra) { if (cond) { ok++; console.log('  ✓ ' + msg); } else { falhas++; console.log('  ✗ ' + msg + (extra ? ' → ' + JSON.stringify(extra).slice(0, 400) : '')); } }
async function api(method, path, body, token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { s: r.status, j };
}
(async () => {
  const sufixo = Date.now();
  console.log('1) cadastro e sessão');
  let r = await api('POST', '/api/auth/cadastro', { nome: 'Usuária A', email: 'a' + sufixo + '@teste.com', senha: 'segredo1' });
  check(r.s === 201 && r.j.token, 'cadastro A', r);
  const A = r.j.token;
  r = await api('POST', '/api/auth/cadastro', { nome: 'B', email: 'a' + sufixo + '@teste.com', senha: 'segredo1' });
  check(r.s === 409, 'e-mail duplicado = 409', r);
  r = await api('POST', '/api/auth/cadastro', { nome: 'Usuário B', email: 'b' + sufixo + '@teste.com', senha: 'segredo2' });
  const B = r.j.token;
  r = await api('POST', '/api/auth/cadastro', { nome: 'Admin', email: 'admin@teste.com', senha: 'admin123' });
  if (r.s === 409) r = await api('POST', '/api/auth/login', { email: 'admin@teste.com', senha: 'admin123' });
  const ADM = r.j.token;
  r = await api('GET', '/api/auth/me', null, A);
  check(r.s === 200 && r.j.acesso === 'ativo' && r.j.admin === false && r.j.dias_restantes === 15, '/me A: ativo, não admin, 15 dias', r.j);
  r = await api('GET', '/api/auth/me', null, ADM);
  check(r.j.admin === true, '/me admin = true');

  console.log('2) fornecedor + catálogo colado (Prompt Mestre)');
  r = await api('POST', '/api/fornecedores', { nome: 'Flex Fast', telefone: '', whatsapp: '(11) 95780-8642' }, A);
  check(r.s === 201, 'cria fornecedor', r);
  const F = r.j.fornecedor.id;
  check(r.j.fornecedor.whatsapp_link === 'https://wa.me/5511957808642', 'link do WhatsApp com 55', r.j.fornecedor.whatsapp_link);
  const texto = fs.readFileSync(path.join(__dirname, 'fixtures', 'prompt_mestre.txt'), 'utf8');
  r = await api('POST', '/api/extracao/texto/' + F, { texto, nome_arquivo: 'Catálogo Flex.pdf', origem: 'texto_colado' }, A);
  check(r.s === 201 && r.j.produtos === 3 && r.j.trechos === 4, 'indexa 3 produtos e 4 trechos', r.j);
  check((r.j.fornecedor_atualizado || []).indexOf('e-mail') >= 0, 'completa e-mail vazio do fornecedor', r.j.fornecedor_atualizado);
  const C = r.j.catalogo_id;
  r = await api('GET', '/api/fornecedores/' + F + '/produtos', null, A);
  check(r.s === 200 && r.j.total === 3 && r.j.produtos[0].nome.indexOf('Cabo PP') === 0, 'lista produtos estruturados', r.j);
  r = await api('GET', '/api/fornecedores/' + F, null, A);
  check(r.j.total_produtos === 3 && r.j.catalogos[0].total_produtos === 3 && r.j.catalogos[0].nome_arquivo === 'Catálogo Flex.pdf', 'detalhe mostra catálogo e produtos', r.j.catalogos);
  r = await api('GET', '/api/fornecedores', null, A);
  check(r.j.fornecedores[0].total_produtos === 3, 'lista de fornecedores com total_produtos', r.j.fornecedores[0]);

  console.log('3) busca técnica');
  const casos = [
    ['cabo PP 3x2,5mm', 'PP-325'], ['cabo pp 3×2.5 mm²', 'PP-325'], ['PP-325', 'PP-325'], ['ABNT NBR 16612', 'Cabo Fotovoltaico 6mm² 1,8kV'],
    ['fotovoltaico 6mm', 'Cabo Fotovoltaico 6mm² 1,8kV'], ['750V flexível', 'FX-25'], ['NBR NM 247-3', 'FX-25'], ['cobre estanhado', 'Cabo Fotovoltaico 6mm² 1,8kV']
  ];
  for (const [q, esperado] of casos) {
    r = await api('POST', '/api/busca', { consulta: q }, A);
    const p = r.j.produtos && r.j.produtos[0];
    check(p && (p.codigo === esperado || p.nome === esperado), 'busca "' + q + '" → ' + esperado + (p ? ' (' + p.score + '%, ' + p.relevancia + ')' : ''), r.j.produtos && r.j.produtos.slice(0, 2).map(x => [x.nome, x.score]));
  }
  r = await api('POST', '/api/busca', { consulta: 'cimento CP-III' }, A);
  check(r.s === 200 && r.j.produtos.length === 0, 'busca sem resultado devolve lista vazia', r.j.produtos.map(x => x.nome));
  r = await api('POST', '/api/busca', { consulta: 'cabo PP 3x2,5mm' }, B);
  check(r.j.produtos.length === 0 && r.j.fornecedores.length === 0, 'B não vê dados de A');

  console.log('3b) "tem" x "parecido" (a medida pedida precisa bater) e cotação em lista');
  r = await api('POST', '/api/fornecedores', { nome: 'Rede Sul Cabos', whatsapp: '(51) 99999-0000', email: 'vendas@redesul.example' }, A);
  const G = r.j.fornecedor.id;
  for (const p of [
    { nome: 'Cabo Flexível 4mm² 750V', codigo: 'FX-40', bitola: '4 mm²', tensao: '450/750 V', preco: 'R$ 3,80', unidade: 'metro' },
    { nome: 'Cabo PP 3x2,5mm² 500V', codigo: 'RS-PP325', bitola: '3x2,5 mm²', tensao: '500 V' },
    { nome: 'Fio rígido 750V', codigo: 'FR-25', bitola: '2,50', tensao: '750 V' }
  ]) {
    r = await api('POST', '/api/fornecedores/' + G + '/produtos', p, A);
    if (r.s !== 201) check(false, 'cadastra ' + p.nome, r);
  }
  const forn = (resp, id) => (resp.j.fornecedores || []).filter(f => f.fornecedor_id === id)[0] || {};
  r = await api('POST', '/api/busca', { consulta: 'cabo PP 3x2,5mm' }, A);
  check(r.j.produtos[0].forte === true && r.j.total_com_item === 2 && forn(r, F).produtos_fortes === 1 && forn(r, G).produtos_fortes === 1 &&
    forn(r, F).melhor.codigo === 'PP-325' && forn(r, G).melhor.codigo === 'RS-PP325',
    '"cabo PP 3x2,5mm": os 2 fornecedores têm, cada um com o seu produto', [r.j.total_com_item, r.j.fornecedores]);
  r = await api('POST', '/api/busca', { consulta: 'cabo flexível 4mm 750V' }, A);
  check(r.j.total_com_item === 1 && r.j.total_com_parecido === 1 && forn(r, G).melhor.codigo === 'FX-40' && forn(r, G).melhor.forte === true &&
    forn(r, F).produtos_fortes === 0 && forn(r, F).produtos_encontrados >= 1 && r.j.fornecedores[0].fornecedor_id === G,
    '"cabo flexível 4mm": só um tem; quem tem 2,5mm aparece como parecido, depois', [r.j.total_com_item, r.j.total_com_parecido, r.j.fornecedores]);
  r = await api('POST', '/api/busca', { consulta: 'cabo flexível 2,5mm 750V' }, A);
  check(r.j.total_com_item === 1 && forn(r, F).melhor.codigo === 'FX-25' && forn(r, G).produtos_fortes === 0,
    '"cabo flexível 2,5mm": fio rígido e cabo de 4mm não contam como "tem"', [r.j.total_com_item, r.j.produtos.map(x => [x.nome, x.score, x.forte])]);
  r = await api('POST', '/api/busca', { consulta: 'fio rígido 2,5mm' }, A);
  check(r.j.total_com_item === 1 && forn(r, G).melhor.codigo === 'FR-25',
    'medida escrita "2,50" no catálogo é a mesma "2,5mm" da pergunta', [r.j.total_com_item, r.j.produtos.map(x => [x.nome, x.score, x.forte])]);
  r = await api('POST', '/api/busca', { consulta: 'CABO DE COBRE FLEXÍVEL ISOLADO EM PVC, SEÇÃO NOMINAL 2,5 MM², TENSÃO 450/750 V, ANTICHAMA, COR VERMELHA, ROLO COM 100 METROS, CONFORME NBR NM 247-3' }, A);
  check(r.j.total_com_item === 1 && r.j.produtos[0].codigo === 'FX-25' && r.j.produtos[0].forte === true,
    'linha inteira de edital acha quem tem o item', [r.j.total_com_item, r.j.produtos.map(x => [x.nome, x.score, x.forte])]);
  r = await api('POST', '/api/busca', { consulta: 'quem vende cabo pp 3x2,5?' }, A);
  check(r.j.total_com_item === 2, 'pergunta em frase ("quem vende…") dá a mesma resposta', [r.j.total_com_item, r.j.termos]);
  r = await api('POST', '/api/busca', { consulta: 'disjuntor 20A' }, A);
  check(r.j.total_com_item === 0 && !(r.j.produtos || []).some(x => x.forte), 'item que ninguém tem: nenhum "tem"', r.j.produtos);
  r = await api('POST', '/api/busca/responder', { consulta: 'cabo PP 3x2,5mm' }, A);
  check(/^2 fornecedores cadastrados têm/.test(r.j.resposta) && /PP-325/.test(r.j.resposta) && /RS-PP325/.test(r.j.resposta), 'resposta começa por quantos têm', r.j.resposta);
  r = await api('POST', '/api/busca/responder', { consulta: 'cabo flexível 10mm 750V' }, A);
  check(/^Nenhum fornecedor cadastrado tem exatamente/.test(r.j.resposta), 'resposta diz que ninguém tem antes de citar os parecidos', r.j.resposta);

  r = await api('POST', '/api/busca/lote', { itens: ['cabo PP 3x2,5mm', 'cabo flexível 4mm 750V', 'luva nitrílica tamanho G', '', 'cabo flexível 10mm 750V'] }, A);
  const L = r.j.itens || [];
  check(r.s === 200 && L.length === 5 && L[0].consulta === 'cabo PP 3x2,5mm', 'lista: uma resposta por item, na mesma ordem', r.j);
  check(L[0] && L[0].tem.length === 2 && L[0].tem.some(f => f.nome === 'Flex Fast' && f.melhor.codigo === 'PP-325' && f.whatsapp_link) &&
    L[0].tem.some(f => f.nome === 'Rede Sul Cabos' && f.email === 'vendas@redesul.example'), 'lista: item com 2 fornecedores, produto e contato de cada um', L[0]);
  check(L[1] && L[1].tem.length === 1 && L[1].tem[0].nome === 'Rede Sul Cabos' && L[1].tem[0].melhor.preco === 'R$ 3,80', 'lista: item com 1 fornecedor e o preço do catálogo', L[1]);
  check(L[2] && L[2].tem.length === 0 && L[2].parecidos.length === 0 && L[3].tem.length === 0 && L[4].tem.length === 0, 'lista: itens que ninguém tem voltam vazios', [L[2], L[3], L[4]]);
  r = await api('POST', '/api/busca/lote', { itens: ['cabo PP 3x2,5mm'] }, B);
  check(r.s === 200 && r.j.itens[0].tem.length === 0 && r.j.itens[0].parecidos.length === 0, 'lista: B não vê dados de A', r.j);
  r = await api('POST', '/api/busca/lote', { itens: [] }, A);
  const r2 = await api('POST', '/api/busca/lote', { itens: 'cabo' }, A);
  const r3 = await api('POST', '/api/busca/lote', { itens: ['cabo'] });
  check(r.s === 400 && r2.s === 400 && r3.s === 401, 'lista vazia = 400; sem login = 401', [r.s, r2.s, r3.s]);
  r = await api('POST', '/api/busca/lote', { itens: Array.from({ length: 60 }, (_, i) => 'cabo flexível ' + (i + 1) + 'mm') }, A);
  check(r.s === 200 && r.j.itens.length === 40, 'lista: no máximo 40 itens por chamada', r.j.itens && r.j.itens.length);
  r = await api('DELETE', '/api/fornecedores/' + G, null, A);
  check(r.s === 200, 'exclui o segundo fornecedor', r);

  console.log('4) IA (sem chave → resposta automática útil)');
  r = await api('POST', '/api/busca/responder', { consulta: 'cabo PP 3x2,5mm' }, A);
  check(r.s === 200 && r.j.fallback === true && /PP-325/.test(r.j.resposta) && /WhatsApp/.test(r.j.resposta) && /^1 fornecedor cadastrado tem/.test(r.j.resposta),
    'resposta automática lista produto e contato', r.j.resposta);

  console.log('4b) produto cadastrado à mão e correção');
  r = await api('POST', '/api/fornecedores/' + F + '/produtos', { codigo: 'X' }, A);
  check(r.s === 400 && /nome/i.test(r.j.error || ''), 'produto sem nome = 400', r);
  r = await api('POST', '/api/fornecedores/' + F + '/produtos', { nome: 'Disjuntor DIN Curva C 32A', codigo: 'DJ-C32', bitola: '32 A', tensao: '230/400 V',
    preco: 'R$ 21,90', unidade: 'peça', atributos: { 'Polos': '1', 'Capacidade de interrupção': '3 kA' } }, A);
  check(r.s === 201 && r.j.criado === true && r.j.produto && r.j.produto.origem === 'manual' && r.j.produto.nome_arquivo === 'Produtos cadastrados à mão' &&
    r.j.produto.atributos.Polos === '1', 'cadastra produto à mão', r.j);
  const PM = r.j.produto && r.j.produto.id;
  r = await api('POST', '/api/busca', { consulta: 'DJ-C32' }, A);
  check((r.j.produtos || []).some(x => x.codigo === 'DJ-C32'), 'busca acha o produto cadastrado à mão', r.j.produtos && r.j.produtos.map(x => x.nome));
  r = await api('POST', '/api/busca', { consulta: 'disjuntor' }, A);
  check((r.j.fornecedores || []).some(f => f.fornecedor_id === F && f.produtos_encontrados === 1), 'busca "disjuntor" mostra o fornecedor com 1 produto', r.j.fornecedores);
  r = await api('PUT', '/api/fornecedores/' + F + '/produtos/' + PM, { nome: 'Disjuntor DIN Curva C 40A', codigo: 'DJ-C40', bitola: '40 A' }, A);
  check(r.s === 200 && r.j.produto.nome === 'Disjuntor DIN Curva C 40A' && !r.j.produto.preco && Object.keys(r.j.produto.atributos || {}).length === 0,
    'corrige produto (campo apagado fica vazio)', r.j);
  r = await api('POST', '/api/busca', { consulta: 'DJ-C32' }, A);
  check(!(r.j.produtos || []).some(x => x.codigo === 'DJ-C32'), 'código antigo some da busca', r.j.produtos && r.j.produtos.map(x => x.codigo));
  r = await api('GET', '/api/fornecedores/' + F, null, A);
  const catManual = (r.j.catalogos || []).filter(c => c.origem === 'manual')[0];
  check(catManual && catManual.total_produtos === 1 && r.j.total_produtos === 4, 'catálogo "à mão" com 1 produto (total 4)', r.j.catalogos);
  r = await api('GET', '/api/fornecedores/' + F + '/produtos', null, A);
  const lido = (r.j.produtos || []).filter(p => p.origem !== 'manual')[0];
  r = await api('PUT', '/api/fornecedores/' + F + '/produtos/' + lido.id, Object.assign({}, lido, { preco: 'R$ 9,99' }), A);
  check(r.s === 200 && r.j.produto.preco === 'R$ 9,99' && r.j.produto.nome === lido.nome && r.j.produto.origem === lido.origem,
    'corrige o preço de um produto lido do catálogo', r.j);

  console.log('5) segurança');
  r = await api('PUT', '/api/fornecedores/' + F + '/produtos/' + PM, { nome: 'invasor' }, B);
  check(r.s === 404, 'IDOR: B não corrige produto de A', r);
  r = await api('DELETE', '/api/fornecedores/' + F + '/produtos/' + PM, null, B);
  check(r.s === 404, 'IDOR: B não exclui produto de A', r);
  r = await api('POST', '/api/fornecedores/' + F + '/produtos', { nome: 'invasor' }, B);
  check(r.s === 404, 'IDOR: B não cadastra produto no fornecedor de A', r);
  r = await api('PUT', '/api/fornecedores/' + F + '/produtos/abc', { nome: 'x' }, A);
  check(r.s === 404, 'produto com id inválido = 404', r);
  r = await api('DELETE', '/api/fornecedores/' + F + '/produtos/' + PM, null, A);
  check(r.s === 200 && r.j.ok === true, 'exclui produto à mão', r);
  r = await api('GET', '/api/fornecedores/' + F, null, A);
  check(!(r.j.catalogos || []).some(c => c.origem === 'manual') && r.j.total_produtos === 3, 'sem produto à mão, o catálogo "à mão" some', r.j.catalogos);
  r = await api('GET', '/api/fornecedores/' + F + '/catalogo/' + C + '/status', null, B);
  check(r.s === 404, 'IDOR status bloqueado', r);
  r = await api('DELETE', '/api/fornecedores/' + F + '/catalogo/' + C, null, B);
  check(r.s === 404, 'IDOR exclusão bloqueada', r);
  r = await api('POST', '/api/fornecedores/' + F + '/catalogo/' + C + '/reprocessar', {}, B);
  check(r.s === 404, 'IDOR reprocessar bloqueado', r);
  r = await api('GET', '/api/extracao/catalogo/' + F + '/' + C + '/status', null, B);
  check(r.s === 404, 'IDOR status (extração) bloqueado', r);
  r = await api('POST', '/api/extracao/texto/' + F, { texto }, B);
  check(r.s === 404, 'B não indexa no fornecedor de A', r);
  r = await api('POST', '/api/auth/ativar-plano', { email: 'b' + sufixo + '@teste.com', plano: 'anual' });
  check(r.s === 401, 'ativar-plano sem login = 401', r);
  r = await api('POST', '/api/auth/ativar-plano', { email: 'b' + sufixo + '@teste.com', plano: 'anual' }, B);
  check(r.s === 403, 'ativar-plano por cliente = 403', r);
  r = await api('GET', '/api/admin/resumo', null, A);
  check(r.s === 403, 'painel admin bloqueado para cliente', r);

  console.log('6) reprocessar e estruturar');
  r = await api('POST', '/api/fornecedores/' + F + '/catalogo/' + C + '/reprocessar', {}, A);
  check(r.s === 200 && r.j.produtos === 3, 'reprocessa pelo texto salvo', r.j);
  r = await api('POST', '/api/fornecedores/' + F + '/catalogo/' + C + '/estruturar', {}, A);
  check(r.s === 503, 'estruturar sem IA configurada = 503 com mensagem', r);

  console.log('7) pagamento: cliente avisa, dono aprova');
  r = await api('POST', '/api/auth/plano/solicitar', { plano: 'mensal', observacao: 'paguei via pix' }, B);
  check(r.s === 200, 'B avisa pagamento', r);
  r = await api('GET', '/api/auth/me', null, B);
  check(r.j.pagamento_pendente && r.j.pagamento_pendente.plano === 'mensal', '/me mostra pendente');
  r = await api('GET', '/api/admin/pagamentos', null, ADM);
  const pend = (r.j.pagamentos || []).find(p => p.email === 'b' + sufixo + '@teste.com');
  check(!!pend, 'admin vê pendente', r.j);
  r = await api('POST', '/api/admin/pagamentos/' + pend.id + '/aprovar', {}, ADM);
  check(r.s === 200 && /Mensal/.test(r.j.msg), 'admin aprova', r.j);
  r = await api('GET', '/api/auth/me', null, B);
  check(r.j.plano === 'mensal' && r.j.dias_restantes === 30 && !r.j.pagamento_pendente, 'B com plano mensal de 30 dias', r.j);
  r = await api('GET', '/api/admin/resumo', null, ADM);
  check(r.s === 200 && r.j.usuarios >= 3, 'resumo admin', r.j);
  r = await api('GET', '/api/admin/diagnostico', null, ADM);
  check(r.s === 200 && r.j.banco.ok === true, 'diagnóstico admin', r.j.banco);
  r = await api('GET', '/api/admin/backup', null, ADM);
  check(r.s === 200 && Array.isArray(r.j.produtos) && r.j.usuarios[0] && !('senha' in r.j.usuarios[0]), 'backup sem senhas');

  console.log('8) plano vencido');
  const { Client } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'pg'));
  const cli = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/licitafacil' });
  await cli.connect();
  await cli.query("UPDATE usuarios SET trial_fim = NOW() - interval '1 day' WHERE email = $1", ['a' + sufixo + '@teste.com']);
  r = await api('POST', '/api/busca', { consulta: 'cabo' }, A);
  check(r.s === 402 && r.j.code === 'PLANO_EXPIRADO', 'busca bloqueada com teste vencido (402)', r);
  r = await api('GET', '/api/fornecedores', null, A);
  check(r.s === 200, 'leitura dos próprios dados continua liberada');
  r = await api('POST', '/api/fornecedores', { nome: 'X' }, A);
  check(r.s === 402, 'criar fornecedor bloqueado com teste vencido');
  r = await api('GET', '/api/auth/me', null, A);
  check(r.j.acesso === 'expirado', '/me informa expirado');
  await cli.query("UPDATE usuarios SET trial_fim = NOW() + interval '5 day' WHERE email = $1", ['a' + sufixo + '@teste.com']);

  console.log('9) exclusão de catálogo remove produtos e trechos');
  r = await api('DELETE', '/api/fornecedores/' + F + '/catalogo/' + C, null, A);
  check(r.s === 200, 'exclui catálogo');
  const n = await cli.query('SELECT (SELECT count(*) FROM produtos WHERE catalogo_id = $1)::int p, (SELECT count(*) FROM chunks WHERE catalogo_id = $1)::int c', [C]);
  check(n.rows[0].p === 0 && n.rows[0].c === 0, 'produtos e trechos removidos em cascata', n.rows[0]);
  r = await api('GET', '/api/busca/stats', null, A);
  check(r.s === 200 && r.j.total_produtos === 0, 'stats atualizado', r.j);

  console.log('10) texto bruto sem estrutura + validações');
  r = await api('POST', '/api/extracao/texto/' + F, { texto: 'Catálogo geral\nCabo flexível 1,5mm 750V rolo 100m\nCabo PP 2x1mm 500V\n' + 'Linha de produtos para instalação residencial e predial. '.repeat(10) }, A);
  check(r.s === 201 && r.j.produtos === 0 && r.j.trechos >= 1 && r.j.ia === 'indisponivel', 'texto bruto indexado para busca (sem IA)', r.j);
  r = await api('POST', '/api/busca', { consulta: 'cabo flexível 1,5mm' }, A);
  check(r.j.fornecedores.length === 1 && /1,5mm/.test(r.j.fornecedores[0].trecho), 'busca acha trecho do texto bruto com quebra de linha', r.j.fornecedores);
  r = await api('POST', '/api/extracao/texto/' + F, { texto: 'oi' }, A);
  check(r.s === 400, 'texto curto demais = 400 com mensagem', r.j);
  r = await api('POST', '/api/busca', { consulta: 'x' }, A);
  check(r.s === 400, 'consulta curta = 400');
  await cli.end();
  console.log('\nRESULTADO: ' + ok + ' ok, ' + falhas + ' falha(s)');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(2); });
