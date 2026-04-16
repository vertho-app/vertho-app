// ═══════════════════════════════════════════════════════════════════════════════
// Fase3_PDI.js — Geração do PDI Consolidado (Passo 3)
// Vertho Mentor IA v2.2
// Recebe todos os JSONs de avaliação do colaborador (passo 2) e gera um
// PDI unificado com plano 30 dias, checklist tático e estudo recomendado.
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONSTANTES ───────────────────────────────────────────────────────────────
var PDI_ID_PASTA = '19RO21ZeHu3cOvZM7FecHtxkKsVy-QtZH';

// ── PONTO DE ENTRADA — BULK ──────────────────────────────────────────────────

function gerarPDIsDescritores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();

  var wsResp = ss.getSheetByName('Respostas');
  if (!wsResp) throw new Error('Aba "Respostas" não encontrada.');

  var headers = wsResp.getRange(1, 1, 1, wsResp.getLastColumn()).getValues()[0];
  var dados   = wsResp.getDataRange().getValues();
  var _h = function(l) {
    return headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes(l.toLowerCase()); });
  };

  var iEmail  = _h('e-mail'); if (iEmail  < 0) iEmail  = _h('id colaborador');
  var iStatus = _h('status ia 4'); if (iStatus < 0) iStatus = _h('status ia4'); if (iStatus < 0) iStatus = _h('status avali');

  var emailsSet = {};
  for (var r = 1; r < dados.length; r++) {
    var rowEmail = _norm(String(dados[r][iEmail]||'')).toLowerCase().trim();
    if (!rowEmail) continue;
    var st = _norm(String(dados[r][iStatus]||'')).toLowerCase();
    if (st === 'avaliado' || st === 'pdf enviado' || st === 'concluido' || st === 'concluido' || st.includes('avali') || st.includes('pdf')) {
      emailsSet[rowEmail] = true;
    }
  }

  // Verificar PDIs já gerados — contar quantas competências cada um consolidou
  var jaFeitos = {};     // email → { qtdComps: N }
  var wsPDI = ss.getSheetByName('PDI_Descritores');
  if (wsPDI && wsPDI.getLastRow() > 1) {
    var pdiDados = wsPDI.getDataRange().getValues();
    var pdiHeaders = pdiDados[0];
    // Procurar coluna "Competências" ou similar que indica quantas comps foram consolidadas
    var iQtd = -1;
    for (var ph = 0; ph < pdiHeaders.length; ph++) {
      var phn = _norm(String(pdiHeaders[ph]||'')).toLowerCase();
      if (phn.includes('competencia') || phn.includes('qtd comp')) { iQtd = ph; break; }
    }
    for (var pr = 1; pr < pdiDados.length; pr++) {
      var pEmail = _norm(String(pdiDados[pr][0]||'')).toLowerCase().trim();
      if (pEmail) {
        // Contar comps consolidadas: se tem coluna, pegar valor; senão, marcar como 1
        var qtdExistente = iQtd >= 0 ? (parseInt(pdiDados[pr][iQtd]) || 1) : 1;
        jaFeitos[pEmail] = { qtdComps: qtdExistente };
      }
    }
  }
  Logger.log('PDIs já gerados: ' + Object.keys(jaFeitos).length);

  // Contar quantas competências avaliadas cada colaborador tem agora
  var compsPorEmail = {};
  for (var r2 = 1; r2 < dados.length; r2++) {
    var rEmail2 = _norm(String(dados[r2][iEmail]||'')).toLowerCase().trim();
    if (!rEmail2 || !emailsSet[rEmail2]) continue;
    var rComp2 = headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes('nome compet'); });
    if (rComp2 < 0) rComp2 = headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes('competencia'); });
    var compNome2 = rComp2 >= 0 ? _norm(String(dados[r2][rComp2]||'')) : '';
    if (compNome2) {
      if (!compsPorEmail[rEmail2]) compsPorEmail[rEmail2] = {};
      compsPorEmail[rEmail2][compNome2] = true;
    }
  }

  // Pendentes: nunca feito OU tem mais competências avaliadas que as consolidadas no PDI existente
  var pendentes = Object.keys(emailsSet).filter(function(e) {
    if (!jaFeitos[e]) return true;  // nunca gerado
    var compsAgora = Object.keys(compsPorEmail[e] || {}).length;
    var compsAntes = jaFeitos[e].qtdComps;
    if (compsAgora > compsAntes) {
      Logger.log('PDI regenerar: ' + e + ' — tinha ' + compsAntes + ' comps, agora tem ' + compsAgora);
      return true;  // novas competências → regenerar
    }
    return false;
  });
  Logger.log('gerarPDIsDescritores: ' + pendentes.length + ' pendentes de ' + Object.keys(emailsSet).length + ' colaboradores');

  if (!pendentes.length) {
    SpreadsheetApp.getActive().toast('Todos os PDI_descritores ja foram gerados.', 'PDI_descritores', 5);
    return;
  }

  var ok = 0, erros = 0;
  var startTime = new Date().getTime();
  var MAX_MS = 5 * 60 * 1000;
  var _pdiModelo = PropertiesService.getScriptProperties().getProperty('cfg_pdi_modelo') || PropertiesService.getScriptProperties().getProperty('cfg_modelo') || 'claude-sonnet-4-20250514';

  for (var i = 0; i < pendentes.length; i++) {
    if (_deveParar()) { _limparParada(); break; }
    if (new Date().getTime() - startTime > MAX_MS) {
      var restam = pendentes.length - i;
      SpreadsheetApp.getActive().toast(
        '[' + _pdiModelo + ']\n' + ok + ' gerados, ' + restam + ' restantes.\nContinuando automaticamente em 1 min...',
        '⏳ PDI — lote encadeado', 10
      );
      Logger.log('PDI tempo limite — agendando proximo lote. Gerados: ' + ok + ' | Restam: ' + restam);
      // Limpar triggers anteriores para evitar duplicação
      ScriptApp.getProjectTriggers().forEach(function(t) {
        if (t.getHandlerFunction() === 'gerarPDIsDescritores') ScriptApp.deleteTrigger(t);
      });
      ScriptApp.newTrigger('gerarPDIsDescritores').timeBased().after(60000).create();
      return;
    }
    SpreadsheetApp.getActive().toast('[' + Config.modelLabel(_pdiModelo) + ']\n(' + (i + 1) + '/' + pendentes.length + ') ' + pendentes[i], 'Gerando PDI...', 15);
    try {
      var res = gerarPDIColaborador({ email: pendentes[i] });
      if (res.ok) { ok++; Logger.log('PDI OK: ' + pendentes[i]); }
      else        { erros++; Logger.log('PDI ERRO ' + pendentes[i] + ': ' + res.msg); }
    } catch(e) {
      erros++;
      Logger.log('PDI EXCECAO ' + pendentes[i] + ': ' + e.message);
    }
    if (i < pendentes.length - 1) Utilities.sleep(1000);
  }

  // Lote final — limpar triggers pendentes (se houver de execução anterior)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'gerarPDIsDescritores') ScriptApp.deleteTrigger(t);
  });
  SpreadsheetApp.getActive().toast('✅ Todos os PDIs concluidos!\nGerados: ' + ok + '   Erros: ' + erros, 'PDI Concluido', 8);
}


// ── PONTO DE ENTRADA — LOTE FORESEA ──────────────────────────────────────────

function gerarPDIsDescritoresForesea() {
  _gerarPDIsDescritoresComBrand('foresea');
}

// ── WRAPPER INTERNO — LOTE COM BRAND ─────────────────────────────────────────

function _gerarPDIsDescritoresComBrand(brand) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _carregarCFG();

  var wsResp = ss.getSheetByName('Respostas');
  if (!wsResp) throw new Error('Aba "Respostas" não encontrada.');

  var headers = wsResp.getRange(1, 1, 1, wsResp.getLastColumn()).getValues()[0];
  var dados   = wsResp.getDataRange().getValues();
  var _h = function(l) {
    return headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes(l.toLowerCase()); });
  };

  var iEmail  = _h('e-mail'); if (iEmail  < 0) iEmail  = _h('id colaborador');
  var iStatus = _h('status ia 4'); if (iStatus < 0) iStatus = _h('status ia4'); if (iStatus < 0) iStatus = _h('status avali');

  var emailsSet = {};
  for (var r = 1; r < dados.length; r++) {
    var rowEmail = _norm(String(dados[r][iEmail]||'')).toLowerCase().trim();
    if (!rowEmail) continue;
    var st = _norm(String(dados[r][iStatus]||'')).toLowerCase();
    if (st.includes('avali') || st.includes('pdf') || st === 'concluido') emailsSet[rowEmail] = true;
  }

  var pendentes = Object.keys(emailsSet);
  if (!pendentes.length) {
    SpreadsheetApp.getActive().toast('Nenhum colaborador avaliado encontrado.', 'PDI ' + brand, 5);
    return;
  }

  var ok = 0, erros = 0;
  var startTime = new Date().getTime();
  var MAX_MS = 5 * 60 * 1000;
  var labelBrand = brand === 'foresea' ? 'Foresea' : 'Vertho';

  for (var i = 0; i < pendentes.length; i++) {
    if (_deveParar()) { _limparParada(); break; }
    if (new Date().getTime() - startTime > MAX_MS) {
      SpreadsheetApp.getActive().toast(ok + ' gerados. Tempo limite — rode novamente para continuar.', '⏳ PDI ' + labelBrand, 10);
      return;
    }
    SpreadsheetApp.getActive().toast('(' + (i + 1) + '/' + pendentes.length + ') ' + pendentes[i], 'Gerando PDI ' + labelBrand + '...', 15);
    try {
      var res = gerarPDIColaborador({ email: pendentes[i], brand: brand });
      if (res.ok) { ok++; } else { erros++; Logger.log('PDI ' + labelBrand + ' ERRO ' + pendentes[i] + ': ' + res.msg); }
    } catch(e) {
      erros++;
      Logger.log('PDI ' + labelBrand + ' EXCECAO ' + pendentes[i] + ': ' + e.message);
    }
    if (i < pendentes.length - 1) Utilities.sleep(1000);
  }

  SpreadsheetApp.getActive().toast('✅ PDIs ' + labelBrand + ' concluídos!\nGerados: ' + ok + '   Erros: ' + erros, 'PDI ' + labelBrand, 8);
}


// ── PONTO DE ENTRADA — INDIVIDUAL ────────────────────────────────────────────

