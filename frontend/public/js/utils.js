// public/js/utils.js — cliente da API (Bearer + localStorage, sem cookie), toasts, modais, tema e helpers
var API_URL = window.LF_API_URL || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://licitafacil-api-kxks.onrender.com');

var PAGINAS_PUBLICAS = ['/login.html', '/cadastro.html', '/recuperar.html', '/resetar.html', '/planos.html'];

function paginaPublica() {
  var p = window.location.pathname;
  return PAGINAS_PUBLICAS.some(function (x) { return p.slice(-x.length) === x; });
}

function erroPadrao(msg, code, status) { return { error: msg, code: code || 'ERRO', status: status || 0 }; }

function api(method, path, body, isFormData, opcoes) {
  opcoes = opcoes || {};
  var token = null;
  try { token = localStorage.getItem('lf_token'); } catch (e) { token = null; }
  var headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var init = { method: method, headers: headers };
  if (body && !isFormData) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  else if (body && isFormData) { init.body = body; }
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var limite = opcoes.timeout || 60000;
  var timer = null;
  if (ctrl) { init.signal = ctrl.signal; timer = setTimeout(function () { ctrl.abort(); }, limite); }
  var tentativa = opcoes.tentativa || 0;

  return fetch(API_URL + path, init).then(function (r) {
    if (timer) clearTimeout(timer);
    return r.text().then(function (txt) {
      var data = null;
      try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = null; }
      if (r.status === 401) {
        if (!paginaPublica()) {
          try { localStorage.removeItem('lf_token'); } catch (e) { /* ignora */ }
          window.location.href = '/login.html';
        }
        return Promise.reject(data || erroPadrao('Sessão expirada. Entre novamente.', 'AUTH', 401));
      }
      if (r.status === 402) {
        try { window.dispatchEvent(new CustomEvent('lf:plano-expirado', { detail: data })); } catch (e) { /* ignora */ }
      }
      if (!data) return Promise.reject(erroPadrao('O servidor está iniciando ou indisponível (código ' + r.status + '). Tente de novo em alguns segundos.', 'SERVIDOR', r.status));
      if (!r.ok) { data.status = r.status; return Promise.reject(data); }
      return data;
    });
  }, function (err) {
    if (timer) clearTimeout(timer);
    // rede caiu ou servidor acordando: tenta de novo uma vez nas leituras
    if (method === 'GET' && tentativa < 1) {
      return new Promise(function (ok) { setTimeout(ok, 2500); }).then(function () {
        return api(method, path, body, isFormData, { timeout: limite, tentativa: tentativa + 1 });
      });
    }
    var abortado = err && err.name === 'AbortError';
    return Promise.reject(erroPadrao(abortado
      ? 'O servidor demorou para responder. Ele pode estar iniciando; tente de novo em alguns segundos.'
      : 'Sem conexão com o servidor. Verifique sua internet e tente de novo.', abortado ? 'TEMPO' : 'REDE'));
  });
}

function apiGet(path) { return api('GET', path); }
function apiPost(path, body, opcoes) { return api('POST', path, body || {}, false, opcoes); }
function apiPut(path, body) { return api('PUT', path, body || {}); }
function apiDelete(path) { return api('DELETE', path); }
function apiForm(path, formData) { return api('POST', path, formData, true, { timeout: 180000 }); }

// Acorda o servidor (Render gratuito dorme) enquanto a pessoa digita
function acordarServidor() {
  try { fetch(API_URL + '/api/health', { method: 'GET' }).catch(function () {}); } catch (e) { /* ignora */ }
}

function msgErro(err, padrao) { return (err && err.error) ? err.error : (padrao || 'Algo deu errado. Tente de novo.'); }

