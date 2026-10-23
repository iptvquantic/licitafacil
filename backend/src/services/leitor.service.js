// src/services/leitor.service.js — Leitor de catálogos
// Funções puras (sem banco): normaliza o texto, estrutura produtos e gera trechos de busca.
// Formatos aceitos: Prompt Mestre (v1 e v2, com ou sem markdown), JSON de IA e tabelas markdown.
'use strict';

var LIMITE_CAMPO = 2000;

var RE_VAZIO = /^(n[aã]o\s+(informad[oa]s?|especificad[oa]s?|consta|dispon[ií]vel|aplic[aá]vel|encontrad[oa]|mencionad[oa])|sem\s+informa[cç][aã]o|sem\s+dados|n\/?a|n\.a\.|nd|null|none|undefined|vazio|[-–—_.]+|\?+)$/i;

// Rótulos conhecidos → campo do produto (chaves já sem acento e em minúsculas)
var MAPA_PRODUTO = {
  'nome': 'nome', 'nome do produto': 'nome', 'produto': 'nome', 'item': 'nome', 'nome comercial': 'nome',
  'codigo': 'codigo', 'codigo referencia': 'codigo', 'referencia': 'codigo', 'ref': 'codigo', 'sku': 'codigo',
  'cod': 'codigo', 'codigo do produto': 'codigo', 'part number': 'codigo', 'pn': 'codigo', 'codigo sku': 'codigo',
  'cod ref': 'codigo', 'codigo interno': 'codigo', 'referencia codigo': 'codigo',
  'marca': 'marca', 'fabricante': 'marca', 'marca fabricante': 'marca',
  'categoria': 'categoria', 'tipo': 'categoria', 'familia': 'categoria', 'linha': 'categoria', 'grupo': 'categoria',
  'descricao': 'descricao', 'descricao tecnica': 'descricao', 'especificacao': 'descricao', 'especificacoes': 'descricao',
  'especificacao tecnica': 'descricao', 'caracteristicas': 'descricao', 'detalhes': 'descricao', 'descricao completa': 'descricao',
  'bitola': 'bitola', 'bitola dimensao': 'bitola', 'dimensao': 'bitola', 'dimensoes': 'bitola', 'medida': 'bitola',
  'medidas': 'bitola', 'medida bitola': 'bitola', 'tamanho': 'bitola', 'secao': 'bitola', 'secao nominal': 'bitola',
  'diametro': 'bitola', 'bitola medida': 'bitola', 'dimensao medida': 'bitola', 'formato': 'bitola',
  'tensao': 'tensao', 'tensao nominal': 'tensao', 'voltagem': 'tensao', 'tensao de isolamento': 'tensao', 'tensao de trabalho': 'tensao',
  'material': 'material', 'material condutor': 'material', 'condutor': 'material', 'composicao': 'material', 'materia prima': 'material',
  'isolamento': 'isolamento', 'isolacao': 'isolamento', 'material isolante': 'isolamento',
  'cobertura': 'cobertura', 'cobertura externa': 'cobertura', 'capa': 'cobertura', 'revestimento': 'cobertura', 'acabamento': 'cobertura',
  'temperatura': 'temperatura', 'temperatura maxima': 'temperatura', 'temperatura de operacao': 'temperatura', 'temperatura max': 'temperatura',
  'aplicacao': 'aplicacao', 'aplicacoes': 'aplicacao', 'uso': 'aplicacao', 'indicacao': 'aplicacao', 'utilizacao': 'aplicacao',
  'norma': 'norma', 'norma aplicavel': 'norma', 'normas': 'norma', 'norma tecnica': 'norma', 'normas tecnicas': 'norma', 'normas aplicaveis': 'norma',
  'certificacoes': 'certificacoes', 'certificacao': 'certificacoes', 'certificado': 'certificacoes', 'certificados': 'certificacoes', 'selo': 'certificacoes',
  'preco': 'preco', 'valor': 'preco', 'preco unitario': 'preco', 'valor unitario': 'preco', 'preco r': 'preco', 'preco sugerido': 'preco',
  'unidade': 'unidade', 'unidade de venda': 'unidade', 'un': 'unidade', 'und': 'unidade', 'unid': 'unidade', 'unidade de medida': 'unidade'
};

