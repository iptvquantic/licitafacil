// js/cotacao.js — Cotação: lista de itens → quem tem cada um → pedido pronto por fornecedor
// Carregado antes do app.js. As funções de tela usam os utilitários globais (esc, html, apiPost, ICONES…) só quando são chamadas.
'use strict';

var COTACAO = { resultado: null, seq: 0 };
var COT_MAX_ITENS = 200;   // itens por lista
var COT_POR_PEDIDO = 20;   // itens conferidos a cada chamada ao servidor (mostra o progresso e não estoura o tempo)

// ─── Leitura da lista colada (funções puras, testadas em testes/cotacao.test.js) ───
var COT_UNIDADES = 'unidades?|unid|und|un|pecas?|peças?|pçs?|pcs?|pc|metros?|mts?|mt|m|rolos?|rl|caixas?|cx|quilos?|kgs?|kg|litros?|lts?|lt|l|pares|par|' +
  'jogos?|jg|kits?|bobinas?|sacos?|sc|barras?|br|tubos?|frascos?|galoes|galões|gl|pacotes?|pct|resmas?|conjuntos?|cj|milheiros?';
var COT_FIM_UNIDADE = '(?=[\\s.,;:)]|$)';
var RE_COT_QTD_INICIO = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + COT_UNIDADES + ')' + COT_FIM_UNIDADE + '\\.?\\s+(?:de\\s+)?(\\S.{2,})$', 'i');
var RE_COT_QTD_FIM = new RegExp('^(.{3,}?)\\s*([-–—,;:(|])\\s*(?:(?:qtd|qtde|quant|quantidade)\\.?\\s*:?\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(' + COT_UNIDADES + ')\\.?\\)?\\s*$', 'i');
var RE_COT_QTD_ROTULO = /^(.{3,}?)[\s\-–—,;:(|]+(?:qtd|qtde|quant|quantidade)\.?\s*:?\s*(\d+(?:[.,]\d+)?)\s*([a-zçãõ]{0,10})\.?\)?\s*$/i;
var RE_COT_CELULA_QTD = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + COT_UNIDADES + ')\\.?$', 'i');
var RE_COT_CELULA_UNIDADE = new RegExp('^(' + COT_UNIDADES + ')\\.?$', 'i');
var RE_COT_NUMERO = /^\d+(?:[.,]\d+)?$/;
var COT_CABECALHO = { item: 1, itens: 1, descricao: 1, especificacao: 1, especificacoes: 1, produto: 1, produtos: 1, material: 1, unid: 1, unidade: 1,
  un: 1, und: 1, qtd: 1, qtde: 1, quant: 1, quantidade: 1, valor: 1, preco: 1, unitario: 1, total: 1, lote: 1, marca: 1, de: 1, do: 1, da: 1, e: 1 };

function cotNormalizar(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function cotLimparTexto(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/^[\s•*·▪■\-–—]+/, '').replace(/[\s;,.:\-–—]+$/, '').trim().slice(0, 300);
}
function cotQuantidade(numero, unidade) {
  return String(numero).trim() + (unidade ? ' ' + String(unidade).trim().toLowerCase().replace(/\.$/, '') : '');
}

