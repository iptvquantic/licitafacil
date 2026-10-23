// src/services/busca.service.js — busca técnica por produto (medida, norma, código) + trechos de catálogo
'use strict';
var db = require('../utils/db');
var T = require('../utils/texto');

var LIMITE_CANDIDATOS = 5000;
var CAMPOS_PRINCIPAIS = ['nome', 'codigo', 'bitola', 'tensao', 'norma', 'marca'];
var CAMPOS_PRODUTO = ['nome', 'codigo', 'marca', 'categoria', 'descricao', 'bitola', 'tensao', 'material', 'isolamento',
  'cobertura', 'temperatura', 'aplicacao', 'norma', 'certificacoes', 'preco', 'unidade'];

function padroesLike(grupos) {
  var lista = [];
  grupos.forEach(function (g) {
    g.variantes.forEach(function (v) {
      var p = '%' + v.replace(/[\\%_]/g, '\\$&') + '%';
      if (lista.indexOf(p) < 0) lista.push(p);
    });
  });
  return lista;
}

function casaGrupo(g, set) {
  for (var i = 0; i < g.variantes.length; i++) if (set.has(g.variantes[i])) return true;
  return false;
}

function casaPrefixo(g, set) {
  if (g.tecnico || g.termo.length < 4) return false;
  var t = g.termo;
  var achou = false;
  set.forEach(function (d) {
    if (!achou && d.length >= 4 && !/\d/.test(d) && (d.indexOf(t) === 0 || t.indexOf(d) === 0)) achou = true;
  });
  return achou;
}

// Peso de cada conceito: termos raros (e medidas/normas) valem mais
function pesosGrupos(grupos, docs, totalDocs) {
  return grupos.map(function (g) {
    var df = 0;
    for (var i = 0; i < docs.length; i++) if (casaGrupo(g, docs[i])) df++;
    var idf = Math.log(1 + (totalDocs + 1) / (df + 1));
    return (g.tecnico ? 1.7 : 1) * Math.max(idf, 0.35);
  });
}

function pontuar(grupos, pesos, docPrincipal, docTodos, textoNorm, consultaNorm) {
  var total = 0, obtido = 0, termos = [], tecTotal = 0, tecOk = 0;
  grupos.forEach(function (g, i) {
    var w = pesos[i];
    total += w;
    if (g.tecnico) tecTotal++;
    var q = 0;
    if (docPrincipal && casaGrupo(g, docPrincipal)) q = 1;
    else if (casaGrupo(g, docTodos)) q = docPrincipal ? 0.8 : 1;
    else if (casaPrefixo(g, docTodos)) q = 0.55;
    if (q) {
      obtido += w * q;
      termos.push(g.termo);
      if (g.tecnico) tecOk++;
    }
  });
  var s = total ? obtido / total : 0;
  if (consultaNorm.length >= 5 && textoNorm.indexOf(consultaNorm) >= 0) s += 0.12;
  if (tecTotal && tecOk === tecTotal) s += 0.05;
  return { score: Math.min(1, s), termos: termos };
}

function relevancia(s) { return s >= 0.7 ? 'alta' : s >= 0.4 ? 'media' : 'baixa'; }

// Melhor janela de linhas do trecho (mantém quebras de linha)
function melhorTrecho(conteudo, grupos) {
  var linhas = String(conteudo || '').split('\n').filter(function (l) { return l.trim(); });
  if (!linhas.length) return '';
  var hits = linhas.map(function (l) {
    var set = T.tokensDoc(l);
    var n = 0;
    grupos.forEach(function (g) { if (casaGrupo(g, set)) n += g.tecnico ? 2 : 1; });
    return n;
  });
  var JAN = Math.min(6, linhas.length);
  var melhor = 0, melhorIni = 0;
  for (var i = 0; i + JAN <= linhas.length; i++) {
    var s = 0;
    for (var j = i; j < i + JAN; j++) s += hits[j];
    if (s > melhor) { melhor = s; melhorIni = i; }
  }
  var txt = linhas.slice(melhorIni, melhorIni + JAN).join('\n');
  return txt.length > 600 ? txt.slice(0, 597) + '…' : txt;
}

function contatoFornecedor(r) {
  return {
    id: r.fornecedor_id,
    nome: r.fornecedor_nome,
    telefone: r.telefone || null,
    whatsapp: r.whatsapp || null,
    whatsapp_link: r.whatsapp_link || null,
    email: r.email || null
  };
}

