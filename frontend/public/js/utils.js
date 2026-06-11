// public/js/utils.js — usa localStorage + Authorization header (sem cookie)
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000'
  : 'https://licitafacil-api-kxks.onrender.com';

function api(method, path, body, isFormData) {
  var token = localStorage.getItem('lf_token');
  var opts = { method: method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isFormData) {
    opts.body = body;
  }
  return fetch(API_URL + path, opts).then(function(r) {
    if (r.status === 401) {
      var publicPages = ['/login.html', '/cadastro.html', '/recuperar.html', '/resetar.html', '/planos.html'];
      var currentPage = window.location.pathname;
      var isPublic = publicPages.some(function(p) { return currentPage.endsWith(p); });
      if (!isPublic) { localStorage.removeItem('lf_token'); window.location.href = '/login.html'; }
      return r.json().then(function(d) { return Promise.reject(d); });
    }
    return r.json().then(function(data) {
      if (!r.ok) return Promise.reject(data);
      return data;
    });
  });
}

function apiGet(path) { return api('GET', path); }
function apiPost(path, body) { return api('POST', path, body); }
function apiPut(path, body) { return api('PUT', path, body); }
function apiDelete(path) { return api('DELETE', path); }
function apiForm(path, formData) { return api('POST', path, formData, true); }

function showToast(msg, type, duration) {
  type = type || 'info'; duration = duration || 3500;
  var container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'toast-container'; document.body.appendChild(container); }
  var icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<span style="font-size:1rem;flex-shrink:0;">' + (icons[type] || 'ℹ') + '</span><span>' + esc(msg) + '</span>';
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 400); }, duration);
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function setLoading(btn, loading, texto) {
  if (!btn) return;
  if (loading) { btn.dataset.originalText = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' + (texto ? esc(texto) : 'Aguarde...'); }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.originalText || texto || 'Enviar'; }
}

function openModal(id) { var o = document.getElementById(id); if (o) { o.classList.add('open'); document.body.style.overflow = 'hidden'; } }
function closeModal(id) { var o = document.getElementById(id); if (o) { o.classList.remove('open'); document.body.style.overflow = ''; } }
document.addEventListener('click', function(e) { if (e.target.classList.contains('modal-overlay')) { e.target.classList.remove('open'); document.body.style.overflow = ''; } });

function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR'); }
function formatDateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function formatPhone(tel) {
  if (!tel) return '';
  var n = tel.replace(/\D/g,'');
  if (n.length === 11) return '(' + n.slice(0,2) + ') ' + n.slice(2,7) + '-' + n.slice(7);
  if (n.length === 10) return '(' + n.slice(0,2) + ') ' + n.slice(2,6) + '-' + n.slice(6);
  return tel;
}
function truncate(s, max) { max = max || 60; if (!s) return ''; return s.length > max ? s.substring(0, max) + '…' : s; }
function debounce(fn, delay) { var timer = null; return function() { var args = arguments, ctx = this; clearTimeout(timer); timer = setTimeout(function() { fn.apply(ctx, args); }, delay); }; }

function aplicarTema(tema) { document.documentElement.setAttribute('data-theme', tema || 'dark'); localStorage.setItem('tema', tema || 'dark'); }
function carregarTema() { aplicarTema(localStorage.getItem('tema') || 'dark'); }

function requireLogin(callback) {
  var token = localStorage.getItem('lf_token');
  if (!token) { window.location.href = '/login.html'; return; }
  apiGet('/api/auth/me').then(function(usuario) {
    if (callback) callback(usuario);
  }).catch(function() {
    localStorage.removeItem('lf_token');
    window.location.href = '/login.html';
  });
}

function redirectIfLoggedIn() {
  var token = localStorage.getItem('lf_token');
  if (!token) return;
  apiGet('/api/auth/me').then(function() {
    window.location.href = '/';
  }).catch(function() {
    localStorage.removeItem('lf_token');
  });
}

carregarTema();