function gerarPDIColaborador(params) {
  try {
    var email = String((params && params.email) || '').trim();
    if (!email) return { ok: false, msg: 'E-mail nao informado.' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    _carregarCFG();

    var consolidado = _pdiConsolidarResultados(ss, email);
    var resultados  = consolidado.resultados;
    var meta        = consolidado.meta;

    if (!resultados.length) return { ok: false, msg: 'Nenhuma avaliacao concluida para: ' + email };

    Logger.log('PDI: ' + resultados.length + ' competencias para ' + email);
    SpreadsheetApp.getActive().toast(resultados.length + ' competencias | ' + (meta.nome || email), 'PDI', 15);

    var wsColab  = ss.getSheetByName('Colaboradores');
    var perfisCIS = _lerPerfisCISIA4(wsColab);
    var cis = perfisCIS[_norm(email).toLowerCase().trim()] || {};

    var compNomes    = resultados.map(function(r) { return r.competencia; });
    var catalogo     = _pdiBuscarCatalogo(ss, compNomes, resultados);
    var trilhaSem123 = _pdiBuscarTrilhaPrimeiras(ss, email);
    var hoje         = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var systemPrompt = _buildPDIv2SystemPrompt();
    var userPrompt   = _buildPDIv2UserPrompt({ nome: meta.nome || email, cargo: meta.cargo || '', escola: meta.escola || '',
      data: hoje, cis: cis, resultados: resultados.slice(0, 8), catalogo: catalogo,
      valores: consolidado.valores || [], trilha: trilhaSem123 });

    var pdiJson = _pdiChamarIA(systemPrompt, userPrompt);

    // ── Corrigir resumo_desempenho: forçar nível inteiro e nota decimal da aba Respostas ──
    if (pdiJson && pdiJson.resumo_desempenho && Array.isArray(pdiJson.resumo_desempenho)) {
      var _estrelasMap = { 1: '★☆☆☆', 2: '★★☆☆', 3: '★★★☆', 4: '★★★★' };
      pdiJson.resumo_desempenho.forEach(function(item) {
        var itemNorm = _norm(item.competencia || '').toLowerCase().replace(/\s+/g, '');
        // Buscar nos resultados o nível e nota corretos
        for (var ri = 0; ri < resultados.length; ri++) {
          var rNorm = _norm(resultados[ri].competencia || '').toLowerCase().replace(/\s+/g, '');
          if (rNorm === itemNorm || rNorm.indexOf(itemNorm) >= 0 || itemNorm.indexOf(rNorm) >= 0
            || rNorm.substring(0, 15) === itemNorm.substring(0, 15)) {
            item.nivel = resultados[ri].nivel_geral || parseInt(resultados[ri].nivel_geral) || item.nivel;
            item.nota = resultados[ri].nota_decimal || resultados[ri].media || item.nota;
            item.estrelas = _estrelasMap[parseInt(item.nivel)] || item.estrelas;
            break;
          }
        }
      });
    }

    // ── Injetar estudo_recomendado da Trilha na competência de maior gap ────
    Logger.log('PDI trilha: ' + (trilhaSem123 ? trilhaSem123.length : 0) + ' semanas encontradas');

    // Encontrar competência de menor nota (maior gap)
    var piorComp = null, piorNota = 99;
    resultados.forEach(function(r) {
      var nota = parseFloat(r.nota_decimal || r.media || r.nivel || 99);
      if (nota < piorNota) { piorNota = nota; piorComp = r.competencia; }
    });
    Logger.log('PDI pior comp: "' + piorComp + '" nota=' + piorNota);

    // Montar estudo_recomendado a partir da trilha
    var estudoTrilha = [{ tipo: 'trilha', titulo: 'Consulte sua Trilha de Desenvolvimento', url: '',
      por_que: 'Sua trilha personalizada contém os conteúdos priorizados para seu desenvolvimento.' }];

    if (trilhaSem123 && trilhaSem123.length > 0) {
      var comUrl = [];
      trilhaSem123.forEach(function(t) {
        if (t.url && String(t.url).trim() && String(t.url).trim().toLowerCase().indexOf('http') === 0) {
          comUrl.push({ tipo: 'trilha', titulo: t.titulo || ('Semana ' + t.semana), url: t.url,
            por_que: 'Descritor: ' + (t.descritor || '') + (t.nota ? ' (nota ' + t.nota + ')' : '') });
        }
      });
      if (comUrl.length > 0) estudoTrilha = comUrl;
      Logger.log('PDI trilha URLs válidas: ' + comUrl.length + ' de ' + trilhaSem123.length);
    }

    // Aplicar na competência de maior gap (todas as prioritárias recebem — match flexível)
    if (pdiJson && pdiJson.competencias_prioritarias) {
      var piorNorm = _norm(piorComp || '').toLowerCase().replace(/\s+/g, '');
      var injetou = false;
      pdiJson.competencias_prioritarias.forEach(function(cp) {
        var cpNorm = _norm(cp.competencia || '').toLowerCase().replace(/\s+/g, '');
        if (cpNorm === piorNorm
          || cpNorm.indexOf(piorNorm) >= 0 || piorNorm.indexOf(cpNorm) >= 0
          || cpNorm.substring(0, 15) === piorNorm.substring(0, 15)) {
          cp.estudo_recomendado = estudoTrilha;
          injetou = true;
          Logger.log('PDI: estudo_recomendado injetado em "' + cp.competencia + '" (' + estudoTrilha.length + ' itens)');
        }
      });
      // Se não conseguiu match, injetar na primeira competência (a de maior gap no PDI)
      if (!injetou && pdiJson.competencias_prioritarias.length > 0) {
        pdiJson.competencias_prioritarias[0].estudo_recomendado = estudoTrilha;
        Logger.log('PDI: estudo_recomendado injetado na 1a comp (fallback): "' + pdiJson.competencias_prioritarias[0].competencia + '"');
      }
    }

    var brand = (params && params.brand) || 'vertho';
    _pdiSalvar(ss, email, pdiJson, meta.nome, meta.cargo, resultados.length, brand);

    return { ok: true, msg: 'PDI gerado para ' + (meta.nome || email) + ' (' + resultados.length + ' comps)', pdiJson: pdiJson };
  } catch(e) {
    Logger.log('gerarPDIColaborador erro: ' + e.message);
    return { ok: false, msg: 'Erro: ' + e.message };
  }
}


// ── CONSOLIDAÇÃO ─────────────────────────────────────────────────────────────

function _pdiConsolidarResultados(ss, email) {
  var wsResp = ss.getSheetByName('Respostas');
  if (!wsResp) return { resultados: [], meta: {} };

  var headers = wsResp.getRange(1, 1, 1, wsResp.getLastColumn()).getValues()[0];
  var dados   = wsResp.getDataRange().getValues();

  var _h = function(l) {
    return headers.findIndex(function(h) { return _norm(h||'').toLowerCase().includes(l.toLowerCase()); });
  };

  var iEmail    = _h('e-mail');    if (iEmail    < 0) iEmail    = _h('id colaborador');
  var iNome     = _h('nome colaborador');
  var iCargo    = _h('cargo');
  var iEscola   = _h('escola');    if (iEscola   < 0) iEscola   = _h('empresa');
  var iComp     = _h('nome compet');
  var iCompId   = _h('id compet');
  var iNivel    = _h('nivel ia4'); if (iNivel < 0) iNivel = _h('nivel ia');
  var iNota     = _h('nota ia4');
  var iFeedback = _h('feedback ia4');
  var iPayload  = _h('payload');
  var iStatus   = _h('status ia 4'); if (iStatus < 0) iStatus = _h('status ia4'); if (iStatus < 0) iStatus = _h('status avali');
  var iValPayload = _h('valores payload');

  var emailNorm = _norm(String(email||'')).toLowerCase().trim();
  var mapa = {}, meta = { nome: '', cargo: '', escola: '' };
  var valoresRaw = [];  // coleta todas avaliações de valores do colaborador

  for (var r = 1; r < dados.length; r++) {
    var row      = dados[r];
    var rowEmail = _norm(String(row[iEmail]||'')).toLowerCase().trim();
    if (rowEmail !== emailNorm) continue;

    if (iNome   >= 0 && row[iNome])   meta.nome   = _norm(String(row[iNome]));
    if (iCargo  >= 0 && row[iCargo])  meta.cargo  = _norm(String(row[iCargo]));
    if (iEscola >= 0 && row[iEscola]) meta.escola = _norm(String(row[iEscola]));

    var st = _norm(String(row[iStatus]||'')).toLowerCase();
    if (!(st === 'avaliado' || st === 'pdf enviado' || st === 'concluido' || st === 'concluido' || st.includes('avali') || st.includes('pdf'))) continue;

    var compNome = iComp   >= 0 ? _norm(String(row[iComp]  ||'')) : '';
    var compId   = iCompId >= 0 ?       String(row[iCompId]||'')  : compNome;
    if (!compNome) continue;

    var payloadObj = null;
    if (iPayload >= 0 && row[iPayload]) { try { payloadObj = JSON.parse(String(row[iPayload])); } catch(e) {} }

    var nivel    = Number(row[iNivel]) || 0;
    var nota     = Number(String(row[iNota]||'').replace(',','.')) || 0;
    var feedback = iFeedback >= 0 ? _norm(String(row[iFeedback]||'')) : '';
    var con      = (payloadObj && payloadObj.consolidacao) || {};
    var dd       = (payloadObj && payloadObj.descritores_destaque) || {};

    // ── Ler notas decimais D1-D6 das colunas (prioridade sobre payload) ────
    var iD1 = _h('d1 nota'); var iD2 = _h('d2 nota'); var iD3 = _h('d3 nota');
    var iD4 = _h('d4 nota'); var iD5 = _h('d5 nota'); var iD6 = _h('d6 nota');
    var notasDesc = [];
    [iD1,iD2,iD3,iD4,iD5,iD6].forEach(function(idx) {
      if (idx >= 0) { var v = parseFloat(row[idx]); if (!isNaN(v) && v > 0) notasDesc.push(v); }
    });
    // Nota decimal = média das D1-D6 (se disponíveis), senão Nota IA4 da célula
    var notaDecimal = notasDesc.length > 0
      ? Math.round((notasDesc.reduce(function(a,b){return a+b;},0) / notasDesc.length) * 100) / 100
      : nota;

    // V2: Extrair descritores com código e nível do novo formato
    var descritoresAvaliados = [];
    var descritoresGap = [];
    if (payloadObj && payloadObj.descritores && Array.isArray(payloadObj.descritores)) {
      descritoresAvaliados = payloadObj.descritores;
      descritoresGap = (payloadObj.descritores_gap || []);
    }

    // Se já existe avaliação para esta competência, manter a mais recente (última linha)
    mapa[compId || compNome] = {
      competencia:         compNome,
      compId:              compId,
      descricao:           (payloadObj && payloadObj.definicao)    || '',
      nivel_geral:         nivel,
      nota_decimal:        notaDecimal,
      media:               notaDecimal,
      gap:                 Math.max(0, 3 - notaDecimal),
      pontos_fortes:       dd.pontos_fortes    || [],
      gaps_prioritarios:   dd.gaps_prioritarios|| [],
      descritores_baixos:  _pdiExtrai3MaisBaixos(payloadObj),
      descritores_avaliados: descritoresAvaliados,
      descritores_gap:     descritoresGap,
      feedback_v2:         (payloadObj && payloadObj.feedback) || feedback,
      recomendacoes_pdi:   (payloadObj && payloadObj.recomendacoes_pdi) || [],
      notas_descritores:   notasDesc,
    };

    // Coletar avaliação de valores (se existir)
    if (iValPayload >= 0 && row[iValPayload]) {
      try {
        var vp = JSON.parse(String(row[iValPayload]));
        if (Array.isArray(vp)) valoresRaw = valoresRaw.concat(vp);
      } catch(e) {}
    }
  }

  // Consolidar valores: agrupar por nome, maioria vence, violação prevalece
  var valoresConsolidados = _pdiConsolidarValores(valoresRaw);

  var arr = Object.keys(mapa).map(function(k) { return mapa[k]; });
  arr.sort(function(a, b) { return (b.gap || 0) - (a.gap || 0); });
  return { resultados: arr, meta: meta, valores: valoresConsolidados };
}

/**
 * Consolida avaliações de valores de múltiplos cenários.
 * Regras: violação prevalece > tensão > alinhado > sem_evidência (maioria dos demais).
 */
function _pdiConsolidarValores(valoresRaw) {
  if (!valoresRaw || valoresRaw.length === 0) return [];

  var porValor = {};
  for (var i = 0; i < valoresRaw.length; i++) {
    var v = valoresRaw[i];
    if (!v || !v.valor) continue;
    var key = v.valor.toLowerCase().trim();
    if (!porValor[key]) porValor[key] = { nome: v.valor, items: [] };
    porValor[key].items.push(v);
  }

  var resultado = [];
  var keys = Object.keys(porValor);
  for (var k = 0; k < keys.length; k++) {
    var grupo = porValor[keys[k]];
    var items = grupo.items;

    // Violação prevalece sobre qualquer outra avaliação
    var temViolacao = items.some(function(x) { return x.status === 'violacao'; });
    if (temViolacao) {
      var viol = items.filter(function(x) { return x.status === 'violacao'; })[0];
      resultado.push({
        valor: grupo.nome,
        status: 'violacao',
        evidencia: viol.evidencia || '',
        trecho_resposta: viol.trecho_resposta || '',
        conexao_perfil: viol.conexao_perfil || ''
      });
      continue;
    }

    // Contar por status
    var contagem = { alinhado: 0, tensao: 0, sem_evidencia: 0 };
    var melhorEvidencia = null;
    for (var j = 0; j < items.length; j++) {
      var st = items[j].status || 'sem_evidencia';
      contagem[st] = (contagem[st] || 0) + 1;
      if (st === 'tensao' && !melhorEvidencia) melhorEvidencia = items[j];
      if (st === 'alinhado' && !melhorEvidencia) melhorEvidencia = items[j];
    }

    // Maioria vence
    var statusFinal = 'sem_evidencia';
    if (contagem.tensao > contagem.alinhado) statusFinal = 'tensao';
    else if (contagem.alinhado > 0) statusFinal = 'alinhado';
    else if (contagem.tensao > 0) statusFinal = 'tensao';

    resultado.push({
      valor: grupo.nome,
      status: statusFinal,
      evidencia: melhorEvidencia ? (melhorEvidencia.evidencia || '') : '',
      trecho_resposta: melhorEvidencia ? (melhorEvidencia.trecho_resposta || '') : '',
      conexao_perfil: melhorEvidencia ? (melhorEvidencia.conexao_perfil || '') : ''
    });
  }

  return resultado;
}

function _pdiExtrai3MaisBaixos(payloadObj) {
  if (!payloadObj) return [];
  var notas = payloadObj.consolidacao && payloadObj.consolidacao.notas_por_descritor;
  if (notas && notas.length) {
    return notas.slice().sort(function(a, b) { return (a.nivel||0) - (b.nivel||0); }).slice(0, 3)
      .map(function(d) { return { nome: d.nome||'', nivel: d.nivel||1, evidencia: d.evidencia||'' }; });
  }
  var apr = payloadObj.avaliacao_por_resposta || {}, vistos = {}, todos = [];
  ['R1','R2','R3','R4'].forEach(function(rk) {
    var ri = apr[rk]; if (!ri || !ri.descritores_avaliados) return;
    (ri.descritores_avaliados || []).forEach(function(d) {
      if (!vistos[d.nome]) { vistos[d.nome] = true; todos.push({ nome: d.nome||'', nivel: d.nivel||1, evidencia: d.evidencia||'' }); }
    });
  });
  todos.sort(function(a, b) { return (a.nivel||0) - (b.nivel||0); });
  return todos.slice(0, 3);
}


// ── CATÁLOGO MOODLE ───────────────────────────────────────────────────────────

function _pdiSemAcento(s) {
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function _pdiBuscarCatalogo(ss, compNomes, resultados) {
  var catalogo = {};
  compNomes.forEach(function(c) { catalogo[c] = []; });

  // ── 1. Tentar ler do Catalogo_Enriquecido (preferido — tem descritores e nível) ──
  var wsCatEnr = ss.getSheetByName('Catalogo_Enriquecido');
  if (wsCatEnr && wsCatEnr.getLastRow() > 1) {
    var enrData = wsCatEnr.getDataRange().getValues();
    var enrHdr  = enrData[0];
    var _he = function(l) { return enrHdr.findIndex(function(h) { return _pdiSemAcento(String(h||'')).includes(l); }); };

    var iCurso  = _he('curso');
    var iSecao  = _he('secao');  if (iSecao < 0) iSecao = _he('seca');
    var iUrl    = _he('url');
    var iCompC  = _he('comp. confirmada'); if (iCompC < 0) iCompC = _he('comp confirmada'); if (iCompC < 0) iCompC = _he('confirmada');
    var iD1     = _he('descritor 1');
    var iD2     = _he('descritor 2');
    var iD3     = _he('descritor 3');
    var iNivel  = _he('nivel ideal'); if (iNivel < 0) iNivel = _he('nivel');
    var iTempo  = _he('tempo');
    var iTipo   = _he('tipo');
    var iModulos= _he('modulos'); if (iModulos < 0) iModulos = _he('sub-temas'); if (iModulos < 0) iModulos = _he('sub');

    if (iCompC >= 0 && iUrl >= 0) {
      // Montar mapa de descritores baixos por competência (do resultado de avaliação)
      var descBaixosPorComp = {};
      (resultados || []).forEach(function(r) {
        var cNorm = _pdiSemAcento(r.competencia || '');
        descBaixosPorComp[cNorm] = (r.descritores_baixos || []).map(function(d) {
          return _pdiSemAcento(d.nome || '');
        });
      });

      // Ler todas as linhas do catálogo enriquecido (pode ter múltiplas linhas por curso×cargo)
      var iCargo  = _he('cargo');
      var secoesPorComp = {};
      var _urlJaVisto = {};  // dedup: evitar duplicatas de curso
      for (var r = 1; r < enrData.length; r++) {
        var tipo = iTipo >= 0 ? String(enrData[r][iTipo]||'').toLowerCase() : '';
        if (tipo === 'administrativo') continue;

        var compConf = String(enrData[r][iCompC]||'').trim();
        if (!compConf || compConf === 'Indefinido' || compConf === 'ERRO') continue;

        var url    = String(enrData[r][iUrl]||'').trim();
        var secao  = iSecao >= 0 ? String(enrData[r][iSecao]||'').trim() : '';
        var curso  = iCurso >= 0 ? String(enrData[r][iCurso]||'').trim() : '';
        var titulo = secao || curso;
        if (!url || !titulo) continue;

        // Dedup: mesmo curso+competência já processado (linhas de cargos diferentes)
        var compConfNormKey = _pdiSemAcento(compConf);
        var dedupKey = compConfNormKey + '|' + url;
        if (_urlJaVisto[dedupKey]) continue;
        _urlJaVisto[dedupKey] = true;

        // Extrair descritores da seção
        var descSecao = [];
        [iD1, iD2, iD3].forEach(function(idx) {
          if (idx >= 0) {
            var val = _pdiSemAcento(String(enrData[r][idx]||''));
            if (val) descSecao.push(val);
          }
        });

        var nivelIdeal = iNivel >= 0 ? (Number(enrData[r][iNivel]) || 0) : 0;
        var tempo      = iTempo >= 0 ? String(enrData[r][iTempo]||'') : '';
        var modulos    = iModulos >= 0 ? String(enrData[r][iModulos]||'') : '';

        var compConfNorm = _pdiSemAcento(compConf);
        if (!secoesPorComp[compConfNorm]) secoesPorComp[compConfNorm] = [];
        secoesPorComp[compConfNorm].push({
          titulo:      titulo,
          curso:       curso,
          url:         url,
          descritores: descSecao,
          nivel_ideal: nivelIdeal,
          tempo:       tempo,
          modulos:     modulos.substring(0, 200)
        });
      }

      // Para cada competência do PDI, buscar seções relevantes priorizando descritores baixos
      compNomes.forEach(function(compNome) {
        var cNorm = _pdiSemAcento(compNome);
        var secoesDisp = secoesPorComp[cNorm] || [];
        if (!secoesDisp.length) return;

        var descBaixos = descBaixosPorComp[cNorm] || [];

        // Pontuar cada seção: +3 por descritor que bate com descritor baixo, +1 por nível ideal baixo (prioriza gaps)
        secoesDisp.forEach(function(sec) {
          sec._score = 0;
          sec.descritores.forEach(function(d) {
            descBaixos.forEach(function(db) {
              if (d.includes(db) || db.includes(d)) sec._score += 3;
            });
          });
          // Preferir conteúdo de nível mais básico para gaps (nível 1-2)
          if (sec.nivel_ideal <= 2) sec._score += 1;
        });

        // Ordenar por score decrescente e pegar top 4
        secoesDisp.sort(function(a, b) { return b._score - a._score; });
        var top = secoesDisp.slice(0, 4);

        top.forEach(function(sec) {
          catalogo[compNome].push({
            titulo:           sec.titulo,
            curso:            sec.curso,
            url:              sec.url,
            nivel_ideal:      sec.nivel_ideal,
            tempo_estimado:   sec.tempo,
            descritores_abordados: sec.descritores.join(', '),
            modulos:          sec.modulos,
            relevancia_gap:   sec._score > 0 ? 'alta' : 'media'
          });
        });
      });

      Logger.log('PDI catálogo: lido do Catalogo_Enriquecido — ' + Object.keys(secoesPorComp).length + ' competências com seções');
      return catalogo;
    }
  }

  // ── 2. Fallback: ler do Moodle_Catalogo (formato antigo, sem descritores) ──
  Logger.log('PDI catálogo: fallback para Moodle_Catalogo (sem Catalogo_Enriquecido)');
  var wsCat = ss.getSheetByName('Moodle_Catalogo');
  if (!wsCat || wsCat.getLastRow() <= 1) return catalogo;

  var catData = wsCat.getRange(1, 1, wsCat.getLastRow(), Math.min(wsCat.getLastColumn(), 7)).getValues();
  var hdr = catData[0];
  var _hc = function(l) { return hdr.findIndex(function(h) { return _norm(String(h||'')).toLowerCase().includes(l); }); };
  var iC = _hc('compet'), iT = _hc('tit'), iU = _hc('url'), iS = _hc('seman');
  if (iC < 0 || iT < 0 || iU < 0) return catalogo;

  for (var r = 1; r < catData.length; r++) {
    var rowCompRaw = _norm(String(catData[r][iC]||'')).trim();
    var rowCompN   = _pdiSemAcento(rowCompRaw);
    var rowTit  = String(catData[r][iT]||'').trim();
    var rowUrl  = String(catData[r][iU]||'').trim();
    if (!rowUrl || !rowTit) continue;
    compNomes.forEach(function(compNome) {
      var cNorm = _pdiSemAcento(compNome);
      if ((rowCompN.includes(cNorm) || cNorm.includes(rowCompN)) && catalogo[compNome].length < 6) {
        catalogo[compNome].push({ titulo: rowTit, url: rowUrl, semana: iS >= 0 ? (Number(catData[r][iS])||'') : '' });
      }
    });
  }
  return catalogo;
}


/**
 * Busca as primeiras semanas de conteúdo da trilha do colaborador na aba Trilhas.
 * Retorna array com {semana, titulo, url, descritor, nota, competencia} das semanas 1-3.
 */
function _pdiBuscarTrilhaPrimeiras(ss, email) {
  var wsTri = ss.getSheetByName('Trilhas');
  if (!wsTri || wsTri.getLastRow() < 2) return [];

  var dados = wsTri.getDataRange().getValues();
  var hdr = dados[0];
  var _nh = function(s) { return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[áàâãéèêíìóòôúùç]/g, function(c) {
    return 'aaaaeeeiioooouuc'.charAt('áàâãéèêíìóòôúùç'.indexOf(c));
  }); };
  var _fh = function(label) {
    var ln = _nh(label);
    return hdr.findIndex(function(h) { return _nh(h).indexOf(ln) >= 0; });
  };

  var iEmail = _fh('email');
  var iComp  = _fh('competencia');
  var iSem   = _fh('semana');
  var iTipo  = _fh('tiposemana');
  var iTit   = _fh('titulopilula'); if (iTit < 0) iTit = _fh('titulo');
  var iUrl   = _fh('urlmoodle');   if (iUrl < 0) iUrl = _fh('url');
  var iDesc  = _fh('descritorfoco'); if (iDesc < 0) iDesc = _fh('descritor');
  var iNota  = _fh('notadescritor'); if (iNota < 0) iNota = _fh('nota');

  if (iEmail < 0) {
    Logger.log('_pdiBuscarTrilhaPrimeiras: coluna Email não encontrada. Headers: ' + hdr.join(' | '));
    return [];
  }

  var emailNorm = String(email||'').trim().toLowerCase();
  var resultado = [];

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail = String(row[iEmail] || '').trim().toLowerCase();
    if (rowEmail !== emailNorm) continue;

    var semana = parseInt(row[iSem >= 0 ? iSem : 0]) || 0;
    var tipo = String(row[iTipo >= 0 ? iTipo : 0] || '').toLowerCase();
    if (semana < 1 || semana > 3 || tipo !== 'conteudo') continue;

    resultado.push({
      semana: semana,
      competencia: iComp >= 0 ? String(row[iComp] || '').trim() : '',
      titulo: iTit >= 0 ? String(row[iTit] || '').trim() : '',
      url: iUrl >= 0 ? String(row[iUrl] || '').trim() : '',
      descritor: iDesc >= 0 ? String(row[iDesc] || '').trim() : '',
      nota: iNota >= 0 ? (parseFloat(row[iNota]) || '') : ''
    });
  }

  resultado.sort(function(a, b) { return a.semana - b.semana; });
  return resultado;
}


// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

function _buildPDIv2SystemPrompt() {
  return [
    'Voce e o Gerador de PDI da Vertho Mentor IA.',
    'Crie um PDI completo, personalizado e acionavel para um profissional da educacao publica.',
    'Baseie-se nos resultados de TODAS as competencias avaliadas e no perfil CIS completo.',
    '',
    '==============================',
    'FILOSOFIA DO PDI',
    '==============================',
    '1. PDI = MUDANCA COMPORTAMENTAL - nao lista de cursos. Acoes que o profissional executa agora.',
    '2. REALISTA - gratuito, na rotina escolar: HTPC, reuniao de planejamento, observacao de par, conselho de classe.',
    '3. MOTIVADOR - linguagem calibrada pelo CIS: Alto Social = impacto nas pessoas; Alto Teorico = compreensao profunda; Alto D = resultados diretos.',
    '4. FOCADO - maximo 3 competencias prioritarias. Um plano com 8 acoes nao e executado.',
    '5. PROGRESSAO - plano 30 dias: semanas 1-2 (micro-habito) / semana 3 (escalada) / semana 4 (evidencia de mudanca).',
    '6. ACIONAVEL - checklist tatico = "freio de consciencia" antes de agir.',
    '',
    '==============================',
    'ESTRUTURA - 5 SECOES',
    '==============================',
    '',
    '1. perfil_comportamental',
    '   tipo_perfil: sigla DISC dominante + rotulo natural. Ex: "SC - Estavel e Criterioso". SEM SCORES.',
    '   como_se_manifesta: 1 frase do padrao comportamental no contexto escolar.',
    '   alavanca_crescimento: "Aumentar [traco baixo] para equilibrar [traco alto] com [resultado esperado]."',
    '',
    '2. resumo_desempenho',
    '   TODAS as competencias avaliadas. Por item: nome, nivel (INTEIRO 1-4 do campo nivel_geral), estrelas, nota (decimal), flag.',
    '   ATENCAO: o campo "nivel" DEVE ser o INTEIRO nivel_geral (1, 2, 3 ou 4), NAO a media decimal.',
    '   O campo "nota" DEVE ser a media decimal (ex: 1.33, 2.17).',
    '   Flag: 🚩 = maior gap | ⭐ = nivel 4. Ordenar por gap descendente.',
    '   Para estrelas use: nivel 1 = ★☆☆☆ | nivel 2 = ★★☆☆ | nivel 3 = ★★★☆ | nivel 4 = ★★★★',
    '',
    '3. competencias_prioritarias (max 3, maior gap primeiro)',
    '   Bloco completo para cada competencia prioritaria:',
    '',
    '   descritores_baixos: use os 3 descritores com menor nivel fornecidos nos dados.',
    '     Para cada um: evidencia literal da resposta + explicacao do gap comportamental.',
    '',
    '   fez_bem: 2-3 evidencias CONCRETAS das respostas (jamais genericas).',
    '   melhorar: 2-3 gaps especificos conectados aos descritores_baixos.',
    '',
    '   feedback: 6-10 linhas. Estrutura obrigatoria:',
    '     1. Abrir com o que faz bem (evidencia real da avaliacao)',
    '     2. Conectar gap ao DISC: "Sua tendencia natural de X faz com que Y..."',
    '     3. Mostrar impacto: "Quando voce [comportamento], a mensagem transmitida e..."',
    '     4. Motivar com Valores top-2: "Para alguem que valoriza [valor], isso significa..."',
    '     5. Fechar com direcao: "O desafio e equilibrar X com Y"',
    '     Tom de mentor - direto e respeitoso. Frases fortes permitidas APOS reconhecimento.',
    '     NUNCA citar scores numericos (nao dizer "I=64", "S=72" etc.).',
    '',
    '   plano_30_dias: 4 blocos. Max 2 acoes por bloco.',
    '     semanas_1_2: micro-habito, baixa friccao, executavel em 5-10 min/dia.',
    '     semana_3: escalada - pratica com peer ou situacao real.',
    '     semana_4: consolidacao - produzir evidencia tangivel de mudanca.',
    '     Acoes no formato SE-ENTAO quando possivel.',
    '     Conectar a momentos reais: HTPC, reuniao pedagogica, conselho de classe, atendimento a familias.',
    '',
    '   dicas_desenvolvimento: 2-3 frases curtas.',
    '     Formato: "Quando [situacao-gatilho], [acao ou lembrete mental]."',
    '     Scripts mentais - frases que o profissional repete no momento da decisao.',
    '',
    '   estudo_recomendado: APENAS para a competencia de MAIOR GAP (menor nota).',
    '     Para as demais competencias, retorne estudo_recomendado como array VAZIO [].',
    '     Na competencia de maior gap, incluir 1-2 recursos da TRILHA DE DESENVOLVIMENTO ou do CATALOGO MOODLE.',
    '     PRIORIDADE 1: Se houver uma TRILHA DE DESENVOLVIMENTO para este colaborador, use os conteudos das primeiras 3 semanas.',
    '     PRIORIDADE 2: Se nao houver trilha, use o CATALOGO MOODLE — PRIORIZE secoes com relevancia_gap="alta".',
    '     REGRA ABSOLUTA: NUNCA invente titulos, URLs ou cursos.',
    '     Use EXATAMENTE o titulo e a url que constam na trilha ou catalogo — copie literalmente.',
    '     Se nenhum curso com URL estiver disponivel, retorne UM UNICO item:',
    '     {"tipo": "trilha", "titulo": "Consulte sua Trilha de Desenvolvimento", "url": "", "por_que": "Sua trilha personalizada contem os conteudos priorizados para seu desenvolvimento."}',
    '     Calibrar pelo Tipo Psicologico:',
    '     Sensorial+Introvertido = guia passo a passo | Sensorial+Extrovertido = tutorial pratico/observacao',
    '     Intuitivo+Introvertido = conceitual/reflexivo | Intuitivo+Extrovertido = debate/grupo',
    '     Racional = dados e frameworks | Emocional = historias com impacto humano',
    '',
    '   checklist_tatico: 5-6 perguntas SIM/NAO em 1a pessoa.',
    '     Especificas desta competencia. Responder ANTES de agir.',
    '     Exemplos: "A meta foi comunicada com clareza e prazo?" / "Estou priorizando o resultado ou o conforto?"',
    '     NUNCA reutilizar entre competencias.',
    '',
    '4. alinhamento_valores (OBRIGATORIO se dados de valores forem fornecidos)',
    '   Secao dedicada ANTES das competencias no output.',
    '   Para cada valor avaliado:',
    '   - valor: nome do valor',
    '   - status: alinhado | tensao | violacao',
    '   - observacao: texto descritivo do que foi observado (2-3 frases)',
    '   - conexao_cis: como o perfil DISC explica o padrao (se tensao ou violacao)',
    '   - reflexao: frase-convite para reflexao (NAO e plano de acao, e espelho)',
    '',
    '   TOM DE VALORES: Valores NAO tem plano de desenvolvimento.',
    '   TENSAO nao e falha — e humana e esperada. O feedback diz:',
    '   "Observamos tensao entre seus valores e suas acoes sob pressao — isso e comum em perfis [DISC]."',
    '   VIOLACAO e excepcional e requer sinalizacao clara mas respeitosa.',
    '   NUNCA "Desenvolva etica em 30 dias". SIM "Posicionar-se eticamente nao e criar conflito."',
    '',
    '5. mensagem_final: 3-4 linhas.',
    '   Reconhecer contexto desafiador. Reforcar forcas demonstradas.',
    '   Fechar com meta em 1a pessoa da prioridade #1.',
    '   Tom: motivador sem ser piegas. Realista sem ser pessimista.',
    '',
    '==============================',
    'REGRAS DE TOM',
    '==============================',
    'USE linguagem de sala dos professores, nao de RH.',
    '"Na proxima HTPC..." sim | "No proximo checkpoint de desenvolvimento..." nao',
    '"Observe a aula de um colega" sim | "Benchmark com job shadowing" nao',
    'Sanduiche: forca > gap > acao. Impacto nas criancas quando relevante.',
    'NUNCA scores numericos. Acoes gratuitas e executaveis.',
    'Frases fortes SOMENTE depois de reconhecer algo positivo.',
    '',
    '==============================',
    'OUTPUT: APENAS JSON VALIDO, SEM MARKDOWN, SEM TEXTO ANTES OU DEPOIS',
    '==============================',
    '{',
    '  "profissional": "nome",',
    '  "cargo": "cargo",',
    '  "escola": "escola",',
    '  "data_geracao": "DD/MM/YYYY",',
    '  "perfil_comportamental": {',
    '    "tipo_perfil": "SC - Estavel e Criterioso",',
    '    "como_se_manifesta": "...",',
    '    "alavanca_crescimento": "Aumentar [traco] para equilibrar [traco] com [resultado]."',
    '  },',
    '  "resumo_desempenho": [',
    '    {"competencia": "Lideranca", "nivel": 2, "nota": 1.33, "estrelas": "★★☆☆", "flag": "🚩"},',
    '    {"competencia": "Comunicacao Eficaz", "nivel": 3, "nota": 2.83, "estrelas": "★★★☆", "flag": ""}',
    '  ],',
    '  "competencias_prioritarias": [',
    '    {',
    '      "prioridade": 1,',
    '      "competencia": "Lideranca",',
    '      "nivel_atual": 2,',
    '      "meta": 3,',
    '      "flag": "🚩",',
    '      "descricao_competencia": "Descricao em 1-2 linhas.",',
    '      "descritores_baixos": [',
    '        {"nome": "Nome do descritor", "nivel": 1, "evidencia": "Trecho ou explicacao do gap"}',
    '      ],',
    '      "fez_bem": ["Evidencia concreta 1", "Evidencia concreta 2"],',
    '      "melhorar": ["Gap especifico 1", "Gap 2", "Gap 3"],',
    '      "feedback": "Paragrafo 6-10 linhas. Positivo > gap DISC > impacto > motivacao valores > direcao.",',
    '      "plano_30_dias": {',
    '        "semanas_1_2": {"foco": "Tema", "acoes": ["SE situacao X, ENTAO faca Y", "Acao 2"]},',
    '        "semana_3":    {"foco": "Escalada", "acoes": ["Acao mais complexa", "Acao 2"]},',
    '        "semana_4":    {"foco": "Consolidacao", "acoes": ["Gerar evidencia de mudanca"]}',
    '      },',
    '      "dicas_desenvolvimento": ["Quando [gatilho], [acao mental].", "Quando [gatilho], [lembrete]."],',
    '      "estudo_recomendado": [',
    '        {"tipo": "curso_moodle|pratica|observacao", "titulo": "Titulo", "url": "https://...", "por_que": "Adequado ao perfil porque..."}',
    '      ],  // APENAS na competencia de MAIOR GAP — nas demais, retornar []',
    '      "checklist_tatico": ["Pergunta 1?", "Pergunta 2?", "Pergunta 3?", "Pergunta 4?", "Pergunta 5?"]',
    '    }',
    '  ],',
    '  "alinhamento_valores": [',
    '    {"valor":"Etica e integridade","status":"alinhado|tensao|violacao","observacao":"texto descritivo","conexao_cis":"como o DISC explica","reflexao":"frase convite para reflexao"}',
    '  ],',
    '  "mensagem_final": "3-4 linhas motivadoras com meta em 1a pessoa."',
    '}',
    '',
    'VALIDACAO: resumo_desempenho tem TODAS as competencias? competencias_prioritarias max 3? alinhamento_valores presente se dados fornecidos?',
    'fez_bem com evidencias reais? feedback integra DISC+Valores+Tipos sem scores?',
    'plano_30_dias com progressao semanal? dicas no formato Quando X Y?',
    'estudo_recomendado com url do catalogo? checklist 5-6 perguntas especificas? JSON valido?',
  ].join('\n');
}