// Uma linha da lista → { texto, quantidade } (ou null quando não é um item: linha vazia, cabeçalho de tabela)
function interpretarLinhaCotacao(linha) {
  var bruta = String(linha == null ? '' : linha).replace(/ /g, ' ');
  if (!bruta.trim()) return null;
  var palavras = cotNormalizar(bruta).split(/[^a-z0-9]+/).filter(Boolean);
  if (palavras.length && palavras.every(function (p) { return COT_CABECALHO[p]; })) return null; // "ITEM  DESCRIÇÃO  UNID  QTD"

  var texto = '';
  var quantidade = '';
  if (bruta.indexOf('\t') >= 0) {
    // colado de planilha: uma célula é a descrição (a que tem mais letras); número ao lado da unidade é a quantidade
    var celulas = bruta.split('\t').map(function (c) { return c.trim(); }).filter(Boolean);
    var melhor = -1;
    var letras = -1;
    celulas.forEach(function (c, i) {
      var n = (cotNormalizar(c).match(/[a-z]/g) || []).length;
      if (n > letras) { letras = n; melhor = i; }
    });
    if (melhor < 0 || letras < 2) return null;
    texto = celulas[melhor];
    for (var i = 0; i < celulas.length && !quantidade; i++) {
      if (i === melhor) continue;
      var junto = celulas[i].match(RE_COT_CELULA_QTD);
      if (junto) { quantidade = cotQuantidade(junto[1], junto[2]); break; }
      if (RE_COT_NUMERO.test(celulas[i])) {
        var antes = i > 0 && i - 1 !== melhor ? celulas[i - 1] : '';
        var depois = i + 1 < celulas.length && i + 1 !== melhor ? celulas[i + 1] : '';
        if (RE_COT_CELULA_UNIDADE.test(depois)) quantidade = cotQuantidade(celulas[i], depois);
        else if (RE_COT_CELULA_UNIDADE.test(antes)) quantidade = cotQuantidade(celulas[i], antes);
      }
    }
  } else {
    texto = bruta.trim().replace(/^(?:item\s*)?\d{1,3}\s*[.)\-–:]\s+/i, ''); // "1. ", "2) ", "3 - ", "Item 4: "
    var m = texto.match(RE_COT_QTD_INICIO);
    if (m) {
      quantidade = cotQuantidade(m[1], m[2]);
      texto = m[3];
    } else {
      m = texto.match(RE_COT_QTD_FIM);
      // "cabo 2,5 m" não é quantidade: a vírgula ali é a casa decimal da medida
      if (m && !(m[2] === ',' && /\d$/.test(m[1]))) {
        quantidade = cotQuantidade(m[3], m[4]);
        texto = m[1];
      } else {
        m = texto.match(RE_COT_QTD_ROTULO);
        if (m) { quantidade = cotQuantidade(m[2], m[3]); texto = m[1]; }
      }
    }
  }
  texto = cotLimparTexto(texto);
  if (texto.length < 2 || !/[a-z0-9]/i.test(texto)) return null;
  return { texto: texto, quantidade: quantidade };
}

// Texto colado → itens (sem repetidos, na ordem em que vieram)
function interpretarItensCotacao(texto, maximo) {
  var vistos = {};
  var itens = [];
  var cortados = 0;
  String(texto == null ? '' : texto).split(/\r?\n/).forEach(function (linha) {
    var item = interpretarLinhaCotacao(linha);
    if (!item) return;
    var chave = cotNormalizar(item.texto);
    if (vistos[chave]) return;
    vistos[chave] = true;
    if (itens.length >= (maximo || COT_MAX_ITENS)) { cortados++; return; }
    itens.push(item);
  });
  itens.cortados = cortados;
  return itens;
}

// Itens conferidos → um pedido por fornecedor (só com os itens que ele tem), do que cobre mais itens para o que cobre menos
function agruparPorFornecedor(itens) {
  var mapa = {};
  var ordem = [];
  (itens || []).forEach(function (it, i) {
    (it.tem || []).forEach(function (f) {
      var g = mapa[f.fornecedor_id];
      if (!g) {
        g = mapa[f.fornecedor_id] = { fornecedor: f, itens: [] };
        ordem.push(g);
      }
      g.itens.push({ indice: i, texto: it.texto, quantidade: it.quantidade || '', melhor: f.melhor || null });
    });
  });
  return ordem.sort(function (a, b) {
    return (b.itens.length - a.itens.length) || String(a.fornecedor.nome).localeCompare(String(b.fornecedor.nome), 'pt-BR');
  });
}

// Mensagem pronta para o fornecedor (WhatsApp, e-mail ou copiar)
function textoPedidoFornecedor(grupo, nomeUsuario) {
  var linhas = grupo.itens.map(function (it, i) {
    return (i + 1) + '. ' + it.texto + (it.quantidade ? ' — ' + it.quantidade : '') + (it.melhor && it.melhor.codigo ? ' (ref. ' + it.melhor.codigo + ')' : '');
  });
  var faltaQuantidade = grupo.itens.some(function (it) { return !it.quantidade; });
  return 'Olá! Gostaria de uma cotação ' + (grupo.itens.length > 1 ? 'destes itens' : 'deste item') + ':\n\n' + linhas.join('\n') + '\n\n' +
    (faltaQuantidade ? 'Quantidade: \n' : '') + 'Prazo de entrega: \nCondição de pagamento: \nFrete: \n\nObrigado' + (nomeUsuario ? ',\n' + nomeUsuario : '!');
}

