// src/services/indexacao.service.js — grava catálogo, produtos e trechos; estruturação por IA em fila
'use strict';
const db = require('../utils/db');
const T = require('../utils/texto');
const leitor = require('./leitor.service');
const ia = require('./ai.service');

const LIMITE_TEXTO = 3000000;
const COLUNAS_PRODUTO = ['usuario_id', 'fornecedor_id', 'catalogo_id', 'ordem', 'nome', 'codigo', 'marca', 'categoria', 'descricao',
  'bitola', 'tensao', 'material', 'isolamento', 'cobertura', 'temperatura', 'aplicacao', 'norma', 'certificacoes', 'preco',
  'unidade', 'atributos', 'texto_norm', 'origem'];

class ErroLeitura extends Error {
  constructor(msg, status) { super(msg); this.status = status || 400; this.amigavel = true; }
}

function textoNormProduto(p) {
  const partes = leitor.CAMPOS.map(function (c) { return p[c] || ''; });
  Object.keys(p.atributos || {}).forEach(function (k) { partes.push(k + ' ' + p.atributos[k]); });
  return T.normalizarBusca(partes.join(' \n '));
}

function linhaProduto(p, i, ids, origem) {
  return [ids.usuarioId, ids.fornecedorId, ids.catalogoId, i, p.nome, p.codigo || null, p.marca || null, p.categoria || null,
    p.descricao || null, p.bitola || null, p.tensao || null, p.material || null, p.isolamento || null, p.cobertura || null,
    p.temperatura || null, p.aplicacao || null, p.norma || null, p.certificacoes || null, p.preco || null, p.unidade || null,
    JSON.stringify(p.atributos || {}), textoNormProduto(p), origem];
}

function waLink(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return 'https://wa.me/' + (d.length <= 11 ? '55' + d : d);
}

// Completa contatos vazios do fornecedor com o que veio no catálogo (nunca sobrescreve)
async function completarFornecedor(executor, fornecedorId, dados) {
  if (!dados) return [];
  const atual = (await executor.query('SELECT telefone, whatsapp, email, observacoes FROM fornecedores WHERE id = $1', [fornecedorId])).rows[0];
  if (!atual) return [];
  const sets = [];
  const vals = [];
  const campos = [];
  function add(col, valor) { vals.push(valor); sets.push(col + ' = $' + vals.length); }
  if (!atual.telefone && dados.telefone) { add('telefone', dados.telefone.slice(0, 50)); campos.push('telefone'); }
  if (!atual.whatsapp && dados.whatsapp) {
    add('whatsapp', dados.whatsapp.slice(0, 50));
    add('whatsapp_link', waLink(dados.whatsapp));
    campos.push('WhatsApp');
  }
  if (!atual.email && dados.email && /@/.test(dados.email)) { add('email', dados.email.slice(0, 255)); campos.push('e-mail'); }
  if (!atual.observacoes && dados.especialidade) { add('observacoes', dados.especialidade.slice(0, 1000)); campos.push('especialidade'); }
  if (!sets.length) return [];
  vals.push(fornecedorId);
  await executor.query('UPDATE fornecedores SET ' + sets.join(', ') + ', atualizado_em = NOW() WHERE id = $' + vals.length, vals);
  return campos;
}