var MAPA_FORNECEDOR = {
  'nome': 'nome', 'razao social': 'nome', 'empresa': 'nome', 'nome fantasia': 'nome',
  'cnpj': 'cnpj',
  'telefone': 'telefone', 'telefones': 'telefone', 'fone': 'telefone', 'tel': 'telefone',
  'whatsapp': 'whatsapp', 'whats': 'whatsapp', 'celular': 'whatsapp',
  'email': 'email', 'e mail': 'email',
  'site': 'site', 'website': 'site', 'web site': 'site', 'pagina': 'site',
  'endereco': 'endereco',
  'especialidade': 'especialidade', 'segmento': 'especialidade', 'ramo': 'especialidade',
  'normas certificacoes': 'normas', 'normas': 'normas', 'certificacoes': 'normas'
};

var CAMPOS = ['nome', 'codigo', 'marca', 'categoria', 'descricao', 'bitola', 'tensao', 'material', 'isolamento',
  'cobertura', 'temperatura', 'aplicacao', 'norma', 'certificacoes', 'preco', 'unidade'];

var ROTULOS_EXIBICAO = {
  nome: 'Nome', codigo: 'Código', marca: 'Marca', categoria: 'Categoria', descricao: 'Descrição',
  bitola: 'Medida/Bitola', tensao: 'Tensão', material: 'Material', isolamento: 'Isolamento', cobertura: 'Cobertura',
  temperatura: 'Temperatura máx.', aplicacao: 'Aplicação', norma: 'Norma', certificacoes: 'Certificações',
  preco: 'Preço', unidade: 'Unidade'
};

