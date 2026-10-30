// src/services/extrator.service.js — Extrator de catálogos: transforma a saída da IA (e o texto do catálogo)
// em produtos e dados do fornecedor confiáveis. Funções puras (sem banco), testadas em testes/leitor.test.js.
'use strict';

var leitor = require('./leitor.service');
var T = require('../utils/texto');

var LIMITE_CAMPO = 500;
var LIMITE_DESCRICAO = 2000;
var MAX_ATRIBUTOS = 40;
var MAX_PRODUTOS = 8000;

function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function chave(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

// Rótulos que a IA pode usar (português ou inglês) → campo do produto
var MAPA_CAMPOS = {
  nome: 'nome', name: 'nome', produto: 'nome', product: 'nome', titulo: 'nome', title: 'nome', 'nome do produto': 'nome', item: 'nome',
  codigo: 'codigo', code: 'codigo', sku: 'codigo', referencia: 'codigo', reference: 'codigo', ref: 'codigo', 'codigo referencia': 'codigo',
  'part number': 'codigo', modelo: 'codigo', model: 'codigo',
  marca: 'marca', brand: 'marca', fabricante: 'marca', manufacturer: 'marca',
  categoria: 'categoria', category: 'categoria', familia: 'categoria', linha: 'categoria', grupo: 'categoria', tipo: 'categoria',
  descricao: 'descricao', description: 'descricao', 'descricao tecnica': 'descricao', especificacao: 'descricao', caracteristicas: 'descricao',
  bitola: 'bitola', medida: 'bitola', medidas: 'bitola', secao: 'bitola', 'secao nominal': 'bitola', dimensao: 'bitola', dimensoes: 'bitola',
  tamanho: 'bitola', size: 'bitola', dimensions: 'bitola', 'bitola dimensao': 'bitola', 'medida bitola': 'bitola', capacidade: 'bitola',
  tensao: 'tensao', voltage: 'tensao', 'tensao nominal': 'tensao', voltagem: 'tensao',
  material: 'material', 'material condutor': 'material', condutor: 'material', composicao: 'material',
  isolamento: 'isolamento', isolacao: 'isolamento', insulation: 'isolamento',
  cobertura: 'cobertura', 'cobertura externa': 'cobertura', capa: 'cobertura', cover: 'cobertura', revestimento: 'cobertura',
  temperatura: 'temperatura', 'temperatura maxima': 'temperatura', temperature: 'temperatura',
  aplicacao: 'aplicacao', aplicacoes: 'aplicacao', application: 'aplicacao', uso: 'aplicacao',
  norma: 'norma', normas: 'norma', 'norma aplicavel': 'norma', standard: 'norma', standards: 'norma',
  certificacoes: 'certificacoes', certificacao: 'certificacoes', certifications: 'certificacoes',
  preco: 'preco', price: 'preco', valor: 'preco', 'preco unitario': 'preco',
  unidade: 'unidade', unit: 'unidade', 'unidade de venda': 'unidade', embalagem_venda: 'unidade'
};
var CHAVES_ATRIBUTOS = { atributos: 1, attributes: 1, specs: 1, especificacoes: 1, outros: 1, extras: 1, 'outros dados': 1 };

function limparTexto(v, max) {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  var s = String(v).replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  s = leitor.limparValor(s);
  if (!s) return '';
  max = max || LIMITE_CAMPO;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function valorSimples(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(valorSimples).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    return Object.keys(v).map(function (k) { var s = valorSimples(v[k]); return s ? k + ': ' + s : ''; }).filter(Boolean).join('; ');
  }
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v);
}

function lerAtributos(origem, destino) {
  if (!origem) return;
  if (Array.isArray(origem)) {
    origem.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var nome = item.nome || item.name || item.atributo || item.chave || item.key;
      var val = item.valor != null ? item.valor : (item.value != null ? item.value : item.v);
      if (nome) adicionarAtributo(destino, nome, val);
    });
    return;
  }
  if (typeof origem === 'object') Object.keys(origem).forEach(function (k) { adicionarAtributo(destino, k, origem[k]); });
}

function adicionarAtributo(destino, nome, val) {
  var rotulo = limparTexto(nome, 60);
  var valor = limparTexto(valorSimples(val), LIMITE_CAMPO);
  if (!rotulo || !valor) return;
  if (Object.keys(destino).length >= MAX_ATRIBUTOS && !destino[rotulo]) return;
  destino[rotulo] = valor;
}