// ── USER PROMPT ───────────────────────────────────────────────────────────────

function _buildPDIv2UserPrompt(inp) {
  var cis = inp.cis || {};

  var resultadosFormatados = (inp.resultados || []).map(function(r) {
    var obj = {
      competencia:         r.competencia,
      compId:              r.compId || '',
      nivel_geral:         r.nivel_geral,
      media:               r.media,
      gap:                 r.gap,
      descricao:           (r.descricao || '').slice(0, 120),
      pontos_fortes:       (r.pontos_fortes || []).slice(0, 3).map(function(p) {
        return { descritor: p.descritor||p.nome||'', nivel: p.nivel, evidencia: (p.evidencia_resumida||p.evidencia||'').slice(0, 80) };
      }),
      gaps_prioritarios:   (r.gaps_prioritarios || []).slice(0, 3).map(function(g) {
        return { descritor: g.descritor||g.nome||'', nivel: g.nivel, o_que_faltou: (g.o_que_faltou||'').slice(0, 80) };
      }),
      descritores_baixos:  (r.descritores_baixos || []).map(function(d) {
        return { nome: d.nome, nivel: d.nivel, evidencia: (d.evidencia||'').slice(0, 100) };
      }),
      feedback_individual: (r.feedback_v2 || '').slice(0, 300),
      pdi_preliminar:      (r.recomendacoes_pdi || []).slice(0, 3).map(function(p) {
        return { descritor: p.descritor_foco||'', nivel_atual: p.nivel_atual, acao: (p.acao||'').slice(0, 80), barreira: (p.barreira_provavel||'').slice(0, 60) };
      }),
    };
    // V2: Incluir descritores avaliados com código e nível
    if (r.descritores_avaliados && r.descritores_avaliados.length > 0) {
      obj.descritores_avaliados = r.descritores_avaliados.map(function(d) {
        return { cod: d.cod||'', nivel: d.nivel, evidencia: (d.evidencia||'').slice(0, 80) };
      });
      obj.descritores_gap = r.descritores_gap || [];
    }
    return obj;
  });

  return [
    'Gere o PDI completo para o profissional abaixo.',
    '',
    '=======================================',
    'DADOS DO PROFISSIONAL',
    '=======================================',
    'NOME: ' + inp.nome + '  |  CARGO: ' + inp.cargo,
    'ESCOLA: ' + (inp.escola || '(nao informada)') + '  |  DATA: ' + inp.data,
    '',
    'PERFIL CIS COMPLETO:',
    'DISC: D=' + (cis.d||0) + '  I=' + (cis.i||0) + '  S=' + (cis.s||0) + '  C=' + (cis.c||0),
    'VALORES: Teorico=' + (cis.val_teorico||0) + '  Economico=' + (cis.val_economico||0) +
      '  Estetico=' + (cis.val_estetico||0) + '  Social=' + (cis.val_social||0) +
      '  Politico=' + (cis.val_politico||0) + '  Religioso=' + (cis.val_religioso||0),
    'TIPOS: Sensorial=' + (cis.tp_sensorial||0) + '  Intuitivo=' + (cis.tp_intuitivo||0) +
      '  Racional=' + (cis.tp_racional||0) + '  Emocional=' + (cis.tp_emocional||0) +
      '  Introvertido=' + (cis.tp_introvertido||0) + '  Extrovertido=' + (cis.tp_extrovertido||0),
    '',
    '=======================================',
    'RESULTADOS DE TODAS AS COMPETENCIAS',
    '(nivel, gap, pontos fortes, gaps, 3 descritores mais baixos, feedback individual, PDI preliminar)',
    '=======================================',
    JSON.stringify(resultadosFormatados, null, 0),
    '',
    '=======================================',
    'CATALOGO MOODLE — SECOES RECOMENDADAS POR COMPETENCIA',
    '(priorizadas por relevancia aos descritores BAIXOS do colaborador)',
    'Campos: titulo, url, descritores_abordados, nivel_ideal, relevancia_gap',
    'ESCOLHA 1-2 secoes por competencia — PRIORIZE relevancia_gap="alta"',
    '=======================================',
    JSON.stringify(inp.catalogo || {}, null, 0),
    '',
    (inp.trilha && inp.trilha.length > 0 ? [
      '=======================================',
      'TRILHA DE DESENVOLVIMENTO — PRIMEIRAS 3 SEMANAS',
      '(conteudos ja selecionados para este colaborador, priorizados por nota do descritor)',
      '=======================================',
      'Use estes conteudos como base para o campo estudo_recomendado.',
      'Eles ja foram escolhidos pela nota mais baixa dos descritores deste colaborador.',
      'Se tiverem URL Moodle, use-os como estudo_recomendado com tipo="curso_moodle".',
      'Se nao tiverem URL, use tipo="pratica" e descreva o conteudo como atividade.',
      '',
      inp.trilha.map(function(t) {
        return 'Semana ' + t.semana + ': ' + t.titulo
          + (t.url ? ' | URL: ' + t.url : '')
          + (t.descritor ? ' | Descritor: ' + t.descritor : '')
          + (t.nota ? ' | Nota: ' + t.nota : '');
      }).join('\n'),
      ''
    ].join('\n') : ''),
    (inp.valores && inp.valores.length > 0 ? [
      '=======================================',
      'AVALIACAO DE VALORES ORGANIZACIONAIS',
      '(consolidada de todos os cenarios avaliados)',
      '=======================================',
      JSON.stringify(inp.valores, null, 0),
      '',
      'INSTRUCOES: Gere a secao "alinhamento_valores" no PDI com base nestes dados.',
      'Tom: reflexao e espelho, NAO plano de acao. Tensao e humana. Violacao e alerta.',
      'Conecte ao perfil DISC quando houver tensao.'
    ].join('\n') : '')
  ].join('\n');
}


