// =====================================================================
// VERTHO — CISReferencia.gs
//
// Módulo de referência CIS (DISC + Valores Motivadores + Tipos Psicológicos).
// Lê dados da aba CIS_IA_Referencia (149 linhas, 15 colunas) UMA VEZ,
// cacheia por 6h, e fornece funções de filtro para cada caso de uso.
//
// REGRA DE OURO: A aba NUNCA vai inteira para nenhum prompt.
// Cada fase usa um SUBCONJUNTO diferente, filtrado por propósito.
//
// | Fase               | Usa CIS? | Como                                     |
// |--------------------|----------|------------------------------------------|
// | Gabarito CIS (IA2) | NÃO     | Só cargo + competências + contexto       |
// | Cenários           | SIM      | Usar_Para_Cenario + traços do cargo      |
// | Avaliação          | SIM      | Traços dominantes do colaborador         |
// | PDI                | SIM      | getCISParaPDI() filtrado + Usar_Para_PDI |
// | Relatório          | SIM      | getCISRiscos() para alertas de extremo   |
//
// Dependências: nenhuma (módulo autônomo)
// =====================================================================

var _CIS_CACHE_KEY = 'cis_ia_ref_v3';
var _CIS_CACHE_TTL = 21600; // 6 horas
var _CIS_SHEET_NAME = 'CIS_IA_Referencia';

// Índices das colunas (0-based)
var _CIS_COL = {
  TEORIA: 0, DIMENSAO: 1, INTENSIDADE: 2, CATEGORIA: 3,
  RESUMO: 4, DETALHADO: 5, SINAL: 6, HIPOTESE: 7,
  RISCO_EXCESSO: 8, PARA_CENARIO: 9, PARA_PDI: 10,
  USO_OPERACIONAL: 11, APLICACAO_ESCOLA: 12,
  CONFIANCA: 13, NAO_CONCLUIR: 14
};


// ═══════════════════════════════════════════════════════════════════════
// CARREGAMENTO E CACHE
// ═══════════════════════════════════════════════════════════════════════

function _loadCISReferencia() {
  var cache = CacheService.getScriptCache();

  // Tentar cache (pode estar em chunks)
  var meta = cache.get(_CIS_CACHE_KEY);
  if (meta) {
    try {
      var numChunks = parseInt(meta);
      if (isNaN(numChunks)) {
        // meta É o JSON direto (cabe em 1 chunk)
        return JSON.parse(meta);
      }
      // Reconstituir de chunks
      var keys = [];
      for (var i = 0; i < numChunks; i++) keys.push(_CIS_CACHE_KEY + '_' + i);
      var chunks = cache.getAll(keys);
      var json = '';
      for (var j = 0; j < numChunks; j++) {
        var chunk = chunks[_CIS_CACHE_KEY + '_' + j];
        if (!chunk) throw new Error('chunk ' + j + ' missing');
        json += chunk;
      }
      return JSON.parse(json);
    } catch(e) { /* cache corrompido, reler */ }
  }

  // Ler da planilha
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(_CIS_SHEET_NAME);
  if (!ws) { Logger.log('CISReferencia: aba nao encontrada'); return []; }

  var dados = ws.getDataRange().getValues();
  if (dados.length < 2) return [];

  var resultado = [];
  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    if (!row[_CIS_COL.TEORIA]) continue;
    resultado.push({
      teoria:       String(row[_CIS_COL.TEORIA] || '').trim(),
      dimensao:     String(row[_CIS_COL.DIMENSAO] || '').trim(),
      intensidade:  String(row[_CIS_COL.INTENSIDADE] || '').trim(),
      categoria:    String(row[_CIS_COL.CATEGORIA] || '').trim(),
      resumo:       String(row[_CIS_COL.RESUMO] || '').trim(),
      detalhado:    String(row[_CIS_COL.DETALHADO] || '').trim(),
      sinal:        String(row[_CIS_COL.SINAL] || '').trim(),
      hipotese:     String(row[_CIS_COL.HIPOTESE] || '').trim(),
      risco:        String(row[_CIS_COL.RISCO_EXCESSO] || '').trim(),
      paraCenario:  String(row[_CIS_COL.PARA_CENARIO] || '').toLowerCase().trim() === 'sim',
      paraPDI:      String(row[_CIS_COL.PARA_PDI] || '').toLowerCase().trim() === 'sim',
      uso:          String(row[_CIS_COL.USO_OPERACIONAL] || '').trim(),
      escola:       String(row[_CIS_COL.APLICACAO_ESCOLA] || '').trim(),
      confianca:    String(row[_CIS_COL.CONFIANCA] || '').trim(),
      naoConcluir:  String(row[_CIS_COL.NAO_CONCLUIR] || '').trim()
    });
  }

  // Cachear
  try {
    var json = JSON.stringify(resultado);
    if (json.length <= 95000) {
      cache.put(_CIS_CACHE_KEY, json, _CIS_CACHE_TTL);
    } else {
      var chunkSize = 90000;
      var nChunks = Math.ceil(json.length / chunkSize);
      var obj = {};
      for (var c = 0; c < nChunks; c++) {
        obj[_CIS_CACHE_KEY + '_' + c] = json.substring(c * chunkSize, (c + 1) * chunkSize);
      }
      obj[_CIS_CACHE_KEY] = String(nChunks);
      cache.putAll(obj, _CIS_CACHE_TTL);
    }
  } catch(e) { Logger.log('CISReferencia: cache falhou: ' + e.message); }

  Logger.log('CISReferencia: carregadas ' + resultado.length + ' linhas');
  return resultado;
}