// Um produto vindo da IA (ou do navegador) → formato do LicitaFácil. Devolve null se não tiver nome.
function normalizarProduto(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  var p = { atributos: {} };
  leitor.CAMPOS.forEach(function (c) { p[c] = ''; });
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    var ck = chave(k);
    if (CHAVES_ATRIBUTOS[ck]) { lerAtributos(v, p.atributos); return; }
    var campo = MAPA_CAMPOS[ck] || MAPA_CAMPOS[ck.replace(/ /g, '_')];
    if (campo) {
      var s = limparTexto(valorSimples(v), campo === 'descricao' ? LIMITE_DESCRICAO : LIMITE_CAMPO);
      if (s && !p[campo]) p[campo] = s;
      return;
    }
    if (ck && ck !== 'id' && ck !== 'pagina' && ck !== 'page') adicionarAtributo(p.atributos, k, v);
  });
  if (!p.nome) {
    if (p.descricao) p.nome = p.descricao.length > 120 ? p.descricao.slice(0, 117) + '…' : p.descricao;
    else if (p.codigo) p.nome = (p.categoria ? p.categoria + ' ' : 'Produto ') + p.codigo;
  }
  if (!p.nome || p.nome.length < 2) return null;
  // nome sem a medida quando a medida existe: acrescenta para cada variação ficar única e pesquisável
  if (p.bitola && T.normalizarBusca(p.nome).indexOf(T.normalizarBusca(p.bitola)) < 0 && p.nome.length < 140) {
    p.nome = p.nome + ' ' + p.bitola;
  }
  return p;
}

// ─── Fornecedor ─────────────────────────────────────────────────────────────
function digitos(s) { return String(s || '').replace(/\D/g, ''); }

function cnpjValido(c) {
  c = digitos(c);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  function dv(base) {
    var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma = 0;
    for (var i = 0; i < pesos.length; i++) soma += parseInt(base[i], 10) * pesos[i];
    var r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }
  return dv(c.slice(0, 12)) === parseInt(c[12], 10) && dv(c.slice(0, 13)) === parseInt(c[13], 10);
}

function formatarCNPJ(c) {
  c = digitos(c);
  if (c.length !== 14) return '';
  return c.slice(0, 2) + '.' + c.slice(2, 5) + '.' + c.slice(5, 8) + '/' + c.slice(8, 12) + '-' + c.slice(12);
}

function formatarTelefone(t) {
  var d = digitos(t);
  if (/^0800\d{7}$/.test(d)) return '0800 ' + d.slice(4, 7) + ' ' + d.slice(7);
  if (d.length === 13 && d.slice(0, 2) === '55') d = d.slice(2);
  if (d.length === 12 && d.slice(0, 2) === '55') d = d.slice(2);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return '';
}

function normalizarSite(s) {
  var t = String(s || '').trim().replace(/[),.;]+$/, '');
  if (!t) return '';
  var m = t.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s]*)?$/i);
  if (!m) return '';
  var host = m[1].toLowerCase();
  if (/^(gmail|hotmail|outlook|yahoo|uol|bol|terra|live|icloud)\./.test(host)) return '';
  return 'https://' + host + (m[2] && m[2] !== '/' ? m[2] : '');
}

function emailValido(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '')) && !/\.(png|jpe?g|gif|webp|svg)$/i.test(e); }

var CAMPOS_FORNECEDOR = ['nome', 'cnpj', 'telefone', 'whatsapp', 'email', 'site', 'endereco', 'especialidade'];

function normalizarFornecedor(obj) {
  if (!obj || typeof obj !== 'object') return null;
  var f = {};
  var mapa = {
    nome: 'nome', name: 'nome', empresa: 'nome', 'razao social': 'nome', 'nome fantasia': 'nome', fornecedor: 'nome',
    cnpj: 'cnpj', telefone: 'telefone', phone: 'telefone', fone: 'telefone', telefones: 'telefone',
    whatsapp: 'whatsapp', celular: 'whatsapp', email: 'email', 'e mail': 'email',
    site: 'site', website: 'site', url: 'site', endereco: 'endereco', address: 'endereco',
    especialidade: 'especialidade', segmento: 'especialidade', ramo: 'especialidade', descricao: 'especialidade', description: 'especialidade'
  };
  Object.keys(obj).forEach(function (k) {
    var campo = mapa[chave(k)];
    if (!campo || f[campo]) return;
    var v = limparTexto(valorSimples(obj[k]), campo === 'endereco' || campo === 'especialidade' ? 300 : 160);
    if (v) f[campo] = v;
  });
  if (f.cnpj) f.cnpj = cnpjValido(f.cnpj) ? formatarCNPJ(f.cnpj) : '';
  if (f.telefone) f.telefone = formatarTelefone(f.telefone.split(/[\/;|]|\s{2,}/)[0]) || '';
  if (f.whatsapp) f.whatsapp = formatarTelefone(f.whatsapp.split(/[\/;|]|\s{2,}/)[0]) || '';
  if (f.email) {
    var em = (f.email.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0].toLowerCase();
    f.email = emailValido(em) ? em : '';
  }
  if (f.site) f.site = normalizarSite(f.site);
  if (f.nome && /^(n[aã]o informado|desconhecido|fornecedor|empresa)$/i.test(f.nome)) f.nome = '';
  Object.keys(f).forEach(function (k) { if (!f[k]) delete f[k]; });
  return Object.keys(f).length ? f : null;
}

