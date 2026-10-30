// src/services/indexacao.service.js — grava catálogo, produtos e trechos; estruturação por IA em fila
'use strict';
const db = require('../utils/db');
const T = require('../utils/texto');
const leitor = require('./leitor.service');
const extrator = require('./extrator.service');
const ia = require('./ai.service');

const LIMITE_TEXTO = 3000000;
const COLUNAS_PRODUTO = ['usuario_id', 'fornecedor_id', 'catalogo_id', 'ordem', 'nome', 'codigo', 'marca', 'categoria', 'descricao',
  'bitola', 'tensao', 'material', 'isolamento', 'cobertura', 'temperatura', 'aplicacao', 'norma', 'certificacoes', 'preco',
  'unidade', 'atributos', 'texto_norm', 'origem'];

class ErroLeitura extends Error {
  constructor(msg, status) { super(msg); this.status = status || 400; this.amigavel = true; }
}

function textoNormProduto(p) {
  const partes = leitor.CAMPOS.map(function (c) { return p[c] || ''; });
  Object.keys(p.atributos || {}).forEach(function (k) { partes.push(k + ' ' + p.atributos[k]); });
  return T.normalizarBusca(partes.join(' \n '));
}

function linhaProduto(p, i, ids, origem) {
  return [ids.usuarioId, ids.fornecedorId, ids.catalogoId, i, p.nome, p.codigo || null, p.marca || null, p.categoria || null,
    p.descricao || null, p.bitola || null, p.tensao || null, p.material || null, p.isolamento || null, p.cobertura || null,
    p.temperatura || null, p.aplicacao || null, p.norma || null, p.certificacoes || null, p.preco || null, p.unidade || null,
    JSON.stringify(p.atributos || {}), textoNormProduto(p), origem];
}

function waLink(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return 'https://wa.me/' + (d.length <= 11 ? '55' + d : d);
}

// Completa dados vazios do fornecedor com o que veio no catálogo (nunca sobrescreve o que a pessoa digitou)
async function completarFornecedor(executor, fornecedorId, dados) {
  if (!dados) return [];
  const atual = (await executor.query('SELECT telefone, whatsapp, email, observacoes, cnpj, site, endereco FROM fornecedores WHERE id = $1', [fornecedorId])).rows[0];
  if (!atual) return [];
  const sets = [];
  const vals = [];
  const campos = [];
  function add(col, valor) { vals.push(valor); sets.push(col + ' = $' + vals.length); }
  if (!atual.telefone && dados.telefone) { add('telefone', String(dados.telefone).slice(0, 50)); campos.push('telefone'); }
  if (!atual.whatsapp && dados.whatsapp) {
    add('whatsapp', String(dados.whatsapp).slice(0, 50));
    add('whatsapp_link', waLink(dados.whatsapp));
    campos.push('WhatsApp');
  }
  if (!atual.email && dados.email && /@/.test(dados.email)) { add('email', String(dados.email).slice(0, 255)); campos.push('e-mail'); }
  if (!atual.cnpj && dados.cnpj && extrator.cnpjValido(dados.cnpj)) { add('cnpj', extrator.formatarCNPJ(dados.cnpj)); campos.push('CNPJ'); }
  if (!atual.site && dados.site) { const site = extrator.normalizarSite(dados.site); if (site) { add('site', site.slice(0, 255)); campos.push('site'); } }
  if (!atual.endereco && dados.endereco) { add('endereco', String(dados.endereco).slice(0, 500)); campos.push('endereço'); }
  if (!atual.observacoes && dados.especialidade) { add('observacoes', String(dados.especialidade).slice(0, 1000)); campos.push('especialidade'); }
  if (!sets.length) return [];
  vals.push(fornecedorId);
  await executor.query('UPDATE fornecedores SET ' + sets.join(', ') + ', atualizado_em = NOW() WHERE id = $' + vals.length, vals);
  return campos;
}