function limparCacheCIS() {
  var cache = CacheService.getScriptCache();
  cache.remove(_CIS_CACHE_KEY);
  for (var i = 0; i < 10; i++) cache.remove(_CIS_CACHE_KEY + '_' + i);
}


// ═══════════════════════════════════════════════════════════════════════
// FILTRO GENÉRICO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Filtro genérico por qualquer combinação de campos.
 * @param {Object} filtros  Ex: { teoria: 'DISC', dimensao: 'D', intensidade: 'Alto', categoria: 'medo' }
 * @returns {Object[]}
 */
function getCISData(filtros) {
  var dados = _loadCISReferencia();
  if (!filtros) return dados;
  var keys = Object.keys(filtros);
  return dados.filter(function(d) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (d[k] === undefined) continue;
      if (String(d[k]).toLowerCase() !== String(filtros[k]).toLowerCase()) return false;
    }
    return true;
  });
}


// ═══════════════════════════════════════════════════════════════════════
// USO: AVALIAÇÃO + PDI — Filtrado pelos traços do colaborador
// ═══════════════════════════════════════════════════════════════════════

/**
 * Recebe o perfil CIS real do colaborador e retorna APENAS linhas relevantes.
 * NÃO retorna a aba inteira — filtra pelos traços DOMINANTES.
 *
 * @param {Object} colaboradorCIS  {
 *   disc_dominantes: ['D','I'],        // fatores >= 60
 *   disc_baixos: ['S'],                // fatores <= 35
 *   valores_significativos: ['Economico','Teorico'],  // top 2
 *   valores_indiferentes: ['Religioso','Estetico'],   // bottom 2
 *   valores_scores: { Teorico: 80, Economico: 30, ... },  // scores reais (para alertas)
 *   tipo_ext_int: 'Extroversao',       // o maior entre ext/int
 *   tipo_sen_int: 'Intuicao',          // o maior entre sen/int
 *   tipo_pen_sen: 'Sentimento'         // o maior entre pen/sen
 * }
 * @returns {Object}  { disc: [...], valores: [...], tipos: [...], alertas: [...] }
 */