function showToast(msg, type, duration) {
  type = type || 'info'; duration = duration || 4000;
  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  var icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<strong aria-hidden="true">' + (icons[type] || 'i') + '</strong><span>' + esc(msg) + '</span>';
  container.appendChild(toast);
  setTimeout(function () { toast.classList.add('show'); }, 10);
  setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.remove(); }, 350); }, duration);
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setLoading(btn, loading, texto) {
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + esc(texto || 'Aguarde...');
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = btn.dataset.originalText || esc(texto || 'Enviar');
    delete btn.dataset.originalText;
  }
}

// ─── Modais acessíveis ─────────────────────────────────────
var _modalFocoAnterior = null;
function openModal(id) {
  var o = document.getElementById(id);
  if (!o) return;
  _modalFocoAnterior = document.activeElement;
  o.classList.add('open');
  o.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(function () {
    var alvo = o.querySelector('[data-foco-inicial]') || o.querySelector('input:not([type=hidden]), select, textarea, button');
    if (alvo) alvo.focus();
  }, 60);
}
function closeModal(id) {
  var o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('open');
  o.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
  if (_modalFocoAnterior && _modalFocoAnterior.focus) { try { _modalFocoAnterior.focus(); } catch (e) { /* ignora */ } }
}
document.addEventListener('click', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var aberto = document.querySelector('.modal-overlay.open');
    if (aberto) closeModal(aberto.id);
  }
});

// ─── Formatação ────────────────────────────────────────────
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR'); }
function formatDateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function formatPhone(tel) {
  if (!tel) return '';
  var n = String(tel).replace(/\D/g, '');
  if (n.length === 13 && n.slice(0, 2) === '55') n = n.slice(2);
  if (n.length === 11) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 7) + '-' + n.slice(7);
  if (n.length === 10) return '(' + n.slice(0, 2) + ') ' + n.slice(2, 6) + '-' + n.slice(6);
  return String(tel);
}
function truncate(s, max) { max = max || 60; if (!s) return ''; s = String(s); return s.length > max ? s.substring(0, max) + '…' : s; }
function debounce(fn, delay) { var t = null; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, delay); }; }

function linkWhatsApp(numero, mensagem) {
  var d = String(numero || '').replace(/\D/g, '');
  if (d.length < 10) return '';
  if (d.length <= 11) d = '55' + d;
  return 'https://wa.me/' + d + (mensagem ? '?text=' + encodeURIComponent(mensagem) : '');
}
function linkTelefone(numero) { var d = String(numero || '').replace(/\D/g, ''); return d.length >= 8 ? 'tel:+' + (d.length <= 11 ? '55' + d : d) : ''; }

function copiarTexto(txt) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt);
  return new Promise(function (ok, falha) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy') ? ok() : falha(new Error('cópia recusada')); } catch (e) { falha(e); }
    ta.remove();
  });
}

function baixarArquivo(nome, conteudo, tipo) {
  var blob = new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
}

// ─── Tema e fonte (aplicados antes de desenhar a tela) ─────
function lerPref(chave, padrao) { try { return localStorage.getItem(chave) || padrao; } catch (e) { return padrao; } }
function gravarPref(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado */ } }
function aplicarTema(tema) { tema = tema || 'dark'; document.documentElement.setAttribute('data-theme', tema); gravarPref('tema', tema); }
function carregarTema() {
  document.documentElement.setAttribute('data-theme', lerPref('tema', 'dark'));
  document.documentElement.setAttribute('data-font-size', lerPref('lf_fonte', 'padrao'));
}

function requireLogin(callback) {
  var token = lerPref('lf_token', '');
  if (!token) { window.location.href = '/login.html'; return; }
  apiGet('/api/auth/me').then(function (usuario) {
    if (callback) callback(usuario);
  }).catch(function (err) {
    if (err && err.status === 401) return; // api() já redirecionou
    if (callback) callback(null, err);
  });
}

function redirectIfLoggedIn() {
  if (!lerPref('lf_token', '')) return;
  apiGet('/api/auth/me').then(function () { window.location.href = '/'; }).catch(function () { /* fica na página */ });
}

carregarTema();
