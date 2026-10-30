// public/js/app.js — LicitaFácil: app principal (busca, fornecedores, leitor de catálogos, configurações e painel do dono)
// Regras: var e funções nomeadas; esc() em todo dado antes de innerHTML; eventos por data-acao (nada de onclick em string).
'use strict';

var ESTADO = {
  usuario: null,
  stats: null,
  secao: null,
  fornecedores: [],
  fornecedoresCarregados: false,
  fornecedor: null,
  fornecedorId: null,
  produtos: [],
  produtosFiltrados: [],
  produtosLimite: 200,
  aba: 'produtos',
  modoEntrada: 'arquivo',
  leitura: null,
  buscaSeq: 0,
  iaSeq: 0,
  pollTimer: null,
  iaEsperada: null,
  confirmar: null,
  avisoPlanoMostrado: false,
  importacao: null,
  capacidades: null,
  capacidadesEm: 0,
  organizando: null
};

var TITULOS = { busca: 'Buscar produtos', importar: 'Importar catálogo', fornecedores: 'Fornecedores', detalhe: 'Fornecedor', config: 'Configurações', admin: 'Painel do dono' };
var NOMES_PLANO = { trial: 'Teste grátis', mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
var ORIGENS = {
  texto_colado: 'Texto colado', pdf_navegador: 'PDF lido no navegador', ocr_navegador: 'PDF escaneado (OCR)',
  imagem_ocr: 'Foto (OCR)', pdf_servidor: 'PDF lido no servidor', reprocessado: 'Relido', ia: 'Organizado pela IA',
  ia_visao: 'Lido pela IA (imagem das páginas)', ia_texto: 'Texto organizado pela IA', manual: 'Cadastrados à mão'
};
var FORMATOS = { prompt_mestre: 'Prompt Mestre', json: 'JSON', tabela: 'Tabela', texto: 'Texto livre', ia: 'Organizado pela IA' };
var IA_ATIVA = ['na_fila', 'estruturando'];
var MAX_ARQUIVO_MB = 50;
var MAX_TEXTO = 1500000; // a função da Vercel aceita até 4,5 MB por envio

var CAMPOS_PRODUTO = [
  ['nome', 'Produto'], ['codigo', 'Código'], ['marca', 'Marca'], ['categoria', 'Categoria'], ['descricao', 'Descrição'],
  ['bitola', 'Medida/Bitola'], ['tensao', 'Tensão'], ['material', 'Material'], ['isolamento', 'Isolamento'],
  ['cobertura', 'Cobertura'], ['temperatura', 'Temperatura máx.'], ['aplicacao', 'Aplicação'], ['norma', 'Norma'],
  ['certificacoes', 'Certificações'], ['preco', 'Preço'], ['unidade', 'Unidade']
];

function svg(caminhos, extra) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + caminhos + '</svg>';
}

var ICONES = {
  busca: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'),
  predio: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/>'),
  caixa: svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  arquivo: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>'),
  enviar: svg('<path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/>'),
  mais: svg('<path d="M12 5v14M5 12h14"/>'),
  editar: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  lixo: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  reler: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>'),
  ia: svg('<path d="M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  fone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  whats: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>'),
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  olho: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  ok: svg('<path d="M20 6 9 17l-5-5"/>'),
  alerta: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  menu: svg('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  voltar: svg('<polyline points="15 18 9 12 15 6"/>', ' stroke-width="2.6"'),
  avancar: svg('<polyline points="9 18 15 12 9 6"/>', ' stroke-width="2.6"')
};

// ─── Prompt Mestre v2 (vale para qualquer categoria; o leitor também entende o v1) ─
var PROMPT_MESTRE = [
  'Você é especialista em catálogos de fornecedores para compras e licitações no Brasil.',
  'Leia o catálogo anexado (PDF, fotos ou texto) e extraia TODOS os produtos, sem pular nenhum.',
  '',
  'REGRAS',
  '1. Nunca invente dados. Se a informação não estiver no catálogo, escreva: não informado',
  '2. Copie medidas, códigos, normas, tensões e preços exatamente como aparecem (ex.: 3x2,5mm², 750V, NBR 6148, R$ 8,90)',
  '3. Cada variação (medida, cor, tensão, capacidade, tamanho) é um PRODUTO separado',
  '4. Atributos técnicos sem rótulo abaixo vão em linhas extras no formato "Atributo: valor" dentro do produto',
  '5. Responda SOMENTE no formato abaixo: sem tabelas, sem markdown, sem comentários',
  '6. Se a resposta ficar longa demais, termine no fim de um produto e escreva CONTINUA. Quando eu disser "continue", siga do próximo número.',
  '',
  'FORMATO',
  '',
  'FORNECEDOR',
  'Nome: ',
  'CNPJ: ',
  'Telefone: ',
  'WhatsApp: ',
  'Email: ',
  'Site: ',
  'Endereço: ',
  'Especialidade: ',
  '',
  'PRODUTO 1',
  'Nome: ',
  'Código: ',
  'Marca: ',
  'Categoria: ',
  'Descrição técnica: ',
  'Medida/Bitola: ',
  'Tensão: ',
  'Material: ',
  'Norma: ',
  'Certificações: ',
  'Preço: ',
  'Unidade: ',
  '',
  'PRODUTO 2',
  '(mesmo formato, até o último produto do catálogo)'
].join('\n');

// ─── Utilidades de tela ─────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function mostrar(el, sim) { el = typeof el === 'string' ? $(el) : el; if (el) el.classList.toggle('hidden', !sim); }
function html(id, conteudo) {
  var el = $(id);
  if (!el) return;
  var atualizacao = el.childElementCount > 0;
  el.innerHTML = conteudo;
  // Atualizações (filtro, acompanhamento) não repetem a animação de entrada: a tela não pisca
  if (atualizacao) Array.prototype.forEach.call(el.querySelectorAll('.fade-in'), function (n) { n.classList.remove('fade-in'); });
}
function valor(id) { var el = $(id); return el ? String(el.value || '') : ''; }
function plural(n, um, varios) { return n === 1 ? um : varios; }
function numero(n) { return (Number(n) || 0).toLocaleString('pt-BR'); }
function vazio() { return '<span class="text-muted" title="não informado">—</span>'; }
function inicial(nome) { var s = String(nome || '').trim(); return s ? s.charAt(0).toUpperCase() : '?'; }
function ehMobile() { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }

// CNPJ: 14 números com os 2 dígitos verificadores certos (mesma conta do servidor)
function cnpjValido(c) {
  c = String(c || '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  function dv(base) {
    var pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var soma = 0;
    for (var i = 0; i < pesos.length; i++) soma += parseInt(base.charAt(i), 10) * pesos[i];
    var r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }
  var d1 = dv(c.slice(0, 12));
  var d2 = dv(c.slice(0, 12) + d1);
  return c.charAt(12) === String(d1) && c.charAt(13) === String(d2);
}
function msgCNPJ(c) {
  var n = String(c || '').replace(/\D/g, '').length;
  return n !== 14 ? 'Confira o CNPJ: são 14 números.' : 'Confira o CNPJ: os dígitos verificadores não batem.';
}

function semAcento(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function normalizar(s) {
  return semAcento(s).toLowerCase().replace(/[×✕]/g, 'x').replace(/²/g, '2').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
}

function caixaVazia(icone, titulo, texto, botoes) {
  return '<div class="empty-box fade-in"><div class="ei">' + icone + '</div><div class="eh">' + esc(titulo) + '</div>' +
    (texto ? '<p class="ep">' + texto + '</p>' : '') + (botoes ? '<div class="btns">' + botoes + '</div>' : '') + '</div>';
}
function carregando(texto) { return '<div class="carregando"><span class="spinner" aria-hidden="true"></span>' + esc(texto || 'Carregando…') + '</div>'; }
function caixaErro(texto, acao, rotulo) {
  return '<div class="banner erro" role="alert"><span>' + esc(texto) + '</span>' +
    (acao ? '<div class="acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="' + esc(acao) + '">' + esc(rotulo || 'Tentar de novo') + '</button></div>' : '') + '</div>';
}

// Destaca os termos da busca (sem acento, × = x, vírgula = ponto) sem quebrar o HTML já escapado
var STOP_DESTAQUE = { de: 1, da: 1, do: 1, das: 1, dos: 1, com: 1, para: 1, por: 1, em: 1, na: 1, no: 1, e: 1, ou: 1, a: 1, o: 1 };
function regexTermo(t) {
  var s = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s.replace(/,/g, '\u0001').replace(/\\\./g, '\u0001');
  s = s.replace(/[aáàâãä]/gi, '[aáàâãä]').replace(/[eéêè]/gi, '[eéêè]').replace(/[iíî]/gi, '[iíî]')
    .replace(/[oóôõö]/gi, '[oóôõö]').replace(/[uúü]/gi, '[uúü]').replace(/[cç]/gi, '[cç]').replace(/[x×]/gi, '[x×]');
  return s.replace(/\u0001/g, '[.,]');
}
function criarDestaque(consulta) {
  var termos = String(consulta || '').split(/\s+/).map(function (t) { return t.replace(/^[^\wÀ-ÿ²]+|[^\wÀ-ÿ²]+$/g, ''); })
    .filter(function (t) { return t.length >= 2 && !STOP_DESTAQUE[t.toLowerCase()]; });
  if (!termos.length) return null;
  termos.sort(function (a, b) { return b.length - a.length; });
  try { return new RegExp('(' + termos.map(regexTermo).join('|') + ')', 'gi'); } catch (e) { return null; }
}
function marcar(texto, re) {
  var seguro = esc(texto);
  if (!re || !seguro) return seguro;
  return seguro.split(/(&[#a-z0-9]+;)/gi).map(function (parte, i) {
    if (i % 2 === 1) return parte;
    re.lastIndex = 0;
    return parte.replace(re, '<mark>$1</mark>');
  }).join('');
}

function dataBR(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }
function dataHoraBR(d) { return d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }

function linkWhats(f, mensagem) {
  var numero = f.whatsapp || (f.whatsapp_link ? String(f.whatsapp_link).replace(/\D/g, '') : '');
  return linkWhatsApp(numero, mensagem);
}

// Botões de contato do fornecedor (WhatsApp já com mensagem de cotação quando há produto)
function htmlContatos(f, opcoes) {
  opcoes = opcoes || {};
  var partes = [];
  var mensagem = opcoes.produto ? 'Olá! Vi no catálogo de vocês: ' + opcoes.produto + '. Pode me passar preço e prazo de entrega?' : '';
  var wa = linkWhats(f, mensagem);
  if (wa) {
    partes.push('<a class="btn btn-whats btn-sm" href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" title="Abrir conversa no WhatsApp">' +
      ICONES.whats + '<span' + (opcoes.compacto ? ' class="sr-only"' : '') + '>WhatsApp</span></a>');
  }
  var tel = f.telefone ? linkTelefone(f.telefone) : '';
  if (tel) {
    partes.push('<a class="btn btn-secondary btn-sm" href="' + esc(tel) + '" title="Ligar">' + ICONES.fone +
      '<span' + (opcoes.compacto ? ' class="sr-only"' : '') + '>' + esc(formatPhone(f.telefone)) + '</span></a>');
  }
  if (f.email) {
    var assunto = opcoes.produto ? '?subject=' + encodeURIComponent('Cotação — ' + opcoes.produto) : '';
    partes.push('<a class="btn btn-secondary btn-sm" href="mailto:' + esc(f.email) + esc(assunto) + '" title="Enviar e-mail">' + ICONES.email +
      '<span' + (opcoes.compacto ? ' class="sr-only"' : '') + '>' + (opcoes.compacto || opcoes.emailCurto ? 'E-mail' : esc(f.email)) + '</span></a>');
  }
  return partes.length ? '<div class="contatos">' + partes.join('') + '</div>' : '<span class="text-sm text-muted">Sem contato cadastrado</span>';
}

// CNPJ, site e endereço do fornecedor (quando houver)
function htmlDadosEmpresa(f) {
  var partes = [];
  if (f.cnpj) partes.push('<span><b>CNPJ</b> ' + esc(f.cnpj) + '</span>');
  if (f.site) {
    var url = /^https?:\/\//i.test(f.site) ? f.site : 'https://' + f.site;
    partes.push('<span><b>Site</b> <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(String(f.site).replace(/^https?:\/\//i, '')) + '</a></span>');
  }
  if (f.endereco) partes.push('<span><b>Endereço</b> ' + esc(f.endereco) + '</span>');
  return partes.length ? '<div class="forn-dados">' + partes.join('') + '</div>' : '';
}

function spec(rotulo, val, re, forte) {
  if (!val) return '';
  return '<span class="spec' + (forte ? ' forte' : '') + '"><b>' + esc(rotulo) + '</b>' + marcar(val, re) + '</span>';
}

function detalhesProdutoHTML(p) {
  var itens = [];
  CAMPOS_PRODUTO.forEach(function (c) {
    if (c[0] !== 'nome' && p[c[0]]) itens.push('<div><dt>' + esc(c[1]) + '</dt><dd>' + esc(p[c[0]]) + '</dd></div>');
  });
  var at = p.atributos || {};
  Object.keys(at).forEach(function (k) { if (at[k]) itens.push('<div><dt>' + esc(k) + '</dt><dd>' + esc(at[k]) + '</dd></div>'); });
  if (p.nome_arquivo || (p.catalogo && p.catalogo.nome_arquivo)) {
    itens.push('<div><dt>Catálogo</dt><dd>' + esc(p.nome_arquivo || p.catalogo.nome_arquivo) + '</dd></div>');
  }
  return itens.length ? '<dl class="detalhes-grid">' + itens.join('') + '</dl>' : '<p class="text-sm text-muted">Sem outros dados.</p>';
}

// ─── Preferências (tema e fonte) ──────────────────────────────────
function marcarPreferencias() {
  var tema = document.documentElement.getAttribute('data-theme') || 'dark';
  var fonte = document.documentElement.getAttribute('data-font-size') || 'padrao';
  Array.prototype.forEach.call(document.querySelectorAll('[data-acao="tema"]'), function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-valor') === tema ? 'true' : 'false');
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-acao="fonte"]'), function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-valor') === fonte ? 'true' : 'false');
  });
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'light' ? '#eef2fb' : (tema === 'matrix' ? '#000a00' : '#070b14'));
}
function mudarTema(tema) {
  if (['dark', 'light', 'matrix'].indexOf(tema) < 0) tema = 'dark';
  aplicarTema(tema);
  marcarPreferencias();
}
function mudarFonte(tamanho) {
  if (['pequeno', 'padrao', 'grande', 'muitogrande'].indexOf(tamanho) < 0) tamanho = 'padrao';
  document.documentElement.setAttribute('data-font-size', tamanho);
  gravarPref('lf_fonte', tamanho);
  marcarPreferencias();
}

// ─── Menu lateral ─────────────────────────────────────────────────
function aplicarMenuRecolhido(recolhido) {
  var sb = $('sidebar');
  var mc = $('main-content');
  sb.classList.toggle('collapsed', recolhido);
  mc.classList.toggle('sidebar-collapsed', recolhido);
  $('btn-menu').setAttribute('aria-expanded', recolhido ? 'false' : 'true');
  $('btn-menu').setAttribute('aria-label', recolhido ? 'Abrir o menu' : 'Recolher o menu');
  $('icone-menu').innerHTML = recolhido ? '<polyline points="9 18 15 12 9 6"/>' : '<polyline points="15 18 9 12 15 6"/>';
}
function alternarMenu() {
  if (ehMobile()) {
    var aberto = $('sidebar').classList.toggle('mobile-open');
    mostrar('mobile-overlay', aberto);
    $('btn-menu').setAttribute('aria-expanded', aberto ? 'true' : 'false');
    return;
  }
  var recolher = !$('sidebar').classList.contains('collapsed');
  aplicarMenuRecolhido(recolher);
  gravarPref('lf_menu', recolher ? 'recolhido' : 'aberto');
}
function fecharMenuMobile() {
  $('sidebar').classList.remove('mobile-open');
  mostrar('mobile-overlay', false);
  if (ehMobile()) $('btn-menu').setAttribute('aria-expanded', 'false');
}
function prepararMenu() {
  if (ehMobile()) {
    $('icone-menu').innerHTML = '<path d="M3 6h18M3 12h18M3 18h18"/>';
    $('btn-menu').setAttribute('aria-label', 'Abrir o menu');
    $('btn-menu').setAttribute('aria-expanded', 'false');
  } else {
    aplicarMenuRecolhido(lerPref('lf_menu', 'aberto') === 'recolhido');
  }
}