// Indexa um texto (colado, lido no navegador ou extraído do PDF no servidor)
async function indexarTexto(opcoes) {
  const usuarioId = opcoes.usuarioId;
  const fornecedorId = parseInt(opcoes.fornecedorId, 10);
  let texto = leitor.normalizarTexto(opcoes.texto);
  if (texto.length < 20) throw new ErroLeitura('Não encontrei texto legível. Se for PDF escaneado ou foto, envie pelo botão de arquivo para o leitor com OCR.');
  if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO);

  const est = leitor.estruturar(texto);
  const trechos = leitor.gerarTrechos(texto, est.produtos, est.fornecedor);
  const origem = String(opcoes.origem || 'texto').slice(0, 30);
  const nomeArquivo = String(opcoes.nomeArquivo || 'Texto colado').slice(0, 255);
  const paginas = Math.max(0, parseInt(opcoes.paginas, 10) || 0);
  // Texto sem estrutura pode ser organizado pela IA: o navegador conduz, parte por parte (sem fila em segundo plano)
  const iaDisponivel = !est.produtos.length && texto.length >= 300 && ia.configurada();

  const resultado = await db.transaction(async function (client) {
    const forn = await client.query('SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1', [fornecedorId, usuarioId]);
    if (!forn.rows.length) throw new ErroLeitura('Fornecedor não encontrado', 404);

    let catalogoId = opcoes.catalogoId ? parseInt(opcoes.catalogoId, 10) : null;
    if (catalogoId) {
      const c = await client.query('SELECT id FROM catalogos WHERE id = $1 AND fornecedor_id = $2', [catalogoId, fornecedorId]);
      if (!c.rows.length) throw new ErroLeitura('Catálogo não encontrado', 404);
    } else {
      const novo = await client.query(
        "INSERT INTO catalogos (fornecedor_id, nome_arquivo, status, origem) VALUES ($1, $2, 'processando', $3) RETURNING id",
        [fornecedorId, nomeArquivo, origem]);
      catalogoId = novo.rows[0].id;
    }

    await client.query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogoId]);
    await client.query('DELETE FROM produtos WHERE catalogo_id = $1', [catalogoId]);

    await db.inserirEmLote(client, 'chunks', ['catalogo_id', 'fornecedor_id', 'conteudo', 'indice', 'texto_norm'],
      trechos.map(function (t, i) { return [catalogoId, fornecedorId, t, i, T.normalizarBusca(t)]; }));

    const ids = { usuarioId: usuarioId, fornecedorId: fornecedorId, catalogoId: catalogoId };
    const origemProduto = est.formato === 'texto' ? origem : est.formato;
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO,
      est.produtos.map(function (p, i) { return linhaProduto(p, i, ids, origemProduto); }));

    await client.query(
      "UPDATE catalogos SET status = 'processado', erro = NULL, texto_extraido = $1, paginas = $2, origem = $3, formato = $4," +
      ' total_produtos = $5, ia_status = $6, ia_info = $7, atualizado_em = NOW() WHERE id = $8',
      [texto, paginas, origem, est.formato, est.produtos.length, null, null, catalogoId]);

    const contatos = Object.assign({}, extrator.extrairContatos(texto), est.fornecedor || {});
    const atualizados = await completarFornecedor(client, fornecedorId, contatos);
    return { catalogo_id: catalogoId, produtos: est.produtos.length, trechos: trechos.length, formato: est.formato, fornecedor_atualizado: atualizados };
  });

  resultado.ia = 'nao_necessaria';
  if (iaDisponivel) resultado.ia = 'disponivel';
  else if (!resultado.produtos && texto.length >= 300) resultado.ia = 'indisponivel';
  return resultado;
}

// ─── IA conduzida pelo navegador: uma parte por chamada (cabe no tempo de uma função da Vercel) ─
function limparCampo(v, max) {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max || 255) : null;
}

function mensagemErroIA(err) {
  if (err && err.code === 'COTA') return 'O limite diário da IA gratuita acabou. Tente de novo amanhã (o limite renova à meia-noite UTC).';
  if (err && err.code === 'CHAVE') return 'A chave da IA foi recusada. Confira a OPENROUTER_API_KEY no painel da Vercel.';
  if (err && err.code === 'SEM_CHAVE') return 'A IA não está configurada no servidor.';
  return 'A IA gratuita não respondeu agora. Tente de novo em alguns minutos ou use o Prompt Mestre.';
}