function getCISParaPDI(colaboradorCIS) {
  if (!colaboradorCIS) return { disc: [], valores: [], tipos: [], alertas: [] };
  var dados = _loadCISReferencia();

  // ── DISC: só traços dominantes + baixos, só categorias úteis para PDI ──
  var catsPDI = ['medo', 'ponto_desenvolver', 'abordagem_feedback', 'comunicacao', 'motivacao'];
  var disc = [];

  (colaboradorCIS.disc_dominantes || []).forEach(function(dim) {
    var linhas = dados.filter(function(d) {
      return d.teoria === 'DISC' && d.dimensao === dim && d.intensidade === 'Alto'
        && catsPDI.indexOf(d.categoria) >= 0 && d.paraPDI;
    });
    linhas.forEach(function(l) { disc.push({ dim: dim, int: 'Alto', cat: l.categoria, texto: l.detalhado, escola: l.escola }); });
  });

  (colaboradorCIS.disc_baixos || []).forEach(function(dim) {
    var linhas = dados.filter(function(d) {
      return d.teoria === 'DISC' && d.dimensao === dim && d.intensidade === 'Baixo'
        && d.paraPDI;
    });
    linhas.forEach(function(l) { disc.push({ dim: dim, int: 'Baixo', cat: l.categoria, texto: l.detalhado, escola: l.escola }); });
  });

  // Combinação DISC
  if (colaboradorCIS.disc_dominantes && colaboradorCIS.disc_dominantes.length >= 2) {
    var combo = colaboradorCIS.disc_dominantes[0] + colaboradorCIS.disc_dominantes[1];
    var comboData = dados.filter(function(d) {
      return d.teoria === 'DISC' && d.dimensao === 'Combinacao' && d.intensidade === combo;
    });
    comboData.forEach(function(l) { disc.push({ dim: 'Combinacao', int: combo, cat: 'descricao', texto: l.detalhado }); });
  }

  // ── VALORES: só os 2 significativos, categorias úteis ──
  var catsVal = ['motivacao', 'recompensa', 'conexao_pdi', 'caracteristicas'];
  var valoresResult = [];

  (colaboradorCIS.valores_significativos || []).forEach(function(dim) {
    var linhas = dados.filter(function(d) {
      return d.teoria === 'VALORES' && d.dimensao === dim && d.intensidade === 'Alto'
        && catsVal.indexOf(d.categoria) >= 0;
    });
    linhas.forEach(function(l) { valoresResult.push({ dim: dim, cat: l.categoria, texto: l.detalhado }); });
  });

  // ── TIPOS: só os dominantes (1 por par) ──
  var tiposResult = [];
  var catstipos = ['descricao', 'bateria', 'uso_no_pdi', 'funcoes_ideais'];
  var tiposDom = [colaboradorCIS.tipo_ext_int, colaboradorCIS.tipo_sen_int, colaboradorCIS.tipo_pen_sen].filter(Boolean);

  tiposDom.forEach(function(dim) {
    var linhas = dados.filter(function(d) {
      return d.teoria === 'TIPOS' && d.dimensao === dim
        && catstipos.indexOf(d.categoria) >= 0;
    });
    linhas.forEach(function(l) {
      tiposResult.push({ dim: dim, cat: l.categoria, texto: l.detalhado, confianca: l.confianca });
    });
  });

  // ── ALERTAS: extremos ──
  var alertas = [];
  var scores = colaboradorCIS.valores_scores || {};
  Object.keys(scores).forEach(function(dim) {
    var score = Number(scores[dim] || 0);
    if (score >= 90) {
      var riscos = dados.filter(function(d) { return d.teoria === 'VALORES' && d.dimensao === dim && d.intensidade === 'Extremo_Alto'; });
      riscos.forEach(function(l) { alertas.push({ dim: dim, tipo: 'Extremo_Alto', score: score, texto: l.detalhado }); });
    }
    if (score <= 20) {
      var riscos = dados.filter(function(d) { return d.teoria === 'VALORES' && d.dimensao === dim && d.intensidade === 'Extremo_Baixo'; });
      riscos.forEach(function(l) { alertas.push({ dim: dim, tipo: 'Extremo_Baixo', score: score, texto: l.detalhado }); });
    }
  });

  // Guardrail
  var guardrail = dados.filter(function(d) { return d.naoConcluir && d.naoConcluir.length > 10; });
  if (guardrail.length > 0) {
    alertas.push({ dim: 'GUARDRAIL', tipo: 'regra', texto: guardrail[0].naoConcluir });
  }

  return { disc: disc, valores: valoresResult, tipos: tiposResult, alertas: alertas };
}