function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function chaveRotulo(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function limparValor(v) {
  if (v == null) return '';
  var s = String(v).replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (!s || RE_VAZIO.test(s)) return '';
  return s.length > LIMITE_CAMPO ? s.slice(0, LIMITE_CAMPO) : s;
}

// Mantém uma informação por linha; remove lixo invisível e espaços sobrando
function normalizarTexto(texto) {
  return String(texto == null ? '' : texto)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\t/g, '  ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n[ ]+(?=\S)/g, function (m) { return m.length > 3 ? '\n' : m; })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Remove marcações de markdown de uma linha (negrito, títulos, marcadores de lista)
function limparLinha(linha) {
  var s = String(linha || '').replace(/\*\*|__|`/g, '');
  s = s.replace(/^\s*#{1,6}\s*/, '');
  s = s.replace(/^\s*>\s*/, '');
  s = s.replace(/^\s*(?:[-*•·▪●◦–—]\s+)+/, '');
  return s.trim();
}

var RE_PRODUTO = /^(?:produto|item)\s*(?:n[º°o]\.?\s*|#\s*)?(\d{1,5})(?:\s*[:\-–—.)|]\s*|\s+)?(.*)$/i;
var RE_FORNECEDOR = /^(?:fornecedor|dados\s+do\s+fornecedor|informa[cç][oõ]es\s+do\s+fornecedor|empresa)\s*:?\s*$/i;
var RE_SECAO_PRODUTOS = /^(?:produtos|lista\s+de\s+produtos|cat[aá]logo\s+de\s+produtos)\s*:?\s*$/i;
var RE_RESUMO = /^(?:resumo(?:\s+final)?|observa[cç][oõ]es\s+finais|total\s+de\s+produtos(?:\s+extra[ií]dos)?\s*:.*)\s*:?\s*$/i;
var RE_SEPARADOR = /^[-=_*~]{3,}$/;
var RE_ROTULO = /^([^:]{1,48}?)\s*:\s*(.*)$/;
// Avisos que as IAs escrevem entre as partes da resposta ("CONTINUA", "(continua...)", "[fim]")
var RE_IGNORAR = /^[([{]?\s*(?:continua(?:ndo|[çc][aã]o)?|continue|segue|fim(?:\s+da\s+lista)?|\.{3}|…)\s*(?:\.{3}|…)?\s*[)\]}]?\.?$/i;

// Rótulos do Prompt Mestre (v1 e v2), usados para separar texto que chegou numa linha só
var ROTULOS_CONHECIDOS = ['Nome', 'Código/Referência', 'Código', 'Referência', 'SKU', 'Marca', 'Fabricante', 'Categoria',
  'Descrição técnica', 'Descrição', 'Bitola/Dimensão', 'Medida/Bitola', 'Dimensão', 'Tensão', 'Material condutor', 'Material',
  'Isolamento', 'Cobertura externa', 'Temperatura máxima', 'Aplicação', 'Norma aplicável', 'Norma', 'Certificações',
  'Preço', 'Unidade de venda', 'Unidade', 'CNPJ', 'Telefone', 'WhatsApp', 'E-mail', 'Email', 'Site', 'Endereço',
  'Especialidade', 'Normas/Certificações'];
var RE_ANTES_ROTULO = new RegExp('[ \\t]+(?=(?:' + ROTULOS_CONHECIDOS.map(function (r) {
  return r.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}).join('|') + ')\\s*:)', 'g');
var RE_ANTES_MARCADOR = /[ \t]+(?=(?:PRODUTO|Produto)\s*(?:N[º°o]\.?\s*|#\s*)?\d{1,5}\b|FORNECEDOR\b|PRODUTOS\b|RESUMO FINAL\b)/g;

// Texto "achatado" (PDF do Word, cópia de página) chega com tudo numa linha: devolve uma informação por linha
function separarLinhas(texto) {
  var t = String(texto || '');
  var quebras = (t.match(/\n/g) || []).length;
  if (t.length < 200 || quebras > t.length / 250) return t;
  var rotulos = (t.match(RE_ANTES_ROTULO) || []).length;
  var marcadores = (t.match(RE_ANTES_MARCADOR) || []).length;
  if (rotulos < 3 && marcadores < 2) return t;
  return t.replace(/[ \t]+([-=_]{3,})(?=[ \t]|$)/g, '\n$1\n').replace(RE_ANTES_MARCADOR, '\n').replace(RE_ANTES_ROTULO, '\n');
}

function novoProduto() {
  var p = { atributos: {} };
  CAMPOS.forEach(function (c) { p[c] = ''; });
  return p;
}

function produtoTemDados(p) {
  return !!(p && (p.nome || p.codigo || p.descricao));
}

function finalizarProduto(p) {
  if (!p) return null;
  if (!p.nome) {
    if (p.descricao) p.nome = p.descricao.length > 120 ? p.descricao.slice(0, 117) + '…' : p.descricao;
    else if (p.codigo) p.nome = 'Produto ' + p.codigo;
  }
  if (!p.nome) return null;
  delete p._nomeRotulado;
  Object.keys(p.atributos).forEach(function (k) { if (!p.atributos[k]) delete p.atributos[k]; });
  return p;
}

// ─── Formato Prompt Mestre (linhas "Rótulo: valor") ─────────────────────────
function parsePromptMestre(texto) {
  var linhas = separarLinhas(normalizarTexto(texto)).split('\n');
  var fornecedor = {};
  var produtos = [];
  var atual = null;
  var modo = 'inicio';          // inicio | fornecedor | produto | resumo
  var ultimoCampo = null;       // para juntar linhas quebradas (PDF gerado no Word)

  function fecharAtual() {
    var p = finalizarProduto(atual);
    if (p) produtos.push(p);
    atual = null;
    ultimoCampo = null;
  }

  for (var i = 0; i < linhas.length; i++) {
    var bruta = linhas[i];
    var linha = limparLinha(bruta);
    if (!linha) { ultimoCampo = null; continue; }
    if (RE_SEPARADOR.test(linha) || RE_IGNORAR.test(linha)) { ultimoCampo = null; continue; }

    var mProd = linha.match(RE_PRODUTO);
    if (mProd) {
      fecharAtual();
      atual = novoProduto();
      modo = 'produto';
      var resto = limparValor(mProd[2] || '');
      if (resto) {
        var mr = resto.match(RE_ROTULO);
        if (mr && MAPA_PRODUTO[chaveRotulo(mr[1])]) {
          var campoInline = MAPA_PRODUTO[chaveRotulo(mr[1])];
          atual[campoInline] = limparValor(mr[2]);
          ultimoCampo = campoInline;
        } else {
          atual.nome = resto;
          ultimoCampo = 'nome';
        }
      }
      continue;
    }
    if (RE_FORNECEDOR.test(linha)) { fecharAtual(); modo = 'fornecedor'; continue; }
    if (RE_SECAO_PRODUTOS.test(linha)) { fecharAtual(); modo = 'inicio'; continue; }
    if (RE_RESUMO.test(linha)) { fecharAtual(); modo = 'resumo'; continue; }
    if (modo === 'resumo') continue;

    var m = linha.match(RE_ROTULO);
    var chave = m ? chaveRotulo(m[1]) : '';

    var campoProduto = m ? MAPA_PRODUTO[chave] : null;
    if (modo === 'fornecedor' && m && campoProduto && !MAPA_FORNECEDOR[chave] && limparValor(m[2])) {
      // rótulo típico de produto dentro do bloco do fornecedor: os produtos começaram sem "PRODUTO N"
      modo = 'produto';
      atual = novoProduto();
    } else if (modo === 'fornecedor' && m && campoProduto === 'nome' && fornecedor.nome && limparValor(m[2])) {
      modo = 'produto';
      atual = novoProduto();
    }
    if ((modo === 'inicio' || modo === 'produto') && m && campoProduto === 'nome' && limparValor(m[2]) && (!atual || atual._nomeRotulado)) {
      // "Nome:" sem marcador PRODUTO N inicia um novo produto
      fecharAtual();
      atual = novoProduto();
      modo = 'produto';
    }

    if (modo === 'fornecedor') {
      if (m && MAPA_FORNECEDOR[chave]) {
        var vf = limparValor(m[2]);
        if (vf) fornecedor[MAPA_FORNECEDOR[chave]] = vf;
        ultimoCampo = MAPA_FORNECEDOR[chave];
      } else if (!m && ultimoCampo === 'endereco' && fornecedor.endereco) {
        fornecedor.endereco += ' ' + linha;
      }
      continue;
    }

    if (modo !== 'produto' || !atual) continue;

    if (m && chave && (MAPA_PRODUTO[chave] || (chave.length <= 40 && /[a-z]/.test(chave) && !/^https?$/.test(chave)))) {
      var valor = limparValor(m[2]);
      var campo = MAPA_PRODUTO[chave];
      if (campo) {
        if (valor) {
          if (atual[campo] && campo !== 'nome') atual[campo] += ' | ' + valor;
          else atual[campo] = valor;
          if (campo === 'nome') atual._nomeRotulado = true;
        }
        ultimoCampo = campo;
      } else {
        var rotulo = limparValor(m[1]).slice(0, 60);
        if (valor && rotulo) atual.atributos[rotulo] = valor;
        ultimoCampo = rotulo ? 'atributo:' + rotulo : null;
      }
      continue;
    }

    // Linha sem rótulo: nome logo após o marcador, ou continuação da linha anterior
    var continuacao = limparValor(linha);
    if (!continuacao) continue;
    if (!atual.nome && !ultimoCampo) { atual.nome = continuacao; ultimoCampo = 'nome'; continue; }
    if (ultimoCampo && ultimoCampo.indexOf('atributo:') === 0) {
      var rot = ultimoCampo.slice(9);
      atual.atributos[rot] = (atual.atributos[rot] ? atual.atributos[rot] + ' ' : '') + continuacao;
    } else if (ultimoCampo && CAMPOS.indexOf(ultimoCampo) >= 0) {
      atual[ultimoCampo] = (atual[ultimoCampo] ? atual[ultimoCampo] + ' ' : '') + continuacao;
    }
  }
  fecharAtual();
  // Bloco do fornecedor sem cabeçalho "FORNECEDOR": o 1º "produto" tem CNPJ/endereço/site e nada técnico
  if (produtos.length && !fornecedor.nome) {
    var p0 = produtos[0];
    var attrs = Object.keys(p0.atributos).map(chaveRotulo);
    var temDadoEmpresa = attrs.some(function (a) { return /^(cnpj|endereco|site|website|especialidade|razao social|inscricao estadual)$/.test(a); });
    var temTecnico = ['codigo', 'bitola', 'tensao', 'material', 'preco', 'unidade', 'norma', 'descricao'].some(function (c) { return !!p0[c]; });
    if (temDadoEmpresa && !temTecnico) {
      fornecedor.nome = p0.nome;
      Object.keys(p0.atributos).forEach(function (k) {
        var c = MAPA_FORNECEDOR[chaveRotulo(k)];
        if (c && !fornecedor[c]) fornecedor[c] = p0.atributos[k];
      });
      produtos.shift();
    }
  }
  return { fornecedor: limparFornecedor(fornecedor), produtos: produtos };
}

function limparFornecedor(f) {
  var out = {};
  Object.keys(f || {}).forEach(function (k) { var v = limparValor(f[k]); if (v) out[k] = v; });
  return Object.keys(out).length ? out : null;
}

// ─── JSON (saída de IA) ─────────────────────────────────────────────────────
function valorJSON(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.map(valorJSON).filter(Boolean).join(', ');
    if (v.raw) return valorJSON(v.raw);
    return Object.keys(v).map(function (k) { var s = valorJSON(v[k]); return s ? k + ': ' + s : ''; }).filter(Boolean).join('; ');
  }
  return limparValor(v);
}

var MAPA_JSON = {
  name: 'nome', nome: 'nome', product: 'nome', produto: 'nome', title: 'nome',
  code: 'codigo', codigo: 'codigo', sku: 'codigo', reference: 'codigo', referencia: 'codigo', ref: 'codigo',
  brand: 'marca', marca: 'marca', manufacturer: 'marca', fabricante: 'marca',
  category: 'categoria', categoria: 'categoria',
  description: 'descricao', descricao: 'descricao', descricao_tecnica: 'descricao',
  dimensions: 'bitola', dimensao: 'bitola', bitola: 'bitola', size: 'bitola', medida: 'bitola',
  voltage: 'tensao', tensao: 'tensao',
  material: 'material', material_condutor: 'material',
  insulation: 'isolamento', isolamento: 'isolamento',
  cover: 'cobertura', cobertura: 'cobertura', cobertura_externa: 'cobertura',
  temperature: 'temperatura', temperatura: 'temperatura', temperatura_maxima: 'temperatura',
  application: 'aplicacao', aplicacao: 'aplicacao', usage: 'aplicacao',
  standard: 'norma', standards: 'norma', norma: 'norma', norma_aplicavel: 'norma',
  certifications: 'certificacoes', certificacoes: 'certificacoes',
  price: 'preco', preco: 'preco',
  unit: 'unidade', unidade: 'unidade', unidade_de_venda: 'unidade'
};

function parseJSON(texto) {
  var s = String(texto || '').trim();
  var ini = s.indexOf('{'), iniA = s.indexOf('[');
  if (ini < 0 && iniA < 0) return null;
  var dados = null;
  try { dados = JSON.parse(s); } catch (e) {
    try {
      var a = (iniA >= 0 && (ini < 0 || iniA < ini)) ? iniA : ini;
      var b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
      if (b > a) dados = JSON.parse(s.slice(a, b + 1));
    } catch (e2) { return null; }
  }
  if (!dados) return null;
  var lista = Array.isArray(dados) ? dados : (dados.products || dados.produtos || dados.items || dados.itens || null);
  if (!Array.isArray(lista) || !lista.length) return null;
  var produtos = [];
  lista.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    var p = novoProduto();
    Object.keys(item).forEach(function (k) {
      var campo = MAPA_JSON[chaveRotulo(k).replace(/ /g, '_')];
      var v = valorJSON(item[k]);
      if (!v) return;
      if (campo) { if (!p[campo]) p[campo] = v; }
      else p.atributos[k] = v;
    });
    p = finalizarProduto(p);
    if (p) produtos.push(p);
  });
  var sup = dados.supplier || dados.fornecedor || null;
  var fornecedor = null;
  if (sup && typeof sup === 'object') {
    fornecedor = limparFornecedor({
      nome: sup.name || sup.nome, cnpj: sup.cnpj, telefone: sup.phone || sup.telefone,
      whatsapp: sup.whatsapp, email: sup.email, site: sup.website || sup.site, endereco: sup.address || sup.endereco,
      especialidade: sup.description || sup.especialidade
    });
  }
  return produtos.length ? { fornecedor: fornecedor, produtos: produtos } : null;
}

// ─── Tabela markdown (| Nome | Código | ... |) ───────────────────────────────
function parseTabela(texto) {
  var linhas = normalizarTexto(texto).split('\n');
  var produtos = [];
  var cab = null;
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i].trim();
    if (!/^\|.*\|$/.test(l)) { cab = null; continue; }
    var cel = l.slice(1, -1).split('|').map(function (c) { return limparValor(c.replace(/\*\*/g, '')); });
    if (cel.every(function (c) { return /^:?-{2,}:?$/.test(c) || c === ''; })) continue;
    if (!cab) {
      var mapeadas = cel.map(function (c) { return MAPA_PRODUTO[chaveRotulo(c)] || null; });
      if (mapeadas.filter(Boolean).length >= 2 && mapeadas.indexOf('nome') >= 0) { cab = { campos: mapeadas, nomes: cel }; continue; }
      continue;
    }
    var p = novoProduto();
    cel.forEach(function (v, idx) {
      if (!v) return;
      var campo = cab.campos[idx];
      if (campo) { if (!p[campo]) p[campo] = v; }
      else if (cab.nomes[idx]) p.atributos[cab.nomes[idx]] = v;
    });
    p = finalizarProduto(p);
    if (p) produtos.push(p);
  }
  return produtos.length ? { fornecedor: null, produtos: produtos } : null;
}

function dedupe(produtos) {
  var vistos = {};
  return produtos.filter(function (p) {
    var k = chaveRotulo([p.nome, p.codigo, p.bitola, p.tensao, p.preco].join('|'));
    if (vistos[k]) return false;
    vistos[k] = true;
    return true;
  });
}

// Detecta o formato e devolve { formato, fornecedor, produtos }
function estruturar(texto) {
  var bruto = String(texto || '');
  var resultados = [];
  var pm = parsePromptMestre(bruto);
  if (pm.produtos.length) resultados.push({ formato: 'prompt_mestre', fornecedor: pm.fornecedor, produtos: pm.produtos });
  var js = parseJSON(bruto);
  if (js) resultados.push({ formato: 'json', fornecedor: js.fornecedor, produtos: js.produtos });
  var tb = parseTabela(bruto);
  if (tb) resultados.push({ formato: 'tabela', fornecedor: null, produtos: tb.produtos });
  if (!resultados.length) return { formato: 'texto', fornecedor: pm.fornecedor, produtos: [] };
  resultados.sort(function (a, b) { return b.produtos.length - a.produtos.length; });
  var melhor = resultados[0];
  if (!melhor.fornecedor && pm.fornecedor) melhor.fornecedor = pm.fornecedor;
  melhor.produtos = dedupe(melhor.produtos).slice(0, 5000);
  return melhor;
}

function contarMarcadores(texto) {
  var n = 0;
  separarLinhas(normalizarTexto(texto)).split('\n').forEach(function (l) { if (RE_PRODUTO.test(limparLinha(l))) n++; });
  return n;
}

// Texto compacto de um produto (para busca e para a IA)
function produtoParaTexto(p, incluirVazios) {
  var partes = [];
  CAMPOS.forEach(function (c) {
    if (p[c] || incluirVazios) partes.push(ROTULOS_EXIBICAO[c] + ': ' + (p[c] || 'não informado'));
  });
  Object.keys(p.atributos || {}).forEach(function (k) { partes.push(k + ': ' + p.atributos[k]); });
  return partes.join('\n');
}

// Trechos de busca: um por produto quando estruturado; senão blocos de linhas (~900 caracteres)
function gerarTrechos(texto, produtos, fornecedor) {
  var trechos = [];
  if (produtos && produtos.length) {
    if (fornecedor) {
      var tf = Object.keys(fornecedor).map(function (k) { return k + ': ' + fornecedor[k]; }).join('\n');
      if (tf.length > 20) trechos.push('FORNECEDOR\n' + tf);
    }
    produtos.forEach(function (p) { trechos.push(produtoParaTexto(p)); });
    return trechos.slice(0, 6000);
  }
  var linhas = [];
  separarLinhas(normalizarTexto(texto)).split('\n').forEach(function (l) {
    l = l.trim();
    if (!l) return;
    if (l.length <= 900) linhas.push(l);
    else quebrarLinhaLonga(l, 600).forEach(function (pedaco) { linhas.push(pedaco); });
  });
  var atual = [];
  var tamanho = 0;
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    if (tamanho + l.length > 900 && atual.length) {
      trechos.push(atual.join('\n'));
      var ultima = atual[atual.length - 1];
      atual = ultima.length < 200 ? [ultima] : [];
      tamanho = atual.length ? ultima.length + 1 : 0;
    }
    atual.push(l);
    tamanho += l.length + 1;
  }
  if (atual.length && atual.join('').length >= 15) trechos.push(atual.join('\n'));
  return trechos.slice(0, 6000);
}

// Quebra linha gigante (PDF sem quebras) em pedaços de até `max` caracteres, por palavras
function quebrarLinhaLonga(l, max) {
  var partes = [];
  var atual = '';
  l.split(/\s+/).forEach(function (w) {
    while (w.length > max) {
      if (atual) { partes.push(atual); atual = ''; }
      partes.push(w.slice(0, max));
      w = w.slice(max);
    }
    if (!w) return;
    if (atual && (atual.length + 1 + w.length) > max) { partes.push(atual); atual = w; }
    else atual = atual ? atual + ' ' + w : w;
  });
  if (atual) partes.push(atual);
  return partes;
}

module.exports = {
  CAMPOS: CAMPOS,
  ROTULOS_EXIBICAO: ROTULOS_EXIBICAO,
  normalizarTexto: normalizarTexto,
  separarLinhas: separarLinhas,
  limparValor: limparValor,
  parsePromptMestre: parsePromptMestre,
  parseJSON: parseJSON,
  parseTabela: parseTabela,
  estruturar: estruturar,
  contarMarcadores: contarMarcadores,
  produtoParaTexto: produtoParaTexto,
  gerarTrechos: gerarTrechos,
  semAcento: semAcento
};