async function buscar(consulta, usuarioId, opcoes) {
  opcoes = opcoes || {};
  var limiteProdutos = Math.min(Math.max(parseInt(opcoes.limiteProdutos, 10) || 30, 1), 100);
  var limiteFornecedores = Math.min(Math.max(parseInt(opcoes.limiteFornecedores, 10) || 10, 1), 50);
  var fornecedorId = opcoes.fornecedorId ? parseInt(opcoes.fornecedorId, 10) : null;

  var grupos = T.gruposBusca(consulta);
  var vazio = { consulta: consulta, termos: [], produtos: [], total_produtos: 0, fornecedores: [], resultados: [], total: 0 };
  if (!grupos.length) return vazio;

  var padroes = padroesLike(grupos);
  var consultaNorm = T.normalizarBusca(consulta);
  var filtroForn = fornecedorId ? ' AND f.id = $3' : '';
  var params = fornecedorId ? [usuarioId, padroes, fornecedorId] : [usuarioId, padroes];

  var resultados = await Promise.all([
    db.query(
      'SELECT p.id, p.fornecedor_id, p.catalogo_id, p.nome, p.codigo, p.marca, p.categoria, p.descricao, p.bitola, p.tensao, p.material,' +
      ' p.isolamento, p.cobertura, p.temperatura, p.aplicacao, p.norma, p.certificacoes, p.preco, p.unidade, p.atributos, p.texto_norm,' +
      ' f.nome AS fornecedor_nome, f.telefone, f.whatsapp, f.whatsapp_link, f.email, c.nome_arquivo' +
      ' FROM produtos p JOIN fornecedores f ON f.id = p.fornecedor_id AND f.ativo = 1' +
      ' LEFT JOIN catalogos c ON c.id = p.catalogo_id' +
      ' WHERE p.usuario_id = $1 AND p.texto_norm LIKE ANY($2::text[])' + filtroForn +
      ' LIMIT ' + LIMITE_CANDIDATOS, params),
    db.query(
      'SELECT ch.id, ch.conteudo, ch.texto_norm, ch.catalogo_id, ch.fornecedor_id, f.nome AS fornecedor_nome,' +
      ' f.telefone, f.whatsapp, f.whatsapp_link, f.email, c.nome_arquivo' +
      ' FROM chunks ch JOIN fornecedores f ON f.id = ch.fornecedor_id AND f.ativo = 1 AND f.usuario_id = $1' +
      ' LEFT JOIN catalogos c ON c.id = ch.catalogo_id' +
      ' WHERE COALESCE(ch.texto_norm, lower(ch.conteudo)) LIKE ANY($2::text[])' + filtroForn +
      ' LIMIT ' + LIMITE_CANDIDATOS, params),
    db.query(
      'SELECT (SELECT count(*) FROM produtos p JOIN fornecedores f ON f.id = p.fornecedor_id AND f.ativo = 1 WHERE p.usuario_id = $1)::int AS np,' +
      ' (SELECT count(*) FROM chunks ch JOIN fornecedores f ON f.id = ch.fornecedor_id AND f.ativo = 1 WHERE f.usuario_id = $1)::int AS nc',
      [usuarioId])
  ]);

  var linhasProd = resultados[0].rows;
  var linhasChunk = resultados[1].rows;
  var totais = resultados[2].rows[0] || { np: 0, nc: 0 };

  // ── produtos ──
  var docsProd = linhasProd.map(function (r) { return T.tokensDoc(r.texto_norm || ''); });
  var pesosProd = pesosGrupos(grupos, docsProd, Math.max(totais.np, linhasProd.length));
  var produtos = [];
  linhasProd.forEach(function (r, i) {
    var principal = T.tokensDoc(CAMPOS_PRINCIPAIS.map(function (c) { return r[c] || ''; }).join(' '));
    var res = pontuar(grupos, pesosProd, principal, docsProd[i], r.texto_norm || '', consultaNorm);
    var cod = T.normalizarBusca(r.codigo || '');
    if (cod && cod.length >= 3 && (cod === consultaNorm || grupos.some(function (g) { return g.termo === cod; }))) res.score = Math.max(res.score, 0.97);
    if (res.score < 0.3) return;
    var p = { id: r.id, score: Math.round(res.score * 100), relevancia: relevancia(res.score), termos: res.termos };
    CAMPOS_PRODUTO.forEach(function (c) { p[c] = r[c] || ''; });
    p.atributos = r.atributos || {};
    p.fornecedor = contatoFornecedor(r);
    p.catalogo = { id: r.catalogo_id, nome_arquivo: r.nome_arquivo || '' };
    produtos.push(p);
  });
  produtos.sort(function (a, b) {
    return (b.score - a.score) || ((b.preco ? 1 : 0) - (a.preco ? 1 : 0)) || a.nome.localeCompare(b.nome, 'pt-BR');
  });

  // ── trechos (catálogos sem estrutura e contexto extra) ──
  var docsChunk = linhasChunk.map(function (r) { return T.tokensDoc(r.texto_norm || r.conteudo || ''); });
  var pesosChunk = pesosGrupos(grupos, docsChunk, Math.max(totais.nc, linhasChunk.length));
  var trechos = [];
  linhasChunk.forEach(function (r, i) {
    var res = pontuar(grupos, pesosChunk, null, docsChunk[i], r.texto_norm || '', consultaNorm);
    if (res.score < 0.25) return;
    trechos.push({ r: r, score: res.score });
  });
  trechos.sort(function (a, b) { return b.score - a.score; });

  // ── agrupado por fornecedor ──
  var porForn = new Map();
  function base(r) {
    var f = porForn.get(r.fornecedor_id);
    if (!f) {
      f = { fornecedor_id: r.fornecedor_id, nome: r.fornecedor_nome, telefone: r.telefone || null, whatsapp: r.whatsapp || null,
        whatsapp_link: r.whatsapp_link || null, email: r.email || null, score: 0, produtos_encontrados: 0,
        catalogo_id: r.catalogo_id, nome_arquivo: r.nome_arquivo || '', trecho: '' };
      porForn.set(r.fornecedor_id, f);
    }
    return f;
  }
  produtos.forEach(function (p) {
    var f = base({ fornecedor_id: p.fornecedor.id, fornecedor_nome: p.fornecedor.nome, telefone: p.fornecedor.telefone,
      whatsapp: p.fornecedor.whatsapp, whatsapp_link: p.fornecedor.whatsapp_link, email: p.fornecedor.email,
      catalogo_id: p.catalogo.id, nome_arquivo: p.catalogo.nome_arquivo });
    f.produtos_encontrados++;
    f.score = Math.max(f.score, p.score / 100);
  });
  trechos.forEach(function (t) {
    var f = base(t.r);
    if (!f.trecho) {
      f.trecho = melhorTrecho(t.r.conteudo, grupos);
      if (!f.produtos_encontrados) { f.catalogo_id = t.r.catalogo_id; f.nome_arquivo = t.r.nome_arquivo || ''; }
    }
    f.score = Math.max(f.score, t.score * 0.95);
  });
  var fornecedores = Array.from(porForn.values()).sort(function (a, b) {
    return (b.score - a.score) || (b.produtos_encontrados - a.produtos_encontrados);
  }).slice(0, limiteFornecedores).map(function (f) {
    f.relevancia = relevancia(f.score);
    f.score = Math.round(f.score * 100);
    return f;
  });

  return {
    consulta: consulta,
    termos: grupos.map(function (g) { return g.termo; }),
    produtos: produtos.slice(0, limiteProdutos),
    total_produtos: produtos.length,
    fornecedores: fornecedores,
    resultados: fornecedores,
    total: fornecedores.length
  };
}

