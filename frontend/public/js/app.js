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
  avisoPlanoMostrado: false
};

var TITULOS = { busca: 'Buscar produtos', fornecedores: 'Fornecedores', detalhe: 'Fornecedor', config: 'Configurações', admin: 'Painel do dono' };
var NOMES_PLANO = { trial: 'Teste grátis', mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
var ORIGENS = {
  texto_colado: 'Texto colado', pdf_navegador: 'PDF lido no navegador', ocr_navegador: 'PDF escaneado (OCR)',
  imagem_ocr: 'Foto (OCR)', pdf_servidor: 'PDF lido no servidor', reprocessado: 'Relido', ia: 'Organizado pela IA'
};
var FORMATOS = { prompt_mestre: 'Prompt Mestre', json: 'JSON', tabela: 'Tabela', texto: 'Texto livre' };
var IA_ATIVA = ['na_fila', 'estruturando'];
var MAX_ARQUIVO_MB = 50;
var MAX_TEXTO = 3000000;

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
function html(id, conteudo) { var el = $(id); if (el) el.innerHTML = conteudo; }
function valor(id) { var el = $(id); return el ? String(el.value || '') : ''; }
function plural(n, um, varios) { return n === 1 ? um : varios; }
function numero(n) { return (Number(n) || 0).toLocaleString('pt-BR'); }
function vazio() { return '<span class="text-muted" title="não informado">—</span>'; }
function inicial(nome) { var s = String(nome || '').trim(); return s ? s.charAt(0).toUpperCase() : '?'; }
function ehMobile() { return window.matchMedia && window.matchMedia('(max-width: 768px)').matches; }

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
      '<span' + (opcoes.compacto ? ' class="sr-only"' : '') + '>' + (opcoes.compacto ? 'E-mail' : esc(f.email)) + '</span></a>');
  }
  return partes.length ? '<div class="contatos">' + partes.join('') + '</div>' : '<span class="text-sm text-muted">Sem contato cadastrado</span>';
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
  if (['busca', 'fornecedores', 'config', 'admin'].indexOf(secao) < 0) secao = 'busca';
  if (secao === 'admin' && !ESTADO.usuario.admin) secao = 'busca';
  mostrarSecao(secao);
  if (secao === 'busca') entrarBusca();
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
    etapa(1, temForn, 'Cadastre um fornecedor', 'Nome e contato de quem vende para você (WhatsApp, telefone ou e-mail).',
      temForn ? '' : '<button type="button" class="btn btn-primary btn-sm" data-acao="novo-fornecedor">' + ICONES.mais + 'Cadastrar fornecedor</button>') +
    etapa(2, false, 'Adicione o catálogo', 'Envie o PDF (com texto ou escaneado) ou cole a resposta do Prompt Mestre.',
      temForn ? '<button type="button" class="btn btn-primary btn-sm" data-acao="ir" data-secao="fornecedores">' + ICONES.enviar + 'Escolher fornecedor</button>' : '') +
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
  return apiPost('/api/busca', { consulta: q, limite: 10, limite_produtos: 60 }, { timeout: 60000 }).then(function (r) {
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
function renderResultados(r, q) {
  var re = criarDestaque(q);
  var produtos = r.produtos || [];
  var trechos = (r.fornecedores || []).filter(function (f) { return f.trecho && !f.produtos_encontrados; });
  if (!produtos.length && !trechos.length) {
    var semCatalogo = ESTADO.stats && ESTADO.stats.total_catalogos === 0;
    html('resultados', caixaVazia(ICONES.busca, semCatalogo ? 'Ainda não há catálogos para buscar' : 'Nada encontrado para “' + q + '”',
      semCatalogo ? 'Adicione o catálogo de um fornecedor e a busca passa a encontrar os produtos dele.'
        : 'Tente só a medida (ex.: <strong>2,5mm</strong>), só a norma ou só o código. Confira também se o catálogo do fornecedor já foi adicionado.',
      '<button type="button" class="btn btn-secondary" data-acao="ir" data-secao="fornecedores">' + ICONES.enviar + 'Adicionar catálogo</button>'));
    return;
  }
  var partes = [];
  if (produtos.length) {
    partes.push('<div class="secao-titulo"><h3>Produtos encontrados</h3><span class="contagem">' +
      (r.total_produtos > produtos.length ? 'mostrando ' + produtos.length + ' de ' + numero(r.total_produtos) : numero(produtos.length) + ' ' + plural(produtos.length, 'produto', 'produtos')) +
      '</span></div>');
    partes.push('<div class="tabela-produtos-wrap mb-4"><div class="table-wrap"><table class="tabela"><caption class="sr-only">Produtos encontrados para ' + esc(q) + '</caption>' +
      '<thead><tr><th scope="col">Produto</th><th scope="col">Especificações</th><th scope="col" class="num">Preço</th><th scope="col">Fornecedor</th><th scope="col" class="centro">Combina</th></tr></thead><tbody>' +
      produtos.map(function (p) { return linhaResultadoProduto(p, re); }).join('') + '</tbody></table></div>' +
      '<div class="lista-cards">' + produtos.map(function (p) { return cardResultadoProduto(p, re); }).join('') + '</div></div>');
  }
  if (trechos.length) {
    partes.push('<div class="secao-titulo"><h3>' + (produtos.length ? 'Também citado nos catálogos' : 'Encontrado nos catálogos') + '</h3><span class="contagem">' +
      trechos.length + ' ' + plural(trechos.length, 'fornecedor', 'fornecedores') + '</span></div>');
    partes.push('<div class="forn-grid">' + trechos.map(function (f) {
      return '<div class="forn-card"><div class="topo"><div class="nome">' + esc(f.nome) + '</div><span class="rel rel-' + esc(f.relevancia) + '">' + esc(f.score) + '%</span></div>' +
        '<div class="trecho">' + marcar(f.trecho, re) + '</div>' +
        (f.nome_arquivo ? '<div class="text-sm text-muted">' + ICONES.arquivo.replace('<svg ', '<svg width="14" height="14" style="display:inline;vertical-align:-2px;margin-right:4px" ') + esc(f.nome_arquivo) + '</div>' : '') +
        htmlContatos(f, { compacto: false }) +
        '<div><button type="button" class="btn btn-ghost btn-sm" data-acao="ver-fornecedor" data-id="' + esc(f.fornecedor_id) + '">' + ICONES.olho + 'Ver fornecedor</button></div></div>';
    }).join('') + '</div>');
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
    return normalizar([f.nome, f.email, f.telefone, f.whatsapp, f.observacoes].join(' ')).indexOf(filtro) >= 0;
  });
  var total = ESTADO.fornecedores.length;
  $('contagem-fornecedores').textContent = total ? (filtro ? lista.length + ' de ' + total : total + ' ' + plural(total, 'fornecedor', 'fornecedores')) : '';
  if (!total) {
    html('lista-fornecedores', caixaVazia(ICONES.predio, 'Nenhum fornecedor ainda',
      'Cadastre o primeiro fornecedor e depois adicione o catálogo dele. Em minutos os produtos aparecem na busca.',
      '<button type="button" class="btn btn-primary" data-acao="novo-fornecedor">' + ICONES.mais + 'Cadastrar fornecedor</button>'));
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
  $('forn-obs').value = f ? (f.observacoes || '') : '';
  mostrar('forn-erro', false);
  openModal('modal-fornecedor');
}
function salvarFornecedor(e) {
  if (e) e.preventDefault();
  var id = valor('forn-id');
  var dados = {
    nome: valor('forn-nome').trim(), telefone: valor('forn-telefone').trim(), whatsapp: valor('forn-whatsapp').trim(),
    email: valor('forn-email').trim(), observacoes: valor('forn-obs').trim()
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
    html('resultado-arquivo', '');
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
    '<p class="forn-espec">' + (f.observacoes ? esc(f.observacoes) : 'Sem especialidade cadastrada.') + '</p>' + htmlContatos(f) + '</div>' +
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
    ESTADO.produtos = (r.produtos || []).map(function (p) {
      var at = p.atributos || {};
      p._busca = normalizar(CAMPOS_PRODUTO.map(function (c) { return p[c[0]] || ''; }).join(' ') + ' ' +
        Object.keys(at).map(function (k) { return k + ' ' + at[k]; }).join(' '));
      return p;
    });
    ESTADO.produtosLimite = 200;
    $('badge-produtos').textContent = numero(ESTADO.produtos.length);
    renderProdutos();
  }).catch(function (err) {
    mostrar('produtos-conteudo', false);
    html('produtos-vazio', caixaErro(msgErro(err, 'Não foi possível carregar os produtos.'), 'recarregar-detalhe'));
    mostrar('produtos-vazio', true);
  });
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
      '<td class="acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="detalhes-produto" data-pid="' + esc(p.id) + '" aria-expanded="false">Detalhes</button></td>' +
      '</tr>';
  }).join(''));
  html('cards-produtos', visiveis.map(function (p) {
    var specs = spec('Medida', p.bitola, re, true) + spec('Tensão', p.tensao, re) + spec('Material', p.material, re) + (p.norma ? '<span class="norma">' + marcar(p.norma, re) + '</span>' : '');
    return '<div class="p-card"><div class="topo"><div><div class="prod-nome">' + marcar(p.nome, re) + '</div>' + (p.codigo ? '<span class="cod">' + marcar(p.codigo, re) + '</span>' : '') + '</div>' +
      (p.preco ? '<div class="num"><div class="preco">' + esc(p.preco) + '</div><div class="unid">' + esc(p.unidade || '') + '</div></div>' : '') + '</div>' +
      (specs ? '<div class="specs">' + specs + '</div>' : '') +
      '<details><summary>Ver todos os dados</summary>' + detalhesProdutoHTML(p) + '</details></div>';
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
    meta.push(numero(c.total_chunks || 0) + ' ' + plural(c.total_chunks || 0, 'trecho', 'trechos') + ' na busca');
    var iaAtiva = IA_ATIVA.indexOf(c.ia_status) >= 0;
    var ia = c.ia_info ? '<div class="cat-ia">' + (iaAtiva ? '<span class="spinner" aria-hidden="true"></span>' : (c.ia_status === 'concluido' ? ICONES.ok : ICONES.info)) + '<span>' + esc(c.ia_info) + '</span></div>' : '';
    var podeOrganizar = c.status === 'processado' && !(c.total_produtos || c.produtos_gravados) && !iaAtiva;
    return '<div class="cat-item">' +
      '<div class="cat-ico" aria-hidden="true">' + ICONES.arquivo + '</div>' +
      '<div class="cat-info"><div class="cat-nome" title="' + esc(c.nome_arquivo) + '">' + esc(c.nome_arquivo || 'Catálogo') + '</div>' +
        '<div class="cat-meta">' + esc(meta.join(' · ')) + '</div>' + ia +
        (c.status === 'erro' && c.erro ? '<div class="form-error mt-2">' + esc(c.erro) + '</div>' : '') + '</div>' +
      textoStatusCatalogo(c) +
      '<div class="cat-acoes">' +
        (podeOrganizar ? '<button type="button" class="btn btn-primary btn-sm" data-acao="estruturar" data-cid="' + esc(c.id) + '">' + ICONES.ia + 'Organizar com IA</button>' : '') +
        (c.status === 'processado' ? '<button type="button" class="btn btn-secondary btn-sm" data-acao="reprocessar" data-cid="' + esc(c.id) + '" title="Ler de novo o texto salvo deste catálogo">' + ICONES.reler + 'Reler</button>' : '') +
        '<button type="button" class="btn btn-danger btn-sm" data-acao="excluir-catalogo" data-cid="' + esc(c.id) + '">' + ICONES.lixo + 'Excluir</button>' +
      '</div></div>';
  }).join(''));
}
function acompanharCatalogos() {
  pararAcompanhamento();
  var f = ESTADO.fornecedor;
  if (!f || ESTADO.secao !== 'detalhe') return;
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
function estruturarCatalogo(cid, botao) {
  var f = ESTADO.fornecedor;
  if (!f) return;
  setLoading(botao, true, 'Enviando…');
  apiPost('/api/fornecedores/' + f.id + '/catalogo/' + cid + '/estruturar', {}).then(function (r) {
    showToast(r.msg || 'A IA começou a organizar os produtos.', 'success', 5000);
    carregarDetalhe(f.id);
  }).catch(function (err) {
    setLoading(botao, false);
    showToast(msgErro(err, 'A IA não está disponível agora. Use o Prompt Mestre.'), 'error', 6000);
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
function atualizarProgresso(texto, pct) {
  mostrar('progresso-leitura', true);
  $('progresso-texto').textContent = texto;
  var p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  $('progresso-pct').textContent = p + '%';
  $('progresso-fill').style.width = p + '%';
  $('progresso-barra').setAttribute('aria-valuenow', String(p));
}
function resumoIndexacao(r, extra) {
  var partes = [];
  if (r.produtos) {
    partes.push('<strong>' + ICONES.ok.replace('<svg ', '<svg width="16" height="16" style="display:inline;vertical-align:-3px;margin-right:6px" ') + 'Pronto! ' +
      numero(r.produtos) + ' ' + plural(r.produtos, 'produto organizado', 'produtos organizados') + '</strong> e ' + numero(r.trechos) + ' trechos na busca.');
  } else {
    partes.push('<strong>Catálogo lido: ' + numero(r.trechos) + ' ' + plural(r.trechos, 'trecho', 'trechos') + ' já aparecem na busca.</strong>');
    if (r.ia === 'na_fila') partes.push('O texto não estava no formato do Prompt Mestre, então <strong>a IA está organizando a tabela de produtos</strong>. Acompanhe na aba Catálogos.');
    else partes.push('O texto não estava no formato do Prompt Mestre. Para ter a tabela de produtos, use “Colar a resposta da IA”.');
  }
  if (r.fornecedor_atualizado && r.fornecedor_atualizado.length) partes.push('Contato completado com o catálogo: ' + esc(r.fornecedor_atualizado.join(', ')) + '.');
  if (extra) partes.push(esc(extra));
  return '<div class="resultado-ok fade-in" role="status"><p>' + partes.join('</p><p class="mt-2">') + '</p>' +
    '<div class="flex gap-2 mt-3" style="flex-wrap:wrap"><button type="button" class="btn btn-primary btn-sm" data-acao="aba" data-aba="' + (r.produtos ? 'produtos' : 'catalogos') + '">' +
    (r.produtos ? 'Ver produtos' : 'Ver catálogos') + '</button><button type="button" class="btn btn-secondary btn-sm" data-acao="ir" data-secao="busca">' + ICONES.busca + 'Ir para a busca</button></div></div>';
}
function erroLeituraHTML(msg) {
  return '<div class="banner erro mt-4" role="alert"><span>' + esc(msg) + '</span></div>';
}
function processarArquivo(arquivo) {
  var fid = ESTADO.fornecedorId;
  if (!arquivo || !fid) return;
  if (ESTADO.leitura) { showToast('Aguarde a leitura atual terminar ou cancele.', 'warning'); return; }
  html('resultado-arquivo', '');
  var tipo = LeitorCatalogo.tipoDoArquivo(arquivo);
  if (!tipo) { html('resultado-arquivo', erroLeituraHTML('Formato não suportado. Envie PDF, JPG, PNG ou WEBP.')); return; }
  if (arquivo.size > MAX_ARQUIVO_MB * 1024 * 1024) { html('resultado-arquivo', erroLeituraHTML('Arquivo maior que ' + MAX_ARQUIVO_MB + ' MB. Divida o PDF em partes e envie uma de cada vez.')); return; }
  var controle = { cancelado: false };
  ESTADO.leitura = controle;
  var extra = '';
  atualizarProgresso('Preparando a leitura de “' + arquivo.name + '”…', 1);
  LeitorCatalogo.ler(arquivo, {
    aoProgredir: function (texto, pct) { if (!controle.cancelado) atualizarProgresso(texto, pct); },
    cancelado: function () { return controle.cancelado; }
  }).then(function (lido) {
    if (controle.cancelado) throw { code: 'CANCELADO' };
    var texto = String(lido.texto || '');
    if (texto.replace(/\s/g, '').length < 20) {
      throw { error: tipo === 'pdf' ? 'Não encontrei texto legível neste PDF, nem com OCR. Confira se as páginas não estão em branco ou muito borradas.' : 'Não consegui ler texto nesta foto. Tire outra com mais luz, sem reflexo e com a página reta.' };
    }
    if (texto.length > MAX_TEXTO) { texto = texto.slice(0, MAX_TEXTO); extra = 'O catálogo é muito grande: indexei a primeira parte. Envie o restante separado.'; }
    if (lido.paginas_ignoradas) extra = 'Li com OCR as primeiras páginas escaneadas; ' + lido.paginas_ignoradas + ' ficaram de fora. Envie o restante em outro arquivo.';
    atualizarProgresso('Organizando os produtos e preparando a busca…', 97);
    return apiPost('/api/extracao/texto/' + fid, { texto: texto, nome_arquivo: arquivo.name, origem: lido.origem, paginas: lido.paginas }, { timeout: 180000 });
  }).catch(function (err) {
    // Leitor do navegador indisponível: lê o PDF no servidor (sem guardar o arquivo)
    if (err && err.code === 'LEITOR_INDISPONIVEL' && tipo === 'pdf' && !controle.cancelado) {
      atualizarProgresso('Enviando o PDF para leitura no servidor…', 50);
      var fd = new FormData();
      fd.append('arquivo', arquivo, arquivo.name);
      return apiForm('/api/extracao/catalogo/' + fid, fd);
    }
    throw err;
  }).then(function (r) {
    ESTADO.leitura = null;
    mostrar('progresso-leitura', false);
    if (r.ia === 'na_fila') ESTADO.iaEsperada = { id: r.catalogo_id, fornecedor: fid, ate: Date.now() + 180000 };
    if (ESTADO.fornecedorId !== fid) return;
    html('resultado-arquivo', resumoIndexacao(r, extra));
    showToast(r.produtos ? numero(r.produtos) + ' produtos organizados!' : 'Catálogo lido e pronto para a busca.', 'success');
    carregarDetalhe(fid);
    carregarStats();
  }).catch(function (err) {
    ESTADO.leitura = null;
    mostrar('progresso-leitura', false);
    if (err && err.code === 'CANCELADO') { showToast('Leitura cancelada.', 'info'); return; }
    html('resultado-arquivo', erroLeituraHTML(msgErro(err, 'Não foi possível ler este arquivo.')));
  });
}
function cancelarLeitura() {
  if (!ESTADO.leitura) return;
  ESTADO.leitura.cancelado = true;
  LeitorCatalogo.cancelar();
  ESTADO.leitura = null;
  mostrar('progresso-leitura', false);
  showToast('Leitura cancelada.', 'info');
}

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
    if (r.ia === 'na_fila') ESTADO.iaEsperada = { id: r.catalogo_id, fornecedor: fid, ate: Date.now() + 180000 };
    html('resultado-colar', resumoIndexacao(r));
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
  var iaTxt = !ia.configurada ? '<span style="color:var(--warning)">sem chave do OpenRouter</span>'
    : ia.teste ? (ia.teste.ok ? '<span class="text-ok">respondeu (' + esc(ia.teste.modelo) + ')</span>' : '<span style="color:var(--danger)">' + esc(ia.teste.erro) + '</span>')
      : (ia.ultimo_sucesso ? '<span class="text-ok">funcionando</span>' + (ia.modelo_atual ? ' · ' + esc(ia.modelo_atual) : '') : 'configurada (clique em Testar a IA)');
  html('adm-diagnostico', '<div class="diag-lista">' +
    linha('API', ok + ' · versão ' + esc(d.versao) + ' · Node ' + esc(d.node)) +
    linha('Banco de dados', d.banco && d.banco.ok ? ok + ' · ' + esc(d.banco.ms) + ' ms' : '<span style="color:var(--danger)">fora do ar</span>') +
    linha('Proteção das tabelas (RLS)', !rls.length ? '—' : (semRls.length ? '<span style="color:var(--warning)">desligada em ' + esc(semRls.join(', ')) + '</span>' : '<span class="text-ok">ligada em ' + rls.length + ' tabelas</span>')) +
    linha('IA (OpenRouter)', iaTxt) +
    (ia.ultimo_erro ? linha('Último erro da IA', '<span class="text-sm">' + esc(ia.ultimo_erro) + '</span>') : '') +
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
    case 'cancelar-leitura': cancelarLeitura(); break;
    case 'detalhes-produto': alternarDetalhesProduto(el); break;
    case 'mais-produtos': ESTADO.produtosLimite += 200; renderProdutos(); break;
    case 'exportar-produtos': exportarProdutosCSV(); break;
    case 'reprocessar': reprocessarCatalogo(cid, el); break;
    case 'estruturar': estruturarCatalogo(cid, el); break;
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
    default: break;
  }
}

function ligarEventos() {
  document.addEventListener('click', aoClicar);
  $('form-busca').addEventListener('submit', function (e) { e.preventDefault(); buscar(); });
  $('campo-busca').addEventListener('focus', acordarServidor, { once: true });
  $('filtro-fornecedores').addEventListener('input', debounce(renderFornecedores, 120));
  $('filtro-produtos').addEventListener('input', debounce(function () { ESTADO.produtosLimite = 200; renderProdutos(); }, 150));
  $('form-fornecedor').addEventListener('submit', salvarFornecedor);
  $('form-perfil').addEventListener('submit', salvarPerfil);
  $('form-aviso-pagamento').addEventListener('submit', avisarPagamento);
  $('colar-texto').addEventListener('input', debounce(atualizarContadorColado, 200));
  document.querySelector('.abas-nav').addEventListener('keydown', teclasAbas);

  var dz = $('dropzone');
  var input = $('input-arquivo');
  dz.addEventListener('click', function () { input.click(); });
  dz.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('arrastando'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('arrastando'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.classList.remove('arrastando');
    var arq = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (arq) processarArquivo(arq);
  });
  input.addEventListener('change', function () {
    var arq = input.files && input.files[0];
    input.value = '';
    if (arq) processarArquivo(arq);
  });

  window.addEventListener('hashchange', rotear);
  window.addEventListener('lf:plano-expirado', aoPlanoExpirado);
  window.addEventListener('resize', debounce(function () {
    if (!ehMobile()) { fecharMenuMobile(); prepararMenu(); }
  }, 200));
  window.addEventListener('beforeunload', function (e) {
    if (ESTADO.leitura) { e.preventDefault(); e.returnValue = ''; }
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
  });
}

iniciar();