// ─── Tela ───────────────────────────────────────────────────────────
function cotChaveTexto() { return 'lf_cotacao_' + (ESTADO.usuario ? ESTADO.usuario.id : '0'); }
function cotGuardarTexto(t) { try { localStorage.setItem(cotChaveTexto(), String(t || '').slice(0, 60000)); } catch (e) { /* sem armazenamento: segue sem guardar */ } }
function cotLerTexto() { try { return localStorage.getItem(cotChaveTexto()) || ''; } catch (e) { return ''; } }
function cotNomeUsuario() { return ESTADO.usuario && ESTADO.usuario.nome ? String(ESTADO.usuario.nome) : ''; }

function mostrarCotacao() {
  var campo = $('cot-itens');
  if (!campo.value) campo.value = cotLerTexto();
  atualizarContagemCotacao();
  if (COTACAO.resultado) renderCotacao();
  else if (!$('cot-resultado').innerHTML) renderCotacaoInicial();
  if (!ehMobile() && !COTACAO.resultado) setTimeout(function () { if (ESTADO.secao === 'cotacao') campo.focus(); }, 60);
}
function atualizarContagemCotacao() {
  var itens = interpretarItensCotacao(valor('cot-itens'));
  $('cot-contagem').textContent = itens.length ? numero(itens.length) + ' ' + plural(itens.length, 'item', 'itens') +
    (itens.cortados ? ' (a lista passa de ' + COT_MAX_ITENS + ': os últimos ' + numero(itens.cortados) + ' ficam para outra rodada)' : '') : '';
}
function renderCotacaoInicial() {
  html('cot-resultado', caixaVazia(ICONES.arquivo, 'Cole a lista e veja quem tem cada item',
    'Funciona com a lista do edital, da planilha ou digitada. Para cada item aparecem os fornecedores que têm o produto e o pedido já vem pronto para mandar.',
    '<button type="button" class="btn btn-secondary" data-acao="cot-exemplo">Preencher com um exemplo</button>'));
}
function usarExemploCotacao() {
  $('cot-itens').value = 'cabo flexível 2,5mm 750V - 300 m\ncabo PP 3x2,5mm - 2 rolos\ndisjuntor 20A curva C - 15 un';
  atualizarContagemCotacao();
  $('cot-itens').focus();
}
function limparCotacao() {
  COTACAO.seq++;
  COTACAO.resultado = null;
  $('cot-itens').value = '';
  cotGuardarTexto('');
  atualizarContagemCotacao();
  renderCotacaoInicial();
  setLoading($('btn-cotacao'), false);
  $('cot-itens').focus();
}

function analisarCotacao() {
  var itens = interpretarItensCotacao(valor('cot-itens'));
  if (!itens.length) {
    showToast('Cole ou digite pelo menos um item, um por linha.', 'warning');
    $('cot-itens').focus();
    return Promise.resolve(null);
  }
  cotGuardarTexto(valor('cot-itens'));
  var seq = ++COTACAO.seq;
  var btn = $('btn-cotacao');
  var prontos = [];
  setLoading(btn, true, 'Conferindo…');

  function proximoLote() {
    if (seq !== COTACAO.seq) return Promise.resolve(null);
    if (prontos.length >= itens.length) return Promise.resolve(prontos);
    html('cot-resultado', carregando(itens.length > COT_POR_PEDIDO
      ? 'Conferindo os itens ' + (prontos.length + 1) + ' a ' + Math.min(prontos.length + COT_POR_PEDIDO, itens.length) + ' de ' + itens.length + '…'
      : 'Conferindo ' + itens.length + ' ' + plural(itens.length, 'item', 'itens') + ' nos catálogos…'));
    var parte = itens.slice(prontos.length, prontos.length + COT_POR_PEDIDO);
    return apiPost('/api/busca/lote', { itens: parte.map(function (it) { return it.texto; }) }, { timeout: 120000 }).then(function (r) {
      var respostas = (r && r.itens) || [];
      parte.forEach(function (it, i) {
        var resp = respostas[i] || {};
        prontos.push({ texto: it.texto, quantidade: it.quantidade, tem: resp.tem || [], parecidos: resp.parecidos || [], citados: resp.citados || 0 });
      });
      return proximoLote();
    });
  }

  return proximoLote().then(function (lista) {
    if (seq !== COTACAO.seq || !lista) return null;
    COTACAO.resultado = { itens: lista, cortados: itens.cortados || 0 };
    renderCotacao();
    return COTACAO.resultado;
  }).catch(function (err) {
    if (seq !== COTACAO.seq) return null;
    if (err && err.code === 'PLANO_EXPIRADO') {
      html('cot-resultado', caixaVazia(ICONES.alerta, 'Cotação pausada', esc(msgErro(err)),
        '<button type="button" class="btn btn-primary" data-acao="ir" data-secao="config">Escolher plano</button>'));
    } else {
      html('cot-resultado', caixaErro(msgErro(err, 'Não foi possível conferir os itens agora.'), 'cot-de-novo'));
    }
    return null;
  }).then(function (r) {
    if (seq === COTACAO.seq) setLoading(btn, false);
    return r;
  });
}