// Compatibilidade: assinatura antiga
async function buscaHibrida(consulta, usuarioId, limite) {
  return buscar(consulta, usuarioId, { limiteFornecedores: limite || 5 });
}

async function getStats(usuarioId) {
  var r = await db.query(
    'SELECT' +
    ' (SELECT count(*) FROM fornecedores WHERE usuario_id = $1 AND ativo = 1)::int AS total_fornecedores,' +
    ' (SELECT count(*) FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id WHERE f.usuario_id = $1 AND f.ativo = 1 AND c.status = \'processado\')::int AS total_catalogos,' +
    ' (SELECT count(*) FROM chunks ch JOIN fornecedores f ON f.id = ch.fornecedor_id WHERE f.usuario_id = $1 AND f.ativo = 1)::int AS total_chunks,' +
    ' (SELECT count(*) FROM produtos p JOIN fornecedores f ON f.id = p.fornecedor_id WHERE p.usuario_id = $1 AND f.ativo = 1)::int AS total_produtos',
    [usuarioId]);
  var row = r.rows[0] || {};
  return {
    total_fornecedores: row.total_fornecedores || 0,
    total_catalogos: row.total_catalogos || 0,
    total_chunks: row.total_chunks || 0,
    total_produtos: row.total_produtos || 0,
    indexado: (row.total_chunks || 0) > 0
  };
}

module.exports = { buscar: buscar, buscaHibrida: buscaHibrida, getStats: getStats, melhorTrecho: melhorTrecho };