// ─── Navegação (endereço com # para o botão voltar funcionar) ──────
function navegar(destino) {
  var alvo = '#' + destino;
  if (window.location.hash === alvo) rotear();
  else window.location.hash = alvo;
}
function mostrarSecao(nome) {
  ESTADO.secao = nome;
  Array.prototype.forEach.call(document.querySelectorAll('.secao'), function (s) { s.classList.add('hidden'); });
  mostrar('secao-' + nome, true);
  var navAtivo = nome === 'detalhe' ? 'fornecedores' : nome;
  Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (b) {
    var ativo = b.getAttribute('data-secao') === navAtivo;
    b.classList.toggle('active', ativo);
    if (ativo) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('topbar-title').textContent = TITULOS[nome] || 'LicitaFácil';
  document.title = (TITULOS[nome] || 'LicitaFácil') + ' — LicitaFácil';
  if (nome !== 'detalhe') pararAcompanhamento();
  if (ESTADO.importacao && ESTADO.importacao.fase === 'concluido') descartarImportacao(true);
  fecharMenuMobile();
  window.scrollTo(0, 0);
}
function rotear() {
  if (!ESTADO.usuario) return;
  var partes = String(window.location.hash || '').replace(/^#\/?/, '').split('/');
  var secao = partes[0] || 'busca';
  if (secao === 'fornecedor' && /^\d+$/.test(partes[1] || '')) {
    mostrarSecao('detalhe');
    abrirFornecedor(parseInt(partes[1], 10), partes[2] || null);
    return;
  }
  if (['busca', 'importar', 'fornecedores', 'config', 'admin'].indexOf(secao) < 0) secao = 'busca';
  if (secao === 'admin' && !ESTADO.usuario.admin) secao = 'busca';
  mostrarSecao(secao);
  if (secao === 'busca') entrarBusca();
  else if (secao === 'importar') mostrarImportacao('importar');
  else if (secao === 'fornecedores') carregarFornecedores();
  else if (secao === 'config') renderConfig();
  else if (secao === 'admin') carregarAdmin();
}

// ─── Usuário, plano e avisos ───────────────────────────────────────
function textoPlanoCurto(u) {
  if (u.admin) return 'Administrador';
  var nome = NOMES_PLANO[u.plano] || u.plano || '—';
  if (u.acesso === 'expirado') return nome + ' · vencido';
  if (u.dias_restantes != null) return nome + ' · ' + u.dias_restantes + 'd';
  return nome;
}
function renderUsuario() {
  var u = ESTADO.usuario;
  if (!u) return;
  $('user-avatar').textContent = inicial(u.nome);
  $('user-nome').textContent = u.nome || u.email;
  var plano = $('user-plano');
  plano.textContent = textoPlanoCurto(u);
  plano.classList.toggle('alerta', !u.admin && (u.acesso !== 'ativo' || (u.dias_restantes != null && u.dias_restantes <= 3)));
  mostrar('nav-admin', !!u.admin);
  mostrar('nav-sep-admin', !!u.admin);
  renderBanners();
}
function renderBanners() {
  var u = ESTADO.usuario;
  var partes = [];
  if (!u || u.admin) { html('banners', ''); return; }
  if (u.acesso === 'expirado') {
    partes.push('<div class="banner erro" role="alert"><span><strong>Seu ' + (u.plano === 'trial' ? 'teste grátis terminou' : 'plano venceu') +
      '.</strong> Seus dados estão guardados. Para voltar a buscar e enviar catálogos, escolha um plano.</span>' +
      '<div class="acoes"><button type="button" class="btn btn-primary btn-sm" data-acao="ir" data-secao="config">Escolher plano</button></div></div>');
  } else if (u.dias_restantes != null && u.dias_restantes <= 3) {
    partes.push('<div class="banner alerta"><span>Faltam <strong>' + esc(u.dias_restantes) + ' ' + plural(u.dias_restantes, 'dia', 'dias') +
      '</strong> do seu ' + (u.plano === 'trial' ? 'teste grátis' : 'plano') + '.</span>' +
      '<div class="acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="ir" data-secao="config">Ver planos</button></div></div>');
  }
  if (u.pagamento_pendente) {
    partes.push('<div class="banner info"><span>Recebemos seu aviso de pagamento do plano <strong>' +
      esc(NOMES_PLANO[u.pagamento_pendente.plano] || u.pagamento_pendente.plano) + '</strong>. A liberação acontece em até 24 horas.</span></div>');
  }
  html('banners', partes.join(''));
}
function atualizarUsuario() {
  return apiGet('/api/auth/me').then(function (u) {
    ESTADO.usuario = u;
    renderUsuario();
    if (ESTADO.secao === 'config') renderConfig();
    return u;
  });
}
function aoPlanoExpirado() {
  if (ESTADO.usuario && ESTADO.usuario.acesso === 'ativo') {
    ESTADO.usuario.acesso = 'expirado';
    renderUsuario();
  }
  if (!ESTADO.avisoPlanoMostrado) {
    ESTADO.avisoPlanoMostrado = true;
    showToast('Seu período de acesso terminou. Escolha um plano em Configurações para continuar.', 'warning', 7000);
  }
}

// ─── Painel inicial: números e primeiros passos ─────────────────────
function carregarStats() {
  return apiGet('/api/busca/stats').then(function (s) {
    ESTADO.stats = s;
    $('st-fornecedores').textContent = numero(s.total_fornecedores);
    $('st-produtos').textContent = numero(s.total_produtos);
    $('st-catalogos').textContent = numero(s.total_catalogos);
    renderOnboarding();
    if (!$('resultados').innerHTML) renderBuscaInicial();
    return s;
  }).catch(function () { /* os números são opcionais */ });
}
function renderOnboarding() {
  var s = ESTADO.stats;
  if (!s || s.total_catalogos > 0) { html('onboarding', ''); return; }
  var temForn = s.total_fornecedores > 0;
  function etapa(n, feita, titulo, texto, botao) {
    return '<div class="etapa' + (feita ? ' feita' : '') + '"><div class="n">' + (feita ? 'FEITO ✓' : 'PASSO ' + n) + '</div><h4>' + titulo + '</h4><p>' + texto + '</p>' +
      (botao ? '<div class="mt-3">' + botao + '</div>' : '') + '</div>';
  }
  html('onboarding', '<div class="card mb-4 fade-in"><div class="card-header"><h2 class="card-title">Comece em 3 passos</h2></div><div class="onboarding">' +
    etapa(1, false, 'Importe um catálogo', 'Envie o PDF ou as fotos. A IA lê cada página, cadastra o fornecedor e organiza os produtos.',
      '<button type="button" class="btn btn-primary btn-sm" data-acao="ir" data-secao="importar">' + ICONES.enviar + 'Importar catálogo</button>') +
    etapa(2, false, 'Confira e salve', 'Veja os produtos e os dados do fornecedor encontrados antes de gravar. Nada é salvo sem você aprovar.', '') +
    etapa(3, false, 'Busque por especificação', 'Medida, norma ou código: “cabo PP 3x2,5mm”, “NBR 6148”, “PP-325”.', '') +
    '</div></div>');
}
function renderBuscaInicial() {
  var s = ESTADO.stats;
  if (s && s.total_catalogos === 0) { html('resultados', ''); return; }
  html('resultados', caixaVazia(ICONES.busca, 'Pronto para buscar',
    'Digite um produto, uma medida, uma norma ou um código. A busca entende <strong>3x2,5mm</strong>, <strong>3×2.5 mm²</strong> e <strong>NBR 6148</strong> do mesmo jeito.'));
}
function entrarBusca() {
  carregarStats();
  if (!ehMobile()) setTimeout(function () { var c = $('campo-busca'); if (c && ESTADO.secao === 'busca') c.focus(); }, 60);
}
function usarExemplo(texto) {
  $('campo-busca').value = texto;
  buscar();
}

// ─── Busca ──────────────────────────────────────────────────────────
function buscar(opcoes) {
  opcoes = opcoes || {};
  var q = valor('campo-busca').trim();
  if (q.length < 2) {
    showToast('Digite pelo menos 2 letras ou números.', 'warning');
    $('campo-busca').focus();
    return Promise.resolve(null);
  }
  if (!opcoes.manterIA) html('ia-area', '');
  var seq = ++ESTADO.buscaSeq;
  var btn = $('btn-buscar');
  setLoading(btn, true, 'Buscando…');
  html('resultados', carregando('Procurando “' + q + '” nos catálogos…'));
  return apiPost('/api/busca', { consulta: q, limite: 30, limite_produtos: 100 }, { timeout: 60000 }).then(function (r) {
    if (seq !== ESTADO.buscaSeq) return null;
    renderResultados(r, q);
    return r;
  }).catch(function (err) {
    if (seq !== ESTADO.buscaSeq) return null;
    if (err && err.code === 'PLANO_EXPIRADO') {
      html('resultados', caixaVazia(ICONES.alerta, 'Busca pausada', esc(msgErro(err)),
        '<button type="button" class="btn btn-primary" data-acao="ir" data-secao="config">Escolher plano</button>'));
    } else {
      html('resultados', caixaErro(msgErro(err, 'Não foi possível buscar agora.'), 'buscar-de-novo'));
    }
    return null;
  }).then(function (r) {
    setLoading(btn, false);
    return r;
  });
}

function linhaResultadoProduto(p, re) {
  var contato = htmlContatos(p.fornecedor, { compacto: true, produto: p.nome + (p.codigo ? ' (cód. ' + p.codigo + ')' : '') });
  var specs = spec('Medida', p.bitola, re, true) + spec('Tensão', p.tensao, re) + spec('Material', p.material, re) +
    spec('Marca', p.marca, re) + (p.norma ? '<span class="norma">' + marcar(p.norma, re) + '</span>' : '');
  var preco = p.preco ? '<div class="preco">' + esc(p.preco) + '</div>' + (p.unidade ? '<div class="unid">' + esc(p.unidade) + '</div>' : '')
    : '<span class="text-sm text-muted">sob consulta</span>';
  return '<tr>' +
    '<td><div class="prod-nome">' + marcar(p.nome, re) + '</div>' + (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : '') +
      (p.descricao ? '<div class="prod-desc">' + marcar(p.descricao, re) + '</div>' : '') + '</td>' +
    '<td><div class="specs">' + (specs || vazio()) + '</div></td>' +
    '<td class="num">' + preco + '</td>' +
    '<td><div class="forn-mini"><button type="button" class="link-btn nome" data-acao="ver-fornecedor" data-id="' + esc(p.fornecedor.id) + '">' +
      esc(p.fornecedor.nome) + '</button>' + contato + '</div></td>' +
    '<td class="centro"><span class="rel rel-' + esc(p.relevancia) + '" title="Quanto o produto combina com a busca">' + esc(p.score) + '%</span></td>' +
    '</tr>';
}
function cardResultadoProduto(p, re) {
  var specs = spec('Medida', p.bitola, re, true) + spec('Tensão', p.tensao, re) + spec('Material', p.material, re) +
    (p.norma ? '<span class="norma">' + marcar(p.norma, re) + '</span>' : '');
  return '<div class="p-card">' +
    '<div class="topo"><div><div class="prod-nome">' + marcar(p.nome, re) + '</div>' + (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : '') + '</div>' +
      '<span class="rel rel-' + esc(p.relevancia) + '">' + esc(p.score) + '%</span></div>' +
    (specs ? '<div class="specs">' + specs + '</div>' : '') +
    (p.preco ? '<div><span class="preco">' + esc(p.preco) + '</span> <span class="unid">' + esc(p.unidade || '') + '</span></div>' : '') +
    '<div class="forn-mini"><button type="button" class="link-btn nome" data-acao="ver-fornecedor" data-id="' + esc(p.fornecedor.id) + '">' + esc(p.fornecedor.nome) + '</button>' +
      htmlContatos(p.fornecedor, { produto: p.nome + (p.codigo ? ' (cód. ' + p.codigo + ')' : '') }) + '</div>' +
    '</div>';
}
// ─── Resultado da busca: primeiro QUEM TEM (por fornecedor, com contato), depois a comparação dos produtos ───
// Medida, tensão e norma que ainda não aparecem no nome (sem repetir o que já está escrito)
function resumoProdutoBusca(p) {
  var nome = normalizar(p.nome).replace(/\s+/g, '');
  return [p.bitola, p.tensao, p.norma].filter(function (v) {
    return v && nome.indexOf(normalizar(v).replace(/\s+/g, '')) < 0;
  }).join(' · ');
}
function seloRelevancia(item) {
  return '<span class="rel rel-' + esc(item.relevancia) + '" title="Quanto combina com a busca">' + esc(item.score) + '%</span>';
}
// Uma linha por fornecedor: nome, o que ele tem (até 3 produtos ou o trecho do catálogo) e o contato direto
function htmlLinhaFornecedor(f, q, prods, re) {
  var id = f.fornecedor_id || f.id;
  var exemplo = prods[0] ? prods[0].nome + (prods[0].codigo ? ' (cód. ' + prods[0].codigo + ')' : '') : '';
  var selo;
  var corpo = '';
  if (f.produtos_encontrados > 0) {
    selo = '<span class="badge badge-blue">' + numero(f.produtos_encontrados) + ' ' + plural(f.produtos_encontrados, 'produto', 'produtos') + '</span>';
    var mostrados = prods.slice(0, 3);
    corpo = '<ul class="rf-prods">' + mostrados.map(function (p) {
      var r = resumoProdutoBusca(p);
      return '<li><span class="rf-prod-nome">' + marcar(p.nome, re) + '</span>' +
        (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : '') +
        (r ? '<span class="rf-spec">' + marcar(r, re) + '</span>' : '') +
        (p.preco ? '<span class="rf-preco">' + esc(p.preco) + (p.unidade ? ' / ' + esc(p.unidade) : '') + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
    var resto = f.produtos_encontrados - mostrados.length;
    if (resto > 0) {
      corpo += '<button type="button" class="link-btn rf-mais" data-acao="ver-fornecedor" data-id="' + esc(id) + '">+ ' + numero(resto) + ' ' +
        plural(resto, 'outro produto', 'outros produtos') + ' deste fornecedor</button>';
    }
  } else if (f.trecho) {
    selo = '<span class="badge badge-yellow">citado no catálogo</span>';
    corpo = '<p class="rf-trecho">' + marcar(String(f.trecho).replace(/\s*\n\s*/g, ' · '), re) + '</p>' +
      (f.nome_arquivo ? '<div class="rf-arquivo">' + esc(f.nome_arquivo) + '</div>' : '');
  } else {
    var semCat = !f.total_catalogos;
    selo = semCat ? '<span class="badge badge-yellow">sem catálogo</span>'
      : '<span class="badge badge-blue">' + numero(f.total_catalogos) + ' ' + plural(f.total_catalogos, 'catálogo', 'catálogos') + '</span>';
    corpo = f.observacoes ? '<p class="rf-trecho">' + marcar(f.observacoes, re) + '</p>' : '';
  }
  var acoes = '';
  if (!f.produtos_encontrados && !f.trecho && !f.total_catalogos) {
    acoes = '<button type="button" class="btn btn-secondary btn-sm" data-acao="adicionar-catalogo" data-id="' + esc(id) + '">' + ICONES.enviar + 'Adicionar catálogo</button>';
  }
  return '<li class="res-forn-item">' +
    '<div class="rf-info"><div class="rf-topo"><button type="button" class="link-btn rf-nome" data-acao="ver-fornecedor" data-id="' + esc(id) + '">' + esc(f.nome) + '</button>' +
      selo + (f.relevancia && f.score != null && (f.produtos_encontrados || f.trecho) ? seloRelevancia(f) : '') + '</div>' + corpo + '</div>' +
    '<div class="rf-lado">' + htmlContatos(f, { emailCurto: true, produto: exemplo || q }) + acoes + '</div>' +
    '</li>';
}
function htmlListaFornecedores(lista, q, porForn, re) {
  return '<ul class="res-forn">' + lista.map(function (f) {
    return htmlLinhaFornecedor(f, q, porForn[f.fornecedor_id || f.id] || [], re);
  }).join('') + '</ul>';
}
function renderResultados(r, q) {
  var re = criarDestaque(q);
  var produtos = r.produtos || [];
  var porForn = {};
  produtos.forEach(function (p) {
    var id = p.fornecedor && p.fornecedor.id;
    if (id) (porForn[id] = porForn[id] || []).push(p);
  });
  var comProduto = (r.fornecedores || []).filter(function (f) { return f.produtos_encontrados > 0; });
  var citados = (r.fornecedores || []).filter(function (f) { return !f.produtos_encontrados && f.trecho; });
  var jaMostrados = {};
  (r.fornecedores || []).forEach(function (f) { jaMostrados[f.fornecedor_id] = 1; });
  var relacionados = (r.fornecedores_relacionados || []).filter(function (f) { return !jaMostrados[f.id]; });
  if (!produtos.length && !citados.length && !comProduto.length) {
    if (relacionados.length) {
      html('resultados', '<div class="fade-in"><div class="banner info mb-4"><span>Nenhum fornecedor cadastrado tem “' + esc(q) +
        '” no catálogo, mas estes trabalham com isso. Adicione o catálogo deles (ou cadastre o produto à mão) para ver medidas e preços.</span></div>' +
        '<div class="secao-titulo"><h3>Fornecedores do ramo</h3><span class="contagem">' + numero(relacionados.length) + ' ' + plural(relacionados.length, 'fornecedor', 'fornecedores') + '</span></div>' +
        htmlListaFornecedores(relacionados, q, {}, re) + '</div>');
      return;
    }
    var semCatalogo = ESTADO.stats && ESTADO.stats.total_catalogos === 0 && !ESTADO.stats.total_produtos;
    html('resultados', caixaVazia(ICONES.busca, semCatalogo ? 'Ainda não há catálogos para buscar' : 'Nenhum fornecedor cadastrado tem “' + q + '”',
      semCatalogo ? 'Importe o catálogo de um fornecedor (ou cadastre os produtos à mão) e a busca passa a encontrar os produtos dele.'
        : 'Tente só a medida (ex.: <strong>2,5mm</strong>), só a norma ou só o código. Confira também se o catálogo do fornecedor já foi importado.',
      '<button type="button" class="btn btn-primary" data-acao="ir" data-secao="importar">' + ICONES.enviar + 'Importar catálogo</button>'));
    return;
  }
  var partes = [];
  if (comProduto.length) {
    partes.push('<div class="quem-tem mb-4"><div class="secao-titulo"><h3>' + numero(comProduto.length) + ' ' +
      plural(comProduto.length, 'fornecedor tem', 'fornecedores têm') + ' “' + esc(q) + '”</h3>' +
      '<span class="contagem">contato direto para a cotação</span></div>' + htmlListaFornecedores(comProduto, q, porForn, re) + '</div>');
  }
  if (citados.length) {
    partes.push('<div class="mb-4"><div class="secao-titulo"><h3>' + (comProduto.length ? 'Também citam “' + esc(q) + '” no catálogo' : 'Citado nos catálogos de') +
      '</h3><span class="contagem">texto do catálogo, sem produto organizado</span></div>' + htmlListaFornecedores(citados, q, {}, re) + '</div>');
  }
  if (produtos.length) {
    partes.push('<div class="secao-titulo"><h3>Comparar produtos</h3><span class="contagem">' +
      (r.total_produtos > produtos.length ? 'mostrando ' + produtos.length + ' de ' + numero(r.total_produtos) : numero(produtos.length) + ' ' + plural(produtos.length, 'produto', 'produtos')) +
      '</span></div>');
    partes.push('<div class="tabela-produtos-wrap mb-4"><div class="table-wrap"><table class="tabela"><caption class="sr-only">Produtos encontrados para ' + esc(q) + '</caption>' +
      '<thead><tr><th scope="col">Produto</th><th scope="col">Especificações</th><th scope="col" class="num">Preço</th><th scope="col">Fornecedor</th><th scope="col" class="centro">Combina</th></tr></thead><tbody>' +
      produtos.map(function (p) { return linhaResultadoProduto(p, re); }).join('') + '</tbody></table></div>' +
      '<div class="lista-cards">' + produtos.map(function (p) { return cardResultadoProduto(p, re); }).join('') + '</div></div>');
  }
  if (relacionados.length) {
    partes.push('<div class="secao-titulo"><h3>Outros fornecedores do ramo</h3><span class="contagem">' + numero(relacionados.length) + ' ' +
      plural(relacionados.length, 'fornecedor', 'fornecedores') + '</span></div>' + htmlListaFornecedores(relacionados, q, {}, re));
  }
  html('resultados', '<div class="fade-in">' + partes.join('') + '</div>');
}

function perguntarIA() {
  var q = valor('campo-busca').trim();
  if (q.length < 2) {
    showToast('Escreva sua pergunta no campo de busca. Ex.: “quem tem cabo PP 3x2,5mm mais barato?”', 'warning', 5000);
    $('campo-busca').focus();
    return;
  }
  var seq = ++ESTADO.iaSeq;
  var btn = $('btn-ia');
  setLoading(btn, true, 'Pensando…');
  html('ia-area', '<div class="ia-card fade-in"><div class="ia-header"><div class="ia-rotulo"><span class="ia-dot" aria-hidden="true"></span>Resposta da IA</div></div>' +
    carregando('Lendo os catálogos para responder…') + '</div>');
  buscar({ manterIA: true });
  apiPost('/api/busca/responder', { consulta: q }, { timeout: 120000 }).then(function (r) {
    if (seq !== ESTADO.iaSeq) return;
    var fontes = (r.fontes || []).map(function (f) {
      return '<button type="button" class="chip-btn" data-acao="ver-fornecedor" data-id="' + esc(f.fornecedor_id) + '">' + esc(f.nome) + '</button>';
    }).join('');
    var meta = r.sem_resultado ? '' : (r.fallback ? 'Resumo automático — a IA gratuita não respondeu agora' : 'Gerado por IA a partir dos seus catálogos');
    html('ia-area', '<div class="ia-card fade-in"><div class="ia-header"><div class="ia-rotulo"><span class="ia-dot" aria-hidden="true"></span>' +
      (r.fallback ? 'Resumo dos catálogos' : 'Resposta da IA') + '</div>' + (meta ? '<span class="ia-meta">' + esc(meta) + '</span>' : '') + '</div>' +
      '<div class="ia-texto">' + esc(r.resposta) + '</div>' +
      (fontes ? '<div class="ia-fontes"><span class="ia-meta">Fornecedores citados:</span>' + fontes + '</div>' : '') + '</div>');
  }).catch(function (err) {
    if (seq !== ESTADO.iaSeq) return;
    html('ia-area', caixaErro(msgErro(err, 'A IA não respondeu agora.'), 'perguntar-ia'));
  }).then(function () { setLoading(btn, false); });
}

// ─── Fornecedores ───────────────────────────────────────────────────
function carregarFornecedores() {
  if (!ESTADO.fornecedoresCarregados) html('lista-fornecedores', carregando('Carregando fornecedores…'));
  return apiGet('/api/fornecedores?por_pagina=200').then(function (r) {
    ESTADO.fornecedores = r.fornecedores || [];
    ESTADO.fornecedoresCarregados = true;
    renderFornecedores();
    return ESTADO.fornecedores;
  }).catch(function (err) {
    html('lista-fornecedores', caixaErro(msgErro(err, 'Não foi possível carregar os fornecedores.'), 'recarregar-fornecedores'));
  });
}
function renderFornecedores() {
  var filtro = normalizar(valor('filtro-fornecedores'));
  var lista = ESTADO.fornecedores.filter(function (f) {
    if (!filtro) return true;
    return normalizar([f.nome, f.email, f.telefone, f.whatsapp, f.observacoes, f.cnpj, f.site].join(' ')).indexOf(filtro) >= 0;
  });
  var total = ESTADO.fornecedores.length;
  $('contagem-fornecedores').textContent = total ? (filtro ? lista.length + ' de ' + total : total + ' ' + plural(total, 'fornecedor', 'fornecedores')) : '';
  if (!total) {
    html('lista-fornecedores', caixaVazia(ICONES.predio, 'Nenhum fornecedor ainda',
      'Comece pelo catálogo: a IA lê o PDF, cadastra o fornecedor e organiza os produtos. Você confere antes de salvar.',
      '<button type="button" class="btn btn-primary" data-acao="ir" data-secao="importar">' + ICONES.enviar + 'Importar catálogo</button>' +
      '<button type="button" class="btn btn-secondary" data-acao="novo-fornecedor">' + ICONES.mais + 'Cadastrar sem catálogo</button>'));
    return;
  }
  if (!lista.length) {
    html('lista-fornecedores', caixaVazia(ICONES.busca, 'Nenhum fornecedor com esse filtro', 'Confira o que foi digitado ou limpe o filtro.'));
    return;
  }
  var linhas = lista.map(function (f) {
    return '<tr>' +
      '<td><button type="button" class="link-btn cell-nome" data-acao="ver-fornecedor" data-id="' + esc(f.id) + '">' + esc(f.nome) + '</button>' +
        (f.observacoes ? '<div class="cell-sub">' + esc(truncate(f.observacoes, 90)) + '</div>' : '') + '</td>' +
      '<td>' + htmlContatos(f, { compacto: true }) + '</td>' +
      '<td class="centro"><span class="badge ' + (f.total_produtos ? 'badge-green' : 'badge-gray') + '">' + numero(f.total_produtos) + '</span></td>' +
      '<td class="centro"><span class="badge ' + (f.total_catalogos ? 'badge-blue' : 'badge-gray') + '">' + numero(f.total_catalogos) + '</span></td>' +
      '<td class="acoes">' +
        '<button type="button" class="btn btn-primary btn-sm" data-acao="ver-fornecedor" data-id="' + esc(f.id) + '">Abrir</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-acao="editar-fornecedor" data-id="' + esc(f.id) + '" aria-label="Editar ' + esc(f.nome) + '">' + ICONES.editar + '</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-acao="excluir-fornecedor" data-id="' + esc(f.id) + '" aria-label="Excluir ' + esc(f.nome) + '">' + ICONES.lixo + '</button>' +
      '</td></tr>';
  }).join('');
  var cards = lista.map(function (f) {
    return '<div class="p-card"><div class="topo"><div><button type="button" class="link-btn prod-nome" data-acao="ver-fornecedor" data-id="' + esc(f.id) + '">' + esc(f.nome) + '</button>' +
      (f.observacoes ? '<div class="cell-sub">' + esc(truncate(f.observacoes, 90)) + '</div>' : '') + '</div>' +
      '<span class="badge ' + (f.total_produtos ? 'badge-green' : 'badge-gray') + '">' + numero(f.total_produtos) + ' ' + plural(f.total_produtos, 'produto', 'produtos') + '</span></div>' +
      htmlContatos(f, { compacto: false }) +
      '<div class="flex gap-2"><button type="button" class="btn btn-primary btn-sm" data-acao="ver-fornecedor" data-id="' + esc(f.id) + '">Abrir</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-acao="editar-fornecedor" data-id="' + esc(f.id) + '">' + ICONES.editar + 'Editar</button>' +
      '<button type="button" class="btn btn-danger btn-sm" data-acao="excluir-fornecedor" data-id="' + esc(f.id) + '">' + ICONES.lixo + 'Excluir</button></div></div>';
  }).join('');
  html('lista-fornecedores', '<div class="tabela-produtos-wrap fade-in"><div class="table-wrap"><table class="tabela"><caption class="sr-only">Seus fornecedores</caption>' +
    '<thead><tr><th scope="col">Fornecedor</th><th scope="col">Contato</th><th scope="col" class="centro">Produtos</th><th scope="col" class="centro">Catálogos</th><th scope="col" class="acoes"><span class="sr-only">Ações</span></th></tr></thead>' +
    '<tbody>' + linhas + '</tbody></table></div><div class="lista-cards">' + cards + '</div></div>');
}
function acharFornecedor(id) {
  id = parseInt(id, 10);
  if (ESTADO.fornecedor && ESTADO.fornecedor.id === id) return ESTADO.fornecedor;
  for (var i = 0; i < ESTADO.fornecedores.length; i++) if (ESTADO.fornecedores[i].id === id) return ESTADO.fornecedores[i];
  return null;
}

function abrirModalFornecedor(id) {
  var f = id ? acharFornecedor(id) : null;
  if (id && !f) {
    apiGet('/api/fornecedores/' + id).then(function (det) { ESTADO.fornecedores.push(det); abrirModalFornecedor(id); })
      .catch(function (err) { showToast(msgErro(err, 'Fornecedor não encontrado.'), 'error'); });
    return;
  }
  $('modal-fornecedor-titulo').textContent = f ? 'Editar fornecedor' : 'Novo fornecedor';
  $('btn-salvar-fornecedor').textContent = f ? 'Salvar alterações' : 'Salvar e adicionar catálogo';
  $('forn-id').value = f ? f.id : '';
  $('forn-nome').value = f ? (f.nome || '') : '';
  $('forn-telefone').value = f ? (f.telefone || '') : '';
  $('forn-whatsapp').value = f ? (f.whatsapp || '') : '';
  $('forn-email').value = f ? (f.email || '') : '';
  $('forn-cnpj').value = f ? (f.cnpj || '') : '';
  $('forn-site').value = f ? (f.site || '') : '';
  $('forn-endereco').value = f ? (f.endereco || '') : '';
  $('forn-obs').value = f ? (f.observacoes || '') : '';
  mostrar('forn-erro', false);
  openModal('modal-fornecedor');
}
function salvarFornecedor(e) {
  if (e) e.preventDefault();
  var id = valor('forn-id');
  var dados = {
    nome: valor('forn-nome').trim(), telefone: valor('forn-telefone').trim(), whatsapp: valor('forn-whatsapp').trim(),
    email: valor('forn-email').trim(), observacoes: valor('forn-obs').trim(),
    cnpj: valor('forn-cnpj').trim(), site: valor('forn-site').trim(), endereco: valor('forn-endereco').trim()
  };
  var erroEl = $('forn-erro');
  function falhar(msg, campo) {
    erroEl.textContent = msg;
    mostrar(erroEl, true);
    if (campo) $(campo).focus();
  }
  if (!dados.nome) return falhar('Informe o nome do fornecedor.', 'forn-nome');
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email)) return falhar('Confira o e-mail: ele parece incompleto.', 'forn-email');
  if (dados.whatsapp && dados.whatsapp.replace(/\D/g, '').length < 10) return falhar('Informe o WhatsApp com DDD. Ex.: (11) 99999-9999', 'forn-whatsapp');
  if (dados.cnpj && !cnpjValido(dados.cnpj)) return falhar(msgCNPJ(dados.cnpj), 'forn-cnpj');
  mostrar(erroEl, false);
  var btn = $('btn-salvar-fornecedor');
  setLoading(btn, true, 'Salvando…');
  var req = id ? apiPut('/api/fornecedores/' + id, dados) : apiPost('/api/fornecedores', dados);
  req.then(function (r) {
    setLoading(btn, false);
    closeModal('modal-fornecedor');
    ESTADO.fornecedoresCarregados = false;
    if (id) {
      showToast('Fornecedor atualizado.', 'success');
      if (ESTADO.fornecedor && String(ESTADO.fornecedor.id) === String(id)) {
        Object.keys(r.fornecedor || {}).forEach(function (k) { ESTADO.fornecedor[k] = r.fornecedor[k]; });
        renderCabecalhoFornecedor();
      }
      if (ESTADO.secao === 'fornecedores') carregarFornecedores();
    } else {
      showToast('Fornecedor cadastrado. Agora adicione o catálogo dele.', 'success', 5000);
      navegar('fornecedor/' + r.fornecedor.id + '/adicionar');
    }
    carregarStats();
  }).catch(function (err) {
    setLoading(btn, false);
    falhar(msgErro(err, 'Não foi possível salvar.'));
  });
}
function pedirExclusaoFornecedor(id) {
  var f = acharFornecedor(id);
  var nome = f ? f.nome : 'este fornecedor';
  confirmar('Excluir fornecedor', 'Excluir “' + nome + '”? Os catálogos e produtos dele deixam de aparecer na busca.', 'Excluir fornecedor', function () {
    return apiDelete('/api/fornecedores/' + id).then(function () {
      showToast('Fornecedor excluído.', 'success');
      ESTADO.fornecedores = ESTADO.fornecedores.filter(function (x) { return String(x.id) !== String(id); });
      carregarStats();
      if (ESTADO.secao === 'detalhe') navegar('fornecedores'); else renderFornecedores();
    });
  });
}

// ─── Detalhe do fornecedor ─────────────────────────────────────────
function abrirFornecedor(id, aba) {
  var mesmo = ESTADO.fornecedor && ESTADO.fornecedor.id === id;
  ESTADO.fornecedorId = id;
  if (!mesmo) {
    ESTADO.fornecedor = null;
    ESTADO.produtos = [];
    $('det-migalha').textContent = '…';
    html('det-header', '<div class="forn-header"><div class="skeleton" style="width:56px;height:56px"></div><div><div class="skeleton" style="height:22px;width:240px"></div><div class="skeleton mt-2" style="height:14px;width:160px"></div></div></div>');
    html('tbody-produtos', '');
    html('cards-produtos', '');
    html('lista-catalogos', '');
    html('resultado-colar', '');
    $('filtro-produtos').value = '';
    mostrar('produtos-conteudo', false);
    html('produtos-vazio', carregando('Carregando produtos…'));
    mostrar('produtos-vazio', true);
  }
  mudarAba(aba && ['produtos', 'catalogos', 'adicionar'].indexOf(aba) >= 0 ? aba : 'produtos', true);
  carregarDetalhe(id);
}
function carregarDetalhe(id, opcoes) {
  opcoes = opcoes || {};
  return apiGet('/api/fornecedores/' + id).then(function (f) {
    if (ESTADO.secao !== 'detalhe') return;
    var antes = ESTADO.fornecedor;
    var produtosMudaram = !antes || antes.id !== f.id || antes.total_produtos !== f.total_produtos ||
      JSON.stringify((antes.catalogos || []).map(function (c) { return c.id + ':' + c.total_produtos; })) !==
      JSON.stringify((f.catalogos || []).map(function (c) { return c.id + ':' + c.total_produtos; }));
    ESTADO.fornecedor = f;
    renderCabecalhoFornecedor();
    renderCatalogos();
    if (produtosMudaram || !opcoes.silencioso) carregarProdutos();
    acompanharCatalogos();
  }).catch(function (err) {
    if (err && err.status === 404) {
      showToast('Fornecedor não encontrado.', 'error');
      navegar('fornecedores');
      return;
    }
    if (!opcoes.silencioso) html('det-header', caixaErro(msgErro(err, 'Não foi possível abrir o fornecedor.'), 'recarregar-detalhe'));
  });
}
function renderCabecalhoFornecedor() {
  var f = ESTADO.fornecedor;
  if (!f) return;
  $('det-migalha').textContent = f.nome;
  if (ESTADO.secao === 'detalhe') {
    $('topbar-title').textContent = f.nome;
    document.title = f.nome + ' — LicitaFácil';
  }
  html('det-header', '<div class="forn-header fade-in"><div class="forn-avatar" aria-hidden="true">' + esc(inicial(f.nome)) + '</div>' +
    '<div><h2 class="forn-nome-big" id="det-nome">' + esc(f.nome) + '</h2>' +
    '<p class="forn-espec">' + (f.observacoes ? esc(f.observacoes) : 'Sem especialidade cadastrada.') + '</p>' + htmlDadosEmpresa(f) + htmlContatos(f) + '</div>' +
    '<button type="button" class="btn btn-secondary" data-acao="editar-fornecedor" data-id="' + esc(f.id) + '">' + ICONES.editar + 'Editar</button></div>');
  $('badge-produtos').textContent = numero(f.total_produtos || 0);
  $('badge-catalogos').textContent = numero((f.catalogos || []).length);
}

function mudarAba(aba, semFoco) {
  ESTADO.aba = aba;
  ['produtos', 'catalogos', 'adicionar'].forEach(function (a) {
    var ativo = a === aba;
    var b = $('aba-' + a);
    b.setAttribute('aria-selected', ativo ? 'true' : 'false');
    b.setAttribute('tabindex', ativo ? '0' : '-1');
    mostrar('painel-' + a, ativo);
  });
  if (!semFoco) $('aba-' + aba).focus();
  if (aba === 'adicionar') mostrarImportacao('fornecedor');
  else if (ESTADO.importacao && ESTADO.importacao.fase === 'concluido' && ESTADO.importacao.ctx.tela === 'fornecedor') descartarImportacao(true);
  if (ESTADO.fornecedor) {
    var alvo = '#fornecedor/' + ESTADO.fornecedor.id + (aba === 'produtos' ? '' : '/' + aba);
    if (window.location.hash !== alvo && window.history && window.history.replaceState) window.history.replaceState(null, '', alvo);
  }
}
function teclasAbas(e) {
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(e.key) < 0) return;
  var ordem = ['produtos', 'catalogos', 'adicionar'];
  var i = ordem.indexOf(ESTADO.aba);
  if (e.key === 'ArrowRight') i = (i + 1) % ordem.length;
  else if (e.key === 'ArrowLeft') i = (i + ordem.length - 1) % ordem.length;
  else if (e.key === 'Home') i = 0;
  else i = ordem.length - 1;
  e.preventDefault();
  mudarAba(ordem[i]);
}

// Produtos do fornecedor
function carregarProdutos() {
  var f = ESTADO.fornecedor;
  if (!f) return Promise.resolve();
  return apiGet('/api/fornecedores/' + f.id + '/produtos').then(function (r) {
    if (!ESTADO.fornecedor || ESTADO.fornecedor.id !== f.id) return;
    ESTADO.produtos = (r.produtos || []).map(prepararProduto);
    ESTADO.produtosLimite = 200;
    $('badge-produtos').textContent = numero(ESTADO.produtos.length);
    renderProdutos();
  }).catch(function (err) {
    mostrar('produtos-conteudo', false);
    html('produtos-vazio', caixaErro(msgErro(err, 'Não foi possível carregar os produtos.'), 'recarregar-detalhe'));
    mostrar('produtos-vazio', true);
  });
}
function prepararProduto(p) {
  var at = p.atributos || {};
  p._busca = normalizar(CAMPOS_PRODUTO.map(function (c) { return p[c[0]] || ''; }).join(' ') + ' ' +
    Object.keys(at).map(function (k) { return k + ' ' + at[k]; }).join(' '));
  return p;
}
function filtrarProdutos() {
  var termos = normalizar(valor('filtro-produtos')).split(' ').filter(Boolean);
  ESTADO.produtosFiltrados = !termos.length ? ESTADO.produtos : ESTADO.produtos.filter(function (p) {
    for (var i = 0; i < termos.length; i++) if (p._busca.indexOf(termos[i]) < 0) return false;
    return true;
  });
  return termos;
}
function renderProdutos() {
  var f = ESTADO.fornecedor;
  if (!ESTADO.produtos.length) {
    mostrar('produtos-conteudo', false);
    var cats = (f && f.catalogos) || [];
    var processando = cats.some(function (c) { return IA_ATIVA.indexOf(c.ia_status) >= 0; });
    var comTexto = cats.filter(function (c) { return c.status === 'processado'; }).length;
    var texto = processando ? 'A IA está organizando os produtos do catálogo. A tabela aparece aqui sozinha quando terminar.'
      : comTexto ? 'O catálogo foi lido e já aparece na busca, mas não estava no formato do Prompt Mestre. Para ter a tabela de produtos, use “Colar a resposta da IA” ou “Organizar com IA” na aba Catálogos.'
        : 'Envie o catálogo deste fornecedor (PDF, escaneado ou foto) ou cole a resposta do Prompt Mestre.';
    html('produtos-vazio', caixaVazia(processando ? '<span class="spinner spinner-lg"></span>' : ICONES.caixa,
      processando ? 'Organizando os produtos…' : 'Nenhum produto organizado ainda', texto,
      '<button type="button" class="btn btn-primary" data-acao="aba" data-aba="adicionar">' + ICONES.enviar + 'Adicionar catálogo</button>' +
      '<button type="button" class="btn btn-secondary" data-acao="novo-produto">' + ICONES.mais + 'Cadastrar produto à mão</button>' +
      (comTexto ? '<button type="button" class="btn btn-secondary" data-acao="aba" data-aba="catalogos">Ver catálogos</button>' : '')));
    mostrar('produtos-vazio', true);
    return;
  }
  mostrar('produtos-vazio', false);
  mostrar('produtos-conteudo', true);
  var termos = filtrarProdutos();
  var lista = ESTADO.produtosFiltrados;
  var re = criarDestaque(valor('filtro-produtos'));
  var visiveis = lista.slice(0, ESTADO.produtosLimite);
  $('contagem-produtos').textContent = termos.length ? numero(lista.length) + ' de ' + numero(ESTADO.produtos.length) + ' produtos'
    : numero(ESTADO.produtos.length) + ' ' + plural(ESTADO.produtos.length, 'produto', 'produtos');
  if (!lista.length) {
    html('tbody-produtos', '<tr><td colspan="9">' + caixaVazia(ICONES.busca, 'Nenhum produto com esse filtro', 'Tente só a medida, o código ou parte do nome.') + '</td></tr>');
    html('cards-produtos', caixaVazia(ICONES.busca, 'Nenhum produto com esse filtro', 'Tente só a medida, o código ou parte do nome.'));
    html('produtos-mais', '');
    return;
  }
  html('tbody-produtos', visiveis.map(function (p, i) {
    return '<tr>' +
      '<td class="num text-muted">' + (i + 1) + '</td>' +
      '<td><div class="prod-nome">' + marcar(p.nome, re) + '</div>' + (p.descricao ? '<div class="prod-desc">' + marcar(p.descricao, re) + '</div>' : '') +
        (p.categoria ? '<div class="cell-sub">' + esc(p.categoria) + '</div>' : '') + '</td>' +
      '<td>' + (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : vazio()) + '</td>' +
      '<td>' + (p.bitola ? marcar(p.bitola, re) : vazio()) + '</td>' +
      '<td>' + (p.tensao ? marcar(p.tensao, re) : vazio()) + '</td>' +
      '<td>' + (p.material ? marcar(p.material, re) : vazio()) + '</td>' +
      '<td>' + (p.norma ? '<span class="norma">' + marcar(p.norma, re) + '</span>' : vazio()) + '</td>' +
      '<td class="num">' + (p.preco ? '<div class="preco">' + esc(p.preco) + '</div>' : '') + (p.unidade ? '<div class="unid">' + esc(p.unidade) + '</div>' : '') + (!p.preco && !p.unidade ? vazio() : '') + '</td>' +
      '<td class="acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="detalhes-produto" data-pid="' + esc(p.id) + '" aria-expanded="false">Detalhes</button>' +
        botoesProduto(p) + '</td>' +
      '</tr>';
  }).join(''));
  html('cards-produtos', visiveis.map(function (p) {
    var specs = spec('Medida', p.bitola, re, true) + spec('Tensão', p.tensao, re) + spec('Material', p.material, re) + (p.norma ? '<span class="norma">' + marcar(p.norma, re) + '</span>' : '');
    return '<div class="p-card"><div class="topo"><div><div class="prod-nome">' + marcar(p.nome, re) + '</div>' + (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : '') + '</div>' +
      (p.preco ? '<div class="num"><div class="preco">' + esc(p.preco) + '</div><div class="unid">' + esc(p.unidade || '') + '</div></div>' : '') + '</div>' +
      (specs ? '<div class="specs">' + specs + '</div>' : '') +
      '<details><summary>Ver todos os dados</summary>' + detalhesProdutoHTML(p) + '</details>' +
      '<div class="p-card-acoes">' + botoesProduto(p, true) + '</div></div>';
  }).join(''));
  var resto = lista.length - visiveis.length;
  html('produtos-mais', resto > 0 ? '<button type="button" class="btn btn-secondary btn-full" data-acao="mais-produtos">Mostrar mais ' +
    numero(Math.min(200, resto)) + ' (faltam ' + numero(resto) + ')</button>' : '');
}
function alternarDetalhesProduto(botao) {
  var pid = botao.getAttribute('data-pid');
  var tr = botao.closest('tr');
  var aberto = botao.getAttribute('aria-expanded') === 'true';
  var proxima = tr.nextElementSibling;
  if (aberto) {
    if (proxima && proxima.classList.contains('linha-detalhe')) proxima.remove();
    botao.setAttribute('aria-expanded', 'false');
    botao.textContent = 'Detalhes';
    return;
  }
  var p = null;
  for (var i = 0; i < ESTADO.produtos.length; i++) if (String(ESTADO.produtos[i].id) === String(pid)) { p = ESTADO.produtos[i]; break; }
  if (!p) return;
  var linha = document.createElement('tr');
  linha.className = 'linha-detalhe';
  linha.innerHTML = '<td colspan="9">' + detalhesProdutoHTML(p) + '</td>';
  tr.parentNode.insertBefore(linha, tr.nextSibling);
  botao.setAttribute('aria-expanded', 'true');
  botao.textContent = 'Fechar';
}
// ─── Produto cadastrado à mão (e correção do que a IA leu) ─────────
var CAMPOS_FORM_PRODUTO = ['nome', 'codigo', 'bitola', 'tensao', 'marca', 'preco', 'unidade', 'categoria', 'norma',
  'material', 'isolamento', 'cobertura', 'temperatura', 'aplicacao', 'certificacoes', 'descricao'];
var CAMPOS_MAIS_DADOS = ['material', 'isolamento', 'cobertura', 'temperatura', 'aplicacao', 'certificacoes', 'descricao'];

function botoesProduto(p, comTexto) {
  return '<button type="button" class="btn btn-ghost btn-sm' + (comTexto ? '' : ' btn-icon') + '" data-acao="editar-produto" data-pid="' + esc(p.id) + '" aria-label="Editar ' + esc(p.nome) + '" title="Editar">' +
      ICONES.editar + (comTexto ? 'Editar' : '') + '</button>' +
    '<button type="button" class="btn btn-ghost btn-sm' + (comTexto ? '' : ' btn-icon') + ' btn-perigo-texto" data-acao="excluir-produto" data-pid="' + esc(p.id) + '" aria-label="Excluir ' + esc(p.nome) + '" title="Excluir">' +
      ICONES.lixo + (comTexto ? 'Excluir' : '') + '</button>';
}
function acharProduto(pid) {
  for (var i = 0; i < ESTADO.produtos.length; i++) if (String(ESTADO.produtos[i].id) === String(pid)) return ESTADO.produtos[i];
  return null;
}
// "Rótulo: valor" por linha ⇄ atributos
function atributosParaTexto(at) {
  at = at || {};
  return Object.keys(at).map(function (k) { return k + ': ' + at[k]; }).join('\n');
}
function textoParaAtributos(t) {
  var at = {};
  var soltos = [];
  String(t || '').split(/\r?\n/).forEach(function (linha) {
    linha = linha.trim();
    if (!linha) return;
    var i = linha.indexOf(':');
    if (i > 0 && i < 80 && linha.slice(i + 1).trim()) at[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    else soltos.push(linha);
  });
  if (soltos.length) at['Observação'] = soltos.join('; ');
  return at;
}
function abrirModalProduto(pid) {
  var f = ESTADO.fornecedor;
  if (!f) return;
  var p = pid ? acharProduto(pid) : null;
  if (pid && !p) { showToast('Produto não encontrado. Atualize a página.', 'error'); return; }
  $('modal-produto-titulo').textContent = p ? 'Editar produto' : 'Novo produto';
  $('prod-fornecedor').textContent = (p ? 'Fornecedor: ' : 'Será cadastrado em: ') + f.nome + (p && p.nome_arquivo ? ' · ' + p.nome_arquivo : '');
  $('prod-id').value = p ? p.id : '';
  CAMPOS_FORM_PRODUTO.forEach(function (c) { $('prod-' + c).value = p ? (p[c] || '') : ''; });
  $('prod-atributos').value = p ? atributosParaTexto(p.atributos) : '';
  // "mais dados" abre sozinho quando o produto já tem algum deles
  $('prod-mais').open = !!(p && (CAMPOS_MAIS_DADOS.some(function (c) { return p[c]; }) || Object.keys(p.atributos || {}).length));
  mostrar('btn-produto-outro', !p);
  $('btn-salvar-produto').textContent = p ? 'Salvar alterações' : 'Salvar produto';
  mostrar('prod-erro', false);
  openModal('modal-produto');
}
function salvarProdutoManual(e, outro) {
  if (e) e.preventDefault();
  var f = ESTADO.fornecedor;
  if (!f) return;
  var pid = valor('prod-id');
  var dados = {};
  CAMPOS_FORM_PRODUTO.forEach(function (c) { dados[c] = valor('prod-' + c).trim(); });
  dados.atributos = textoParaAtributos(valor('prod-atributos'));
  var erroEl = $('prod-erro');
  if (!dados.nome) {
    erroEl.textContent = 'Informe o nome do produto.';
    mostrar(erroEl, true);
    $('prod-nome').focus();
    return;
  }
  mostrar(erroEl, false);
  var btn = outro ? $('btn-produto-outro') : $('btn-salvar-produto');
  setLoading(btn, true, 'Salvando…');
  var req = pid ? apiPut('/api/fornecedores/' + f.id + '/produtos/' + pid, dados) : apiPost('/api/fornecedores/' + f.id + '/produtos', dados);
  req.then(function (r) {
    setLoading(btn, false);
    var prod = prepararProduto(r.produto);
    var i = -1;
    for (var k = 0; k < ESTADO.produtos.length; k++) if (String(ESTADO.produtos[k].id) === String(prod.id)) { i = k; break; }
    if (i >= 0) ESTADO.produtos[i] = prod; else ESTADO.produtos.unshift(prod);
    $('badge-produtos').textContent = numero(ESTADO.produtos.length);
    renderProdutos();
    carregarStats();
    if (outro) {
      // mantém família, marca, categoria, tensão, norma e unidade: só muda o que varia de um item para o outro
      ['nome', 'codigo', 'bitola', 'preco'].forEach(function (c) { $('prod-' + c).value = ''; });
      $('prod-nome').focus();
      showToast('“' + prod.nome + '” salvo. Pode cadastrar o próximo.', 'success');
    } else {
      closeModal('modal-produto');
      showToast(pid ? 'Produto atualizado.' : 'Produto cadastrado e pronto para a busca.', 'success');
    }
    carregarDetalhe(f.id, { silencioso: true });
  }).catch(function (err) {
    setLoading(btn, false);
    erroEl.textContent = msgErro(err, 'Não foi possível salvar o produto.');
    mostrar(erroEl, true);
  });
}
function pedirExclusaoProduto(pid) {
  var f = ESTADO.fornecedor;
  var p = acharProduto(pid);
  if (!f || !p) return;
  confirmar('Excluir produto', 'Excluir “' + p.nome + '”? Ele deixa de aparecer na busca.', 'Excluir produto', function () {
    return apiDelete('/api/fornecedores/' + f.id + '/produtos/' + pid).then(function () {
      ESTADO.produtos = ESTADO.produtos.filter(function (x) { return String(x.id) !== String(pid); });
      $('badge-produtos').textContent = numero(ESTADO.produtos.length);
      renderProdutos();
      carregarStats();
      carregarDetalhe(f.id, { silencioso: true });
      showToast('Produto excluído.', 'success');
    });
  });
}

function celulaCSV(v) {
  var s = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
  if (/^[=@]/.test(s) || /^[+\-][^\d\s]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
function exportarProdutosCSV() {
  var lista = ESTADO.produtosFiltrados.length ? ESTADO.produtosFiltrados : ESTADO.produtos;
  if (!lista.length) { showToast('Não há produtos para baixar.', 'warning'); return; }
  var cab = CAMPOS_PRODUTO.map(function (c) { return c[1]; }).concat(['Outros dados', 'Catálogo', 'Fornecedor']);
  var linhas = [cab.map(celulaCSV).join(';')];
  lista.forEach(function (p) {
    var at = p.atributos || {};
    var outros = Object.keys(at).map(function (k) { return k + ': ' + at[k]; }).join(' | ');
    linhas.push(CAMPOS_PRODUTO.map(function (c) { return celulaCSV(p[c[0]]); })
      .concat([celulaCSV(outros), celulaCSV(p.nome_arquivo), celulaCSV(ESTADO.fornecedor ? ESTADO.fornecedor.nome : '')]).join(';'));
  });
  var nome = 'produtos-' + normalizar(ESTADO.fornecedor ? ESTADO.fornecedor.nome : 'fornecedor').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv';
  baixarArquivo(nome, '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
  showToast('Planilha baixada (' + numero(lista.length) + ' produtos). Abre no Excel e no Google Planilhas.', 'success');
}

// Catálogos do fornecedor
function textoStatusCatalogo(c) {
  if (c.status === 'processado') return '<span class="badge badge-green">' + ICONES.ok.replace('<svg ', '<svg width="12" height="12" ') + 'Lido</span>';
  if (c.status === 'erro') return '<span class="badge badge-red">Erro</span>';
  return '<span class="badge badge-yellow">Processando</span>';
}
function renderCatalogos() {
  var f = ESTADO.fornecedor;
  var cats = (f && f.catalogos) || [];
  if (!cats.length) {
    html('lista-catalogos', caixaVazia(ICONES.arquivo, 'Nenhum catálogo ainda', 'Os catálogos enviados aparecem aqui, com a quantidade de produtos lidos de cada um.',
      '<button type="button" class="btn btn-primary" data-acao="aba" data-aba="adicionar">' + ICONES.enviar + 'Adicionar catálogo</button>'));
    return;
  }
  html('lista-catalogos', cats.map(function (c) {
    var meta = [dataHoraBR(c.criado_em)];
    if (c.paginas) meta.push(c.paginas + ' ' + plural(c.paginas, 'página', 'páginas'));
    meta.push(ORIGENS[c.origem] || 'Envio antigo');
    if (c.formato && FORMATOS[c.formato]) meta.push('formato ' + FORMATOS[c.formato]);
    meta.push(numero(c.total_produtos || c.produtos_gravados || 0) + ' ' + plural(c.total_produtos || c.produtos_gravados || 0, 'produto', 'produtos'));
    if (c.origem !== 'manual') meta.push(numero(c.total_chunks || 0) + ' ' + plural(c.total_chunks || 0, 'trecho', 'trechos') + ' na busca');
    var iaAtiva = IA_ATIVA.indexOf(c.ia_status) >= 0;
    var org = ESTADO.organizando && String(ESTADO.organizando.cid) === String(c.id) ? ESTADO.organizando : null;
    var ia = org ? htmlProgressoOrganizar(org)
      : (c.ia_info ? '<div class="cat-ia">' + (iaAtiva ? '<span class="spinner" aria-hidden="true"></span>' : (c.ia_status === 'concluido' ? ICONES.ok : ICONES.info)) + '<span>' + esc(c.ia_info) + '</span></div>' : '');
    var podeOrganizar = c.status === 'processado' && !(c.total_produtos || c.produtos_gravados) && !org && !(iaAtiva && ESTADO.organizando);
    return '<div class="cat-item">' +
      '<div class="cat-ico" aria-hidden="true">' + ICONES.arquivo + '</div>' +
      '<div class="cat-info"><div class="cat-nome" title="' + esc(c.nome_arquivo) + '">' + esc(c.nome_arquivo || 'Catálogo') + '</div>' +
        '<div class="cat-meta">' + esc(meta.join(' · ')) + '</div>' + ia +
        (c.status === 'erro' && c.erro ? '<div class="form-error mt-2">' + esc(c.erro) + '</div>' : '') + '</div>' +
      textoStatusCatalogo(c) +
      '<div class="cat-acoes">' +
        (podeOrganizar ? '<button type="button" class="btn btn-primary btn-sm" data-acao="estruturar" data-cid="' + esc(c.id) + '">' + ICONES.ia + 'Organizar com IA</button>' : '') +
        (c.status === 'processado' && c.origem !== 'manual' ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="reprocessar" data-cid="' + esc(c.id) + '" title="Ler de novo o texto salvo deste catálogo">' + ICONES.reler + 'Reler</button>' : '') +
        '<button type="button" class="btn btn-danger btn-sm" data-acao="excluir-catalogo" data-cid="' + esc(c.id) + '">' + ICONES.lixo + 'Excluir</button>' +
      '</div></div>';
  }).join(''));
}
function acompanharCatalogos() {
  pararAcompanhamento();
  var f = ESTADO.fornecedor;
  if (!f || ESTADO.secao !== 'detalhe' || ESTADO.organizando) return;
  var ativo = (f.catalogos || []).some(function (c) { return IA_ATIVA.indexOf(c.ia_status) >= 0 || c.status === 'processando'; });
  var esp = ESTADO.iaEsperada;
  if (esp) {
    var cat = (f.catalogos || []).filter(function (c) { return c.id === esp.id; })[0];
    var terminou = cat && ['concluido', 'falhou', 'sem_produtos', 'interrompido'].indexOf(cat.ia_status) >= 0;
    if (terminou || Date.now() > esp.ate || (cat === undefined && (f.catalogos || []).length && f.id === esp.fornecedor)) ESTADO.iaEsperada = null;
    else if (f.id === esp.fornecedor) ativo = true;
  }
  if (!ativo) return;
  ESTADO.pollTimer = setTimeout(function () {
    if (ESTADO.secao === 'detalhe' && ESTADO.fornecedor && ESTADO.fornecedor.id === f.id) carregarDetalhe(f.id, { silencioso: true });
  }, 4000);
}
function pararAcompanhamento() {
  if (ESTADO.pollTimer) { clearTimeout(ESTADO.pollTimer); ESTADO.pollTimer = null; }
}
function reprocessarCatalogo(cid, botao) {
  var f = ESTADO.fornecedor;
  if (!f) return;
  setLoading(botao, true, 'Relendo…');
  apiPost('/api/fornecedores/' + f.id + '/catalogo/' + cid + '/reprocessar', {}, { timeout: 120000 }).then(function (r) {
    showToast('Catálogo relido: ' + numero(r.produtos) + ' ' + plural(r.produtos, 'produto', 'produtos') + ' e ' + numero(r.trechos) + ' trechos.', 'success');
    carregarDetalhe(f.id);
    carregarStats();
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'Não foi possível reler o catálogo.'), 'error');
  });
}
// "Organizar com IA": o navegador conduz a IA parte por parte do texto salvo (cada parte cabe numa chamada)
function htmlProgressoOrganizar(org) {
  var pct = org.total ? Math.round((org.parte / org.total) * 100) : 0;
  return '<div class="org-prog" id="org-prog-' + esc(org.cid) + '">' +
    '<div class="linha"><span>' + (org.total ? 'A IA está organizando: parte ' + Math.min(org.parte + 1, org.total) + ' de ' + org.total : 'Preparando…') +
    ' · ' + numero(org.produtos) + ' ' + plural(org.produtos, 'produto', 'produtos') + '</span><span>' + pct + '%</span></div>' +
    '<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progresso da IA"><div style="width:' + pct + '%"></div></div>' +
    '<button type="button" class="btn btn-ghost btn-sm mt-2" data-acao="organizar-parar">Parar</button></div>';
}
function atualizarProgressoOrganizar() {
  var org = ESTADO.organizando;
  if (!org) return;
  var el = $('org-prog-' + org.cid);
  if (el) el.outerHTML = htmlProgressoOrganizar(org);
}
function organizarComIA(cid) {
  var f = ESTADO.fornecedor;
  if (!f) return;
  if (ESTADO.organizando) { showToast('A IA já está organizando um catálogo. Aguarde terminar.', 'warning'); return; }
  var org = { cid: String(cid), fornecedorId: f.id, parte: 0, total: 0, produtos: 0, parar: false, falhasSeguidas: 0 };
  ESTADO.organizando = org;
  pararAcompanhamento();
  renderCatalogos();
  var base = '/api/fornecedores/' + f.id + '/catalogo/' + cid + '/estruturar';
  var contexto = '';
  var continuarApos = '';
  var continuacoes = 0;
  function proxima() {
    if (org.parar || org.parte >= org.total) return Promise.resolve();
    return apiPost(base, { parte: org.parte, contexto: contexto, continuar_apos: continuarApos }, { timeout: 295000 }).then(function (r) {
      // a API responde ok:false quando a IA gratuita falha (cota, modelo ocupado)
      if (r && r.ok === false) throw { error: r.error, code: r.code, status: r.code === 'COTA' ? 429 : 502 };
      org.produtos = r.total_produtos;
      org.falhasSeguidas = 0;
      // parte com produtos demais: a IA continua de onde parou antes de ir para a próxima parte
      if (r.incompleto && r.ultimo && continuacoes < 6) { continuarApos = r.ultimo; continuacoes++; }
      else { org.parte = r.parte + 1; continuarApos = ''; continuacoes = 0; }
      contexto = r.resumo || '';
      atualizarProgressoOrganizar();
      return proxima();
    }, function (err) {
      if (err && err.code !== 'COTA' && err.status !== 404 && err.status !== 400 && org.falhasSeguidas < 2) {
        org.falhasSeguidas++;
        return new Promise(function (ok) { setTimeout(ok, 2500); }).then(proxima);
      }
      throw err;
    });
  }
  apiGet(base).then(function (r) {
    org.total = r.total || 0;
    atualizarProgressoOrganizar();
    return proxima();
  }).then(function () {
    if (org.parar) showToast('Organização interrompida. ' + numero(org.produtos) + ' produtos foram salvos.', 'info', 5000);
    else showToast(org.produtos ? numero(org.produtos) + ' produtos organizados pela IA!' : 'A IA não encontrou produtos neste texto.', org.produtos ? 'success' : 'warning', 6000);
  }).catch(function (err) {
    showToast(msgErro(err, 'A IA não está disponível agora. Use o Prompt Mestre.'), 'error', 7000);
  }).then(function () {
    ESTADO.organizando = null;
    if (ESTADO.fornecedor && ESTADO.fornecedor.id === org.fornecedorId) carregarDetalhe(org.fornecedorId);
    carregarStats();
  });
}
function pedirExclusaoCatalogo(cid) {
  var f = ESTADO.fornecedor;
  if (!f) return;
  var c = (f.catalogos || []).filter(function (x) { return String(x.id) === String(cid); })[0];
  var nome = c ? c.nome_arquivo : 'este catálogo';
  var n = c ? (c.total_produtos || c.produtos_gravados || 0) : 0;
  confirmar('Excluir catálogo', 'Excluir “' + nome + '”? ' + (n ? 'Os ' + numero(n) + ' produtos lidos dele saem da busca.' : 'Os trechos dele saem da busca.'), 'Excluir catálogo', function () {
    return apiDelete('/api/fornecedores/' + f.id + '/catalogo/' + cid).then(function () {
      showToast('Catálogo excluído.', 'success');
      carregarDetalhe(f.id);
      carregarStats();
    });
  });
}

// ─── Adicionar catálogo: arquivo (lido no navegador) ou texto colado ────────
function mudarModoEntrada(modo) {
  ESTADO.modoEntrada = modo === 'colar' ? 'colar' : 'arquivo';
  Array.prototype.forEach.call(document.querySelectorAll('[data-acao="modo-entrada"]'), function (b) {
    b.setAttribute('aria-pressed', b.getAttribute('data-modo') === ESTADO.modoEntrada ? 'true' : 'false');
  });
  mostrar('entrada-arquivo', ESTADO.modoEntrada === 'arquivo');
  mostrar('entrada-colar', ESTADO.modoEntrada === 'colar');
  if (ESTADO.modoEntrada === 'colar') setTimeout(function () { $('colar-texto').focus(); }, 30);
}
function resumoIndexacao(r, extra) {
  var partes = [];
  if (r.produtos) {
    partes.push('<strong>' + ICONES.ok.replace('<svg ', '<svg width="16" height="16" style="display:inline;vertical-align:-3px;margin-right:6px" ') + 'Pronto! ' +
      numero(r.produtos) + ' ' + plural(r.produtos, 'produto organizado', 'produtos organizados') + '</strong> e ' + numero(r.trechos) + ' trechos na busca.');
  } else {
    partes.push('<strong>Texto salvo: ' + numero(r.trechos) + ' ' + plural(r.trechos, 'trecho já aparece', 'trechos já aparecem') + ' na busca.</strong>');
    if (r.ia === 'disponivel') partes.push('O texto não estava no formato do Prompt Mestre, então <strong>a IA está organizando a tabela de produtos</strong>. Acompanhe na aba Catálogos.');
    else partes.push('O texto não estava no formato do Prompt Mestre. Para ter a tabela de produtos, cole a resposta do Prompt Mestre.');
  }
  if (r.fornecedor_atualizado && r.fornecedor_atualizado.length) partes.push('Dados do fornecedor completados: ' + esc(r.fornecedor_atualizado.join(', ')) + '.');
  if (extra) partes.push(esc(extra));
  return '<div class="resultado-ok fade-in" role="status"><p>' + partes.join('</p><p class="mt-2">') + '</p>' +
    '<div class="flex gap-2 mt-3" style="flex-wrap:wrap"><button type="button" class="btn btn-primary btn-sm" data-acao="aba" data-aba="' + (r.produtos ? 'produtos' : 'catalogos') + '">' +
    (r.produtos ? 'Ver produtos' : 'Ver catálogos') + '</button><button type="button" class="btn btn-secondary btn-sm" data-acao="ir" data-secao="busca">' + ICONES.busca + 'Ir para a busca</button></div></div>';
}
function erroLeituraHTML(msg) {
  return '<div class="banner erro mt-4" role="alert"><span>' + esc(msg) + '</span></div>';
}

// ─── Importar catálogo: a IA lê página por página; a pessoa confere e salva ─────
var IMP_LIMITE_TABELA = 150;
var CAMPOS_FORN_IMP = [['nome', 'Nome do fornecedor *'], ['cnpj', 'CNPJ'], ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'],
  ['email', 'E-mail'], ['site', 'Site'], ['endereco', 'Endereço'], ['especialidade', 'Especialidade']];
var MAPA_FORN_EXISTENTE = { telefone: 'telefone', whatsapp: 'whatsapp', email: 'email', cnpj: 'cnpj', site: 'site', endereco: 'endereco', especialidade: 'observacoes' };

// A leitura continua mesmo se a pessoa mudar de tela; só desenha quando a tela dela está aberta
function importacaoVisivel(imp) {
  if (!imp || ESTADO.importacao !== imp) return false;
  if (imp.ctx.tela === 'importar') return ESTADO.secao === 'importar';
  return ESTADO.secao === 'detalhe' && String(ESTADO.fornecedorId) === String(imp.fornecedorId) && ESTADO.aba === 'adicionar';
}
function contextoImportacao(tela) {
  return tela === 'fornecedor'
    ? { tela: 'fornecedor', entrada: 'imp-entrada-fornecedor', trabalho: 'imp-trabalho-fornecedor', capacidades: 'imp-capacidades-fornecedor' }
    : { tela: 'importar', entrada: 'imp-entrada-importar', trabalho: 'imp-trabalho-importar', capacidades: 'imp-capacidades-importar' };
}
function carregarCapacidades(forcar) {
  if (!forcar && ESTADO.capacidades && Date.now() - ESTADO.capacidadesEm < 60000) return Promise.resolve(ESTADO.capacidades);
  return apiGet('/api/extracao/capacidades').then(function (c) {
    ESTADO.capacidades = c;
    ESTADO.capacidadesEm = Date.now();
    return c;
  }).catch(function () { return ESTADO.capacidades || { ia: false, visao: false, cota: null }; });
}
function restanteIA(c) { return c && c.cota && c.cota.restante != null ? Number(c.cota.restante) : null; }
function htmlCapacidades(c) {
  if (!c) return '';
  var resta = restanteIA(c);
  if (!c.ia) return '<div class="cap-linha alerta">' + ICONES.alerta + '<span>A IA não está configurada: a leitura usa OCR e os produtos não são organizados sozinhos.</span></div>';
  if (resta === 0) return '<div class="cap-linha alerta">' + ICONES.alerta + '<span>A cota gratuita de IA de hoje acabou. Ela renova às 21h (Brasília). Dá para ler agora sem IA, mas a qualidade é bem menor.</span></div>';
  return '<div class="cap-linha ok">' + ICONES.ia + '<span><strong>Leitura com IA ativa' + (c.provedor === 'gemini' ? ' (Google Gemini)' : '') + ':</strong> ' +
    (c.visao ? 'a IA lê a imagem de cada página (tabelas, PDFs escaneados e fotos).' : 'a IA organiza o texto das páginas.') +
    (resta != null ? ' Restam <strong>' + numero(resta) + '</strong> leituras gratuitas hoje (1 por página).' : '') + '</span></div>';
}
function renderCapacidades(tela) {
  var ctx = contextoImportacao(tela);
  carregarCapacidades().then(function (c) { html(ctx.capacidades, htmlCapacidades(c)); });
}

// Mostra a importação certa na tela (ou o aviso de que há outra em andamento)
function mostrarImportacao(tela) {
  var ctx = contextoImportacao(tela);
  var imp = ESTADO.importacao;
  renderCapacidades(tela);
  // leitura já salva: ao voltar para a tela, começa limpa (e não bloqueia a outra tela)
  if (imp && imp.fase === 'concluido') { descartarImportacao(true); imp = null; }
  if (!imp) { mostrar(ctx.entrada, true); html(ctx.trabalho, ''); return; }
  var mesma = imp.ctx.tela === tela && (tela !== 'fornecedor' || imp.fornecedorId === ESTADO.fornecedorId);
  if (!mesma) {
    mostrar(ctx.entrada, false);
    html(ctx.trabalho, '<div class="banner info"><span>Há uma leitura de catálogo em andamento (“' + esc(imp.nomeArquivo) +
      '”). Termine ou descarte antes de começar outra.</span><div class="acoes"><button type="button" class="btn btn-primary btn-sm" data-acao="imp-ir">Ver a leitura</button></div></div>');
    return;
  }
  mostrar(ctx.entrada, false);
  if (imp.fase === 'abrindo') html(ctx.trabalho, carregando('Abrindo “' + imp.nomeArquivo + '”…'));
  else if (imp.fase === 'preparar') renderPreparacao(imp);
  else if (imp.fase === 'lendo') renderProgresso(imp);
  else if (imp.fase === 'revisar') renderRevisao(imp);
  else if (imp.fase === 'concluido') renderConcluido(imp);
}

function iniciarImportacao(arquivos, tela) {
  var ctx = contextoImportacao(tela);
  var atual = ESTADO.importacao;
  if (atual && (atual.fase === 'lendo' || atual.fase === 'revisar')) {
    showToast(atual.fase === 'lendo' ? 'Aguarde a leitura atual terminar ou cancele.' : 'Salve ou descarte a leitura atual antes de começar outra.', 'warning', 5000);
    return;
  }
  descartarImportacao(true);
  var lista = Array.prototype.slice.call(arquivos || []);
  if (!lista.length) return;
  var total = lista.reduce(function (s, a) { return s + (a.size || 0); }, 0);
  if (total > MAX_ARQUIVO_MB * 1024 * 1024) {
    html(ctx.trabalho, erroLeituraHTML('Arquivo maior que ' + MAX_ARQUIVO_MB + ' MB. Divida o PDF em partes e importe uma de cada vez.'));
    return;
  }
  if (tela === 'fornecedor' && !ESTADO.fornecedorId) return;
  var imp = {
    ctx: ctx, fornecedorId: tela === 'fornecedor' ? ESTADO.fornecedorId : null, arquivos: lista, fase: 'abrindo',
    fornecedor: tela === 'fornecedor' ? ESTADO.fornecedor : null,
    nomeArquivo: lista.length === 1 ? lista[0].name : lista.length + ' fotos', excluidos: {}, filtro: '', limite: IMP_LIMITE_TABELA, modoForn: null
  };
  ESTADO.importacao = imp;
  mostrar(ctx.entrada, false);
  html(ctx.trabalho, carregando('Abrindo “' + imp.nomeArquivo + '”…'));
  Promise.all([LeitorCatalogo.abrirDocumento(lista), carregarCapacidades(true)]).then(function (r) {
    if (ESTADO.importacao !== imp) { r[0].fechar(); return; }
    imp.doc = r[0];
    imp.cap = r[1];
    imp.fase = 'preparar';
    renderPreparacao(imp);
  }).catch(function (err) {
    if (ESTADO.importacao !== imp) return;
    var visivel = importacaoVisivel(imp);
    ESTADO.importacao = null;
    var msg = msgErro(err, 'Não consegui abrir este arquivo.');
    if (!visivel) { showToast(msg, 'error', 7000); return; }
    mostrar(ctx.entrada, true);
    html(ctx.trabalho, erroLeituraHTML(msg));
  });
}

function renderPreparacao(imp) {
  if (!importacaoVisivel(imp)) return;
  var n = imp.doc.paginas;
  var c = imp.cap || {};
  var resta = restanteIA(c);
  var iaPossivel = !!c.ia && resta !== 0;
  var sugestaoFim = n;
  var aviso = '';
  if (iaPossivel && resta != null && n > resta) {
    sugestaoFim = Math.max(1, resta);
    aviso = '<div class="banner alerta mt-3"><span>Restam <strong>' + numero(resta) + '</strong> leituras com IA hoje e este catálogo tem <strong>' + numero(n) +
      '</strong> páginas. Sugestão: leia agora as páginas 1 a ' + numero(resta) + ' e importe o restante amanhã, com o mesmo arquivo, a partir da página ' + numero(resta + 1) + '.</span></div>';
  }
  var tipo = imp.doc.tipo === 'pdf' ? 'PDF' : (n === 1 ? 'foto' : 'fotos');
  html(imp.ctx.trabalho, '<div class="card imp-card fade-in">' +
    '<div class="imp-arquivo"><div class="imp-arquivo-ico" aria-hidden="true">' + ICONES.arquivo + '</div>' +
      '<div class="imp-arquivo-info"><strong>' + esc(imp.nomeArquivo) + '</strong><span>' + numero(n) + ' ' + plural(n, 'página', 'páginas') + ' · ' + tipo + '</span></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-acao="imp-descartar">Trocar arquivo</button></div>' +
    htmlCapacidades(c) + aviso +
    (n > 1 ? '<div class="form-row mt-4 imp-intervalo"><div class="form-group"><label class="form-label" for="imp-de">Da página</label>' +
      '<input class="input" id="imp-de" type="number" inputmode="numeric" min="1" max="' + n + '" value="1"></div>' +
      '<div class="form-group"><label class="form-label" for="imp-ate">Até a página</label>' +
      '<input class="input" id="imp-ate" type="number" inputmode="numeric" min="1" max="' + n + '" value="' + sugestaoFim + '"></div></div>' : '') +
    '<label class="check mt-3"><input type="checkbox" id="imp-usar-ia"' + (iaPossivel ? ' checked' : ' disabled') + '> <span>Ler com IA <span class="text-muted">(recomendado: muito mais preciso em tabelas e PDFs escaneados)</span></span></label>' +
    '<div class="flex gap-2 mt-4" style="flex-wrap:wrap"><button type="button" class="btn btn-primary btn-lg" data-acao="imp-comecar">' + ICONES.ia + 'Começar leitura</button></div>' +
    '</div>');
}

function comecarLeitura() {
  var imp = ESTADO.importacao;
  if (!imp || imp.fase !== 'preparar') return;
  var n = imp.doc.paginas;
  var de = Math.min(n, Math.max(1, parseInt(valor('imp-de'), 10) || 1));
  var ate = Math.min(n, Math.max(de, parseInt(valor('imp-ate'), 10) || n));
  var usarIA = $('imp-usar-ia') ? $('imp-usar-ia').checked : false;
  imp.intervalo = { de: de, ate: ate };
  imp.usarIA = usarIA;
  imp.fase = 'lendo';
  imp.sessao = Importador.criar({
    documento: imp.doc, inicio: de, fim: ate, capacidades: imp.cap, usarIA: usarIA, nomeArquivo: imp.nomeArquivo,
    aoEvento: function (ev) { aoEventoImportacao(imp, ev); }
  });
  renderProgresso(imp);
  imp.sessao.iniciar().then(function (res) {
    if (ESTADO.importacao !== imp) return null;
    imp.resultado = res;
    return prepararRevisao(imp);
  }).then(function () {
    if (ESTADO.importacao !== imp || !imp.resultado) return;
    imp.fase = 'revisar';
    if (importacaoVisivel(imp)) {
      renderRevisao(imp);
      showToast('Leitura concluída: confira os produtos e salve.', 'success', 5000);
    } else {
      showToast('Leitura de “' + imp.nomeArquivo + '” concluída. Volte em ' + (imp.ctx.tela === 'importar' ? 'Importar catálogo' : 'Adicionar catálogo do fornecedor') +
        ' para conferir e salvar.', 'success', 9000);
    }
  }).catch(function (err) {
    if (ESTADO.importacao !== imp) return;
    if (err && err.code === 'CANCELADO') { descartarImportacao(true); showToast('Leitura cancelada.', 'info'); return; }
    imp.fase = 'preparar';
    var msg = msgErro(err, 'A leitura parou no meio. Tente de novo.');
    if (!importacaoVisivel(imp)) { showToast(msg, 'error', 7000); return; }
    renderPreparacao(imp);
    html(imp.ctx.trabalho, $(imp.ctx.trabalho).innerHTML + erroLeituraHTML(msg));
  });
}

var NOMES_METODO = { ia_visao: 'lida pela IA', ia_texto: 'texto organizado pela IA', pdf_texto: 'texto do PDF', ocr: 'OCR', estruturado: 'texto já organizado' };
var NOMES_FORMATO_PRONTO = { prompt_mestre: 'no formato do Prompt Mestre', json: 'em JSON', tabela: 'em tabela' };
function classeChip(p) {
  if (!p) return 'pg-espera';
  if (p.estado === 'lendo') return 'pg-lendo';
  if (p.estado === 'erro') return 'pg-erro';
  if (p.parcial) return 'pg-semia';
  if (p.produtos && p.produtos.length) return 'pg-ok';
  if (p.metodo === 'ia_texto') return 'pg-ok';
  if (p.estado === 'sem_ia') return 'pg-semia';
  return 'pg-vazia';
}
function tituloChip(p, n) {
  if (!p) return 'Página ' + n + ': aguardando';
  if (p.estado === 'lendo') return 'Página ' + n + ': lendo…';
  if (p.estado === 'erro') return 'Página ' + n + ': erro — ' + (p.erro || '');
  var q = (p.produtos || []).length;
  return 'Página ' + n + ': ' + (q ? q + ' ' + plural(q, 'produto', 'produtos') : 'sem produtos') + (p.metodo ? ' (' + (NOMES_METODO[p.metodo] || p.metodo) + ')' : '') +
    (p.parcial ? ' — pode ter ficado incompleta' : '') + (p.erroIA ? ' — ' + p.erroIA : '');
}
function htmlChips(imp) {
  var est = imp.sessao ? imp.sessao.estado.paginas : {};
  return imp.sessao.paginas.map(function (n) {
    var p = est[n];
    return '<span class="pg-chip ' + classeChip(p) + '" id="imp-pg-' + n + '" role="listitem" title="' + esc(tituloChip(p, n)) + '">' + n + '</span>';
  }).join('');
}
function renderProgresso(imp) {
  if (!importacaoVisivel(imp)) return;
  var r = imp.sessao.resumo();
  var pct = r.total ? Math.round((r.feitas / r.total) * 100) : 0;
  html(imp.ctx.trabalho, '<div class="card imp-card">' +
    '<div class="imp-topo"><div><h3 class="card-title">Lendo “' + esc(imp.nomeArquivo) + '”</h3>' +
      '<p class="text-sm mt-1" id="imp-status" aria-live="polite">' + (imp.usarIA ? 'A IA está lendo as páginas…' : 'Lendo as páginas…') + '</p></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-acao="imp-cancelar">Cancelar</button></div>' +
    '<div class="progresso mt-3"><div class="linha"><span id="imp-prog-texto">' + r.feitas + ' de ' + r.total + ' ' + plural(r.total, 'página', 'páginas') + '</span><span id="imp-prog-pct">' + pct + '%</span></div>' +
      '<div class="barra" id="imp-prog-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progresso da leitura"><div id="imp-prog-fill" style="width:' + pct + '%"></div></div></div>' +
    '<div class="imp-numeros"><div><strong id="imp-n-produtos">' + numero(r.produtos) + '</strong><span>produtos encontrados</span></div>' +
      '<div><strong id="imp-n-ia">' + numero(r.comIA) + '</strong><span>páginas lidas pela IA</span></div></div>' +
    '<div class="imp-paginas" role="list" aria-label="Situação de cada página">' + htmlChips(imp) + '</div>' +
    '<div class="imp-legenda text-sm"><span><i class="pg-chip pg-ok"></i>com produtos</span><span><i class="pg-chip pg-vazia"></i>sem produtos</span>' +
      '<span><i class="pg-chip pg-semia"></i>lida sem IA</span><span><i class="pg-chip pg-erro"></i>erro</span></div>' +
    '<div class="imp-previa"><h4>Últimos produtos encontrados</h4><ul id="imp-previa-lista">' + htmlPrevia(imp) + '</ul></div>' +
    '</div>');
}
function htmlPrevia(imp) {
  var ult = imp.previa || [];
  if (!ult.length) return '<li class="text-muted">Os produtos aparecem aqui conforme as páginas são lidas.</li>';
  return ult.map(function (p) {
    return '<li><span class="prod-nome">' + esc(p.nome) + '</span>' + (p.preco ? ' <span class="preco">' + esc(p.preco) + '</span>' : '') + ' <span class="text-muted">· pág. ' + esc(p._pagina || '') + '</span></li>';
  }).join('');
}
function aoEventoImportacao(imp, ev) {
  if (ESTADO.importacao !== imp || imp.fase !== 'lendo') return;
  var status = $('imp-status');
  if (ev.tipo === 'pagina') {
    var p = ev.pagina;
    var chip = $('imp-pg-' + p.n);
    if (chip) { chip.className = 'pg-chip ' + classeChip(p); chip.title = tituloChip(p, p.n); }
    if (p.produtos && p.produtos.length && (p.estado === 'ok' || p.metodo === 'ia_texto')) {
      imp.previa = p.produtos.slice(-3).map(function (x) { return Object.assign({ _pagina: p.n }, x); }).concat(imp.previa || []).slice(0, 6);
      var lista = $('imp-previa-lista');
      if (lista) lista.innerHTML = htmlPrevia(imp);
    }
    var r = ev.resumo;
    var pct = r.total ? Math.round((r.feitas / r.total) * 100) : 0;
    if ($('imp-prog-texto')) $('imp-prog-texto').textContent = r.feitas + ' de ' + r.total + ' ' + plural(r.total, 'página', 'páginas');
    if ($('imp-prog-pct')) $('imp-prog-pct').textContent = pct + '%';
    if ($('imp-prog-fill')) $('imp-prog-fill').style.width = pct + '%';
    if ($('imp-prog-barra')) $('imp-prog-barra').setAttribute('aria-valuenow', String(pct));
    if ($('imp-n-produtos')) $('imp-n-produtos').textContent = numero(r.produtos);
    if ($('imp-n-ia')) $('imp-n-ia').textContent = numero(r.comIA);
    if (status && p.estado === 'lendo') status.textContent = 'Página ' + p.n + ': ' + (p.metodo === 'ia_visao' ? 'a IA está lendo a imagem…' : (p.metodo === 'ocr' ? 'lendo com OCR…' : 'lendo…'));
    if (r.cotaAcabou && status) status.textContent = 'A cota gratuita de IA de hoje acabou: as próximas páginas são lidas sem IA.';
  } else if (ev.tipo === 'ocr' && status) {
    status.textContent = 'Página ' + ev.pagina + ': lendo com OCR… ' + (ev.pct || 0) + '%';
  } else if (ev.tipo === 'ia' && status) {
    status.textContent = 'Página ' + ev.pagina + ': ' + (ev.continuacao ? 'a IA está lendo o restante da tabela' : 'a IA está lendo a imagem') +
      (ev.tentativa > 1 ? ' (tentativa ' + ev.tentativa + ')' : '') + '…';
  } else if (ev.tipo === 'continua' && status) {
    status.textContent = 'Página ' + ev.pagina + ': muitos produtos (' + numero(ev.produtos) + ' até agora), lendo o restante…';
  } else if (ev.tipo === 'texto_ia' && status) {
    status.textContent = 'A IA está organizando o texto das páginas: parte ' + ev.bloco + ' de ' + ev.total + '…';
  } else if (ev.tipo === 'analise' && status) {
    status.textContent = 'Conferindo se o PDF já está organizado…';
  } else if (ev.tipo === 'organizado' && status) {
    status.textContent = 'O PDF já está ' + (NOMES_FORMATO_PRONTO[ev.formato] || 'organizado') + ': li sem gastar a IA.';
  }
}

// Depois da leitura: junta os dados do fornecedor e confere com os já cadastrados
function prepararRevisao(imp) {
  var res = imp.resultado;
  var lista = imp.fornecedorId ? Promise.resolve() : (ESTADO.fornecedoresCarregados ? Promise.resolve() : apiGet('/api/fornecedores?por_pagina=200').then(function (r) {
    ESTADO.fornecedores = r.fornecedores || [];
    ESTADO.fornecedoresCarregados = true;
  }).catch(function () { /* a lista é opcional */ }));
  var det = apiPost('/api/extracao/fornecedor', { fornecedores: res.fornecedores.slice(0, 200), texto: res.texto.slice(0, 300000), nome_arquivo: imp.nomeArquivo })
    .then(function (d) { imp.deteccao = d; }, function () { imp.deteccao = { fornecedor: {}, parecidos: [] }; });
  return Promise.all([lista, det]);
}

function produtosRevisao(imp) {
  var termos = normalizar(imp.filtro || '').split(' ').filter(Boolean);
  return imp.resultado.produtos.filter(function (p) {
    if (!termos.length) return true;
    if (!p._busca) p._busca = normalizar([p.nome, p.codigo, p.bitola, p.tensao, p.norma, p.categoria, p.preco].join(' '));
    for (var i = 0; i < termos.length; i++) if (p._busca.indexOf(termos[i]) < 0) return false;
    return true;
  });
}
function qtdSelecionados(imp) {
  return imp.resultado.produtos.filter(function (p) { return !imp.excluidos[p._chave]; }).length;
}
function resumoAtributos(p) {
  var at = p.atributos || {};
  return Object.keys(at).slice(0, 4).map(function (k) { return k + ': ' + at[k]; }).join(' · ');
}
function htmlLinhasRevisao(imp) {
  var lista = produtosRevisao(imp);
  if (!lista.length) return '<tr><td colspan="7" class="imp-sem-resultado"><p class="text-muted" style="padding:12px">Nenhum produto com esse filtro.</p></td></tr>';
  // data-rot: no celular a linha vira cartão e cada célula mostra o rótulo
  function celula(rotulo, conteudo, classe) {
    var classes = [classe || '', conteudo ? '' : 'vazia'].join(' ').trim();
    return '<td data-rot="' + rotulo + '"' + (classes ? ' class="' + classes + '"' : '') + '>' + (conteudo || vazio()) + '</td>';
  }
  return lista.slice(0, imp.limite).map(function (p) {
    var fora = !!imp.excluidos[p._chave];
    var extra = resumoAtributos(p);
    return '<tr class="' + (fora ? 'imp-excluido' : '') + '">' +
      '<td class="centro"><input type="checkbox" class="imp-sel" data-chave="' + esc(p._chave) + '"' + (fora ? '' : ' checked') + ' aria-label="Salvar ' + esc(p.nome) + '"></td>' +
      '<td class="imp-prod"><div class="prod-nome">' + esc(p.nome) + '</div>' + (p.codigo ? '<span class="cod">' + esc(p.codigo) + '</span>' : '') +
        (p.categoria ? '<div class="cell-sub">' + esc(p.categoria) + '</div>' : '') + (extra ? '<div class="cell-sub">' + esc(extra) + '</div>' : '') + '</td>' +
      celula('Medida', p.bitola ? esc(p.bitola) : '') +
      celula('Tensão', p.tensao ? esc(p.tensao) : '') +
      celula('Norma', p.norma ? '<span class="norma">' + esc(p.norma) + '</span>' : '') +
      celula('Preço', p.preco ? '<div class="preco">' + esc(p.preco) + '</div>' + (p.unidade ? '<div class="unid">' + esc(p.unidade) + '</div>' : '') : '', 'num') +
      celula('Página', p._pagina ? esc(p._pagina) : '', 'centro text-muted') + '</tr>';
  }).join('');
}
function atualizarTabelaRevisao(imp) {
  html('imp-tbody', htmlLinhasRevisao(imp));
  var lista = produtosRevisao(imp);
  var resto = lista.length - Math.min(lista.length, imp.limite);
  html('imp-mais', resto > 0 ? '<button type="button" class="btn btn-secondary btn-full" data-acao="imp-mais">Mostrar mais ' + numero(Math.min(300, resto)) + ' (faltam ' + numero(resto) + ')</button>' : '');
  atualizarBotaoSalvar(imp);
}
function atualizarBotaoSalvar(imp) {
  var n = qtdSelecionados(imp);
  var b = $('imp-btn-salvar');
  if (b && !b.disabled) b.innerHTML = ICONES.ok + (n ? 'Salvar ' + numero(n) + ' ' + plural(n, 'produto', 'produtos') : 'Salvar o catálogo');
  var todos = $('imp-todos');
  if (todos) {
    var visiveis = produtosRevisao(imp);
    var marcados = visiveis.filter(function (p) { return !imp.excluidos[p._chave]; }).length;
    todos.checked = visiveis.length > 0 && marcados === visiveis.length;
    todos.indeterminate = marcados > 0 && marcados < visiveis.length;
  }
}

function htmlFornecedorRevisao(imp) {
  var det = (imp.deteccao && imp.deteccao.fornecedor) || {};
  var parecidos = (imp.deteccao && imp.deteccao.parecidos) || [];
  if (imp.fornecedorId) {
    var f = imp.fornecedor || ESTADO.fornecedor || {};
    var linhas = Object.keys(MAPA_FORN_EXISTENTE).filter(function (k) { return det[k]; }).map(function (k) {
      var atual = f[MAPA_FORN_EXISTENTE[k]];
      var rot = { telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', cnpj: 'CNPJ', site: 'Site', endereco: 'Endereço', especialidade: 'Especialidade' }[k];
      return '<div><span>' + esc(rot) + '</span><strong>' + esc(det[k]) + '</strong>' +
        (atual ? '<em class="text-muted">já cadastrado: ' + esc(truncate(atual, 60)) + '</em>' : '<em class="text-ok">vai completar</em>') + '</div>';
    });
    if (!linhas.length) return '<div class="card-header"><h3 class="card-title">Fornecedor</h3></div><p class="text-sm">O catálogo não trouxe dados de contato novos para <strong>' + esc(f.nome || '') + '</strong>.</p>';
    return '<div class="card-header"><h3 class="card-title">Dados do fornecedor encontrados no catálogo</h3></div>' +
      '<div class="diag-lista imp-dados">' + linhas.join('') + '</div>' +
      '<label class="check mt-3"><input type="checkbox" id="imp-completar" checked> <span>Completar os campos vazios de <strong>' + esc(f.nome || 'fornecedor') + '</strong> com esses dados</span></label>';
  }
  var modo = imp.modoForn || (parecidos.length ? 'existente' : 'novo');
  imp.modoForn = modo;
  var existentes = ESTADO.fornecedores || [];
  var opcoes = existentes.map(function (f) {
    return '<option value="' + esc(f.id) + '"' + (parecidos[0] && String(parecidos[0].id) === String(f.id) ? ' selected' : '') + '>' + esc(f.nome) + '</option>';
  }).join('');
  var campos = CAMPOS_FORN_IMP.map(function (c) {
    var id = 'imp-f-' + c[0];
    var campo = c[0] === 'especialidade'
      ? '<textarea class="textarea" id="' + id + '" rows="2" maxlength="2000">' + esc(det[c[0]] || '') + '</textarea>'
      : '<input class="input" id="' + id + '" maxlength="' + (c[0] === 'endereco' ? 500 : 255) + '" value="' + esc(det[c[0]] || '') + '"' + (c[0] === 'nome' ? ' required' : '') + '>';
    return '<div class="form-group' + (c[0] === 'especialidade' || c[0] === 'endereco' ? ' imp-largo' : '') + '"><label class="form-label" for="' + id + '">' + esc(c[1]) + '</label>' + campo + '</div>';
  }).join('');
  return '<div class="card-header"><h3 class="card-title">Fornecedor deste catálogo</h3></div>' +
    (parecidos.length ? '<div class="banner info"><span>Parece ser <strong>' + esc(parecidos[0].nome) + '</strong> (' + esc(parecidos[0].motivo) + '), que você já cadastrou.</span></div>' : '') +
    '<fieldset class="imp-modo"><legend class="sr-only">Onde salvar os produtos</legend>' +
      '<label class="radio"><input type="radio" name="imp-modo-forn" value="novo"' + (modo === 'novo' ? ' checked' : '') + '> <span>Criar um fornecedor novo com os dados abaixo</span></label>' +
      (existentes.length ? '<label class="radio"><input type="radio" name="imp-modo-forn" value="existente"' + (modo === 'existente' ? ' checked' : '') + '> <span>Adicionar a um fornecedor que já cadastrei</span></label>' +
        '<div class="imp-existente' + (modo === 'existente' ? '' : ' hidden') + '" id="imp-existente-area"><label class="sr-only" for="imp-forn-existente">Fornecedor já cadastrado</label>' +
        '<select class="select" id="imp-forn-existente">' + opcoes + '</select>' +
        '<label class="check mt-2"><input type="checkbox" id="imp-completar" checked> <span>Completar os campos vazios dele com os dados abaixo</span></label></div>' : '') +
    '</fieldset>' +
    '<div class="imp-campos mt-3' + (modo === 'existente' ? ' imp-campos-ref' : '') + '" id="imp-forn-campos">' + campos + '</div>' +
    '<p class="form-hint mt-2">Confira os dados: a IA copia do catálogo, mas vale uma olhada no CNPJ e nos telefones.</p>';
}

// Páginas que valem uma nova leitura: erro, lidas sem a IA (com a IA ligada) ou cortadas por terem produtos demais
function paginasComProblema(imp) {
  return imp.resultado.paginas.filter(function (p) {
    return p.estado === 'erro' || p.parcial || (imp.usarIA && p.estado === 'sem_ia' && p.metodo !== 'ia_texto');
  });
}
// Por que a IA não leu: resume os motivos que o servidor devolveu (modelos ocupados, sem resposta, cota…)
function motivoFalhaIA(lista) {
  var t = [];
  lista.forEach(function (p) { (p.motivosIA || []).forEach(function (m) { t.push(String(m)); }); });
  if (!t.length) return '';
  t = t.join(' | ');
  if (/limite diário/i.test(t) && !/Gemini/i.test(t)) return 'o limite diário da IA gratuita acabou';
  if (/chave/i.test(t)) return 'a chave da IA foi recusada (confira no Painel do dono)';
  var ocupado = /429|ocupad|limite por minuto/i.test(t);
  var lento = /não começou|parou de responder|tempo esgotado/i.test(t);
  if (ocupado && lento) return 'os modelos gratuitos estavam congestionados (ocupados ou sem responder)';
  if (ocupado) return 'os modelos gratuitos estavam ocupados (muita gente usando agora)';
  if (lento) return 'os modelos gratuitos demoraram demais para responder';
  return 'a IA não devolveu os produtos no formato esperado';
}
function listaPaginas(lista) {
  return lista.slice(0, 12).map(function (p) { return p.n; }).join(', ') + (lista.length > 12 ? '…' : '');
}
function renderRevisao(imp) {
  if (!importacaoVisivel(imp)) return;
  var res = imp.resultado;
  var r = res.resumo;
  var paginas = res.paginas;
  var problemas = paginasComProblema(imp);
  var naoLidas = problemas.filter(function (p) { return !p.parcial; });
  var parciais = problemas.filter(function (p) { return p.parcial; });
  var podeReler = problemas.length && imp.usarIA && imp.doc && !(imp.sessao && imp.sessao.estado.cotaAcabou);
  var avisos = [];
  if (naoLidas.length) {
    var motivo = motivoFalhaIA(naoLidas);
    avisos.push(numero(naoLidas.length) + ' ' + plural(naoLidas.length, 'página não foi lida', 'páginas não foram lidas') + ' pela IA (' + listaPaginas(naoLidas) + ').' +
      (motivo ? ' Motivo: ' + motivo + '.' : ''));
  }
  if (parciais.length) avisos.push(numero(parciais.length) + ' ' + plural(parciais.length, 'página tinha', 'páginas tinham') + ' produtos demais e ' +
    plural(parciais.length, 'pode ter ficado incompleta', 'podem ter ficado incompletas') + ' (' + listaPaginas(parciais) + ').');
  var nProd = res.produtos.length;
  html(imp.ctx.trabalho,
    '<div class="card imp-card fade-in">' +
      '<div class="imp-topo"><div><h3 class="card-title">Confira antes de salvar</h3>' +
        '<p class="mt-1">Encontrei <strong>' + numero(nProd) + ' ' + plural(nProd, 'produto', 'produtos') + '</strong> em ' + numero(paginas.length) + ' ' +
        plural(paginas.length, 'página', 'páginas') + ' de “' + esc(imp.nomeArquivo) + '”' + (r.comIA ? ' · ' + numero(r.comIA) + ' lidas pela IA' : '') + '.</p>' +
        (res.formato ? '<p class="text-sm mt-1">' + ICONES.ok.replace('<svg ', '<svg width="14" height="14" style="display:inline;vertical-align:-2px;margin-right:4px" ') +
          'O PDF já estava ' + esc(NOMES_FORMATO_PRONTO[res.formato] || 'organizado') + ': li o texto direto, sem gastar a cota de IA.</p>' : '') + '</div></div>' +
      '<div class="imp-paginas mt-3" role="list" aria-label="Situação de cada página">' + htmlChips(imp) + '</div>' +
      (res.cotaAcabou ? '<div class="banner alerta mt-3"><span>A cota gratuita de IA de hoje acabou durante a leitura: algumas páginas foram lidas sem IA. Amanhã você pode importar essas páginas de novo, com o mesmo arquivo.</span></div>' : '') +
      (problemas.length ? '<div class="banner ' + (podeReler ? 'info' : 'alerta') + ' mt-3"><span>' + esc(avisos.join(' ')) + '</span>' +
        (podeReler ? '<div class="acoes"><button type="button" class="btn btn-secondary btn-sm" data-acao="imp-reler">' + ICONES.reler + 'Ler essas páginas de novo</button></div>' : '') + '</div>' : '') +
      (!nProd ? '<div class="banner alerta mt-3"><span>Nenhum produto foi organizado. Se salvar, o texto lido entra na busca e você pode usar “Organizar com IA” depois.</span></div>' : '') +
    '</div>' +
    '<div class="card imp-card" id="imp-forn-card">' + htmlFornecedorRevisao(imp) + '</div>' +
    (nProd ? '<div class="card imp-card">' +
      '<div class="card-header imp-cab-produtos"><h3 class="card-title">Produtos encontrados</h3>' +
        '<div class="input-icone imp-filtro">' + ICONES.busca + '<input class="input" id="imp-filtro" type="search" placeholder="Filtrar: nome, medida, norma…" aria-label="Filtrar produtos encontrados" value="' + esc(imp.filtro || '') + '"></div></div>' +
      '<div class="table-wrap"><table class="tabela imp-tabela"><caption class="sr-only">Produtos encontrados no catálogo; desmarque os que não quer salvar</caption>' +
        '<thead><tr><th scope="col" class="centro"><input type="checkbox" id="imp-todos" aria-label="Marcar ou desmarcar todos os produtos visíveis"></th><th scope="col">Produto</th><th scope="col">Medida</th><th scope="col">Tensão</th><th scope="col">Norma</th><th scope="col" class="num">Preço</th><th scope="col" class="centro">Pág.</th></tr></thead>' +
        '<tbody id="imp-tbody"></tbody></table></div><div id="imp-mais" class="mt-3"></div></div>' : '') +
    '<div class="imp-acoes"><button type="button" class="btn btn-primary btn-lg" id="imp-btn-salvar" data-acao="imp-salvar">' + ICONES.ok + 'Salvar</button>' +
      '<button type="button" class="btn btn-ghost" data-acao="imp-descartar-confirmar">Descartar leitura</button></div>');
  if (nProd) atualizarTabelaRevisao(imp); else atualizarBotaoSalvar(imp);
}

function lerCampoForn(c) { var el = $('imp-f-' + c); return el ? String(el.value || '').trim() : ''; }
function salvarImportacao(botao) {
  var imp = ESTADO.importacao;
  if (!imp || imp.fase !== 'revisar') return;
  var res = imp.resultado;
  var corpo = {
    nome_arquivo: imp.nomeArquivo + (imp.intervalo && (imp.intervalo.de > 1 || imp.intervalo.ate < imp.doc.paginas) ? ' (páginas ' + imp.intervalo.de + '–' + imp.intervalo.ate + ')' : ''),
    paginas: imp.intervalo ? imp.intervalo.ate - imp.intervalo.de + 1 : imp.doc.paginas,
    origem: res.origem,
    texto: res.texto.slice(0, MAX_TEXTO),
    resumos: res.resumos.slice(0, 500),
    fornecedor: imp.deteccao ? imp.deteccao.fornecedor : null,
    info_ia: res.modelos.length ? 'Lido pela IA (' + res.modelos.slice(0, 3).join(', ') + ')' : '',
    formato: res.formato || null
  };
  if (imp.fornecedorId) {
    corpo.fornecedor_id = imp.fornecedorId;
    corpo.completar_fornecedor = $('imp-completar') ? $('imp-completar').checked : true;
  } else {
    var modo = (document.querySelector('input[name="imp-modo-forn"]:checked') || {}).value || 'novo';
    if (modo === 'existente') {
      corpo.fornecedor_id = parseInt(valor('imp-forn-existente'), 10);
      corpo.completar_fornecedor = $('imp-completar') ? $('imp-completar').checked : true;
      var dados = {};
      CAMPOS_FORN_IMP.forEach(function (c) { var v = lerCampoForn(c[0]); if (v) dados[c[0]] = v; });
      corpo.fornecedor = dados;
    } else {
      var novo = {};
      CAMPOS_FORN_IMP.forEach(function (c) { novo[c[0]] = lerCampoForn(c[0]); });
      if (!novo.nome) { showToast('Informe o nome do fornecedor.', 'warning'); $('imp-f-nome').focus(); return; }
      if (novo.cnpj && !cnpjValido(novo.cnpj)) { showToast(msgCNPJ(novo.cnpj), 'warning'); $('imp-f-cnpj').focus(); return; }
      corpo.novo_fornecedor = novo;
    }
  }
  var produtos = res.produtos.filter(function (p) { return !imp.excluidos[p._chave]; }).map(function (p) {
    var limpo = {};
    Object.keys(p).forEach(function (k) { if (k.charAt(0) !== '_') limpo[k] = p[k]; });
    return limpo;
  });
  if (!produtos.length && corpo.texto.replace(/\s/g, '').length < 20) { showToast('Não há produtos nem texto para salvar.', 'warning'); return; }
  // envio em partes (a Vercel aceita ~4,5 MB por vez)
  var lotes = [];
  var atual = [];
  var tamanho = 0;
  produtos.forEach(function (p) {
    var t = JSON.stringify(p).length;
    if (atual.length && tamanho + t > 2500000) { lotes.push(atual); atual = []; tamanho = 0; }
    atual.push(p);
    tamanho += t;
  });
  if (atual.length) lotes.push(atual);
  if (JSON.stringify(corpo).length + (lotes[0] ? JSON.stringify(lotes[0]).length : 0) > 3800000) corpo.texto = corpo.texto.slice(0, 600000);
  setLoading(botao, true, 'Salvando…');
  var salvo = null;
  apiPost('/api/extracao/importar', Object.assign({}, corpo, { produtos: lotes[0] || [] }), { timeout: 120000 }).then(function (r) {
    salvo = r;
    var cadeia = Promise.resolve();
    lotes.slice(1).forEach(function (lote) {
      cadeia = cadeia.then(function () { return apiPost('/api/extracao/importar/' + r.catalogo_id + '/produtos', { produtos: lote }, { timeout: 120000 }); });
    });
    return cadeia;
  }).then(function () {
    imp.fase = 'concluido';
    imp.salvo = Object.assign({}, salvo, { produtos: produtos.length });
    if (imp.sessao) imp.sessao.fechar();
    renderConcluido(imp);
    showToast(numero(produtos.length) + ' produtos salvos e prontos para a busca!', 'success', 6000);
    ESTADO.fornecedoresCarregados = false;
    carregarStats();
    if (imp.ctx.tela === 'fornecedor' && ESTADO.fornecedor) carregarDetalhe(ESTADO.fornecedor.id);
  }).catch(function (err) {
    setLoading(botao, false);
    atualizarBotaoSalvar(imp);
    showToast(msgErro(err, 'Não foi possível salvar agora. Tente de novo.') + (salvo ? ' (parte dos produtos já foi salva)' : ''), 'error', 7000);
  });
}

function renderConcluido(imp) {
  if (!importacaoVisivel(imp)) return;
  var r = imp.salvo || {};
  var nome = imp.fornecedorId ? (imp.fornecedor ? imp.fornecedor.nome : 'o fornecedor')
    : (r.fornecedor_criado ? lerNomeSalvo(imp) : 'o fornecedor escolhido');
  html(imp.ctx.trabalho, '<div class="resultado-ok imp-card fade-in" role="status">' +
    '<h3 class="card-title">' + ICONES.ok.replace('<svg ', '<svg width="20" height="20" style="display:inline;vertical-align:-4px;margin-right:6px" ') +
      'Pronto! ' + numero(r.produtos || 0) + ' ' + plural(r.produtos || 0, 'produto salvo', 'produtos salvos') + '</h3>' +
    '<p class="mt-2">' + (r.fornecedor_criado ? 'Fornecedor <strong>' + esc(nome) + '</strong> cadastrado com os dados do catálogo. ' : 'Catálogo adicionado a <strong>' + esc(nome) + '</strong>. ') +
      'Os produtos já aparecem na busca.</p>' +
    (r.fornecedor_atualizado && r.fornecedor_atualizado.length ? '<p class="mt-2">Dados completados: ' + esc(r.fornecedor_atualizado.join(', ')) + '.</p>' : '') +
    '<div class="flex gap-2 mt-4" style="flex-wrap:wrap">' +
      (imp.ctx.tela === 'fornecedor'
        ? '<button type="button" class="btn btn-primary" data-acao="aba" data-aba="produtos">Ver produtos</button>'
        : '<button type="button" class="btn btn-primary" data-acao="ver-fornecedor" data-id="' + esc(r.fornecedor_id) + '">Ver fornecedor e produtos</button>') +
      '<button type="button" class="btn btn-secondary" data-acao="ir" data-secao="busca">' + ICONES.busca + 'Buscar produtos</button>' +
      '<button type="button" class="btn btn-ghost" data-acao="imp-novo">' + ICONES.enviar + 'Importar outro catálogo</button>' +
    '</div></div>');
}
function lerNomeSalvo(imp) {
  var el = $('imp-f-nome');
  if (el && el.value) imp.nomeSalvo = el.value;
  return imp.nomeSalvo || (imp.deteccao && imp.deteccao.fornecedor && imp.deteccao.fornecedor.nome) || 'novo fornecedor';
}

function cancelarImportacao() {
  var imp = ESTADO.importacao;
  if (!imp || !imp.sessao) return;
  imp.sessao.cancelar();
}
function descartarImportacao(silencioso) {
  var imp = ESTADO.importacao;
  if (!imp) return;
  if (imp.sessao) imp.sessao.fechar();
  else if (imp.doc) { try { imp.doc.fechar(); } catch (e) { /* ignora */ } }
  ESTADO.importacao = null;
  mostrar(imp.ctx.entrada, true);
  html(imp.ctx.trabalho, '');
  if (!silencioso) showToast('Leitura descartada.', 'info');
}
function relerPaginasImportacao(botao) {
  var imp = ESTADO.importacao;
  if (!imp || imp.fase !== 'revisar' || !imp.sessao) return;
  var lista = paginasComProblema(imp).map(function (p) { return p.n; });
  if (!lista.length) return;
  setLoading(botao, true, 'Lendo…');
  imp.fase = 'lendo';
  renderProgresso(imp);
  imp.sessao.relerPaginas(lista).then(function (res) {
    if (ESTADO.importacao !== imp) return;
    imp.resultado = res;
    imp.fase = 'revisar';
    return prepararRevisao(imp).then(function () { renderRevisao(imp); });
  }).catch(function (err) {
    if (ESTADO.importacao !== imp) return;
    imp.fase = 'revisar';
    renderRevisao(imp);
    if (!(err && err.code === 'CANCELADO')) showToast(msgErro(err, 'Não consegui reler as páginas.'), 'error');
  });
}
function aoMudarRevisao(e) {
  var imp = ESTADO.importacao;
  var alvo = e.target;
  if (!imp || imp.fase !== 'revisar' || !alvo) return;
  if (alvo.classList && alvo.classList.contains('imp-sel')) {
    var chave = alvo.getAttribute('data-chave');
    if (alvo.checked) delete imp.excluidos[chave]; else imp.excluidos[chave] = 1;
    var tr = alvo.closest('tr');
    if (tr) tr.classList.toggle('imp-excluido', !alvo.checked);
    atualizarBotaoSalvar(imp);
  } else if (alvo.id === 'imp-todos') {
    produtosRevisao(imp).forEach(function (p) { if (alvo.checked) delete imp.excluidos[p._chave]; else imp.excluidos[p._chave] = 1; });
    atualizarTabelaRevisao(imp);
  } else if (alvo.name === 'imp-modo-forn') {
    imp.modoForn = alvo.value;
    mostrar('imp-existente-area', alvo.value === 'existente');
    var campos = $('imp-forn-campos');
    if (campos) campos.classList.toggle('imp-campos-ref', alvo.value === 'existente');
  }
}
var filtrarRevisao = debounce(function () {
  var imp = ESTADO.importacao;
  if (!imp || imp.fase !== 'revisar') return;
  imp.filtro = valor('imp-filtro');
  imp.limite = IMP_LIMITE_TABELA;
  atualizarTabelaRevisao(imp);
}, 180);

var RE_MARCADOR_PRODUTO = /^(?:produto|item)\s*(?:n[º°o]\.?\s*|#\s*)?(\d{1,5})(?:\s*[:\-–—.)|]\s*|\s+|$)/i;
function limparLinhaColada(l) {
  return String(l || '').replace(/\*\*|__|`/g, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*>\s*/, '').replace(/^\s*(?:[-*•·▪●◦–—]\s+)+/, '').trim();
}
function analisarColado(texto) {
  var t = String(texto || '').replace(/\r\n?/g, '\n');
  if (!t.trim()) return null;
  var linhas = t.split('\n').map(limparLinhaColada);
  var marcadores = linhas.filter(function (l) { return RE_MARCADOR_PRODUTO.test(l); }).length;
  if (!marcadores) marcadores = (t.match(/\bPRODUTO\s*(?:N[º°o]\.?\s*)?\d{1,5}\b/g) || []).length;
  var nomes = linhas.filter(function (l) { return /^nome(?:\s+do\s+produto)?\s*:\s*\S/i.test(l); }).length;
  var tabela = linhas.filter(function (l) { return /^\|.*\|$/.test(l); }).length;
  if (/^\s*[\[{]/.test(t)) return { n: 0, formato: 'json' };
  if (marcadores) return { n: marcadores, formato: 'prompt_mestre' };
  if (nomes >= 2) return { n: nomes, formato: 'prompt_mestre' };
  if (tabela >= 3) return { n: tabela - 2, formato: 'tabela' };
  return { n: 0, formato: 'texto' };
}
function atualizarContadorColado() {
  var a = analisarColado(valor('colar-texto'));
  var el = $('colar-contador');
  el.classList.remove('text-muted');
  if (!a) { el.textContent = ''; return; }
  if (a.formato === 'json') { el.textContent = 'Formato JSON detectado.'; return; }
  if (a.n) {
    el.textContent = '✓ ' + numero(a.n) + ' ' + plural(a.n, 'produto detectado', 'produtos detectados') + (a.formato === 'tabela' ? ' (tabela)' : '');
    return;
  }
  el.classList.add('text-muted');
  el.textContent = 'Não achei “PRODUTO 1”. O texto vai para a busca e a IA tenta organizar os produtos.';
}
function indexarColado() {
  var fid = ESTADO.fornecedorId;
  if (!fid) return;
  var texto = valor('colar-texto');
  if (texto.replace(/\s/g, '').length < 20) {
    showToast('Cole a resposta da IA na caixa de texto antes de indexar.', 'warning');
    $('colar-texto').focus();
    return;
  }
  if (texto.length > MAX_TEXTO) { showToast('Texto grande demais. Cole em partes menores.', 'error'); return; }
  var nome = valor('colar-nome').trim() || ('Texto colado em ' + new Date().toLocaleDateString('pt-BR'));
  var btn = $('btn-indexar');
  setLoading(btn, true, 'Indexando…');
  html('resultado-colar', '');
  apiPost('/api/extracao/texto/' + fid, { texto: texto, nome_arquivo: nome, origem: 'texto_colado' }, { timeout: 120000 }).then(function (r) {
    setLoading(btn, false);
    html('resultado-colar', resumoIndexacao(r));
    if (r.ia === 'disponivel' && ESTADO.fornecedorId === fid) {
      apiGet('/api/fornecedores/' + fid).then(function (f) {
        if (ESTADO.fornecedorId !== fid) return;
        ESTADO.fornecedor = f;
        mudarAba('catalogos', true);
        renderCatalogos();
        organizarComIA(r.catalogo_id);
      }).catch(function () { /* o botão Organizar com IA continua disponível */ });
    }
    $('colar-texto').value = '';
    $('colar-nome').value = '';
    atualizarContadorColado();
    showToast(r.produtos ? numero(r.produtos) + ' produtos organizados!' : 'Texto indexado para a busca.', 'success');
    if (ESTADO.fornecedorId === fid) carregarDetalhe(fid);
    carregarStats();
  }).catch(function (err) {
    setLoading(btn, false);
    html('resultado-colar', erroLeituraHTML(msgErro(err, 'Não foi possível indexar o texto.')));
  });
}
function copiarPromptMestre(botao) {
  copiarTexto(PROMPT_MESTRE).then(function () {
    showToast('Prompt Mestre copiado. Cole na sua IA junto com o catálogo.', 'success');
    if (botao) {
      var original = botao.innerHTML;
      botao.innerHTML = ICONES.ok + 'Copiado!';
      setTimeout(function () { botao.innerHTML = original; }, 2000);
    }
  }).catch(function () {
    $('colar-texto').value = PROMPT_MESTRE;
    showToast('Não consegui copiar sozinho. Coloquei o prompt na caixa de texto: selecione e copie.', 'warning', 6000);
  });
}

// ─── Configurações ─────────────────────────────────────────────────
function renderConfig() {
  var u = ESTADO.usuario;
  if (!u) return;
  if (document.activeElement !== $('cfg-nome')) $('cfg-nome').value = u.nome || '';
  $('cfg-email').value = u.email || '';
  $('cfg-plano').textContent = u.admin ? 'Administrador' : (NOMES_PLANO[u.plano] || u.plano || '—');
  var fim = u.plano === 'trial' ? u.trial_fim : u.plano_fim;
  var dias = $('cfg-dias');
  dias.classList.remove('text-ok');
  dias.style.color = '';
  if (u.admin) dias.textContent = 'Acesso completo de administrador';
  else if (u.acesso === 'expirado') { dias.textContent = 'Vencido — escolha um plano para continuar'; dias.style.color = 'var(--danger)'; }
  else if (u.dias_restantes != null) dias.textContent = u.dias_restantes + ' ' + plural(u.dias_restantes, 'dia restante', 'dias restantes') + (fim ? ' · até ' + dataBR(fim) : '');
  else dias.textContent = 'Ativo';
  html('cfg-pendente', u.pagamento_pendente ? '<div class="banner info"><span>Aviso de pagamento do plano <strong>' +
    esc(NOMES_PLANO[u.pagamento_pendente.plano] || u.pagamento_pendente.plano) + '</strong> enviado em ' + esc(dataBR(u.pagamento_pendente.criado_em)) +
    '. Assim que confirmarmos, o plano é liberado.</span></div>' : '');
  mostrar('cfg-planos-area', !u.admin);
  var planos = u.planos || {};
  html('cfg-planos', Object.keys(planos).map(function (k) {
    var p = planos[k];
    return '<div class="plano-op"><div><strong>' + esc(p.nome) + '</strong><span>' + esc(p.preco) + ' · ' + esc(p.dias) + ' dias</span></div>' +
      (p.link ? '<a class="btn btn-primary btn-sm" href="' + esc(p.link) + '" target="_blank" rel="noopener noreferrer">Pagar</a>' : '') + '</div>';
  }).join(''));
  var sel = $('aviso-plano');
  if (sel.options.length <= 1) {
    Object.keys(planos).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = planos[k].nome + ' — ' + planos[k].preco;
      sel.appendChild(o);
    });
  }
}
function salvarPerfil(e) {
  e.preventDefault();
  var dados = { nome: valor('cfg-nome').trim() };
  var atual = valor('cfg-senha-atual');
  var nova = valor('cfg-senha-nova');
  if (!dados.nome) { showToast('Informe seu nome.', 'warning'); $('cfg-nome').focus(); return; }
  if (atual || nova) {
    if (!atual || !nova) { showToast('Para trocar a senha, preencha a senha atual e a nova.', 'warning'); return; }
    if (nova.length < 6) { showToast('A nova senha precisa de pelo menos 6 caracteres.', 'warning'); $('cfg-senha-nova').focus(); return; }
    dados.senha_atual = atual;
    dados.senha_nova = nova;
  }
  var btn = $('btn-salvar-perfil');
  setLoading(btn, true, 'Salvando…');
  apiPut('/api/auth/perfil', dados).then(function () {
    setLoading(btn, false);
    $('cfg-senha-atual').value = '';
    $('cfg-senha-nova').value = '';
    showToast(dados.senha_nova ? 'Dados e senha atualizados.' : 'Dados atualizados.', 'success');
    atualizarUsuario();
  }).catch(function (err) {
    setLoading(btn, false);
    showToast(msgErro(err, 'Não foi possível salvar.'), 'error');
  });
}
function avisarPagamento(e) {
  e.preventDefault();
  var plano = valor('aviso-plano');
  if (!plano) { showToast('Escolha qual plano você pagou.', 'warning'); $('aviso-plano').focus(); return; }
  var btn = $('btn-avisar-pagamento');
  setLoading(btn, true, 'Enviando…');
  apiPost('/api/auth/plano/solicitar', { plano: plano, observacao: valor('aviso-obs').trim() }).then(function (r) {
    setLoading(btn, false);
    $('aviso-obs').value = '';
    showToast(r.msg || 'Aviso enviado.', 'success', 6000);
    atualizarUsuario();
  }).catch(function (err) {
    setLoading(btn, false);
    showToast(msgErro(err, 'Não foi possível enviar o aviso.'), 'error');
  });
}

// ─── Painel do dono ────────────────────────────────────────────────
function carregarAdmin() {
  html('adm-kpis', carregando('Carregando o painel…'));
  return Promise.all([
    apiGet('/api/admin/resumo').catch(function (e) { return { _erro: e }; }),
    apiGet('/api/admin/pagamentos?status=pendente').catch(function (e) { return { _erro: e }; }),
    apiGet('/api/admin/usuarios').catch(function (e) { return { _erro: e }; }),
    apiGet('/api/admin/diagnostico').catch(function (e) { return { _erro: e }; })
  ]).then(function (r) {
    renderAdminResumo(r[0]);
    renderAdminPagamentos(r[1]);
    renderAdminUsuarios(r[2]);
    renderAdminDiagnostico(r[3]);
  });
}
function renderAdminResumo(r) {
  if (r._erro) { html('adm-kpis', caixaErro(msgErro(r._erro, 'Não foi possível carregar o resumo.'), 'admin-atualizar')); return; }
  var itens = [['Clientes', r.usuarios], ['Em teste', r.em_teste], ['Pagantes ativos', r.pagantes], ['Vencidos', r.vencidos],
    ['Novos (7 dias)', r.novos_7d], ['Fornecedores', r.fornecedores], ['Produtos', r.produtos], ['Pagamentos a confirmar', r.pagamentos_pendentes]];
  html('adm-kpis', itens.map(function (i) { return '<div class="kpi"><div class="v">' + numero(i[1]) + '</div><div class="l">' + esc(i[0]) + '</div></div>'; }).join(''));
  var badge = $('nav-admin-badge');
  badge.textContent = r.pagamentos_pendentes ? String(r.pagamentos_pendentes) : '';
  mostrar(badge, !!r.pagamentos_pendentes);
}
function renderAdminPagamentos(r) {
  if (r._erro) { html('adm-pagamentos', caixaErro(msgErro(r._erro), 'admin-atualizar')); return; }
  var lista = r.pagamentos || [];
  if (!lista.length) { html('adm-pagamentos', '<p class="text-muted">Nenhum aviso de pagamento esperando confirmação.</p>'); return; }
  html('adm-pagamentos', '<div class="table-wrap"><table class="tabela"><thead><tr><th scope="col">Cliente</th><th scope="col">Plano pedido</th><th scope="col">Observação</th><th scope="col">Quando</th><th scope="col" class="acoes"><span class="sr-only">Ações</span></th></tr></thead><tbody>' +
    lista.map(function (p) {
      return '<tr><td><div class="cell-nome">' + esc(p.nome) + '</div><div class="cell-sub">' + esc(p.email) + '</div></td>' +
        '<td><span class="badge badge-blue">' + esc(NOMES_PLANO[p.plano] || p.plano) + '</span></td>' +
        '<td>' + (p.observacao ? esc(p.observacao) : vazio()) + '</td><td>' + esc(dataHoraBR(p.criado_em)) + '</td>' +
        '<td class="acoes"><button type="button" class="btn btn-primary btn-sm" data-acao="admin-aprovar" data-id="' + esc(p.id) + '">' + ICONES.ok + 'Confirmar pagamento</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-acao="admin-recusar" data-id="' + esc(p.id) + '">Recusar</button></td></tr>';
    }).join('') + '</tbody></table></div>');
}
function renderAdminUsuarios(r) {
  if (r._erro) { html('adm-usuarios', caixaErro(msgErro(r._erro), 'admin-atualizar')); return; }
  var lista = r.usuarios || [];
  if (!lista.length) { html('adm-usuarios', '<p class="text-muted">Nenhum cliente ainda.</p>'); return; }
  var opcoes = Object.keys(NOMES_PLANO).filter(function (k) { return k !== 'trial'; }).map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(NOMES_PLANO[k]) + '</option>';
  }).join('');
  html('adm-usuarios', '<div class="table-wrap"><table class="tabela"><thead><tr><th scope="col">Cliente</th><th scope="col">Plano</th><th scope="col">Situação</th><th scope="col" class="centro">Uso</th><th scope="col">Desde</th><th scope="col" class="acoes">Liberar plano</th></tr></thead><tbody>' +
    lista.map(function (u) {
      var situacao = u.status === 'suspenso' ? '<span class="badge badge-red">Suspenso</span>'
        : u.acesso === 'expirado' ? '<span class="badge badge-yellow">Vencido</span>'
          : '<span class="badge badge-green">Ativo' + (u.dias_restantes != null ? ' · ' + esc(u.dias_restantes) + 'd' : '') + '</span>';
      var ehEu = ESTADO.usuario && ESTADO.usuario.id === u.id;
      return '<tr><td><div class="cell-nome">' + esc(u.nome) + '</div><div class="cell-sub">' + esc(u.email) + '</div></td>' +
        '<td>' + esc(NOMES_PLANO[u.plano] || u.plano) + '</td><td>' + situacao + '</td>' +
        '<td class="centro text-sm">' + numero(u.fornecedores) + ' forn. · ' + numero(u.produtos) + ' prod.</td>' +
        '<td>' + esc(dataBR(u.criado_em)) + '</td>' +
        '<td class="acoes"><div class="flex gap-2 items-center" style="justify-content:flex-end;flex-wrap:wrap">' +
          '<label class="sr-only" for="adm-plano-' + esc(u.id) + '">Plano para ' + esc(u.nome) + '</label>' +
          '<select class="select adm-sel" id="adm-plano-' + esc(u.id) + '">' + opcoes + '</select>' +
          '<button type="button" class="btn btn-primary btn-sm" data-acao="admin-ativar" data-id="' + esc(u.id) + '">Liberar</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-acao="admin-link-senha" data-id="' + esc(u.id) + '" title="Gerar link de nova senha para mandar ao cliente">Link de senha</button>' +
          (ehEu ? '' : (u.status === 'suspenso'
            ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="admin-status" data-id="' + esc(u.id) + '" data-status="ativo">Reativar</button>'
            : '<button type="button" class="btn btn-danger btn-sm" data-acao="admin-status" data-id="' + esc(u.id) + '" data-status="suspenso">Suspender</button>')) +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div>');
}
function renderAdminDiagnostico(d) {
  if (d._erro) { html('adm-diagnostico', caixaErro(msgErro(d._erro), 'admin-atualizar')); return; }
  function linha(rotulo, valorHtml) { return '<div><span>' + esc(rotulo) + '</span><strong>' + valorHtml + '</strong></div>'; }
  var ok = '<span class="text-ok">OK</span>';
  var rls = (d.banco && d.banco.rls) || [];
  var semRls = rls.filter(function (t) { return !t.relrowsecurity; }).map(function (t) { return t.relname; });
  var ia = d.ia || {};
  var iaTxt = !(ia.openrouter ? ia.openrouter.configurado : ia.configurada) ? '<span style="color:var(--warning)">sem chave do OpenRouter</span>'
    : ia.teste ? (ia.teste.ok ? '<span class="text-ok">respondeu (' + esc(ia.teste.modelo) + ')</span>' : '<span style="color:var(--danger)">' + esc(ia.teste.erro) + '</span>')
      : (ia.ultimo_sucesso ? '<span class="text-ok">funcionando</span>' + (ia.modelo_atual ? ' · ' + esc(ia.modelo_atual) : '') : 'configurada (clique em Testar a IA)');
  html('adm-diagnostico', '<div class="diag-lista">' +
    linha('API', ok + ' · versão ' + esc(d.versao) + ' · Node ' + esc(d.node)) +
    linha('Banco de dados', d.banco && d.banco.ok ? ok + ' · ' + esc(d.banco.ms) + ' ms' : '<span style="color:var(--danger)">fora do ar</span>') +
    linha('Proteção das tabelas (RLS)', !rls.length ? '—' : (semRls.length ? '<span style="color:var(--warning)">desligada em ' + esc(semRls.join(', ')) + '</span>' : '<span class="text-ok">ligada em ' + rls.length + ' tabelas</span>')) +
    linha('Google Gemini (leitura principal)', ia.gemini && ia.gemini.configurado
      ? (ia.gemini.ativo ? '<span class="text-ok">ligado</span>' + (ia.gemini.ultimo_sucesso ? ' · funcionando' : '') + ' · ' + esc((ia.gemini.modelos || []).join(', '))
        : '<span style="color:var(--warning)">' + esc(ia.gemini.ultimo_erro || 'chave recusada') + '</span>')
      : '<span style="color:var(--warning)">sem chave</span> <span class="text-sm text-muted">(chave grátis em aistudio.google.com → Get API key; ' +
        'na Vercel: Settings → Environment Variables → GEMINI_API_KEY)</span>') +
    linha('IA (OpenRouter)', iaTxt) +
    (ia.configurada ? linha('Leitura de páginas pela IA', ia.visao ? ok + ' · ' + esc(ia.modelos_visao) + ' modelos gratuitos de imagem' + (ia.modelo_visao ? ' · ' + esc(ia.modelo_visao) : '')
      : '<span style="color:var(--warning)">nenhum modelo gratuito de imagem disponível agora</span>') : '') +
    (ia.cota && ia.cota.limite ? linha('Cota gratuita de hoje', esc(numero(ia.cota.restante)) + ' de ' + esc(numero(ia.cota.limite)) + ' leituras restantes' +
      (ia.cota.limite <= 50 ? ' <span class="text-sm text-muted">(com US$ 10 em créditos no OpenRouter sobe para 1.000 por dia)</span>' : '')) : '') +
    (ia.ultimo_erro ? linha('Último erro da IA', '<span class="text-sm">' + esc(ia.ultimo_erro) + '</span>') : '') +
    (ia.ultimos_motivos && ia.ultimos_motivos.length ? linha('Tentativas da última falha', '<span class="text-sm">' + esc(ia.ultimos_motivos.join(' · ')) + '</span>') : '') +
    linha('E-mail de recuperação de senha', d.email && d.email.configurado ? ok : '<span style="color:var(--warning)">não configurado</span>') +
    linha('Administradores configurados', esc(d.admin_emails)) +
    '</div>');
}
function adminAcao(promessa, botao, sucesso) {
  setLoading(botao, true, 'Aguarde…');
  return promessa.then(function (r) {
    showToast((r && r.msg) || sucesso || 'Feito.', 'success', 5000);
    carregarAdmin();
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'Não foi possível concluir.'), 'error');
  });
}
function gerarLinkSenha(id, botao) {
  setLoading(botao, true, 'Gerando…');
  apiPost('/api/admin/usuarios/' + id + '/link-senha', {}).then(function (r) {
    setLoading(botao, false);
    html('adm-link-senha', '<div class="banner info mb-3"><span>Link de nova senha para <strong>' + esc(r.email) + '</strong> (vale até ' + esc(dataHoraBR(r.expira_em)) + '):</span>' +
      '<input class="input mt-2" id="adm-link-senha-url" readonly value="' + esc(r.url) + '" aria-label="Link de nova senha">' +
      '<div class="acoes"><button type="button" class="btn btn-primary btn-sm" data-acao="copiar-campo" data-alvo="adm-link-senha-url">Copiar link</button></div></div>');
    copiarTexto(r.url).then(function () {
      showToast('Link copiado. Mande ao cliente pelo WhatsApp: ele escolhe a nova senha ao abrir.', 'success', 6000);
    }, function () { showToast('Link gerado. Copie o link que apareceu acima.', 'info'); });
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'Não foi possível gerar o link.'), 'error');
  });
}
function copiarCampo(idCampo) {
  var campo = $(idCampo);
  if (!campo) return;
  copiarTexto(campo.value).then(function () { showToast('Copiado.', 'success'); }, function () {
    campo.select();
    showToast('Selecionei o texto: use Ctrl+C para copiar.', 'info');
  });
}
function testarIAAdmin(botao) {
  setLoading(botao, true, 'Testando…');
  apiGet('/api/admin/diagnostico?testar_ia=1').then(function (d) {
    setLoading(botao, false);
    renderAdminDiagnostico(d);
    var t = d.ia && d.ia.teste;
    showToast(t && t.ok ? 'A IA respondeu: ' + t.modelo : 'A IA não respondeu: ' + ((t && t.erro) || 'sem chave configurada'), t && t.ok ? 'success' : 'warning', 7000);
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err), 'error');
  });
}
function baixarBackup(botao) {
  setLoading(botao, true, 'Gerando…');
  apiGet('/api/admin/backup').then(function (dados) {
    setLoading(botao, false);
    baixarArquivo('licitafacil-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(dados, null, 2), 'application/json');
    showToast('Backup baixado. Guarde o arquivo em um lugar seguro.', 'success');
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'Não foi possível gerar o backup.'), 'error');
  });
}

// ─── Confirmação ───────────────────────────────────────────────────
function confirmar(titulo, texto, rotuloOk, acao) {
  $('confirmar-titulo').textContent = titulo;
  $('confirmar-texto').textContent = texto;
  $('btn-confirmar-ok').textContent = rotuloOk || 'Confirmar';
  ESTADO.confirmar = acao;
  openModal('modal-confirmar');
}
function executarConfirmacao(botao) {
  var acao = ESTADO.confirmar;
  if (!acao) { closeModal('modal-confirmar'); return; }
  setLoading(botao, true, 'Aguarde…');
  Promise.resolve().then(acao).then(function () {
    ESTADO.confirmar = null;
    setLoading(botao, false);
    closeModal('modal-confirmar');
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'Não foi possível concluir.'), 'error');
  });
}

function sair() {
  apiPost('/api/auth/logout', {}).catch(function () { /* sai mesmo assim */ }).then(function () {
    try { localStorage.removeItem('lf_token'); } catch (e) { /* ignora */ }
    window.location.href = '/login.html';
  });
}

// ─── Eventos (um único ouvinte por tipo) ────────────────────────────
function aoClicar(e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-acao]') : null;
  if (!el || el.disabled) return;
  var acao = el.getAttribute('data-acao');
  var id = el.getAttribute('data-id');
  var cid = el.getAttribute('data-cid');
  switch (acao) {
    case 'ir': e.preventDefault(); navegar(el.getAttribute('data-secao')); break;
    case 'menu': alternarMenu(); break;
    case 'fechar-menu': fecharMenuMobile(); break;
    case 'fonte': mudarFonte(el.getAttribute('data-valor')); break;
    case 'tema': mudarTema(el.getAttribute('data-valor')); break;
    case 'sair': sair(); break;
    case 'exemplo': usarExemplo(el.textContent.trim()); break;
    case 'perguntar-ia': perguntarIA(); break;
    case 'buscar-de-novo': buscar(); break;
    case 'ver-fornecedor': navegar('fornecedor/' + id); break;
    case 'novo-fornecedor': abrirModalFornecedor(null); break;
    case 'editar-fornecedor': abrirModalFornecedor(id); break;
    case 'excluir-fornecedor': pedirExclusaoFornecedor(id); break;
    case 'recarregar-fornecedores': carregarFornecedores(); break;
    case 'recarregar-detalhe': if (ESTADO.fornecedor) carregarDetalhe(ESTADO.fornecedor.id); else rotear(); break;
    case 'aba': mudarAba(el.getAttribute('data-aba')); break;
    case 'modo-entrada': mudarModoEntrada(el.getAttribute('data-modo')); break;
    case 'copiar-prompt': copiarPromptMestre(el); break;
    case 'indexar-colado': indexarColado(); break;
    case 'imp-comecar': comecarLeitura(); break;
    case 'imp-cancelar': cancelarImportacao(); el.disabled = true; el.textContent = 'Cancelando…'; break;
    case 'imp-descartar': descartarImportacao(true); break;
    case 'imp-descartar-confirmar':
      confirmar('Descartar leitura', 'Os produtos lidos deste catálogo não serão salvos. Descartar mesmo assim?', 'Descartar', function () { descartarImportacao(); });
      break;
    case 'imp-salvar': salvarImportacao(el); break;
    case 'imp-reler': relerPaginasImportacao(el); break;
    case 'imp-mais': if (ESTADO.importacao) { ESTADO.importacao.limite += 300; atualizarTabelaRevisao(ESTADO.importacao); } break;
    case 'imp-novo':
      var telaNovo = ESTADO.importacao ? ESTADO.importacao.ctx.tela : 'importar';
      descartarImportacao(true);
      mostrarImportacao(telaNovo);
      break;
    case 'imp-ir':
      if (ESTADO.importacao) navegar(ESTADO.importacao.ctx.tela === 'fornecedor' ? 'fornecedor/' + ESTADO.importacao.fornecedorId + '/adicionar' : 'importar');
      break;
    case 'adicionar-catalogo': navegar('fornecedor/' + id + '/adicionar'); break;
    case 'detalhes-produto': alternarDetalhesProduto(el); break;
    case 'novo-produto': abrirModalProduto(null); break;
    case 'editar-produto': abrirModalProduto(el.getAttribute('data-pid')); break;
    case 'excluir-produto': pedirExclusaoProduto(el.getAttribute('data-pid')); break;
    case 'salvar-produto-outro': salvarProdutoManual(null, true); break;
    case 'mais-produtos': ESTADO.produtosLimite += 200; renderProdutos(); break;
    case 'exportar-produtos': exportarProdutosCSV(); break;
    case 'reprocessar': reprocessarCatalogo(cid, el); break;
    case 'estruturar': organizarComIA(cid); break;
    case 'organizar-parar': if (ESTADO.organizando) { ESTADO.organizando.parar = true; el.disabled = true; el.textContent = 'Parando…'; } break;
    case 'excluir-catalogo': pedirExclusaoCatalogo(cid); break;
    case 'confirmar-ok': executarConfirmacao(el); break;
    case 'fechar-modal': closeModal(el.getAttribute('data-modal')); break;
    case 'admin-atualizar': carregarAdmin(); break;
    case 'admin-backup': baixarBackup(el); break;
    case 'admin-testar-ia': testarIAAdmin(el); break;
    case 'admin-aprovar': adminAcao(apiPost('/api/admin/pagamentos/' + id + '/aprovar', {}), el, 'Pagamento confirmado e plano liberado.'); break;
    case 'admin-recusar': adminAcao(apiPost('/api/admin/pagamentos/' + id + '/recusar', {}), el, 'Aviso de pagamento recusado.'); break;
    case 'admin-ativar': adminAcao(apiPost('/api/admin/usuarios/' + id + '/plano', { plano: valor('adm-plano-' + id) }), el); break;
    case 'admin-status': adminAcao(apiPost('/api/admin/usuarios/' + id + '/status', { status: el.getAttribute('data-status') }), el,
      el.getAttribute('data-status') === 'suspenso' ? 'Cliente suspenso.' : 'Cliente reativado.'); break;
    case 'admin-link-senha': gerarLinkSenha(id, el); break;
    case 'copiar-campo': copiarCampo(el.getAttribute('data-alvo')); break;
    case 'tentar-de-novo': window.location.reload(); break;
    case 'atualizar-versao': window.location.reload(); break;
    default: break;
  }
}

function ligarDropzone(idZona, idInput, tela) {
  var dz = $(idZona);
  var input = $(idInput);
  if (!dz || !input) return;
  dz.addEventListener('click', function () { input.click(); });
  dz.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('arrastando'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('arrastando'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.classList.remove('arrastando');
    var arquivos = e.dataTransfer && e.dataTransfer.files;
    if (arquivos && arquivos.length) iniciarImportacao(arquivos, tela);
  });
  input.addEventListener('change', function () {
    var arquivos = Array.prototype.slice.call(input.files || []);
    input.value = '';
    if (arquivos.length) iniciarImportacao(arquivos, tela);
  });
}

function ligarEventos() {
  document.addEventListener('click', aoClicar);
  $('form-busca').addEventListener('submit', function (e) { e.preventDefault(); buscar(); });
  $('campo-busca').addEventListener('focus', acordarServidor, { once: true });
  $('filtro-fornecedores').addEventListener('input', debounce(renderFornecedores, 120));
  $('filtro-produtos').addEventListener('input', debounce(function () { ESTADO.produtosLimite = 200; renderProdutos(); }, 150));
  $('form-fornecedor').addEventListener('submit', salvarFornecedor);
  $('form-produto').addEventListener('submit', function (e) { salvarProdutoManual(e, false); });
  $('prod-nome').addEventListener('input', function () { mostrar('prod-erro', false); });
  $('form-perfil').addEventListener('submit', salvarPerfil);
  $('form-aviso-pagamento').addEventListener('submit', avisarPagamento);
  $('colar-texto').addEventListener('input', debounce(atualizarContadorColado, 200));
  document.querySelector('.abas-nav').addEventListener('keydown', teclasAbas);

  ligarDropzone('dropzone', 'input-arquivo', 'fornecedor');
  ligarDropzone('dz-importar', 'input-importar', 'importar');
  document.addEventListener('change', aoMudarRevisao);
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'imp-filtro') filtrarRevisao(); });

  window.addEventListener('hashchange', rotear);
  window.addEventListener('lf:plano-expirado', aoPlanoExpirado);
  window.addEventListener('resize', debounce(function () {
    if (!ehMobile()) { fecharMenuMobile(); prepararMenu(); }
  }, 200));
  window.addEventListener('beforeunload', function (e) {
    var imp = ESTADO.importacao;
    if ((imp && (imp.fase === 'lendo' || imp.fase === 'revisar')) || ESTADO.organizando) { e.preventDefault(); e.returnValue = ''; }
  });
}

// Falha inesperada: mostra aviso amigável (sem tela branca)
window.addEventListener('error', function (ev) {
  if (!ev || !ev.message || $('erro-geral')) return;
  if (ev.filename && ev.filename.indexOf(window.location.origin) !== 0) return; // extensões do navegador
  var box = document.createElement('div');
  box.id = 'erro-geral';
  box.className = 'banner erro';
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-width:520px;margin:0 auto;z-index:1000';
  box.innerHTML = '<span>Algo não carregou direito nesta tela.</span><div class="acoes"><button type="button" class="btn btn-primary btn-sm" data-acao="tentar-de-novo">Recarregar</button></div>';
  document.body.appendChild(box);
});

// ─── Versão nova publicada: avisa para atualizar (a tela aberta há horas continua com o código antigo) ───
var VERSAO_APP = '3.4.0'; // igual ao ?v= dos arquivos e à versão da API (conferido pelo teste testes/versao.test.js)
function compararVersao(a, b) {
  var x = String(a || '0').split('.'), y = String(b || '0').split('.');
  for (var i = 0; i < 3; i++) {
    var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
    if (d) return d;
  }
  return 0;
}
function verificarVersaoNova() {
  if (ESTADO.versaoNova || API_URL !== '') return; // só com a API do mesmo domínio (mesma publicação do site)
  fetch('/api/health?sonda=1', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (h) {
    if (!h || !h.version || compararVersao(h.version, VERSAO_APP) <= 0 || ESTADO.versaoNova) return;
    ESTADO.versaoNova = h.version;
    var div = document.createElement('div');
    div.className = 'aviso-versao';
    div.setAttribute('role', 'status');
    div.innerHTML = '<span>Saiu uma versão nova do LicitaFácil (' + esc(h.version) + ').</span>' +
      '<button type="button" class="btn btn-primary btn-sm" data-acao="atualizar-versao">Atualizar agora</button>';
    document.body.appendChild(div);
  }).catch(function () { /* sem rede: tenta depois */ });
}

function iniciar() {
  ligarEventos();
  marcarPreferencias();
  prepararMenu();
  requireLogin(function (u, err) {
    mostrar('carregando-inicial', false);
    if (!u) {
      html('banners', caixaErro(msgErro(err, 'Não consegui falar com o servidor agora.') + ' Ele pode estar iniciando.', 'tentar-de-novo', 'Tentar de novo'));
      return;
    }
    ESTADO.usuario = u;
    renderUsuario();
    rotear();
    setInterval(verificarVersaoNova, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') verificarVersaoNova(); });
  });
}

iniciar();