// ── CHAMADA IA ────────────────────────────────────────────────────────────────

function _pdiChamarIA(systemPrompt, userPrompt) {
  var props  = PropertiesService.getScriptProperties();
  var modelo = props.getProperty('cfg_pdi_modelo') || props.getProperty('cfg_modelo') || 'claude-sonnet-4-20250514';
  Logger.log('PDI modelo: ' + modelo);

  var tentativas = [modelo];
  tentativas.push(modelo.toLowerCase().includes('claude') ? 'gemini-2.0-flash' : 'claude-sonnet-4-20250514');

  var pdiJson = null, lastErr = '';
  for (var t = 0; t < tentativas.length; t++) {
    try {
      var mod = tentativas[t];
      var texto = mod.toLowerCase().includes('gemini')
        ? _ia4GeminiRawV2(mod, systemPrompt, userPrompt)
        : _ia4ClaudeRawV2(mod, systemPrompt, userPrompt, false);
      Logger.log('PDI resposta OK (' + mod + '): ' + (texto||'').length + ' chars');

      try { pdiJson = JSON.parse(_ia4ExtrairJSON(texto)); } catch(ep) { pdiJson = null; }
      if (pdiJson && pdiJson.competencias_prioritarias) break;

      // JSON invalido — logar inicio e tentar proximo modelo
      lastErr = 'JSON sem competencias_prioritarias';
      Logger.log('PDI JSON invalido (' + mod + '), tentando proximo. Inicio: ' + (texto||'').substring(0, 600));
      pdiJson = null;
    } catch(e) {
      lastErr = e.message;
      Logger.log('PDI tentativa ' + (t+1) + ' falhou (' + tentativas[t] + '): ' + e.message);
    }
  }

  if (!pdiJson || !pdiJson.competencias_prioritarias) {
    throw new Error('PDI: JSON invalido apos ' + tentativas.length + ' tentativas. Ultimo erro: ' + lastErr);
  }
  return pdiJson;
}


// ── PERSISTÊNCIA — Drive PDF + controle na aba PDIs ─────────────────────────