async function catalogoComTexto(fornecedorId, catalogoId, usuarioId) {
  const r = await db.query(
    'SELECT c.id, c.texto_extraido, c.fornecedor_id, c.formato, f.usuario_id FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id' +
    ' WHERE c.id = $1 AND c.fornecedor_id = $2 AND f.usuario_id = $3 AND f.ativo = 1', [catalogoId, fornecedorId, usuarioId]);
  const c = r.rows[0];
  if (!c) throw new ErroLeitura('Catálogo não encontrado', 404);
  if (!c.texto_extraido || c.texto_extraido.trim().length < 20) throw new ErroLeitura('Este catálogo não tem texto salvo. Envie o arquivo novamente.');
  return c;
}

// Quantas partes o texto salvo do catálogo tem (para o navegador mostrar o progresso)
async function partesDoCatalogo(opcoes) {
  const c = await catalogoComTexto(opcoes.fornecedorId, opcoes.catalogoId, opcoes.usuarioId);
  return { total: extrator.dividirBlocos(c.texto_extraido, 6000).length };
}

// Organiza com a IA uma parte do texto salvo. A parte 0 recomeça a tabela de produtos do catálogo.
async function estruturarParte(opcoes) {
  if (!ia.configurada()) throw new ErroLeitura('A IA não está configurada no servidor.', 503);
  const c = await catalogoComTexto(opcoes.fornecedorId, opcoes.catalogoId, opcoes.usuarioId);
  const blocos = extrator.dividirBlocos(c.texto_extraido, 6000);
  const total = blocos.length;
  const parte = Math.max(0, parseInt(opcoes.parte, 10) || 0);
  if (!total) throw new ErroLeitura('O texto deste catálogo é curto demais para a IA organizar.');
  if (parte >= total) throw new ErroLeitura('Esta parte não existe.');
  if (parte === 0) {
    await db.query("UPDATE catalogos SET ia_status = 'estruturando', ia_info = $1, atualizado_em = NOW() WHERE id = $2",
      ['A IA está lendo a parte 1 de ' + total + '…', c.id]);
  }
  let r;
  try {
    r = await ia.estruturarTexto(blocos[parte], { contexto: opcoes.contexto });
  } catch (err) {
    await db.query("UPDATE catalogos SET ia_status = 'falhou', ia_info = $1, atualizado_em = NOW() WHERE id = $2", [mensagemErroIA(err), c.id]).catch(function () {});
    err.mensagem = mensagemErroIA(err);
    throw err;
  }
  return db.transaction(async function (client) {
    if (parte === 0) await client.query('DELETE FROM produtos WHERE catalogo_id = $1', [c.id]);
    const n0 = (await client.query('SELECT count(*)::int AS n FROM produtos WHERE catalogo_id = $1', [c.id])).rows[0].n;
    const ids = { usuarioId: c.usuario_id, fornecedorId: c.fornecedor_id, catalogoId: c.id };
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO, r.produtos.map(function (p, i) { return linhaProduto(p, n0 + i, ids, 'ia'); }));
    const totalProdutos = n0 + r.produtos.length;
    const fim = parte + 1 >= total;
    await client.query('UPDATE catalogos SET total_produtos = $1, formato = $2, ia_status = $3, ia_info = $4, atualizado_em = NOW() WHERE id = $5', [
      totalProdutos, totalProdutos ? 'ia' : c.formato,
      fim ? (totalProdutos ? 'concluido' : 'sem_produtos') : 'estruturando',
      fim ? (totalProdutos ? totalProdutos + ' produto(s) organizados pela IA' : 'A IA não identificou produtos neste texto.')
        : 'A IA está lendo a parte ' + (parte + 2) + ' de ' + total + '…',
      c.id]);
    const atualizados = await completarFornecedor(client, c.fornecedor_id, r.fornecedor);
    return { parte: parte, total: total, fim: fim, produtos_novos: r.produtos.length, total_produtos: totalProdutos,
      fornecedor_atualizado: atualizados, modelo: r.modelo, resumo: r.resumo || '' };
  });
}

function dadosNovoFornecedor(novo) {
  novo = novo || {};
  const det = extrator.normalizarFornecedor(novo) || {};
  const whatsapp = limparCampo(novo.whatsapp, 50) || det.whatsapp || null;
  const cnpj = novo.cnpj && extrator.cnpjValido(novo.cnpj) ? extrator.formatarCNPJ(novo.cnpj) : null;
  return {
    nome: limparCampo(novo.nome, 255),
    telefone: limparCampo(novo.telefone, 50),
    whatsapp: whatsapp,
    whatsapp_link: waLink(whatsapp),
    email: limparCampo(novo.email, 255),
    cnpj: cnpj,
    site: novo.site ? (extrator.normalizarSite(novo.site) || limparCampo(novo.site, 255)) : null,
    endereco: limparCampo(novo.endereco, 500),
    observacoes: limparCampo(novo.especialidade || novo.observacoes, 2000)
  };
}

