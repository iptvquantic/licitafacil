// public/js/leitor.js — Leitor de catálogos no navegador
// PDF com texto: pdf.js (mantém uma informação por linha). PDF escaneado e fotos: OCR com tesseract.js (português).
// O arquivo nunca sai do computador da pessoa: só o texto lido é enviado ao LicitaFácil.
var LeitorCatalogo = (function () {
  'use strict';

  var BASE = String(window.LF_VENDOR_BASE || '/vendor').replace(/\/$/, '');
  var LIBS = {
    pdf: BASE + '/pdfjs-3.11.174/pdf.min.js',
    pdfWorker: BASE + '/pdfjs-3.11.174/pdf.worker.min.js',
    tesseract: BASE + '/tesseract-5.1.1/tesseract.min.js',
    tesseractWorker: BASE + '/tesseract-5.1.1/worker.min.js',
    tesseractCore: BASE + '/tesseract-5.1.1/core',
    tesseractLang: BASE + '/tesseract-5.1.1/lang'
  };
  var MIN_TEXTO_PAGINA = 25;   // menos que isso = página escaneada (imagem)
  var MAX_PAGINAS_OCR = 250;
  var MAX_LADO_OCR = 2000;     // ~240 dpi numa folha A4

  var scripts = {};
  var workerOCR = null;
  var aoProgredirOCR = null;
  var ocrEmAndamento = false;

  function erro(msg, code) { return { error: msg, code: code || 'LEITOR' }; }
  function absoluta(url) { return new URL(url, window.location.href).href; }

  function carregarScript(url) {
    if (scripts[url]) return scripts[url];
    scripts[url] = new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () {
        delete scripts[url];
        s.remove();
        falha(erro('Não consegui carregar o leitor de catálogos. Verifique sua internet e tente de novo.', 'LEITOR_INDISPONIVEL'));
      };
      document.head.appendChild(s);
    });
    return scripts[url];
  }

  function carregarPdfjs() {
    return carregarScript(LIBS.pdf).then(function () {
      if (!window.pdfjsLib) throw erro('O leitor de PDF não iniciou. Recarregue a página e tente de novo.', 'LEITOR_INDISPONIVEL');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = absoluta(LIBS.pdfWorker);
      return window.pdfjsLib;
    });
  }

  function obterWorkerOCR() {
    if (workerOCR) return workerOCR;
    workerOCR = carregarScript(LIBS.tesseract).then(function () {
      if (!window.Tesseract) throw erro('O leitor de imagens (OCR) não iniciou. Recarregue a página e tente de novo.', 'OCR_INDISPONIVEL');
      return window.Tesseract.createWorker('por', 1, {
        workerPath: absoluta(LIBS.tesseractWorker),
        corePath: absoluta(LIBS.tesseractCore),
        langPath: absoluta(LIBS.tesseractLang),
        logger: function (m) { if (aoProgredirOCR) aoProgredirOCR(m); }
      });
    }).catch(function (err) {
      workerOCR = null;
      throw (err && err.code) ? err : erro('Não consegui iniciar a leitura de imagens (OCR). Recarregue a página e tente de novo.', 'OCR_INDISPONIVEL');
    });
    return workerOCR;
  }

  // Encerra o OCR (cancelamento ou erro). O próximo uso cria outro.
  function encerrarOCR() {
    var w = workerOCR;
    workerOCR = null;
    if (w) w.then(function (wk) { try { wk.terminate(); } catch (e) { /* já encerrado */ } }, function () { /* nada */ });
  }

  // ─── Texto das páginas: junta os pedaços do pdf.js em linhas, na ordem de leitura ─
  function montarLinhas(itens) {
    var lista = [];
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i];
      if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
      var t = it.transform || [1, 0, 0, 1, 0, 0];
      var alt = Math.abs(t[3]) || Math.abs(t[0]) || it.height || 10;
      lista.push({ s: it.str, x: t[4], y: t[5], w: it.width || 0, h: alt });
    }
    lista.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var linhas = [];
    var atual = null;
    lista.forEach(function (it) {
      var tol = Math.max(1.5, Math.min(it.h, atual ? atual.h : it.h) * 0.45);
      if (!atual || Math.abs(atual.y - it.y) > tol) {
        atual = { y: it.y, h: it.h, itens: [] };
        linhas.push(atual);
      }
      atual.itens.push(it);
    });
    return linhas.map(function (l) {
      l.itens.sort(function (a, b) { return a.x - b.x; });
      var txt = '';
      var fim = null;
      l.itens.forEach(function (it) {
        if (fim !== null) {
          var gap = it.x - fim;
          if (gap > it.h * 1.8) txt += '   ';
          else if (gap > it.h * 0.12 && !/\s$/.test(txt) && !/^\s/.test(it.s)) txt += ' ';
        }
        txt += it.s;
        fim = it.x + it.w;
      });
      return txt.replace(/\s+$/, '');
    }).filter(function (s) { return s.trim(); }).join('\n');
  }

  function textoDaPagina(pagina) {
    return pagina.getTextContent().then(function (tc) { return montarLinhas(tc.items || []); });
  }

  function desenharParaOCR(origem, largura, altura, desenhar) {
    var escala = Math.min(1, MAX_LADO_OCR / Math.max(largura, altura));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(largura * escala));
    canvas.height = Math.max(1, Math.floor(altura * escala));
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return Promise.resolve(desenhar(ctx, canvas, escala, origem)).then(function () { return canvas; });
  }

  function reconhecer(worker, canvas) {
    return worker.recognize(canvas).then(function (r) {
      canvas.width = 0;
      canvas.height = 0;
      return (r && r.data && r.data.text) ? r.data.text : '';
    });
  }

  function ocrPaginaPDF(worker, pagina) {
    var base = pagina.getViewport({ scale: 1 });
    var escala = Math.max(1.2, Math.min(3, MAX_LADO_OCR / Math.max(base.width, base.height)));
    var vp = pagina.getViewport({ scale: escala });
    return desenharParaOCR(null, vp.width, vp.height, function (ctx, canvas) {
      var vpFinal = pagina.getViewport({ scale: escala * (canvas.width / vp.width) });
      return pagina.render({ canvasContext: ctx, viewport: vpFinal }).promise;
    }).then(function (canvas) { return reconhecer(worker, canvas); });
  }

  function lerPDF(arquivo, opcoes) {
    var prog = opcoes.aoProgredir;
    var cancelado = opcoes.cancelado;
    var doc = null;
    return carregarPdfjs().then(function (pdfjsLib) {
      prog('Abrindo o PDF…', 2);
      return arquivo.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
      }).catch(function (err) {
        if (err && err.name === 'PasswordException') throw erro('Este PDF tem senha. Abra no seu computador, salve uma cópia sem senha e envie de novo.', 'PDF_SENHA');
        throw erro('Não consegui abrir este PDF. Ele pode estar corrompido. Tente salvar uma nova cópia e enviar de novo.', 'PDF_INVALIDO');
      });
    }).then(function (d) {
      doc = d;
      var n = doc.numPages;
      var textos = new Array(n);
      var escaneadas = [];
      var i = 0;

      function proximaTexto() {
        if (cancelado()) return Promise.reject(erro('Leitura cancelada.', 'CANCELADO'));
        if (i >= n) return Promise.resolve();
        var num = ++i;
        prog('Lendo a página ' + num + ' de ' + n + '…', 2 + Math.round((num / n) * 46));
        return doc.getPage(num).then(function (pg) {
          return textoDaPagina(pg).then(function (t) {
            textos[num - 1] = t;
            if (t.replace(/\s/g, '').length < MIN_TEXTO_PAGINA) escaneadas.push(num);
            pg.cleanup();
          });
        }).then(proximaTexto);
      }

      function ocrEscaneadas() {
        if (!escaneadas.length) return Promise.resolve(0);
        var lista = escaneadas.slice(0, MAX_PAGINAS_OCR);
        prog('Preparando a leitura de páginas escaneadas (OCR)…', 50);
        ocrEmAndamento = true;
        return obterWorkerOCR().then(function (worker) {
          var k = 0;
          function proximaOCR() {
            if (cancelado()) return Promise.reject(erro('Leitura cancelada.', 'CANCELADO'));
            if (k >= lista.length) return Promise.resolve(lista.length);
            var num = lista[k++];
            var feito = k - 1;
            aoProgredirOCR = function (m) {
              if (m && m.status === 'recognizing text') {
                var pct = 50 + Math.round(((feito + (m.progress || 0)) / lista.length) * 46);
                prog('Lendo com OCR a página escaneada ' + k + ' de ' + lista.length + '…', pct);
              }
            };
            prog('Lendo com OCR a página escaneada ' + k + ' de ' + lista.length + '…', 50 + Math.round((feito / lista.length) * 46));
            return doc.getPage(num).then(function (pg) {
              return ocrPaginaPDF(worker, pg).then(function (t) {
                textos[num - 1] = t;
                pg.cleanup();
              });
            }).then(proximaOCR);
          }
          return proximaOCR();
        }).then(function (qtd) { ocrEmAndamento = false; aoProgredirOCR = null; return qtd; }, function (err) {
          ocrEmAndamento = false;
          aoProgredirOCR = null;
          throw err;
        });
      }

      return proximaTexto().then(ocrEscaneadas).then(function (qtdOCR) {
        var texto = textos.map(function (t) { return t || ''; }).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
        return {
          texto: texto,
          paginas: n,
          paginas_ocr: qtdOCR,
          paginas_ignoradas: Math.max(0, escaneadas.length - MAX_PAGINAS_OCR),
          origem: qtdOCR ? 'ocr_navegador' : 'pdf_navegador'
        };
      });
    }).then(function (r) {
      if (doc) { try { doc.destroy(); } catch (e) { /* ignora */ } }
      return r;
    }, function (err) {
      if (doc) { try { doc.destroy(); } catch (e) { /* ignora */ } }
      throw err;
    });
  }

  function carregarImagem(arquivo) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(arquivo).then(function (bmp) { return { img: bmp, w: bmp.width, h: bmp.height }; });
    }
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () { ok({ img: img, w: img.naturalWidth, h: img.naturalHeight, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); falha(erro('Não consegui abrir esta imagem. Use JPG, PNG ou WEBP.', 'IMAGEM_INVALIDA')); };
      img.src = url;
    });
  }

  function lerImagem(arquivo, opcoes) {
    var prog = opcoes.aoProgredir;
    prog('Preparando a leitura da foto (OCR)… Na primeira vez pode levar até 1 minuto.', 5);
    ocrEmAndamento = true;
    return carregarImagem(arquivo).catch(function () {
      throw erro('Não consegui abrir esta imagem. Use JPG, PNG ou WEBP.', 'IMAGEM_INVALIDA');
    }).then(function (im) {
      return desenharParaOCR(im, im.w, im.h, function (ctx, canvas) {
        ctx.drawImage(im.img, 0, 0, canvas.width, canvas.height);
        if (im.img.close) im.img.close();
        if (im.url) URL.revokeObjectURL(im.url);
      });
    }).then(function (canvas) {
      return obterWorkerOCR().then(function (worker) {
        if (opcoes.cancelado()) throw erro('Leitura cancelada.', 'CANCELADO');
        aoProgredirOCR = function (m) {
          if (m && m.status === 'recognizing text') prog('Lendo a foto com OCR…', 15 + Math.round((m.progress || 0) * 80));
        };
        prog('Lendo a foto com OCR…', 15);
        return reconhecer(worker, canvas);
      });
    }).then(function (texto) {
      ocrEmAndamento = false;
      aoProgredirOCR = null;
      return { texto: String(texto || '').trim(), paginas: 1, paginas_ocr: 1, paginas_ignoradas: 0, origem: 'imagem_ocr' };
    }, function (err) {
      ocrEmAndamento = false;
      aoProgredirOCR = null;
      throw err;
    });
  }

  function tipoDoArquivo(arquivo) {
    var nome = String(arquivo && arquivo.name || '').toLowerCase();
    var tipo = String(arquivo && arquivo.type || '').toLowerCase();
    if (tipo === 'application/pdf' || /\.pdf$/.test(nome)) return 'pdf';
    if (/^image\/(jpe?g|png|webp)$/.test(tipo) || /\.(jpe?g|png|webp)$/.test(nome)) return 'imagem';
    return null;
  }

  // Lê o arquivo e devolve { texto, paginas, paginas_ocr, paginas_ignoradas, origem }
  function ler(arquivo, opcoes) {
    opcoes = opcoes || {};
    var o = {
      aoProgredir: function (texto, pct) { if (opcoes.aoProgredir) opcoes.aoProgredir(texto, Math.max(0, Math.min(100, pct || 0))); },
      cancelado: function () { return !!(opcoes.cancelado && opcoes.cancelado()); }
    };
    var tipo = tipoDoArquivo(arquivo);
    if (!tipo) return Promise.reject(erro('Formato não suportado. Envie PDF, JPG, PNG ou WEBP.', 'FORMATO'));
    return tipo === 'pdf' ? lerPDF(arquivo, o) : lerImagem(arquivo, o);
  }

  function cancelar() {
    if (ocrEmAndamento) encerrarOCR();
    ocrEmAndamento = false;
    aoProgredirOCR = null;
  }

  return { ler: ler, cancelar: cancelar, tipoDoArquivo: tipoDoArquivo, montarLinhas: montarLinhas, LIBS: LIBS };
})();