function _pdiSalvar(ss, email, json, nome, cargo, qtdComps, brand) {
  var hoje    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  var nomeArq = 'PDI_Descritor - ' + (nome || email);
  var fileUrl = '';

  // 1. Criar Doc, preencher e converter para PDF
  Logger.log('_pdiSalvar: iniciando Drive step para ' + email);
  try {
    var folder = DriveApp.getFolderById(PDI_ID_PASTA);
    Logger.log('_pdiSalvar: folder ok — ' + folder.getName());

    // Excluir versão anterior (mesmo nome.pdf)
    var existentes = folder.getFilesByName(nomeArq + '.pdf');
    while (existentes.hasNext()) { existentes.next().setTrashed(true); }

    var doc = DocumentApp.create(nomeArq);
    Logger.log('_pdiSalvar: doc criado — ' + doc.getId());
    try {
      // Roteamento por branding do cliente (passado como parâmetro)
      if (brand === 'foresea') {
        _pdiGerarDocForesea(doc, json, nome, cargo);
      } else {
        _pdiGerarDoc(doc, json, nome, cargo);
      }
    } catch(eDoc) {
      Logger.log('_pdiGerarDoc erro: ' + eDoc.message + ' | stack: ' + (eDoc.stack || ''));
      try { doc.saveAndClose(); } catch(_) {}
      try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch(_) {}
      throw eDoc;
    }
    doc.saveAndClose();

    var docFile = DriveApp.getFileById(doc.getId());
    var pdfBlob = docFile.getAs(MimeType.PDF);
    var pdfFile = folder.createFile(pdfBlob).setName(nomeArq + '.pdf');
    docFile.setTrashed(true);

    fileUrl = pdfFile.getUrl();
    Logger.log('PDI PDF salvo: ' + pdfFile.getName() + ' | url: ' + fileUrl);
  } catch(eDrive) {
    Logger.log('_pdiSalvar Drive ERRO: ' + eDrive.message + ' | stack: ' + (eDrive.stack || ''));
    try { SpreadsheetApp.getActive().toast('Erro ao salvar PDF: ' + eDrive.message, '⚠️ PDI_descritores', 30); } catch(_) {}
  }

  // 2. Registrar na aba PDIs para controle
  var WS_NAME = 'PDI_Descritores';
  var ws = ss.getSheetByName(WS_NAME);
  if (!ws) {
    ws = ss.insertSheet(WS_NAME);
    var hdr = ws.getRange(1, 1, 1, 7);
    hdr.setValues([['Email', 'Nome', 'Cargo', 'Data Geracao', 'Status', 'Drive URL', 'Qtd Competencias']]);
    hdr.setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    ws.setColumnWidth(6, 400);
  } else {
    // Garantir que coluna 7 existe (upgrade de abas existentes)
    var hdrExist = ws.getRange(1, 1, 1, Math.max(ws.getLastColumn(), 7)).getValues()[0];
    if (!String(hdrExist[6]||'').includes('Compet')) {
      ws.getRange(1, 7).setValue('Qtd Competencias').setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    }
  }

  var dados     = ws.getLastRow() > 1 ? ws.getRange(2, 1, ws.getLastRow() - 1, 1).getValues() : [];
  var emailNorm = _norm(String(email||'')).toLowerCase().trim();
  var rowIdx    = -1;
  for (var r = 0; r < dados.length; r++) {
    if (_norm(String(dados[r][0]||'')).toLowerCase().trim() === emailNorm) { rowIdx = r + 2; break; }
  }
  var rowData = [email, nome||'', cargo||'', hoje, 'Gerado', fileUrl, qtdComps || 1];
  if (rowIdx >= 0) { ws.getRange(rowIdx, 1, 1, 7).setValues([rowData]); }
  else             { ws.appendRow(rowData); }

  SpreadsheetApp.flush();
}

// ── RENDERIZAÇÃO DO DOCUMENTO ─────────────────────────────────────────────────
// Layout idêntico ao PDI original (gerarPDIs / Código.js)