// Indexa um texto (colado, lido no navegador ou extraído do PDF no servidor)
async function indexarTexto(opcoes) {
  const usuarioId = opcoes.usuarioId;
  const fornecedorId = parseInt(opcoes.fornecedorId, 10);
  let texto = leitor.normalizarTexto(opcoes.texto);
  if (texto.length < 20) throw new ErroLeitura('Não encontrei texto legível. Se for PDF escaneado ou foto, envie pelo botão de arquivo para o leitor com OCR.');
  if (texto.length > LIMITE_TEXTO) texto = texto.slice(0, LIMITE_TEXTO);

  const est = leitor.estruturar(texto);
  const trechos = leitor.gerarTrechos(texto, est.produtos, est.fornecedor);
  const origem = String(opcoes.origem || 'texto').slice(0, 30);
  const nomeArquivo = String(opcoes.nomeArquivo || 'Texto colado').slice(0, 255);
  const paginas = Math.max(0, parseInt(opcoes.paginas, 10) || 0);
  // Texto sem estrutura vai para a IA. O estado "na fila" é gravado junto, antes da resposta (o painel acompanha sem atraso).
  const vaiParaIA = !est.produtos.length && texto.length >= 300 && ia.configurada();

  const resultado = await db.transaction(async function (client) {
    const forn = await client.query('SELECT id FROM fornecedores WHERE id = $1 AND usuario_id = $2 AND ativo = 1', [fornecedorId, usuarioId]);
    if (!forn.rows.length) throw new ErroLeitura('Fornecedor não encontrado', 404);

    let catalogoId = opcoes.catalogoId ? parseInt(opcoes.catalogoId, 10) : null;
    if (catalogoId) {
      const c = await client.query('SELECT id FROM catalogos WHERE id = $1 AND fornecedor_id = $2', [catalogoId, fornecedorId]);
      if (!c.rows.length) throw new ErroLeitura('Catálogo não encontrado', 404);
    } else {
      const novo = await client.query(
        "INSERT INTO catalogos (fornecedor_id, nome_arquivo, status, origem) VALUES ($1, $2, 'processando', $3) RETURNING id",
        [fornecedorId, nomeArquivo, origem]);
      catalogoId = novo.rows[0].id;
    }

    await client.query('DELETE FROM chunks WHERE catalogo_id = $1', [catalogoId]);
    await client.query('DELETE FROM produtos WHERE catalogo_id = $1', [catalogoId]);

    await db.inserirEmLote(client, 'chunks', ['catalogo_id', 'fornecedor_id', 'conteudo', 'indice', 'texto_norm'],
      trechos.map(function (t, i) { return [catalogoId, fornecedorId, t, i, T.normalizarBusca(t)]; }));

    const ids = { usuarioId: usuarioId, fornecedorId: fornecedorId, catalogoId: catalogoId };
    const origemProduto = est.formato === 'texto' ? origem : est.formato;
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO,
      est.produtos.map(function (p, i) { return linhaProduto(p, i, ids, origemProduto); }));

    await client.query(
      "UPDATE catalogos SET status = 'processado', erro = NULL, texto_extraido = $1, paginas = $2, origem = $3, formato = $4," +
      ' total_produtos = $5, ia_status = $6, ia_info = $7, atualizado_em = NOW() WHERE id = $8',
      [texto, paginas, origem, est.formato, est.produtos.length, vaiParaIA ? 'na_fila' : null,
        vaiParaIA ? 'Aguardando a IA organizar os produtos…' : null, catalogoId]);

    const atualizados = await completarFornecedor(client, fornecedorId, est.fornecedor);
    return { catalogo_id: catalogoId, produtos: est.produtos.length, trechos: trechos.length, formato: est.formato, fornecedor_atualizado: atualizados };
  });

  resultado.ia = 'nao_necessaria';
  if (vaiParaIA) {
    enfileirar(resultado.catalogo_id);
    resultado.ia = 'na_fila';
  } else if (!resultado.produtos && texto.length >= 300) {
    resultado.ia = 'indisponivel';
  }
  return resultado;
}

// ─── Fila de estruturação por IA (uma de cada vez, para respeitar limites gratuitos) ─
const fila = [];
let rodando = false;

// Na Vercel a função congela depois da resposta: waitUntil mantém a fila rodando até o fim (dentro do tempo máximo).
// É o mesmo mecanismo do pacote @vercel/functions, sem a dependência.
function manterVivo(promessa) {
  if (!process.env.VERCEL) return;
  try {
    const contexto = globalThis[Symbol.for('@vercel/request-context')];
    const atual = contexto && typeof contexto.get === 'function' ? contexto.get() : null;
    if (atual && typeof atual.waitUntil === 'function') atual.waitUntil(promessa);
  } catch (err) { console.warn('[ia-fila] waitUntil indisponível: ' + err.message); }
}

function enfileirar(catalogoId) {
  catalogoId = parseInt(catalogoId, 10);
  if (fila.indexOf(catalogoId) < 0) fila.push(catalogoId);
  manterVivo(processarFila());
}