// ═══════════════════════════════════════════════════════════════════════
// USO: CENÁRIOS — Filtrado pelo cargo (não pelo colaborador)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna linhas que informam o que o cenário deve PROVOCAR.
 * Filtrado: só Usar_Para_Cenario == "Sim" + traços do CARGO.
 *
 * @param {string[]} discDoCargo  Ex: ['D','S'] — dimensões DISC que o cargo exige
 * @returns {Object[]}  Linhas filtradas com tomada_decisao, medos, pontos a desenvolver
 */
function getCISParaCenario(discDoCargo) {
  var dados = _loadCISReferencia();
  if (!discDoCargo || discDoCargo.length === 0) discDoCargo = ['D', 'I', 'S', 'C'];

  return dados.filter(function(d) {
    if (!d.paraCenario) return false;
    if (d.teoria !== 'DISC') return false;
    // Só linhas das dimensões relevantes para o cargo
    return discDoCargo.indexOf(d.dimensao) >= 0
      || d.dimensao === 'Combinacao'
      || d.dimensao === 'Geral';
  });
}


// ═══════════════════════════════════════════════════════════════════════
// USO: RELATÓRIO — Alertas de extremo
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica scores extremos e retorna riscos.
 * @param {Object} scores  { d: 90, i: 45, s: 20, c: 70, val_teorico: 95, val_social: 15, ... }
 * @returns {Object[]}  Array de alertas
 */
function getCISRiscos(scores) {
  if (!scores) return [];
  var dados = _loadCISReferencia();
  var alertas = [];

  // DISC extremos (>85 ou <15)
  var discMap = { d: 'D', i: 'I', s: 'S', c: 'C' };
  Object.keys(discMap).forEach(function(k) {
    var score = Number(scores[k] || 0);
    if (score >= 85) {
      dados.filter(function(d) {
        return d.teoria === 'DISC' && d.dimensao === discMap[k] && d.intensidade === 'Alto'
          && d.categoria === 'ponto_desenvolver' && d.risco;
      }).forEach(function(l) {
        alertas.push({ dim: discMap[k] + ' Alto (' + score + ')', tipo: 'DISC', texto: l.risco || l.detalhado });
      });
    }
    if (score <= 15) {
      dados.filter(function(d) {
        return d.teoria === 'DISC' && d.dimensao === discMap[k] && d.intensidade === 'Baixo'
          && d.categoria === 'risco_avaliacao';
      }).forEach(function(l) {
        alertas.push({ dim: discMap[k] + ' Baixo (' + score + ')', tipo: 'DISC', texto: l.risco || l.detalhado });
      });
    }
  });

  // Valores extremos (>90 ou <20)
  var valMap = { val_teorico: 'Teorico', val_economico: 'Economico', val_estetico: 'Estetico',
                 val_social: 'Social', val_politico: 'Politico', val_religioso: 'Religioso' };
  Object.keys(valMap).forEach(function(k) {
    var score = Number(scores[k] || 0);
    if (score >= 90) {
      dados.filter(function(d) { return d.teoria === 'VALORES' && d.dimensao === valMap[k] && d.intensidade === 'Extremo_Alto'; })
        .forEach(function(l) { alertas.push({ dim: valMap[k] + ' (' + score + ')', tipo: 'VALORES', texto: l.detalhado }); });
    }
    if (score <= 20) {
      dados.filter(function(d) { return d.teoria === 'VALORES' && d.dimensao === valMap[k] && d.intensidade === 'Extremo_Baixo'; })
        .forEach(function(l) { alertas.push({ dim: valMap[k] + ' (' + score + ')', tipo: 'VALORES', texto: l.detalhado }); });
    }
  });

  return alertas;
}


