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

  console.log('4) IA (sem chave → resposta automática útil)');
  r = await api('POST', '/api/busca/responder', { consulta: 'cabo PP 3x2,5mm' }, A);
  check(r.s === 200 && r.j.fallback === true && /PP-325/.test(r.j.resposta) && /WhatsApp/.test(r.j.resposta), 'resposta automática lista produto e contato', r.j.resposta);

  console.log('5) segurança');
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