// Contatos encontrados no texto do catálogo (CNPJ, telefones, WhatsApp, e-mail, site, endereço)
function extrairContatos(texto) {
  var t = String(texto || '');
  var out = {};
  var cnpjs = t.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}\s?\/?\s?\d{4}[-\s]?\d{2}\b/g) || [];
  for (var i = 0; i < cnpjs.length; i++) { if (cnpjValido(cnpjs[i])) { out.cnpj = formatarCNPJ(cnpjs[i]); break; } }

  var emails = (t.match(/[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) || []).map(function (e) { return e.toLowerCase().replace(/\.+$/, ''); })
    .filter(emailValido);
  if (emails.length) {
    var pref = emails.filter(function (e) { return /^(vendas|comercial|contato|atendimento|sac|orcamento)/.test(e); })[0];
    out.email = pref || emails[0];
  }

  var sites = t.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com\.br|ind\.br|net\.br|com|net|org\.br|eng\.br|br)\b(?:\/[^\s)]*)?/gi) || [];
  for (var s = 0; s < sites.length; s++) {
    if (/@/.test(t.charAt(t.indexOf(sites[s]) - 1))) continue; // parte de e-mail
    var site = normalizarSite(sites[s]);
    if (site) { out.site = site; break; }
  }

  var linhas = t.split('\n');
  var fixos = [];
  var celulares = [];
  var RE_FONE = /(?:\+?55[\s.-]*)?(?:\(?0?\d{2}\)?[\s.-]*)?(?:9[\s.]?\d{4}|\d{4})[\s.-]?\d{4}\b|0800[\s.-]?\d{3}[\s.-]?\d{4}/g;
  linhas.forEach(function (l) {
    var m;
    RE_FONE.lastIndex = 0;
    while ((m = RE_FONE.exec(l)) !== null) {
      var fmt = formatarTelefone(m[0]);
      if (!fmt) continue;
      var d = digitos(fmt);
      var antes = l.slice(Math.max(0, m.index - 30), m.index);
      var celular = d.length === 11 && d.charAt(2) === '9';
      if (celular) celulares.push({ fmt: fmt, whats: /whats|zap|wpp/i.test(antes) });
      else fixos.push(fmt);
    }
  });
  var marcado = celulares.filter(function (c) { return c.whats; })[0];
  if (marcado || celulares.length) out.whatsapp = (marcado || celulares[0]).fmt;
  if (fixos.length) out.telefone = fixos[0];
  else {
    var outro = celulares.filter(function (c) { return c.fmt !== out.whatsapp; })[0];
    if (outro) out.telefone = outro.fmt;
  }

  for (var j = 0; j < linhas.length; j++) {
    var l = linhas[j].trim();
    if (l.length > 8 && l.length < 220 && /\b(rua|r\.|av\.?|avenida|rod\.?|rodovia|estrada|alameda|al\.|travessa|pra[cç]a|est\.)\s+\S/i.test(l) &&
        (/\b\d{5}-?\d{3}\b/.test(l) || /,\s*\d+/.test(l) || /\b(n[ºo°]\.?|km)\s*\d+/i.test(l))) {
      out.endereco = l.replace(/\s{2,}/g, ' ');
      break;
    }
  }
  return out;
}