// ═══════════════════════════════════════════════════════════════════════
// HELPER: Extrair perfil CIS estruturado dos scores brutos
// ═══════════════════════════════════════════════════════════════════════

/**
 * Converte scores brutos do colaborador em objeto estruturado para getCISParaPDI.
 * @param {Object} ts  trait_scores do colaborador (da aba Colaboradores)
 * @returns {Object}  colaboradorCIS formatado para getCISParaPDI
 */
function extrairPerfilCIS(ts) {
  if (!ts) return null;

  var d = Number(ts.D || ts.d || ts.D_Natural || 0);
  var i = Number(ts.I || ts.i || ts.I_Natural || 0);
  var s = Number(ts.S || ts.s || ts.S_Natural || 0);
  var c = Number(ts.C || ts.c || ts.C_Natural || 0);

  var disc_dominantes = [];
  var disc_baixos = [];
  if (d >= 60) disc_dominantes.push('D'); else if (d <= 35) disc_baixos.push('D');
  if (i >= 60) disc_dominantes.push('I'); else if (i <= 35) disc_baixos.push('I');
  if (s >= 60) disc_dominantes.push('S'); else if (s <= 35) disc_baixos.push('S');
  if (c >= 60) disc_dominantes.push('C'); else if (c <= 35) disc_baixos.push('C');

  // Se nenhum dominante, pegar os 2 mais altos
  if (disc_dominantes.length === 0) {
    var arr = [{l:'D',v:d},{l:'I',v:i},{l:'S',v:s},{l:'C',v:c}];
    arr.sort(function(a,b) { return b.v - a.v; });
    disc_dominantes = [arr[0].l, arr[1].l];
  }

  // Valores ordenados
  var valScores = {
    Teorico: Number(ts.Teorico || ts.val_teorico || 0),
    Economico: Number(ts.Economico || ts.val_economico || 0),
    Estetico: Number(ts.Estetico || ts.val_estetico || 0),
    Social: Number(ts.Social || ts.val_social || 0),
    Politico: Number(ts.Politico || ts.val_politico || 0),
    Religioso: Number(ts.Religioso || ts.val_religioso || 0)
  };
  var valOrdenados = Object.keys(valScores).map(function(k) { return { nome: k, score: valScores[k] }; })
    .sort(function(a,b) { return b.score - a.score; });

  // Tipos psicológicos (1 dominante por par)
  var ext = Number(ts.Extrovertido || ts.Extroversao || ts.tp_extrovertido || 0);
  var intr = Number(ts.Introvertido || ts.Introversao || ts.tp_introvertido || 0);
  var sen = Number(ts.Sensorial || ts.Sensacao || ts.tp_sensorial || 0);
  var intui = Number(ts.Intuitivo || ts.Intuicao || ts.tp_intuitivo || 0);
  var rac = Number(ts.Racional || ts.Pensamento || ts.tp_racional || 0);
  var emo = Number(ts.Emocional || ts.Sentimento || ts.tp_emocional || 0);

  return {
    disc_dominantes: disc_dominantes,
    disc_baixos: disc_baixos,
    disc_scores: { D: d, I: i, S: s, C: c },
    valores_significativos: valOrdenados.slice(0, 2).map(function(v) { return v.nome; }),
    valores_indiferentes: valOrdenados.slice(-2).map(function(v) { return v.nome; }),
    valores_scores: valScores,
    tipo_ext_int: ext > intr + 10 ? 'Extroversao' : intr > ext + 10 ? 'Introversao' : null,
    tipo_sen_int: sen > intui + 10 ? 'Sensacao' : intui > sen + 10 ? 'Intuicao' : null,
    tipo_pen_sen: rac > emo + 10 ? 'Pensamento' : emo > rac + 10 ? 'Sentimento' : null
  };
}


// ═══════════════════════════════════════════════════════════════════════
// HELPER: Formatar CIS filtrado como texto para prompt
// ═══════════════════════════════════════════════════════════════════════