// "FX-25 · R$ 2,35 / metro" — o que o catálogo do fornecedor diz sobre o item
function cotReferencia(melhor) {
  if (!melhor) return '';
  var partes = [];
  if (melhor.codigo) partes.push(melhor.codigo);
  else if (melhor.nome) partes.push(truncate(melhor.nome, 46));
  if (melhor.preco) partes.push(melhor.preco + (melhor.unidade ? ' / ' + melhor.unidade : ''));
  return partes.join(' · ');
}
function htmlLinhaItemCotacao(it, i) {
  var estado = it.tem.length ? 'tem' : (it.parecidos.length || it.citados ? 'parecido' : 'falta');
  var quem;
  if (it.tem.length) {
    var mostrados = it.tem.slice(0, 5);
    quem = mostrados.map(function (f) {
      var ref = cotReferencia(f.melhor);
      return '<div class="cot-f"><button type="button" class="link-btn" data-acao="ver-fornecedor" data-id="' + esc(f.fornecedor_id) + '">' + esc(f.nome) + '</button>' +
        (ref ? '<span class="cot-ref">' + esc(ref) + '</span>' : '') + '</div>';
    }).join('') + (it.tem.length > mostrados.length ? '<div class="cot-ref">+ ' + numero(it.tem.length - mostrados.length) + ' ' +
      plural(it.tem.length - mostrados.length, 'outro fornecedor', 'outros fornecedores') + '</div>' : '');
  } else {
    quem = '<div class="cot-nao">Nenhum fornecedor cadastrado tem</div>';
    if (it.parecidos.length) {
      quem += '<div class="cot-ref">Parecido em: ' + it.parecidos.slice(0, 3).map(function (f) {
        return '<button type="button" class="link-btn" data-acao="ver-fornecedor" data-id="' + esc(f.fornecedor_id) + '">' + esc(f.nome) + '</button>';
      }).join(', ') + '</div>';
    } else if (it.citados) {
      quem += '<div class="cot-ref">Citado em ' + numero(it.citados) + ' ' + plural(it.citados, 'catálogo sem produtos organizados', 'catálogos sem produtos organizados') + '</div>';
    }
  }
  return '<li class="cot-linha ' + estado + '">' +
    '<span class="cot-n" aria-hidden="true">' + (i + 1) + '</span>' +
    '<div class="cot-item"><div class="cot-texto">' + esc(it.texto) + '</div>' + (it.quantidade ? '<div class="cot-qtd">' + esc(it.quantidade) + '</div>' : '') + '</div>' +
    '<div class="cot-quem">' + quem + '</div>' +
    '<button type="button" class="btn btn-ghost btn-sm cot-ver" data-acao="cot-buscar-item" data-i="' + i + '" title="Abrir este item na busca">' + ICONES.busca + '<span>Ver na busca</span></button>' +
    '</li>';
}
function htmlPedidoFornecedor(grupo, totalItens) {
  var f = grupo.fornecedor;
  var mensagem = textoPedidoFornecedor(grupo, cotNomeUsuario());
  var wa = linkWhats(f, mensagem);
  var botoes = [];
  if (wa) {
    botoes.push('<a class="btn btn-whats btn-sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer">' + ICONES.whats + 'Pedir no WhatsApp</a>');
  }
  if (f.email) {
    // corpo comprido não cabe no link de e-mail de todo programa: nesse caso o pedido vai para a área de transferência
    var curto = encodeURIComponent(mensagem).length <= 1500;
    var mailto = 'mailto:' + encodeURIComponent(f.email) + '?subject=' + encodeURIComponent('Pedido de cotação') +
      '&body=' + encodeURIComponent(curto ? mensagem : 'Olá! Segue o pedido de cotação (cole aqui o pedido copiado).');
    botoes.push('<a class="btn btn-secondary btn-sm" href="' + esc(mailto) + '" data-acao="cot-email" data-fid="' + esc(f.fornecedor_id) + '">' + ICONES.email + 'E-mail</a>');
  }
  botoes.push('<button type="button" class="btn btn-secondary btn-sm" data-acao="cot-copiar" data-fid="' + esc(f.fornecedor_id) + '">' + ICONES.copiar + 'Copiar pedido</button>');
  return '<li class="res-forn-item cot-pedido">' +
    '<div class="rf-info"><div class="rf-topo"><button type="button" class="link-btn rf-nome" data-acao="ver-fornecedor" data-id="' + esc(f.fornecedor_id) + '">' + esc(f.nome) + '</button>' +
      '<span class="badge badge-green">tem ' + numero(grupo.itens.length) + ' de ' + numero(totalItens) + ' ' + plural(totalItens, 'item', 'itens') + '</span></div>' +
      '<ol class="cot-pedido-itens">' + grupo.itens.map(function (it) {
        var ref = cotReferencia(it.melhor);
        return '<li>' + esc(it.texto) + (it.quantidade ? ' <span class="cot-qtd">' + esc(it.quantidade) + '</span>' : '') +
          (ref ? ' <span class="cot-ref">' + esc(ref) + '</span>' : '') + '</li>';
      }).join('') + '</ol></div>' +
    '<div class="rf-lado"><div class="contatos">' + botoes.join('') + '</div>' +
      (!wa && !f.email ? '<span class="text-sm text-muted">Sem WhatsApp nem e-mail cadastrado</span>' : '') + '</div>' +
    '</li>';
}
function renderCotacao() {
  var r = COTACAO.resultado;
  if (!r) return;
  var itens = r.itens;
  var com = itens.filter(function (it) { return it.tem.length; }).length;
  var faltando = itens.filter(function (it) { return !it.tem.length; });
  var grupos = agruparPorFornecedor(itens);
  var titulo = com === itens.length
    ? (itens.length === 1 ? 'Você tem fornecedor para este item' : 'Você tem fornecedor para os ' + numero(itens.length) + ' itens')
    : (com ? 'Você tem fornecedor para ' + numero(com) + ' de ' + numero(itens.length) + ' itens' : 'Nenhum fornecedor cadastrado tem estes itens');
  var partes = [];
  partes.push('<div class="cot-resumo"><h3 class="veredito ' + (com === itens.length ? 'sim' : (com ? 'parcial' : 'nao')) + '">' + esc(titulo) + '</h3>' +
    '<div class="cotacao-acoes">' +
    '<button type="button" class="btn btn-secondary btn-sm" data-acao="cot-planilha">' + ICONES.arquivo + 'Baixar planilha</button>' +
    '</div></div>');
  if (r.cortados) {
    partes.push('<div class="banner info mb-4"><span>A lista tinha mais de ' + COT_MAX_ITENS + ' itens: conferi os primeiros ' + COT_MAX_ITENS +
      '. Apague-os da caixa e confira os outros ' + numero(r.cortados) + ' em seguida.</span></div>');
  }
  partes.push('<ol class="cot-lista">' + itens.map(htmlLinhaItemCotacao).join('') + '</ol>');
  if (grupos.length) {
    partes.push('<div class="secao-titulo"><h3>Pedido pronto por fornecedor</h3><span class="contagem">' + numero(grupos.length) + ' ' +
      plural(grupos.length, 'fornecedor', 'fornecedores') + '</span></div>' +
      '<ul class="res-forn">' + grupos.map(function (g) { return htmlPedidoFornecedor(g, itens.length); }).join('') + '</ul>');
  }
  if (faltando.length) {
    partes.push('<div class="secao-titulo"><h3>Sem fornecedor cadastrado</h3><span class="contagem">' + numero(faltando.length) + ' ' +
      plural(faltando.length, 'item', 'itens') + '</span></div>' +
      '<div class="card cot-faltando"><ul>' + faltando.map(function (it) {
        return '<li>' + esc(it.texto) + (it.quantidade ? ' <span class="cot-qtd">' + esc(it.quantidade) + '</span>' : '') + '</li>';
      }).join('') + '</ul>' +
      '<p class="form-hint">Importe o catálogo de quem vende estes itens, ou cadastre o produto à mão no fornecedor, e confira a lista de novo.</p>' +
      '<div class="cotacao-acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="cot-copiar-faltando">' + ICONES.copiar + 'Copiar estes itens</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-acao="ir" data-secao="importar">' + ICONES.enviar + 'Importar catálogo</button></div></div>');
  }
  html('cot-resultado', '<div class="fade-in">' + partes.join('') + '</div>');
}

