// public/js/importador.js — Importador de catálogos
// 1) PDF já organizado (formato do Prompt Mestre, JSON ou tabela): lê o texto e organiza sem gastar a IA.
// 2) Senão, página por página: a IA lê a imagem de cada página (melhor para tabelas e PDFs "desenhados");
//    sem IA, usa o texto do PDF ou OCR e a IA de texto organiza depois. Nada é gravado aqui: a pessoa confere e salva.
var Importador = (function () {
  'use strict';

  var TENTATIVAS_PAGINA = 3;
  var BLOCO_TEXTO_IA = 6000;
  var FORMATOS_PRONTOS = ['prompt_mestre', 'json', 'tabela'];
  var CAMPOS_TECNICOS = ['codigo', 'marca', 'categoria', 'descricao', 'bitola', 'tensao', 'material', 'isolamento', 'cobertura',
    'temperatura', 'aplicacao', 'norma', 'certificacoes', 'preco', 'unidade'];

  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function semAcentoI(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function normI(s) { return semAcentoI(s).toLowerCase().replace(/[×]/g, 'x').replace(/²/g, '2').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ''); }
  function chaveProduto(p) { return [normI(p.nome), normI(p.codigo)].join('|'); }
  function compativeis(a, b) {
    return ['bitola', 'tensao'].every(function (c) { return !a[c] || !b[c] || normI(a[c]) === normI(b[c]); });
  }

  // Junta os produtos de todas as páginas, sem repetir (o servidor confere de novo ao salvar)
  function juntarProdutos(paginas) {
    var grupos = {};
    var lista = [];
    paginas.forEach(function (pg) {
      (pg.produtos || []).forEach(function (p) {
        if (!p || !p.nome) return;
        var k = chaveProduto(p);
        var variantes = grupos[k] || (grupos[k] = []);
        var a = null;
        for (var i = 0; i < variantes.length; i++) if (compativeis(variantes[i], p)) { a = variantes[i]; break; }
        if (a) {
          Object.keys(p).forEach(function (c) { if (c !== 'atributos' && !a[c] && p[c]) a[c] = p[c]; });
          Object.keys(p.atributos || {}).forEach(function (c) { if (!a.atributos[c]) a.atributos[c] = p.atributos[c]; });
          return;
        }
        var novo = Object.assign({}, p, { atributos: Object.assign({}, p.atributos || {}), _pagina: pg.n });
        novo._chave = k + '#' + variantes.length;
        variantes.push(novo);
        lista.push(novo);
      });
    });
    return lista;
  }

  // Sinais de texto já organizado por outra IA: "PRODUTO 1", linhas "Nome:", tabela com | ou JSON
  function pareceOrganizado(t) {
    var marcadores = (t.match(/(?:^|\n)[ \t#>*•·\-–—]*(?:produto|item)\s*(?:n[º°o]\.?\s*|#\s*)?\d{1,5}\b/gi) || []).length;
    var nomes = (t.match(/(?:^|\n)[ \t*•·\-–—]*nome(?:\s+do\s+produto)?\s*:\s*\S/gi) || []).length;
    var tabela = (t.match(/(?:^|\n)[ \t]*\|[^\n]*\|[ \t]*(?=\n|$)/g) || []).length;
    return marcadores >= 1 || nomes >= 2 || tabela >= 3 || /^\s*[\[{]/.test(t);
  }
  function camposPreenchidos(p) {
    var n = Object.keys(p.atributos || {}).length;
    CAMPOS_TECNICOS.forEach(function (c) { if (p[c]) n++; });
    return n;
  }
  // Página onde o produto aparece (para a coluna "Pág." da conferência)
  function paginaDoProduto(p, numeros, textosNorm) {
    var cod = normI(p.codigo);
    var nome = normI(p.nome);
    var bit = normI(p.bitola);
    if (bit && nome.length > bit.length && nome.slice(-bit.length) === bit) nome = nome.slice(0, -bit.length);
    nome = nome.slice(0, 24);
    for (var i = 0; i < numeros.length; i++) {
      var t = textosNorm[numeros[i]] || '';
      if ((cod.length >= 3 && t.indexOf(cod) >= 0) || (nome.length >= 4 && t.indexOf(nome) >= 0)) return numeros[i];
    }
    return numeros[0];
  }

  // opcoes: { documento, inicio, fim, capacidades, usarIA, nomeArquivo, aoEvento(ev) }
  function criar(opcoes) {
    var doc = opcoes.documento;
    var inicio = Math.max(1, parseInt(opcoes.inicio, 10) || 1);
    var fim = Math.min(doc.paginas, parseInt(opcoes.fim, 10) || doc.paginas);
    var numeros = [];
    for (var n = inicio; n <= fim; n++) numeros.push(n);
    var cap = opcoes.capacidades || {};
    var estado = {
      paginas: {},
      visao: !!(opcoes.usarIA && cap.ia && cap.visao),
      textoIA: !!(opcoes.usarIA && cap.ia),
      cotaAcabou: false,
      contexto: '',
      cancelado: false,
      modelos: {},
      textos: {},
      formato: null
    };

    function emitir(ev) { try { if (opcoes.aoEvento) opcoes.aoEvento(ev); } catch (e) { /* a tela não pode travar a leitura */ } }

    function resumo() {
      var feitas = 0;
      var comIA = 0;
      var falhas = 0;
      numeros.forEach(function (k) {
        var p = estado.paginas[k];
        if (!p) return;
        if (p.estado === 'ok' || p.estado === 'sem_ia' || p.estado === 'erro') feitas++;
        if (p.metodo === 'ia_visao' || p.metodo === 'ia_texto') comIA++;
        if (p.estado === 'erro') falhas++;
      });
      return { feitas: feitas, total: numeros.length, produtos: juntarProdutos(numeros.map(function (k) { return estado.paginas[k] || { n: k }; })).length,
        comIA: comIA, falhas: falhas, cotaAcabou: estado.cotaAcabou };
    }

    function registrar(k, dados) {
      estado.paginas[k] = Object.assign(estado.paginas[k] || { n: k, produtos: [] }, dados);
      if (dados.modelo) estado.modelos[dados.modelo] = (estado.modelos[dados.modelo] || 0) + 1;
      emitir({ tipo: 'pagina', pagina: estado.paginas[k], resumo: resumo() });
    }

    function lerComVisao(k, texto) {
      var evitar = [];
      var tentativa = 0;
      function tentar(lado) {
        tentativa++;
        return doc.imagemPagina(k, lado).then(function (imagem) {
          if (estado.cancelado) throw { code: 'CANCELADO' };
          emitir({ tipo: 'ia', pagina: k, tentativa: tentativa });
          return apiPost('/api/extracao/pagina', {
            imagem: imagem, texto: texto.slice(0, 15000), pagina: k, total: doc.paginas, contexto: estado.contexto,
            nome_arquivo: opcoes.nomeArquivo || doc.nome, evitar: evitar
          }, { timeout: 75000 });
        }).catch(function (err) {
          if (err && err.code === 'CANCELADO') throw err;
          if (err && err.code === 'COTA') { estado.cotaAcabou = true; throw err; }
          if (err && err.status === 413 && tentativa < TENTATIVAS_PAGINA) return tentar(1200);
          if (err && Array.isArray(err.tentados)) evitar = evitar.concat(err.tentados);
          var semVolta = err && (err.code === 'SEM_CHAVE' || err.code === 'CHAVE' || err.status === 400 || err.status === 401 || err.status === 402 || err.status === 403);
          if (tentativa < TENTATIVAS_PAGINA && !semVolta && !estado.cancelado) {
            return esperar(1200 * tentativa).then(function () { return tentar(lado); });
          }
          throw err;
        });
      }
      return tentar(null);
    }

    // Sem IA de imagem: fica o texto do PDF (ou OCR, se a página for imagem); a IA de texto organiza no fim
    function semVisao(k, texto, erroVisao) {
      var temTexto = texto.replace(/\s/g, '').length >= 60;
      var obter = temTexto ? Promise.resolve(texto) : doc.ocrPagina(k, function (pct) { emitir({ tipo: 'ocr', pagina: k, pct: pct }); });
      if (!temTexto) registrar(k, { estado: 'lendo', metodo: 'ocr' });
      return obter.then(function (t) {
        registrar(k, {
          estado: 'sem_ia', metodo: temTexto ? 'pdf_texto' : 'ocr', texto: String(t || ''),
          erroIA: erroVisao ? (erroVisao.error || 'A IA não respondeu nesta página.') : ''
        });
      });
    }

    function textoDaPagina(k) {
      if (estado.textos[k] != null) return Promise.resolve(estado.textos[k]);
      return doc.textoPagina(k).catch(function () { return ''; }).then(function (t) {
        estado.textos[k] = String(t || '');
        return estado.textos[k];
      });
    }

    // PDF já organizado: um único pedido ao servidor (sem IA) organiza todas as páginas escolhidas
    function tentarOrganizado() {
      if (doc.tipo !== 'pdf') return Promise.resolve(false);
      emitir({ tipo: 'analise' });
      var cadeia = Promise.resolve();
      numeros.forEach(function (k) {
        cadeia = cadeia.then(function () {
          if (estado.cancelado) throw { code: 'CANCELADO' };
          return textoDaPagina(k);
        });
      });
      return cadeia.then(function () {
        var total = numeros.map(function (k) { return estado.textos[k]; }).join('\n\n');
        if (total.replace(/\s/g, '').length < 120 || !pareceOrganizado(total)) return false;
        return apiPost('/api/extracao/analisar', { texto: total.slice(0, 2900000) }, { timeout: 60000 }).then(function (r) {
          var prods = (r && r.produtos) || [];
          var bons = prods.filter(function (p) { return camposPreenchidos(p) >= 2; }).length;
          var organizado = FORMATOS_PRONTOS.indexOf(r && r.formato) >= 0 &&
            prods.length >= Math.max(1, Math.ceil(numeros.length / 3)) && bons >= Math.ceil(prods.length * 0.6);
          if (!organizado || estado.cancelado) return false;
          var textosNorm = {};
          numeros.forEach(function (k) { textosNorm[k] = normI(estado.textos[k]); });
          var porPagina = {};
          prods.forEach(function (p) {
            var n = paginaDoProduto(p, numeros, textosNorm);
            (porPagina[n] = porPagina[n] || []).push(p);
          });
          estado.formato = r.formato;
          numeros.forEach(function (k, i) {
            registrar(k, { estado: 'ok', metodo: 'estruturado', texto: estado.textos[k], produtos: porPagina[k] || [],
              fornecedor: i === 0 ? (r.fornecedor || null) : null, erro: '', erroIA: '' });
          });
          emitir({ tipo: 'organizado', formato: r.formato, produtos: prods.length });
          return true;
        }, function () { return false; });
      });
    }

    function processar(k) {
      registrar(k, { estado: 'lendo', metodo: estado.visao && !estado.cotaAcabou ? 'ia_visao' : null, erro: '', erroIA: '' });
      return textoDaPagina(k).then(function (texto) {
        texto = String(texto || '');
        if (estado.cancelado) throw { code: 'CANCELADO' };
        if (estado.visao && !estado.cotaAcabou) {
          return lerComVisao(k, texto).then(function (r) {
            var prods = r.produtos || [];
            if (r.resumo) estado.contexto = r.resumo;
            else if (prods.length) estado.contexto = 'Produtos da página anterior: ' + prods.slice(-2).map(function (p) { return p.nome; }).join('; ');
            registrar(k, { estado: 'ok', metodo: 'ia_visao', texto: texto, produtos: prods, fornecedor: r.fornecedor || null, resumo: r.resumo || '', modelo: r.modelo || '' });
          }, function (err) {
            if (err && err.code === 'CANCELADO') throw err;
            return semVisao(k, texto, err);
          });
        }
        return semVisao(k, texto, null);
      });
    }

    function trabalhador(fila) {
      if (estado.cancelado) return Promise.reject({ code: 'CANCELADO' });
      var k = fila.shift();
      if (k == null) return Promise.resolve();
      return processar(k).catch(function (err) {
        if (err && err.code === 'CANCELADO') throw err;
        registrar(k, { estado: 'erro', erro: (err && err.error) || 'Não consegui ler esta página.' });
      }).then(function () { return trabalhador(fila); });
    }

    // Páginas lidas sem IA de imagem: a IA de texto organiza em blocos (economiza a cota diária)
    function organizarTexto(lista) {
      if (!estado.textoIA || estado.cotaAcabou) return Promise.resolve();
      var candidatas = lista.filter(function (k) {
        var p = estado.paginas[k];
        return p && p.estado === 'sem_ia' && !(p.produtos && p.produtos.length) && String(p.texto || '').replace(/\s/g, '').length >= 60;
      });
      var blocos = [];
      var atual = { paginas: [], texto: '' };
      candidatas.forEach(function (k) {
        var t = String(estado.paginas[k].texto || '').slice(0, 12000);
        if (atual.paginas.length && atual.texto.length + t.length > BLOCO_TEXTO_IA) { blocos.push(atual); atual = { paginas: [], texto: '' }; }
        atual.paginas.push(k);
        atual.texto += (atual.texto ? '\n\n' : '') + t;
      });
      if (atual.paginas.length) blocos.push(atual);
      var i = 0;
      function proximo() {
        if (estado.cancelado) return Promise.reject({ code: 'CANCELADO' });
        if (i >= blocos.length || estado.cotaAcabou) return Promise.resolve();
        var b = blocos[i++];
        emitir({ tipo: 'texto_ia', bloco: i, total: blocos.length, paginas: b.paginas });
        return apiPost('/api/extracao/estruturar-bloco', { texto: b.texto.slice(0, 16000), contexto: estado.contexto }, { timeout: 75000 }).then(function (r) {
          if (r.resumo) estado.contexto = r.resumo;
          registrar(b.paginas[0], { metodo: 'ia_texto', produtos: r.produtos || [], fornecedor: r.fornecedor || null, resumo: r.resumo || '', modelo: r.modelo || '' });
          b.paginas.slice(1).forEach(function (k) { registrar(k, { metodo: 'ia_texto' }); });
        }, function (err) {
          if (err && err.code === 'COTA') estado.cotaAcabou = true;
        }).then(proximo);
      }
      return proximo();
    }

    function resultado() {
      var lista = numeros.map(function (k) { return estado.paginas[k]; }).filter(Boolean);
      var metodos = lista.map(function (p) { return p.metodo; });
      var origem = metodos.indexOf('ia_visao') >= 0 ? 'ia_visao'
        : metodos.indexOf('ia_texto') >= 0 ? 'ia_texto'
          : (doc.tipo === 'imagens' ? 'imagem_ocr' : (metodos.indexOf('ocr') >= 0 ? 'ocr_navegador' : 'pdf_navegador'));
      return {
        paginas: lista,
        produtos: juntarProdutos(lista),
        fornecedores: lista.map(function (p) { return p.fornecedor; }).filter(Boolean),
        resumos: lista.map(function (p) { return p.resumo; }).filter(Boolean),
        texto: lista.map(function (p) { return String(p.texto || '').trim(); }).filter(Boolean).join('\n\n'),
        origem: origem,
        formato: estado.formato,
        modelos: Object.keys(estado.modelos),
        cotaAcabou: estado.cotaAcabou,
        resumo: resumo()
      };
    }

    return {
      paginas: numeros,
      estado: estado,
      resumo: resumo,
      resultado: resultado,
      iniciar: function () {
        return tentarOrganizado().then(function (pronto) {
          if (pronto) return resultado();
          var fila = numeros.slice();
          var paralelo = estado.visao ? 2 : 1;
          var trabalhos = [];
          for (var i = 0; i < Math.min(paralelo, fila.length); i++) trabalhos.push(trabalhador(fila));
          return Promise.all(trabalhos).then(function () { return organizarTexto(numeros); }).then(resultado);
        });
      },
      // Lê de novo páginas que falharam (o arquivo continua aberto enquanto a revisão estiver na tela)
      relerPaginas: function (lista) {
        estado.cancelado = false;
        if (opcoes.usarIA && cap.visao && !estado.cotaAcabou) estado.visao = true;
        var fila = lista.slice();
        return trabalhador(fila).then(function () { return organizarTexto(lista); }).then(resultado);
      },
      cancelar: function () { estado.cancelado = true; LeitorCatalogo.cancelar(); },
      fechar: function () { estado.cancelado = true; try { doc.fechar(); } catch (e) { /* ignora */ } }
    };
  }

  return { criar: criar, juntarProdutos: juntarProdutos, chaveProduto: chaveProduto };
})();