/**
 * Monta bloco de texto formatado a partir do resultado de getCISParaPDI.
 * Pronto para injetar no prompt de avaliação ou PDI.
 * @param {Object} cisData  Resultado de getCISParaPDI()
 * @param {Object} scores   { D: 72, I: 45, ... } scores brutos para exibição
 * @returns {string}
 */
function formatarCISParaPrompt(cisData, scores) {
  if (!cisData) return '';
  var parts = [];

  parts.push('PERFIL COMPORTAMENTAL DO COLABORADOR (usar para personalizar feedback e PDI):');
  parts.push('');

  // DISC
  if (cisData.disc.length > 0) {
    parts.push('DISC — Como age:');
    var porDim = {};
    cisData.disc.forEach(function(d) {
      var key = d.dim + ' ' + d.int;
      if (!porDim[key]) porDim[key] = [];
      porDim[key].push(d);
    });
    Object.keys(porDim).forEach(function(key) {
      var items = porDim[key];
      var scoreLabel = '';
      if (scores) {
        var dim = items[0].dim;
        if (scores[dim]) scoreLabel = ' (score ' + scores[dim] + ')';
      }
      parts.push('  ' + key + scoreLabel + ':');
      items.forEach(function(item) {
        parts.push('    [' + item.cat + '] ' + item.texto);
      });
    });
    parts.push('');
  }

  // Valores
  if (cisData.valores.length > 0) {
    parts.push('VALORES — Por que age:');
    var porVal = {};
    cisData.valores.forEach(function(v) {
      if (!porVal[v.dim]) porVal[v.dim] = [];
      porVal[v.dim].push(v);
    });
    Object.keys(porVal).forEach(function(dim) {
      var scoreLabel = scores && scores['val_' + dim.toLowerCase()] ? ' (score ' + scores['val_' + dim.toLowerCase()] + ')' : '';
      parts.push('  Significativo: ' + dim + scoreLabel);
      porVal[dim].forEach(function(v) {
        parts.push('    [' + v.cat + '] ' + v.texto);
      });
    });
    parts.push('');
  }

  // Tipos
  if (cisData.tipos.length > 0) {
    parts.push('TIPOS PSICOLOGICOS — Como aprende:');
    parts.push('  (Confianca: BAIXA — usar como sugestao, nao afirmacao)');
    var porTipo = {};
    cisData.tipos.forEach(function(t) {
      if (!porTipo[t.dim]) porTipo[t.dim] = [];
      porTipo[t.dim].push(t);
    });
    Object.keys(porTipo).forEach(function(dim) {
      parts.push('  ' + dim + ':');
      porTipo[dim].forEach(function(t) {
        parts.push('    [' + t.cat + '] ' + t.texto);
      });
    });
    parts.push('');
  }

  // Alertas
  if (cisData.alertas.length > 0) {
    cisData.alertas.forEach(function(a) {
      if (a.tipo === 'regra') {
        parts.push('GUARDRAIL: ' + a.texto);
      } else {
        parts.push('⚠️ ALERTA ' + a.dim + ': ' + a.texto);
      }
    });
  }

  return parts.join('\n');
}


// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function garantirAbaCISReferencia() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(_CIS_SHEET_NAME);
  if (ws) return ws;
  ws = ss.insertSheet(_CIS_SHEET_NAME);
  ws.appendRow([
    'Teoria', 'Dimensao', 'Intensidade', 'Categoria',
    'Conteudo_Resumo', 'Conteudo_Detalhado', 'Sinal_Observavel',
    'Hipotese_Interpretativa', 'Risco_Se_Em_Excesso',
    'Usar_Para_Cenario', 'Usar_Para_PDI', 'Uso_Operacional',
    'Aplicacao_Escola', 'Confianca_Inferencia', 'Nao_Concluir_Isoladamente'
  ]);
  ws.getRange(1, 1, 1, 15).setFontWeight('bold').setBackground('#0f2240').setFontColor('#ffffff');
  ws.setFrozenRows(1);
  return ws;
}