async function agendarEstruturacao(catalogoId) {
  catalogoId = parseInt(catalogoId, 10);
  try {
    await db.query("UPDATE catalogos SET ia_status = 'na_fila', ia_info = 'Aguardando a IA organizar os produtos…', atualizado_em = NOW() WHERE id = $1", [catalogoId]);
  } catch (err) { console.error('[ia-fila] ' + err.message); }
  enfileirar(catalogoId);
}

async function processarFila() {
  if (rodando) return;
  rodando = true;
  try {
    while (fila.length) {
      const id = fila.shift();
      try { await estruturarCatalogo(id); } catch (err) {
        console.error('[ia-fila] catálogo ' + id + ': ' + err.message);
        await db.query("UPDATE catalogos SET ia_status = 'falhou', ia_info = $1, atualizado_em = NOW() WHERE id = $2",
          ['A IA gratuita não respondeu agora. Tente de novo mais tarde ou use o Prompt Mestre.', id]).catch(function () {});
      }
    }
  } finally {
    rodando = false;
  }
}

async function estruturarCatalogo(catalogoId) {
  const r = await db.query(
    'SELECT c.id, c.texto_extraido, c.fornecedor_id, f.usuario_id FROM catalogos c JOIN fornecedores f ON f.id = c.fornecedor_id WHERE c.id = $1',
    [catalogoId]);
  const c = r.rows[0];
  if (!c || !c.texto_extraido) return;
  await db.query("UPDATE catalogos SET ia_status = 'estruturando', ia_info = 'A IA está lendo o catálogo…', atualizado_em = NOW() WHERE id = $1", [catalogoId]);
  const saida = await ia.estruturarComIA(c.texto_extraido, function (parte, total) {
    return db.query('UPDATE catalogos SET ia_info = $1 WHERE id = $2', ['A IA está lendo a parte ' + parte + ' de ' + total + '…', catalogoId]).catch(function () {});
  });
  const est = leitor.estruturar(saida.texto);
  if (!est.produtos.length) {
    await db.query("UPDATE catalogos SET ia_status = 'sem_produtos', ia_info = 'A IA não identificou produtos neste texto.', atualizado_em = NOW() WHERE id = $1", [catalogoId]);
    return;
  }
  await db.transaction(async function (client) {
    await client.query('DELETE FROM produtos WHERE catalogo_id = $1', [catalogoId]);
    const ids = { usuarioId: c.usuario_id, fornecedorId: c.fornecedor_id, catalogoId: catalogoId };
    await db.inserirEmLote(client, 'produtos', COLUNAS_PRODUTO,
      est.produtos.map(function (p, i) { return linhaProduto(p, i, ids, 'ia'); }));
    await client.query("UPDATE catalogos SET total_produtos = $1, ia_status = 'concluido', ia_info = $2, atualizado_em = NOW() WHERE id = $3",
      [est.produtos.length, est.produtos.length + ' produto(s) estruturado(s) pela IA' + (saida.falhas ? ' (parte do texto não foi lida)' : ''), catalogoId]);
    await completarFornecedor(client, c.fornecedor_id, est.fornecedor);
  });
}

// Libera catálogos presos (servidor reiniciou ou a função da Vercel terminou no meio). Só mexe no que está parado há 15 min.
async function liberarPresos() {
  await db.query("UPDATE catalogos SET ia_status = 'interrompido', ia_info = 'A organização pela IA foi interrompida. Clique em Organizar com IA para tentar de novo.' WHERE ia_status IN ('na_fila', 'estruturando') AND atualizado_em < NOW() - INTERVAL '15 minutes'");
  await db.query("UPDATE catalogos SET status = 'erro', erro = 'Processamento interrompido. Envie o catálogo novamente.' WHERE status IN ('processando', 'pendente') AND atualizado_em < NOW() - INTERVAL '20 minutes'");
}

// Extração no servidor (fallback quando o navegador não consegue ler o PDF)
async function extrairTextoPDF(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return { texto: data.text || '', paginas: data.numpages || 0 };
}

module.exports = { indexarTexto, agendarEstruturacao, liberarPresos, extrairTextoPDF, ErroLeitura, waLink };