function trechosImportacao(produtos, resumos, texto) {
  const trechos = [];
  produtos.forEach(function (p) { trechos.push(leitor.produtoParaTexto(p)); });
  (resumos || []).forEach(function (r) { trechos.push(r); });
  if (texto) leitor.gerarTrechos(texto, [], null).forEach(function (t) { trechos.push(t); });
  return trechos.filter(function (t) { return t && t.replace(/\s/g, '').length >= 10; }).slice(0, 8000);
}

const ORIGENS_IMPORTACAO = ['ia_visao', 'ia_texto', 'pdf_navegador', 'ocr_navegador', 'imagem_ocr', 'texto_colado'];
const FORMATOS_PRONTOS = ['prompt_mestre', 'json', 'tabela'];

// Salva um catálogo lido no navegador: cria o fornecedor (se preciso), o catálogo, os produtos e os trechos de busca
async function importarCatalogo(o) {
  const usuarioId = o.usuarioId;
  const produtos = extrator.mesclarProdutos([Array.isArray(o.produtos) ? o.produtos : []]);
  let texto = leitor.normalizarTexto(o.texto || '');
  if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO);
  if (!produtos.length && texto.replace(/\s/g, '').length < 20) throw new ErroLeitura('Não há produtos nem texto para salvar. Leia o catálogo de novo.');
  const nomeArquivo = String(o.nomeArquivo || 'Catálogo').slice(0, 255);
  const origem = ORIGENS_IMPORTACAO.indexOf(o.origem) >= 0 ? o.origem : 'ia_visao';
  const paginas = Math.max(0, Math.min(5000, parseInt(o.paginas, 10) || 0));
  const detectado = extrator.normalizarFornecedor(o.fornecedor || {}) || {};
  const resumos = (Array.isArray(o.resumos) ? o.resumos : []).map(function (r) { return limparCampo(r, 400); }).filter(Boolean).slice(0, 500);
  const info = limparCampo(o.infoIA, 300);
  // PDF que já veio organizado (Prompt Mestre, JSON ou tabela): produtos lidos sem IA
  const pronto = FORMATOS_PRONTOS.indexOf(o.formato) >= 0 && produtos.length > 0;
  const formato = pronto ? o.formato : (produtos.length ? 'ia' : 'texto');
  const origemProduto = pronto ? o.formato : (origem === 'ia_visao' ? 'ia_visao' : 'ia');
  const comIA = produtos.length > 0 && !pronto;

  return db.transaction(async function (client) {
    let fornecedorId = parseInt(o.fornecedorId, 10) || null;
    let criado = false;
    if (fornecedorId) {
      const f = await client.query('SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1', [fornecedorId, usuarioId]);
      if (!f.rows.length) throw new ErroLeitura('Fornecedor não encontrado', 404);
    } else {
      const d = dadosNovoFornecedor(o.novoFornecedor);
      if (!d.nome) throw new ErroLeitura('Informe o nome do fornecedor.');
      const novo = await client.query(
        'INSERT INTO fornecedores (usuario_id, nome, telefone, whatsapp, whatsapp_link, email, cnpj, site, endereco, observacoes)' +
        ' VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [usuarioId, d.nome, d.telefone, d.whatsapp, d.whatsapp_link, d.email, d.cnpj, d.site, d.endereco, d.observacoes]);
      fornecedorId = novo.rows[0].id;
      criado = true;
    }
    const cat = await client.query(
      "INSERT INTO catalogos (fornecedor_id, nome_arquivo, status, origem, texto_extraido, paginas, formato, total_produtos, ia_status, ia_info)" +
      " VALUES ($1, $2, 'processado', $3, $4, $5, $6, $7, $8, $9) RETURNING id",
      [fornecedorId, nomeArquivo, origem, texto || null, paginas, formato, produtos.length,
        comIA ? 'concluido' : null, comIA ? (info || produtos.length + ' produto(s) organizados pela IA') : null]);
    const catalogoId = cat.rows[0].id;
    const ids = { usuarioId: usuarioId, fornecedorId: fornecedorId, catalogoId: catalogoId };
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO,
      produtos.map(function (p, i) { return linhaProduto(p, i, ids, origemProduto); }));
    const trechos = trechosImportacao(produtos, resumos, texto);
    await db.inserirEmLote(client, 'chunks', ['catalogo_id', 'fornecedor_id', 'conteudo', 'indice', 'texto_norm'],
      trechos.map(function (t, i) { return [catalogoId, fornecedorId, t, i, T.normalizarBusca(t)]; }));
    let atualizados = [];
    if (!criado && o.completarFornecedor !== false) atualizados = await completarFornecedor(client, fornecedorId, detectado);
    return { fornecedor_id: fornecedorId, catalogo_id: catalogoId, fornecedor_criado: criado, produtos: produtos.length,
      trechos: trechos.length, fornecedor_atualizado: atualizados };
  });
}