function cotGrupoDoFornecedor(fid) {
  if (!COTACAO.resultado) return null;
  var grupos = agruparPorFornecedor(COTACAO.resultado.itens);
  for (var i = 0; i < grupos.length; i++) if (String(grupos[i].fornecedor.fornecedor_id) === String(fid)) return grupos[i];
  return null;
}
function copiarPedidoCotacao(fid, botao, silencioso) {
  var g = cotGrupoDoFornecedor(fid);
  if (!g) return;
  copiarTexto(textoPedidoFornecedor(g, cotNomeUsuario())).then(function () {
    showToast(silencioso ? 'Pedido copiado: se o e-mail abrir sem os itens, é só colar.' : 'Pedido para ' + g.fornecedor.nome + ' copiado.', 'success');
    if (botao && !silencioso) botao.focus();
  }).catch(function () { if (!silencioso) showToast('Não foi possível copiar. Use o WhatsApp ou o e-mail.', 'error'); });
}
function copiarItensFaltando() {
  if (!COTACAO.resultado) return;
  var linhas = COTACAO.resultado.itens.filter(function (it) { return !it.tem.length; }).map(function (it) {
    return it.texto + (it.quantidade ? ' - ' + it.quantidade : '');
  });
  copiarTexto(linhas.join('\n')).then(function () {
    showToast(numero(linhas.length) + ' ' + plural(linhas.length, 'item copiado', 'itens copiados') + '.', 'success');
  }).catch(function () { showToast('Não foi possível copiar.', 'error'); });
}
function baixarPlanilhaCotacao() {
  if (!COTACAO.resultado) return;
  var cab = ['Item', 'Descrição', 'Quantidade', 'Situação', 'Fornecedor', 'Produto no catálogo', 'Código', 'Preço', 'Unidade', 'Telefone', 'WhatsApp', 'E-mail'];
  var linhas = [cab.map(celulaCSV).join(';')];
  COTACAO.resultado.itens.forEach(function (it, i) {
    if (!it.tem.length) {
      linhas.push([i + 1, it.texto, it.quantidade, it.parecidos.length ? 'só parecido' : 'sem fornecedor', it.parecidos.map(function (f) { return f.nome; }).join(', '),
        '', '', '', '', '', '', ''].map(celulaCSV).join(';'));
      return;
    }
    it.tem.forEach(function (f) {
      var m = f.melhor || {};
      linhas.push([i + 1, it.texto, it.quantidade, 'tem', f.nome, m.nome || '', m.codigo || '', m.preco || '', m.unidade || '',
        f.telefone ? formatPhone(f.telefone) : '', f.whatsapp ? formatPhone(f.whatsapp) : '', f.email || ''].map(celulaCSV).join(';'));
    });
  });
  baixarArquivo('cotacao-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
  showToast('Planilha baixada. Abre no Excel e no Google Planilhas.', 'success');
}
function buscarItemCotacao(i) {
  var it = COTACAO.resultado && COTACAO.resultado.itens[parseInt(i, 10)];
  if (!it) return;
  $('campo-busca').value = it.texto.slice(0, 300);
  navegar('busca');
  buscar();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { interpretarLinhaCotacao: interpretarLinhaCotacao, interpretarItensCotacao: interpretarItensCotacao,
    agruparPorFornecedor: agruparPorFornecedor, textoPedidoFornecedor: textoPedidoFornecedor };
}