function _pdiGerarDoc(doc, json, nomeColab, cargoColab) {
  var body  = doc.getBody();
  var colab = json.colaborador || {};
  var comps = json.competencias_prioritarias || [];

  var C_TITULO    = '#0F2B54';
  var C_PERFIL_BG = '#EEF3FB';
  var C_FUNDO_POS = '#D9EAD3';
  var C_FUNDO_NEG = '#FCE5CD';
  var C_FLAG_RED  = '#CC0000';

  var nomeDoc  = _ia4Safe(colab.nome  || nomeColab  || '');
  var cargoDoc = _ia4Safe(colab.cargo || cargoColab || '') + (colab.empresa ? '  |  ' + _ia4Safe(colab.empresa) : '');

  var PDI_LOGO_ID = '1vux2_Vej_QUC6rbz0NzwXxnC_H9k65XW';

  // Margens iguais ao template original
  body.setMarginTop(56).setMarginBottom(56).setMarginLeft(56).setMarginRight(56);

  // ── HEADER com logo — layout igual ao template original ─────────────────
  // Tabela invisível: [Título | Logo]
  var tHdr = body.appendTable();
  tHdr.setBorderWidth(0);
  var rHdr = tHdr.appendTableRow();

  // Célula esquerda: título + cargo
  var cTxt = rHdr.appendTableCell();
  _ia4LimparCelula(cTxt);
  var pTitulo = cTxt.appendParagraph('PLANO DE DESENVOLVIMENTO INDIVIDUAL');
  pTitulo.editAsText().setForegroundColor(C_TITULO).setBold(true).setFontSize(18).setFontFamily('Arial');
  pTitulo.setSpacingAfter(12);

  var cargoLine = cargoDoc + ': ' + nomeDoc;
  var pCargo = cTxt.appendParagraph(cargoLine);
  var tCargo = pCargo.editAsText();
  tCargo.setFontSize(11).setFontFamily('Arial').setForegroundColor(C_TITULO);
  tCargo.setBold(0, cargoDoc.length, true);
  if (cargoLine.length > cargoDoc.length + 1)
    tCargo.setBold(cargoDoc.length + 1, cargoLine.length - 1, false);

  // Célula direita: logo Vertho
  var cLogo = rHdr.appendTableCell();
  _ia4LimparCelula(cLogo);
  try {
    var logoBlob = DriveApp.getFileById(PDI_LOGO_ID).getBlob();
    var img = cLogo.appendParagraph('').appendInlineImage(logoBlob);
    img.setWidth(80).setHeight(80);
    cLogo.getChild(cLogo.getNumChildren() - 1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  } catch(eLogo) {
    Logger.log('Logo não carregado: ' + eLogo.message);
  }
  cLogo.setWidth(100);

  body.appendParagraph(' ');

  var idx = body.getNumChildren();

  // ── Perfil Comportamental ─────────────────────────────────────────────────
  var perf = json.perfil_comportamental || {};
  if (perf.resumo || perf.pontos_fortes || perf.areas_desenvolvimento || perf.tipo_perfil || perf.como_se_manifesta) {
    var pPerfilTit = body.insertParagraph(idx++, '🧠 Perfil Comportamental');
    pPerfilTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    var tP = body.insertTable(idx++);
    tP.setBorderWidth(0);
    var cP = tP.appendTableRow().appendTableCell();
    cP.setBackgroundColor(C_PERFIL_BG);
    _ia4LimparCelula(cP);
    if (perf.tipo_perfil)             _ia4ParaMisto(cP, 'Tipo de Perfil:', perf.tipo_perfil);
    if (perf.como_se_manifesta)       _ia4ParaMisto(cP, 'Como esse perfil se manifesta:', perf.como_se_manifesta);
    if (perf.alavanca_crescimento)    _ia4ParaMisto(cP, 'Alavanca de Crescimento:', perf.alavanca_crescimento);
    if (perf.resumo)                  _ia4ParaMisto(cP, 'Resumo:', perf.resumo);
    if (perf.pontos_fortes)           _ia4ParaMisto(cP, 'Pontos Fortes:', perf.pontos_fortes);
    if (perf.areas_desenvolvimento)   _ia4ParaMisto(cP, 'Áreas de Desenvolvimento:', perf.areas_desenvolvimento);
    body.insertParagraph(idx++, ' ');
  }

  // ── Resumo de Desempenho (tabela com estrelas) ────────────────────────────
  var resumoArr = json.resumo_desempenho;
  if (resumoArr && (Array.isArray(resumoArr) ? resumoArr.length > 0 : resumoArr.narrativa)) {
    var pResTit = body.insertParagraph(idx++, 'Resumo de Desempenho');
    pResTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, ' ');

    // Se array (formato original) → tabela comp + estrelas
    if (Array.isArray(resumoArr)) {
      var tRes = body.insertTable(idx++);
      tRes.setBorderWidth(0);
      resumoArr.forEach(function(item) {
        var rRes  = tRes.appendTableRow();
        var flag  = item.flag === '🚩' ? '🚩 ' : '';
        var cNome = rRes.appendTableCell(flag + _ia4Safe(item.competencia || ''));
        var nivel = parseInt(item.nivel) || 0;
        if (nivel < 1 || nivel > 4) nivel = Math.min(4, Math.max(1, Math.round(parseFloat(item.nivel) || 1)));
        rRes.appendTableCell(_ia4Estrelas(nivel));
        cNome.editAsText().setBold(false).setForegroundColor(item.flag === '🚩' ? C_FLAG_RED : C_TITULO);
      });
    } else {
      // Formato objeto com narrativa
      if (resumoArr.media_geral !== undefined) {
        body.insertParagraph(idx++, 'Média Geral: ' + _ia4Safe(String(resumoArr.media_geral)))
          .editAsText().setBold(true).setForegroundColor(C_TITULO);
      }
      if (resumoArr.narrativa) {
        body.insertParagraph(idx++, _ia4Safe(resumoArr.narrativa)).editAsText().setBold(false);
      }
    }
    body.insertParagraph(idx++, ' ');
  }

  // ── Competências detalhadas ───────────────────────────────────────────────
  comps.forEach(function(cp, iComp) {
    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, ' ');

    // Título da competência
    var flag = cp.flag === '🚩' ? '🚩 ' : '';
    var corComp = cp.flag === '🚩' ? C_FLAG_RED : C_TITULO;
    var pCTit = body.insertParagraph(idx++, flag + _ia4Safe(cp.nome || cp.competencia || 'Competência ' + (iComp + 1)));
    pCTit.setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setForegroundColor(corComp).editAsText().setBold(true);
    body.insertParagraph(idx++, ' ');

    // Descrição da competência (itálico, cinza — igual ao original)
    var descComp = cp.descricao_competencia || cp.descricao || '';
    if (descComp) {
      var pDesc = body.insertParagraph(idx++, _ia4Safe(descComp));
      pDesc.editAsText().setItalic(true).setBold(false).setForegroundColor('#666666');
      pDesc.setSpacingAfter(8);
      body.insertParagraph(idx++, ' ');
    }

    // Descritores abaixo de 3,00
    var descBaixos = (cp.descritores_baixos || []).filter(function(d) {
      return (d.nivel || 0) < 3 && (d.nome || '').trim();
    }).slice(0, 3);
    if (descBaixos.length > 0) {
      var tDesc = body.insertTable(idx++);
      tDesc.setBorderWidth(0);
      var cDesc = tDesc.appendTableRow().appendTableCell();
      cDesc.setBackgroundColor('#FFF3E0');
      _ia4LimparCelula(cDesc);
      var pDescTit = cDesc.appendParagraph('🔎 Descritores em Desenvolvimento');
      pDescTit.editAsText().setBold(true).setItalic(false).setForegroundColor('#BF360C').setFontSize(10);
      pDescTit.setSpacingAfter(4);
      descBaixos.forEach(function(d) {
        var pD = cDesc.appendParagraph('• ' + _ia4Safe(d.nome));
        pD.editAsText().setBold(false).setItalic(false).setForegroundColor(C_TITULO).setFontSize(10);
        pD.setSpacingAfter(3);
      });
      cDesc.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);
      body.insertParagraph(idx++, ' ');
    }

    // Tabela FEZ BEM / MELHORAR (split por vírgula, ícone ▸ por frase)
    if (cp.fez_bem || cp.melhorar) {
      var _splitFrases = function(txt) {
        // Split por: \n, ou ".,", ou ". ," — padrões que a IA usa para separar itens
        // NÃO split por vírgula simples (faz parte de frases normais)
        return _ia4Safe(txt || '').split(/\n+|\.,\s*/).map(function(f) {
          return f.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '').trim();
        }).filter(function(f) { return f.length > 5; });
      };
      var tAn = body.insertTable(idx++);
      tAn.setBorderWidth(1).setBorderColor('#CCCCCC');
      var rAn = tAn.appendTableRow();

      var cF = rAn.appendTableCell();
      cF.setBackgroundColor(C_FUNDO_POS);
      _ia4LimparCelula(cF);
      cF.appendParagraph('✅ FEZ BEM:').editAsText().setBold(true).setItalic(false);
      _splitFrases(cp.fez_bem).forEach(function(frase) {
        var p = cF.appendParagraph('▸ ' + frase);
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(6);
      });
      cF.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);

      var cA = rAn.appendTableCell();
      cA.setBackgroundColor(C_FUNDO_NEG);
      _ia4LimparCelula(cA);
      cA.appendParagraph('⚠️ MELHORAR:').editAsText().setBold(true).setItalic(false);
      _splitFrases(cp.melhorar).forEach(function(frase) {
        var p = cA.appendParagraph('▸ ' + frase);
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(6);
      });
      cA.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
      body.insertParagraph(idx++, ' ');
    }

    // Feedback
    if (cp.feedback) {
      body.insertParagraph(idx++, 'Feedback:').editAsText().setBold(true).setItalic(false);
      _ia4Safe(cp.feedback).split(/\n\n|\n/).filter(function(p) { return p.trim(); }).forEach(function(paraTexto) {
        var pFB = body.insertParagraph(idx++, paraTexto.trim());
        pFB.editAsText().setBold(false).setItalic(false);
        pFB.setSpacingAfter(6);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Plano 30 dias
    var p30     = cp.plano_30_dias || {};
    var semKeys = ['semana_1', 'semana_2', 'semana_3', 'semana_4', 'semanas_1_2', 'semana_1_2'];
    if (semKeys.some(function(s) { return p30[s]; })) {
      body.insertParagraph(idx++, '📅 Plano de Desenvolvimento — 30 Dias')
        .editAsText().setBold(true).setItalic(false);
      var tPl = body.insertTable(idx++);
      tPl.setBorderWidth(0);
      var cPl = tPl.appendTableRow().appendTableCell();
      cPl.setBackgroundColor('#E8F0FE');
      _ia4LimparCelula(cPl);
      // Semanas 1-2 (pode vir como semanas_1_2, semana_1_2, ou semana_1 + semana_2)
      var s12 = p30.semanas_1_2 || p30.semana_1_2;
      if (s12) { _ia4Semana(cPl, '📅 Semanas 1-2:', s12); }
      else {
        if (p30.semana_1) _ia4Semana(cPl, '📅 Semana 1:', p30.semana_1);
        if (p30.semana_2) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 2:', p30.semana_2); }
      }
      if (p30.semana_3) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 3:', p30.semana_3); }
      if (p30.semana_4) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 4:', p30.semana_4); }
      body.insertParagraph(idx++, ' ');
    }

    // Dicas
    var dicas = cp.dicas_desenvolvimento || [];
    if (dicas.length > 0) {
      body.insertParagraph(idx++, '🚀 Dicas de Desenvolvimento:')
        .editAsText().setBold(true).setItalic(false);
      dicas.forEach(function(d) {
        var p = body.insertParagraph(idx++, '• ' + _ia4Safe(d));
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(4);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Estudo recomendado
    var estudo = cp.estudo_recomendado || [];
    if (estudo.length > 0) {
      body.insertParagraph(idx++, '📚 Estudo Recomendado:').editAsText().setBold(true);
      estudo.forEach(function(e) {
        var txt = (e.titulo || _ia4Safe(String(e))) + (e.url ? '  —  ' + e.url : '');
        var pE  = body.insertParagraph(idx++, txt);
        if (e.url) pE.editAsText().setUnderline(true).setForegroundColor('#1155CC');
        pE.editAsText().setBold(false);
        pE.setSpacingAfter(4);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Checklist tático
    var chk = cp.checklist_tatico || [];
    if (chk.length > 0) {
      var tChk  = body.insertTable(idx++);
      tChk.setBorderWidth(1).setBorderColor(C_TITULO);
      var rChkH = tChk.appendTableRow();
      var cChkH = rChkH.appendTableCell('⚡ CHECKLIST TÁTICO');
      cChkH.setBackgroundColor(C_TITULO);
      cChkH.editAsText().setForegroundColor('#FFFFFF').setBold(true).setItalic(false).setFontSize(11);
      cChkH.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
      chk.forEach(function(item, iChk) {
        var limpo = _ia4Safe(item)
          .replace(/^[☐☑✅□✓\-•\s]+/, '')
          .replace(/\s*[\(\/]?\s*(sim|não|nao|yes|no)\s*[\)\/]?\s*$/i, '')
          .replace(/\.$/, '').trim();
        if (!limpo) return;
        var rChkI = tChk.appendTableRow();
        var cChkI = rChkI.appendTableCell('☐  ' + limpo);
        cChkI.setBackgroundColor(iChk % 2 === 0 ? '#FFFFFF' : '#F7FBFF');
        cChkI.editAsText().setBold(false).setItalic(false).setUnderline(false)
          .setForegroundColor(C_TITULO).setFontSize(10);
        cChkI.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(14).setPaddingRight(10);
      });
      body.insertParagraph(idx++, ' ');
    }
  });

  // ── Mensagem Final ────────────────────────────────────────────────────────
  if (json.mensagem_final) {
    body.insertHorizontalRule(idx++);
    var pMFTit = body.insertParagraph(idx++, 'Mensagem Final');
    pMFTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    var pMF = body.insertParagraph(idx++, _ia4Safe(json.mensagem_final));
    pMF.editAsText().setBold(false);
    body.insertParagraph(idx++, ' ');
  }
}

// ── RENDERIZAÇÃO DO DOCUMENTO — FORESEA ─────────────────────────────────────
// Versão com branding Foresea Socioambiental (cores, logo, subtítulo)
// Layout e lógica idênticos ao _pdiGerarDoc, apenas branding customizado.

function _pdiGerarDocForesea(doc, json, nomeColab, cargoColab) {
  var body  = doc.getBody();
  var colab = json.colaborador || {};
  var comps = json.competencias_prioritarias || [];

  // Paleta Foresea
  var C_TITULO    = '#1A1D56';   // Azul Profundo Foresea
  var C_PERFIL_BG = '#E8F5F0';   // Verde claro (light green tint)
  var C_FUNDO_POS = '#E0F5EC';   // Verde Mar light
  var C_FUNDO_NEG = '#FFF3E0';   // Laranja claro (mantido)
  var C_FLAG_RED  = '#CC0000';   // Vermelho alerta (mantido)
  var C_VERDE_MAR = '#1DD693';   // Verde Mar — cor de destaque Foresea

  var nomeDoc  = _ia4Safe(colab.nome  || nomeColab  || '');
  var cargoDoc = _ia4Safe(colab.cargo || cargoColab || '') + (colab.empresa ? '  |  ' + _ia4Safe(colab.empresa) : '');

  var FORESEA_LOGO_ID = '1APS6fAOTE7xlYSdQ2GUUCVEMjzVIY7Im';
  var FORESEA_LOGO_ID_ALT = '1b6WbZP6K0Zq5lr-7hLfLzPGxWYdJWDdR';
  var FORESEA_FONT = 'Syne';

  // Margens iguais ao template original
  body.setMarginTop(56).setMarginBottom(56).setMarginLeft(56).setMarginRight(56);
  // Cor padrão de texto: Azul Profundo em todo o doc
  body.editAsText().setForegroundColor(C_TITULO).setFontFamily(FORESEA_FONT);

  // ── HEADER com logo — layout igual ao template original ─────────────────
  // Tabela invisível: [Título | Logo]
  var tHdr = body.appendTable();
  tHdr.setBorderWidth(0);
  var rHdr = tHdr.appendTableRow();

  // Célula esquerda: título + subtítulo Foresea + cargo
  var cTxt = rHdr.appendTableCell();
  _ia4LimparCelula(cTxt);
  var pTitulo = cTxt.appendParagraph('PLANO DE DESENVOLVIMENTO INDIVIDUAL');
  pTitulo.editAsText().setForegroundColor(C_TITULO).setBold(true).setFontSize(18).setFontFamily(FORESEA_FONT);
  pTitulo.setSpacingAfter(12);

  var cargoLine = cargoDoc + ': ' + nomeDoc;
  var pCargo = cTxt.appendParagraph(cargoLine);
  var tCargo = pCargo.editAsText();
  tCargo.setFontSize(11).setFontFamily(FORESEA_FONT).setForegroundColor(C_TITULO);
  tCargo.setBold(0, cargoDoc.length, true);
  if (cargoLine.length > cargoDoc.length + 1)
    tCargo.setBold(cargoDoc.length + 1, cargoLine.length - 1, false);

  // Célula direita: logo Foresea
  var cLogo = rHdr.appendTableCell();
  _ia4LimparCelula(cLogo);
  var _logoLoaded = false;
  var _logoIds = [FORESEA_LOGO_ID, FORESEA_LOGO_ID_ALT];
  for (var li = 0; li < _logoIds.length && !_logoLoaded; li++) {
    try {
      var logoBlob = DriveApp.getFileById(_logoIds[li]).getBlob();
      var img = cLogo.appendParagraph('').appendInlineImage(logoBlob);
      img.setWidth(240).setHeight(51);
      cLogo.getChild(cLogo.getNumChildren() - 1).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      _logoLoaded = true;
      Logger.log('Logo Foresea carregado do ID: ' + _logoIds[li]);
    } catch(eLogo) {
      Logger.log('Logo Foresea tentativa ' + (li + 1) + ' falhou (' + _logoIds[li] + '): ' + eLogo.message);
    }
  }
  if (!_logoLoaded) {
    var pLogoFallback = cLogo.appendParagraph('Foresea');
    pLogoFallback.editAsText().setForegroundColor(C_TITULO).setBold(true).setFontSize(16).setFontFamily(FORESEA_FONT);
    pLogoFallback.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  }
  cLogo.setWidth(180);

  body.appendParagraph(' ');

  var idx = body.getNumChildren();

  // ── Perfil Comportamental ─────────────────────────────────────────────────
  var perf = json.perfil_comportamental || {};
  if (perf.resumo || perf.pontos_fortes || perf.areas_desenvolvimento || perf.tipo_perfil || perf.como_se_manifesta) {
    var pPerfilTit = body.insertParagraph(idx++, '🧠 Perfil Comportamental');
    pPerfilTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    var tP = body.insertTable(idx++);
    tP.setBorderWidth(0);
    var cP = tP.appendTableRow().appendTableCell();
    cP.setBackgroundColor(C_PERFIL_BG);
    _ia4LimparCelula(cP);
    if (perf.tipo_perfil)             _ia4ParaMisto(cP, 'Tipo de Perfil:', perf.tipo_perfil);
    if (perf.como_se_manifesta)       _ia4ParaMisto(cP, 'Como esse perfil se manifesta:', perf.como_se_manifesta);
    if (perf.alavanca_crescimento)    _ia4ParaMisto(cP, 'Alavanca de Crescimento:', perf.alavanca_crescimento);
    if (perf.resumo)                  _ia4ParaMisto(cP, 'Resumo:', perf.resumo);
    if (perf.pontos_fortes)           _ia4ParaMisto(cP, 'Pontos Fortes:', perf.pontos_fortes);
    if (perf.areas_desenvolvimento)   _ia4ParaMisto(cP, 'Áreas de Desenvolvimento:', perf.areas_desenvolvimento);
    body.insertParagraph(idx++, ' ');
  }

  // ── Resumo de Desempenho (tabela com estrelas) ────────────────────────────
  var resumoArr = json.resumo_desempenho;
  if (resumoArr && (Array.isArray(resumoArr) ? resumoArr.length > 0 : resumoArr.narrativa)) {
    var pResTit = body.insertParagraph(idx++, 'Resumo de Desempenho');
    pResTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    body.insertParagraph(idx++, ' ');

    // Se array (formato original) → tabela comp + estrelas
    if (Array.isArray(resumoArr)) {
      var tRes = body.insertTable(idx++);
      tRes.setBorderWidth(0);
      resumoArr.forEach(function(item) {
        var rRes  = tRes.appendTableRow();
        var flag  = item.flag === '🚩' ? '🚩 ' : '';
        var cNome = rRes.appendTableCell(flag + _ia4Safe(item.competencia || ''));
        var nivel = parseInt(item.nivel) || 0;
        if (nivel < 1 || nivel > 4) nivel = Math.min(4, Math.max(1, Math.round(parseFloat(item.nivel) || 1)));
        rRes.appendTableCell(_ia4Estrelas(nivel));
        cNome.editAsText().setBold(false).setForegroundColor(item.flag === '🚩' ? C_FLAG_RED : C_TITULO);
      });
    } else {
      // Formato objeto com narrativa
      if (resumoArr.media_geral !== undefined) {
        body.insertParagraph(idx++, 'Média Geral: ' + _ia4Safe(String(resumoArr.media_geral)))
          .editAsText().setBold(true).setForegroundColor(C_TITULO);
      }
      if (resumoArr.narrativa) {
        body.insertParagraph(idx++, _ia4Safe(resumoArr.narrativa)).editAsText().setBold(false);
      }
    }
    body.insertParagraph(idx++, ' ');
  }

  // ── Competências detalhadas ───────────────────────────────────────────────
  comps.forEach(function(cp, iComp) {
    body.insertHorizontalRule(idx++);
    body.insertParagraph(idx++, ' ');

    // Título da competência
    var flag = cp.flag === '🚩' ? '🚩 ' : '';
    var corComp = cp.flag === '🚩' ? C_FLAG_RED : C_TITULO;
    var pCTit = body.insertParagraph(idx++, flag + _ia4Safe(cp.nome || cp.competencia || 'Competência ' + (iComp + 1)));
    pCTit.setHeading(DocumentApp.ParagraphHeading.HEADING1)
      .setForegroundColor(corComp).editAsText().setBold(true);
    body.insertParagraph(idx++, ' ');

    // Descrição da competência (itálico, cinza — igual ao original)
    var descComp = cp.descricao_competencia || cp.descricao || '';
    if (descComp) {
      var pDesc = body.insertParagraph(idx++, _ia4Safe(descComp));
      pDesc.editAsText().setItalic(true).setBold(false).setForegroundColor('#666666');
      pDesc.setSpacingAfter(8);
      body.insertParagraph(idx++, ' ');
    }

    // Descritores abaixo de 3,00
    var descBaixos = (cp.descritores_baixos || []).filter(function(d) {
      return (d.nivel || 0) < 3 && (d.nome || '').trim();
    }).slice(0, 3);
    if (descBaixos.length > 0) {
      var tDesc = body.insertTable(idx++);
      tDesc.setBorderWidth(0);
      var cDesc = tDesc.appendTableRow().appendTableCell();
      cDesc.setBackgroundColor('#FFF3E0');
      _ia4LimparCelula(cDesc);
      var pDescTit = cDesc.appendParagraph('🔎 Descritores em Desenvolvimento');
      pDescTit.editAsText().setBold(true).setItalic(false).setForegroundColor('#BF360C').setFontSize(10);
      pDescTit.setSpacingAfter(4);
      descBaixos.forEach(function(d) {
        var pD = cDesc.appendParagraph('• ' + _ia4Safe(d.nome));
        pD.editAsText().setBold(false).setItalic(false).setForegroundColor(C_TITULO).setFontSize(10);
        pD.setSpacingAfter(3);
      });
      cDesc.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(12).setPaddingRight(12);
      body.insertParagraph(idx++, ' ');
    }

    // Tabela FEZ BEM / MELHORAR (split por vírgula, ícone ▸ por frase)
    if (cp.fez_bem || cp.melhorar) {
      var _splitFrases = function(txt) {
        // Split por: \n, ou ".,", ou ". ," — padrões que a IA usa para separar itens
        // NÃO split por vírgula simples (faz parte de frases normais)
        return _ia4Safe(txt || '').split(/\n+|\.,\s*/).map(function(f) {
          return f.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '').trim();
        }).filter(function(f) { return f.length > 5; });
      };
      var tAn = body.insertTable(idx++);
      tAn.setBorderWidth(1).setBorderColor('#CCCCCC');
      var rAn = tAn.appendTableRow();

      var cF = rAn.appendTableCell();
      cF.setBackgroundColor(C_FUNDO_POS);
      _ia4LimparCelula(cF);
      cF.appendParagraph('✅ FEZ BEM:').editAsText().setBold(true).setItalic(false);
      _splitFrases(cp.fez_bem).forEach(function(frase) {
        var p = cF.appendParagraph('▸ ' + frase);
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(6);
      });
      cF.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);

      var cA = rAn.appendTableCell();
      cA.setBackgroundColor(C_FUNDO_NEG);
      _ia4LimparCelula(cA);
      cA.appendParagraph('⚠️ MELHORAR:').editAsText().setBold(true).setItalic(false);
      _splitFrases(cp.melhorar).forEach(function(frase) {
        var p = cA.appendParagraph('▸ ' + frase);
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(6);
      });
      cA.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(10).setPaddingRight(10);
      body.insertParagraph(idx++, ' ');
    }

    // Feedback
    if (cp.feedback) {
      body.insertParagraph(idx++, 'Feedback:').editAsText().setBold(true).setItalic(false);
      _ia4Safe(cp.feedback).split(/\n\n|\n/).filter(function(p) { return p.trim(); }).forEach(function(paraTexto) {
        var pFB = body.insertParagraph(idx++, paraTexto.trim());
        pFB.editAsText().setBold(false).setItalic(false);
        pFB.setSpacingAfter(6);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Plano 30 dias
    var p30     = cp.plano_30_dias || {};
    var semKeys = ['semana_1', 'semana_2', 'semana_3', 'semana_4', 'semanas_1_2', 'semana_1_2'];
    if (semKeys.some(function(s) { return p30[s]; })) {
      body.insertParagraph(idx++, '📅 Plano de Desenvolvimento — 30 Dias')
        .editAsText().setBold(true).setItalic(false);
      var tPl = body.insertTable(idx++);
      tPl.setBorderWidth(0);
      var cPl = tPl.appendTableRow().appendTableCell();
      cPl.setBackgroundColor('#E8F5F0');
      _ia4LimparCelula(cPl);
      // Semanas 1-2 (pode vir como semanas_1_2, semana_1_2, ou semana_1 + semana_2)
      var s12 = p30.semanas_1_2 || p30.semana_1_2;
      if (s12) { _ia4Semana(cPl, '📅 Semanas 1-2:', s12); }
      else {
        if (p30.semana_1) _ia4Semana(cPl, '📅 Semana 1:', p30.semana_1);
        if (p30.semana_2) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 2:', p30.semana_2); }
      }
      if (p30.semana_3) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 3:', p30.semana_3); }
      if (p30.semana_4) { cPl.appendParagraph(' '); _ia4Semana(cPl, '📅 Semana 4:', p30.semana_4); }
      body.insertParagraph(idx++, ' ');
    }

    // Dicas
    var dicas = cp.dicas_desenvolvimento || [];
    if (dicas.length > 0) {
      body.insertParagraph(idx++, '🚀 Dicas de Desenvolvimento:')
        .editAsText().setBold(true).setItalic(false);
      dicas.forEach(function(d) {
        var p = body.insertParagraph(idx++, '• ' + _ia4Safe(d));
        p.editAsText().setBold(false).setItalic(false);
        p.setSpacingAfter(4);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Estudo recomendado
    var estudo = cp.estudo_recomendado || [];
    if (estudo.length > 0) {
      body.insertParagraph(idx++, '📚 Estudo Recomendado:').editAsText().setBold(true);
      estudo.forEach(function(e) {
        var txt = (e.titulo || _ia4Safe(String(e))) + (e.url ? '  —  ' + e.url : '');
        var pE  = body.insertParagraph(idx++, txt);
        if (e.url) pE.editAsText().setUnderline(true).setForegroundColor(C_VERDE_MAR);
        pE.editAsText().setBold(false);
        pE.setSpacingAfter(4);
      });
      body.insertParagraph(idx++, ' ');
    }

    // Checklist tático
    var chk = cp.checklist_tatico || [];
    if (chk.length > 0) {
      var tChk  = body.insertTable(idx++);
      tChk.setBorderWidth(1).setBorderColor(C_TITULO);
      var rChkH = tChk.appendTableRow();
      var cChkH = rChkH.appendTableCell('⚡ CHECKLIST TÁTICO');
      cChkH.setBackgroundColor('#1A1D56');
      cChkH.editAsText().setForegroundColor('#FFFFFF').setBold(true).setItalic(false).setFontSize(11);
      cChkH.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
      chk.forEach(function(item, iChk) {
        var limpo = _ia4Safe(item)
          .replace(/^[☐☑✅□✓\-•\s]+/, '')
          .replace(/\s*[\(\/]?\s*(sim|não|nao|yes|no)\s*[\)\/]?\s*$/i, '')
          .replace(/\.$/, '').trim();
        if (!limpo) return;
        var rChkI = tChk.appendTableRow();
        var cChkI = rChkI.appendTableCell('☐  ' + limpo);
        cChkI.setBackgroundColor(iChk % 2 === 0 ? '#FFFFFF' : '#F0FAF5');
        cChkI.editAsText().setBold(false).setItalic(false).setUnderline(false)
          .setForegroundColor(C_TITULO).setFontSize(10);
        cChkI.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(14).setPaddingRight(10);
      });
      body.insertParagraph(idx++, ' ');
    }
  });

  // ── Mensagem Final ────────────────────────────────────────────────────────
  if (json.mensagem_final) {
    body.insertHorizontalRule(idx++);
    var pMFTit = body.insertParagraph(idx++, 'Mensagem Final');
    pMFTit.setHeading(DocumentApp.ParagraphHeading.HEADING2)
      .setForegroundColor(C_TITULO).editAsText().setBold(true);
    var pMF = body.insertParagraph(idx++, _ia4Safe(json.mensagem_final));
    pMF.editAsText().setBold(false);
    body.insertParagraph(idx++, ' ');
  }

  // ── Forçar fonte Syne + line spacing em TODO o documento ─────────────────
  var _applyFont = function(para) {
    para.editAsText().setFontFamily(FORESEA_FONT);
    para.setLineSpacing(1.5);
    // Garantir padding extra nas descendentes via spacingAfter mínimo
    if ((para.getSpacingAfter() || 0) < 2) para.setSpacingAfter(2);
  };
  for (var ei = 0; ei < body.getNumChildren(); ei++) {
    var child = body.getChild(ei);
    var tipo = child.getType();
    if (tipo === DocumentApp.ElementType.PARAGRAPH) {
      _applyFont(child.asParagraph());
    } else if (tipo === DocumentApp.ElementType.TABLE) {
      var tbl = child.asTable();
      for (var tri = 0; tri < tbl.getNumRows(); tri++) {
        var trow = tbl.getRow(tri);
        for (var tci = 0; tci < trow.getNumCells(); tci++) {
          var cell = trow.getCell(tci);
          for (var pi = 0; pi < cell.getNumChildren(); pi++) {
            var cp = cell.getChild(pi);
            if (cp.getType() === DocumentApp.ElementType.PARAGRAPH) {
              _applyFont(cp.asParagraph());
            }
          }
        }
      }
    }
  }
}

// ── ROTEAMENTO POR CLIENTE (branding) ───────────────────────────────────────
// Lê a ScriptProperty 'cfg_cliente' e retorna o identificador do cliente.
// Valores possíveis: 'foresea', 'vertho' (padrão).

function _pdiGetClientBrand() {
  try {
    var marca = PropertiesService.getScriptProperties().getProperty('cfg_cliente');
    if (marca) return marca.toLowerCase().trim();
  } catch(e) {
    Logger.log('_pdiGetClientBrand: erro ao ler ScriptProperty — ' + e.message);
  }
  return 'vertho';
}