// Catálogos muito grandes chegam em partes: acrescenta produtos (e trechos) a um catálogo já criado
async function acrescentarProdutos(o) {
  const produtos = extrator.mesclarProdutos([Array.isArray(o.produtos) ? o.produtos : []]);
  if (!produtos.length) throw new ErroLeitura('Nenhum produto para acrescentar.');
  return db.transaction(async function (client) {
    const r = await client.query(
      'SELECT c.id, c.fornecedor_id, c.origem, c.formato FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id WHERE c.id = $1 AND f.usuario_id = $2 AND f.ativo = 1',
      [o.catalogoId, o.usuarioId]);
    const c = r.rows[0];
    if (!c) throw new ErroLeitura('Catálogo não encontrado', 404);
    const pronto = FORMATOS_PRONTOS.indexOf(c.formato) >= 0;
    const n0 = (await client.query('SELECT count(*)::int AS n FROM produtos WHERE catalogo_id = $1', [c.id])).rows[0].n;
    const t0 = (await client.query('SELECT COALESCE(max(indice), -1)::int AS n FROM chunks WHERE catalogo_id = $1', [c.id])).rows[0].n + 1;
    const ids = { usuarioId: o.usuarioId, fornecedorId: c.fornecedor_id, catalogoId: c.id };
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO,
      produtos.map(function (p, i) { return linhaProduto(p, n0 + i, ids, pronto ? c.formato : (c.origem === 'ia_visao' ? 'ia_visao' : 'ia')); }));
    const trechos = trechosImportacao(produtos, [], '');
    await db.inserirEmLote(client, 'chunks', ['catalogo_id', 'fornecedor_id', 'conteudo', 'indice', 'texto_norm'],
      trechos.map(function (t, i) { return [c.id, c.fornecedor_id, t, t0 + i, T.normalizarBusca(t)]; }));
    if (pronto) await client.query('UPDATE catalogos SET total_produtos = $1, atualizado_em = NOW() WHERE id = $2', [n0 + produtos.length, c.id]);
    else await client.query("UPDATE catalogos SET total_produtos = $1, formato = 'ia', ia_status = 'concluido', atualizado_em = NOW() WHERE id = $2", [n0 + produtos.length, c.id]);
    return { catalogo_id: c.id, produtos: produtos.length, total_produtos: n0 + produtos.length };
  });
}

// Libera catálogos presos (servidor reiniciou ou a função da Vercel terminou no meio). Só mexe no que está parado há 15 min.
async function liberarPresos() {
  await db.query("UPDATE catalogos SET ia_status = 'interrompido', ia_info = 'A organização pela IA foi interrompida. Clique em Organizar com IA para tentar de novo.' WHERE ia_status IN ('na_fila', 'estruturando') AND atualizado_em < NOW() - INTERVAL '15 minutes'");
  await db.query("UPDATE catalogos SET status = 'erro', erro = 'Processamento interrompido. Envie o catálogo novamente.' WHERE status IN ('processando', 'pendente') AND atualizado_em < NOW() - INTERVAL '20 minutes'");
}

// Extração no servidor (fallback quando o navegador não consegue ler o PDF)
async function extrairTextoPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return { texto: data.text || '', paginas: data.numpages || 0 };
}

module.exports = { indexarTexto, estruturarParte, partesDoCatalogo, importarCatalogo, acrescentarProdutos, completarFornecedor,
  liberarPresos, extrairTextoPDF, mensagemErroIA, ErroLeitura, waLink };