// Junta os dados do fornecedor vindos de várias páginas: em cada campo vale o valor mais frequente
function mesclarFornecedores(lista) {
  var cont = {};
  (lista || []).forEach(function (f) {
    if (!f) return;
    CAMPOS_FORNECEDOR.forEach(function (c) {
      var v = f[c];
      if (!v) return;
      cont[c] = cont[c] || {};
      var k = c === 'nome' || c === 'especialidade' || c === 'endereco' ? chave(v) : digitos(v) || chave(v);
      if (!cont[c][k]) cont[c][k] = { v: v, n: 0 };
      cont[c][k].n++;
      if (String(v).length > String(cont[c][k].v).length && c !== 'nome') cont[c][k].v = v;
    });
  });
  var out = {};
  Object.keys(cont).forEach(function (c) {
    var melhor = null;
    Object.keys(cont[c]).forEach(function (k) { if (!melhor || cont[c][k].n > melhor.n) melhor = cont[c][k]; });
    if (melhor) out[c] = melhor.v;
  });
  return Object.keys(out).length ? out : null;
}

// Nome provável quando a IA não achou: domínio do site ou nome do arquivo
function nomePorSiteOuArquivo(site, nomeArquivo) {
  if (site) {
    var host = String(site).replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[./]/)[0];
    if (host && host.length >= 3) return host.charAt(0).toUpperCase() + host.slice(1);
  }
  var n = String(nomeArquivo || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ')
    .replace(/\b(cat[aá]logo|catalog|catalogue|produtos|tabela|pre[cç]os|lista|20\d\d)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return n.length >= 2 ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}

// Compara com os fornecedores já cadastrados (CNPJ, e-mail, site, telefone ou nome)
function compararFornecedores(dados, existentes) {
  if (!dados) return [];
  var cnpj = digitos(dados.cnpj);
  var email = String(dados.email || '').toLowerCase();
  var dominio = dados.site ? String(dados.site).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : '';
  var dominioEmail = email.split('@')[1] || '';
  var fones = [dados.telefone, dados.whatsapp].map(function (t) { return digitos(t).slice(-8); }).filter(function (d) { return d.length === 8; });
  var nome = chave(dados.nome || '');
  var tokensNome = nome.split(' ').filter(function (w) { return w.length >= 3 && !/^(ltda|eireli|industria|comercio|de|da|do|dos|das|e|me|sa|fios|cabos)$/.test(w); });
  var achados = [];
  (existentes || []).forEach(function (f) {
    var motivo = null;
    if (cnpj && digitos(f.cnpj) === cnpj) motivo = 'mesmo CNPJ';
    else if (email && String(f.email || '').toLowerCase() === email) motivo = 'mesmo e-mail';
    else if (dominio && f.site && String(f.site).indexOf(dominio) >= 0) motivo = 'mesmo site';
    else if (dominioEmail && !/^(gmail|hotmail|outlook|yahoo|uol|bol|terra|live|icloud)\./.test(dominioEmail) &&
      String(f.email || '').toLowerCase().split('@')[1] === dominioEmail) motivo = 'mesmo domínio de e-mail';
    else if (fones.length && [f.telefone, f.whatsapp].some(function (t) { return fones.indexOf(digitos(t).slice(-8)) >= 0; })) motivo = 'mesmo telefone';
    else if (tokensNome.length) {
      var nf = chave(f.nome || '');
      var iguais = tokensNome.filter(function (w) { return (' ' + nf + ' ').indexOf(' ' + w + ' ') >= 0; }).length;
      if (nf && (nf === nome || iguais >= Math.max(1, Math.ceil(tokensNome.length * 0.6)))) motivo = 'nome parecido';
    }
    if (motivo) achados.push({ id: f.id, nome: f.nome, motivo: motivo });
  });
  return achados.slice(0, 5);
}

// ─── Produtos de várias páginas: tira repetidos e completa campos vazios ────
// Mesmo nome e código = mesmo produto, a não ser que medida ou tensão (quando as duas existem) sejam diferentes
function chaveProduto(p) {
  return [T.normalizarBusca(p.nome), T.normalizarBusca(p.codigo || '')].join('|');
}

function compativeis(a, b) {
  return ['bitola', 'tensao'].every(function (c) {
    return !a[c] || !b[c] || T.normalizarBusca(a[c]) === T.normalizarBusca(b[c]);
  });
}

function mesclarProdutos(listas) {
  var grupos = new Map();
  var ordem = [];
  (listas || []).forEach(function (lista) {
    (lista || []).forEach(function (bruto) {
      var p = normalizarProduto(bruto);
      if (!p) return;
      var k = chaveProduto(p);
      var variantes = grupos.get(k);
      if (!variantes) { variantes = []; grupos.set(k, variantes); }
      var atual = null;
      for (var i = 0; i < variantes.length; i++) if (compativeis(variantes[i], p)) { atual = variantes[i]; break; }
      if (!atual) { variantes.push(p); ordem.push(p); return; }
      leitor.CAMPOS.forEach(function (c) { if (!atual[c] && p[c]) atual[c] = p[c]; });
      Object.keys(p.atributos || {}).forEach(function (a) { if (!atual.atributos[a]) atual.atributos[a] = p.atributos[a]; });
    });
  });
  return ordem.slice(0, MAX_PRODUTOS);
}

// Texto em blocos para a IA (por linhas, sem cortar uma linha no meio)
function dividirBlocos(texto, tamanho) {
  tamanho = tamanho || 6000;
  var linhas = String(texto || '').split('\n');
  var blocos = [];
  var atual = '';
  linhas.forEach(function (l) {
    while (l.length > tamanho) { if (atual) { blocos.push(atual); atual = ''; } blocos.push(l.slice(0, tamanho)); l = l.slice(tamanho); }
    if ((atual.length + l.length + 1) > tamanho && atual) { blocos.push(atual); atual = ''; }
    atual += (atual ? '\n' : '') + l;
  });
  if (atual.trim()) blocos.push(atual);
  return blocos.filter(function (b) { return b.replace(/\s/g, '').length >= 30; });
}

// JSON da IA: tolera cercas de código, texto antes/depois e resposta cortada no meio de um produto
function parseJSONTolerante(texto) {
  var s = String(texto || '').replace(/```(?:json)?/gi, '').trim();
  var ini = s.indexOf('{');
  var iniA = s.indexOf('[');
  if (ini < 0 && iniA < 0) return null;
  var comeco = (iniA >= 0 && (ini < 0 || iniA < ini)) ? iniA : ini;
  var fim = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (fim > comeco) {
    try { return JSON.parse(s.slice(comeco, fim + 1)); } catch (e) { /* tenta consertar abaixo */ }
  }
  // cortado: fecha no último produto completo
  var corpo = s.slice(comeco);
  var ultimo = corpo.lastIndexOf('},');
  while (ultimo > 0) {
    var tentativa = corpo.slice(0, ultimo + 1);
    var abertos = [];
    var emTexto = false;
    for (var i = 0; i < tentativa.length; i++) {
      var ch = tentativa[i];
      if (ch === '"' && tentativa[i - 1] !== '\\') emTexto = !emTexto;
      if (emTexto) continue;
      if (ch === '{' || ch === '[') abertos.push(ch);
      else if (ch === '}' || ch === ']') abertos.pop();
    }
    var fecha = abertos.reverse().map(function (c) { return c === '{' ? '}' : ']'; }).join('');
    try { return JSON.parse(tentativa + fecha); } catch (e) { ultimo = corpo.lastIndexOf('},', ultimo - 1); }
  }
  return null;
}

// Saída da IA (objeto ou texto) → { fornecedor, produtos, resumo }
function normalizarResultadoIA(saida) {
  var dados = typeof saida === 'string' ? parseJSONTolerante(saida) : saida;
  if (!dados) return null;
  var lista = Array.isArray(dados) ? dados : (dados.produtos || dados.products || dados.itens || dados.items || []);
  if (!Array.isArray(lista)) lista = [];
  var produtos = mesclarProdutos([lista]);
  var fornecedor = Array.isArray(dados) ? null : normalizarFornecedor(dados.fornecedor || dados.supplier || dados.empresa || null);
  var resumo = Array.isArray(dados) ? '' : limparTexto(dados.resumo_pagina || dados.resumo || dados.summary || '', 400);
  return { fornecedor: fornecedor, produtos: produtos, resumo: resumo };
}

module.exports = {
  normalizarProduto: normalizarProduto,
  normalizarFornecedor: normalizarFornecedor,
  extrairContatos: extrairContatos,
  mesclarFornecedores: mesclarFornecedores,
  nomePorSiteOuArquivo: nomePorSiteOuArquivo,
  compararFornecedores: compararFornecedores,
  mesclarProdutos: mesclarProdutos,
  dividirBlocos: dividirBlocos,
  parseJSONTolerante: parseJSONTolerante,
  normalizarResultadoIA: normalizarResultadoIA,
  cnpjValido: cnpjValido,
  formatarCNPJ: formatarCNPJ,
  formatarTelefone: formatarTelefone,
  normalizarSite: normalizarSite,
  CAMPOS_FORNECEDOR: CAMPOS_FORNECEDOR
};
