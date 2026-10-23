// src/utils/texto.js — tokenização para busca técnica (medidas, normas, códigos) + utilitários TF-IDF
'use strict';

var STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os', 'e', 'que', 'um', 'uma',
  'para', 'com', 'por', 'se', 'ao', 'aos', 'ou', 'mas', 'mais', 'como', 'seu', 'sua', 'seus', 'suas', 'este', 'esta', 'estes', 'estas',
  'esse', 'essa', 'isso', 'ele', 'ela', 'eles', 'elas', 'foi', 'ser', 'ter', 'nao', 'me', 'te', 'lhe', 'quando', 'onde', 'qual',
  'quais', 'tem', 'ha', 'preciso', 'quero', 'procuro', 'algum', 'alguma', 'fornecedor', 'fornecedores', 'produto', 'produtos',
  'informado', 'sobre', 'entre', 'pelo', 'pela', 'the', 'and', 'for', 'of']);

function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Normaliza para comparar medidas e códigos: "3 × 2,5 mm²" → "3x2.5mm2", "750 V" → "750v"
function normalizarBusca(s) {
  return semAcento(s).toLowerCase()
    .replace(/[×✕✖]/g, 'x')
    .replace(/²/g, '2').replace(/³/g, '3')
    .replace(/[º°]/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d)\s*x\s*(?=\d)/g, '$1x')
    .replace(/(\d)\s+(mm2|mm|kv|kva|v|a|w|kw|m|kg|cm|pol|awg|hz)\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

var RE_DIM = /^(\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)*)(mm2|mm|m|cm|kg|v|kv|kva|a|w|kw|awg|pol|hz)?$/;

// Variantes de um token. modo 'doc' gera também as partes de letras (para casar "nbr 6148" com "NBR6148").
function variantes(t, modo) {
  var out = [t];
  var m = t.match(RE_DIM);
  if (m && m[2]) {
    if (/^(mm2|mm|m|cm)$/.test(m[2]) || m[1].indexOf('x') > 0) out.push(m[1]);
    if (m[2] === 'mm2') out.push(m[1] + 'mm');
    if (m[2] === 'mm') out.push(m[1] + 'mm2');
  } else if (!m && /[a-z]/.test(t) && /\d/.test(t) && t.indexOf('/') < 0) {
    t.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/).forEach(function (p) {
      if (/^\d+$/.test(p) ? (p.length >= 3 || modo === 'doc') : (modo === 'doc' && p.length >= 2)) out.push(p);
    });
  }
  if (t.indexOf('/') > 0) {
    var partes = t.split('/').filter(Boolean);
    if (modo === 'doc') partes.forEach(function (p) { variantes(p, modo).forEach(function (v) { out.push(v); }); });
    else if (partes.length) variantes(partes[partes.length - 1], modo).forEach(function (v) { out.push(v); });
  }
  return out;
}

function limparToken(v) { return String(v || '').replace(/^[.\/]+|[.\/]+$/g, ''); }

function tokenValido(v) {
  if (!v) return false;
  if (/\d/.test(v)) return true;
  return v.length >= 2 && !STOPWORDS.has(v);
}

function brutos(texto) {
  return normalizarBusca(texto).split(/[^a-z0-9.\/]+/).map(limparToken).filter(tokenValido);
}

// Conjunto de tokens de um documento (com variantes)
function tokensDoc(texto) {
  var set = new Set();
  brutos(texto).forEach(function (t) {
    variantes(t, 'doc').forEach(function (v) { v = limparToken(v); if (tokenValido(v)) set.add(v); });
  });
  return set;
}

// Grupos da consulta: cada termo digitado vira um conceito com as variantes aceitas
function gruposBusca(texto) {
  var vistos = {};
  var grupos = [];
  brutos(texto).forEach(function (t) {
    if (vistos[t]) return;
    vistos[t] = true;
    var vars = [];
    variantes(t, 'consulta').forEach(function (v) { v = limparToken(v); if (tokenValido(v) && vars.indexOf(v) < 0) vars.push(v); });
    if (vars.length) grupos.push({ termo: t, variantes: vars, tecnico: /\d/.test(t) });
  });
  return grupos.slice(0, 12);
}

// Lista plana de tokens (compatível com versões anteriores)
function tokensBusca(texto) { return Array.from(tokensDoc(texto)); }

function ehTecnico(t) { return /\d/.test(t); }

// ─── compatibilidade com o código antigo ────────────────────────────────────
function tokenizar(texto) {
  return semAcento(texto).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (t) { return t.length > 2 && !STOPWORDS.has(t); });
}

function gerarBigramas(tokens) {
  var b = [];
  for (var i = 0; i < tokens.length - 1; i++) b.push(tokens[i] + '_' + tokens[i + 1]);
  return b;
}

function calcularTFIDF(texto, corpus) {
  var tokens = tokenizar(texto), todas = tokens.concat(gerarBigramas(tokens));
  var tf = {};
  for (var i = 0; i < todas.length; i++) tf[todas[i]] = (tf[todas[i]] || 0) + 1;
  for (var k in tf) tf[k] = tf[k] / todas.length;
  var tfidf = {};
  for (var term in tf) {
    var df = corpus.filter(function (d) { return d.includes(term); }).length;
    tfidf[term] = tf[term] * (Math.log((corpus.length + 1) / (df + 1)) + 1);
  }
  return tfidf;
}

function cosineSimilarity(v1, v2) {
  var keys = new Set(Object.keys(v1).concat(Object.keys(v2)));
  var dot = 0, n1 = 0, n2 = 0;
  keys.forEach(function (k) { var a = v1[k] || 0, b = v2[k] || 0; dot += a * b; n1 += a * a; n2 += b * b; });
  return n1 && n2 ? dot / (Math.sqrt(n1) * Math.sqrt(n2)) : 0;
}

module.exports = {
  semAcento: semAcento,
  normalizarBusca: normalizarBusca,
  tokensDoc: tokensDoc,
  gruposBusca: gruposBusca,
  tokensBusca: tokensBusca,
  ehTecnico: ehTecnico,
  tokenizar: tokenizar,
  gerarBigramas: gerarBigramas,
  calcularTFIDF: calcularTFIDF,
  cosineSimilarity: cosineSimilarity
};
