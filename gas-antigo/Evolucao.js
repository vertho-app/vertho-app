// =====================================================================
// VERTHO — Evolucao.gs  (Fase 5 — Reavaliação e Fusão de Evolução)
//
// Compara avaliação inicial (Cenário A / Forms) com reavaliação
// (Cenário B / Conversa) e gera relatório de evolução por descritor.
//
// Cruza 3 fontes: delta numérico, evidência demonstrada (cenário B),
// e evidência relatada (conversa semana 15).
//
// Dependências:
//   Código.js    → _lerBaseCompetenciasV2, _carregarCFG, _CFG, _norm,
//                   _extrairJSON, _getApiKey
//   Fase2_Cenarios.js → _ia4ClaudeRawV2, _ia4OpenAIRawV2
//   CISReferencia.js  → getCISParaPDI, getCISRiscos, formatarCISParaPrompt
// =====================================================================


// ─── Constantes ─────────────────────────────────────────────────────────
var _EVO_ABA_EVOLUCAO    = 'Evolucao';
var _EVO_ABA_DESCRITORES = 'Evolucao_Descritores';

// Colunas da aba Colaboradores (header na linha 4, dados a partir da 5)
var _EVO_COLAB_HEADER_ROW = 3; // index 0-based
var _EVO_COLAB_COL_NOME   = 1; // B
var _EVO_COLAB_COL_CARGO  = 3; // D
var _EVO_COLAB_COL_AREA   = 4; // E (escola/area)
var _EVO_COLAB_COL_EMAIL  = 6; // G


// ═══════════════════════════════════════════════════════════════════════
// 1. GARANTIR ABAS DE EVOLUÇÃO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cria as abas Evolucao e Evolucao_Descritores se não existirem.
 * Header: negrito, fundo navy (#0F2B54), texto branco, linha 1 congelada.
 *
 * @param {Spreadsheet} ss  Planilha ativa
 */
function _garantirAbasEvolucao(ss) {
  // ── Aba Evolucao (20 colunas) ────────────────────────────────────────
  var wsEvo = ss.getSheetByName(_EVO_ABA_EVOLUCAO);
  if (!wsEvo) {
    wsEvo = ss.insertSheet(_EVO_ABA_EVOLUCAO);
    var cabEvo = [
      'Email', 'Nome', 'Cargo', 'Escola',
      'Competencia_ID', 'Competencia_Nome',
      'Nota_A', 'Nivel_A', 'Nota_B', 'Nivel_B',
      'Delta', 'Descritores_Subiram',
      'Convergencia_Resumo', 'Consciencia_Gap',
      'Gaps_Persistentes', 'Foco_Ciclo2',
      'Feedback_Colaborador', 'Payload_Fusao',
      'Data_Geracao', 'Status'
    ];
    wsEvo.getRange(1, 1, 1, cabEvo.length).setValues([cabEvo])
      .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
    wsEvo.setFrozenRows(1);
    Logger.log('_garantirAbasEvolucao: aba ' + _EVO_ABA_EVOLUCAO + ' criada');
  }

  // ── Aba Evolucao_Descritores (13 colunas) ────────────────────────────
  var wsDesc = ss.getSheetByName(_EVO_ABA_DESCRITORES);
  if (!wsDesc) {
    wsDesc = ss.insertSheet(_EVO_ABA_DESCRITORES);
    var cabDesc = [
      'Email', 'Competencia_ID',
      'Descritor', 'Descritor_Nome',
      'Nivel_A', 'Nivel_B', 'Delta',
      'Evidencia_Cenario_B', 'Evidencia_Conversa',
      'Citacao', 'Convergencia',
      'Conexao_CIS', 'Confianca'
    ];
    wsDesc.getRange(1, 1, 1, cabDesc.length).setValues([cabDesc])
      .setBackground('#0F2B54').setFontColor('#FFFFFF').setFontWeight('bold');
    wsDesc.setFrozenRows(1);
    Logger.log('_garantirAbasEvolucao: aba ' + _EVO_ABA_DESCRITORES + ' criada');
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 2. HELPERS DE LEITURA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Carrega dados do colaborador da aba Colaboradores.
 * Header na linha 4 (index 3), dados a partir da linha 5 (index 4).
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @returns {Object|null}  { email, nome, cargo, escola, scores_disc, scores_valores, scores_tipos }
 */
function _evoCarregarColaborador(ss, email) {
  var ws = ss.getSheetByName('Colaboradores');
  if (!ws) { Logger.log('_evoCarregarColaborador: aba Colaboradores nao encontrada'); return null; }

  var dados = ws.getDataRange().getValues();
  if (dados.length <= 4) return null;

  var headers = dados[_EVO_COLAB_HEADER_ROW];
  var emailNorm = email.toLowerCase().trim();

  // Mapear colunas de CIS por header
  var _h = function(label) {
    var labelLow = label.toLowerCase();
    return headers.findIndex(function(h) {
      return h && String(h).toLowerCase().indexOf(labelLow) >= 0;
    });
  };

  var iDNat = _h('d_natural');
  var iINat = _h('i_natural');
  var iSNat = _h('s_natural');
  var iCNat = _h('c_natural');
  var iTeorico   = _h('teorico');
  var iEconomico = _h('economico');
  var iEstetico  = _h('estetico');
  var iSocial    = _h('social');
  var iPolitico  = _h('politico');
  var iReligioso = _h('religioso');
  var iPerfil    = _h('perfil');

  for (var r = _EVO_COLAB_HEADER_ROW + 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail = String(row[_EVO_COLAB_COL_EMAIL] || '').toLowerCase().trim();
    if (rowEmail !== emailNorm) continue;

    var colab = {
      email:  rowEmail,
      nome:   String(row[_EVO_COLAB_COL_NOME]  || '').trim(),
      cargo:  String(row[_EVO_COLAB_COL_CARGO] || '').trim(),
      escola: String(row[_EVO_COLAB_COL_AREA]  || '').trim(),
      perfil_disc: iPerfil >= 0 ? String(row[iPerfil] || '').trim() : '',
      scores_disc: {
        D: iDNat >= 0 ? Number(row[iDNat]) || 0 : 0,
        I: iINat >= 0 ? Number(row[iINat]) || 0 : 0,
        S: iSNat >= 0 ? Number(row[iSNat]) || 0 : 0,
        C: iCNat >= 0 ? Number(row[iCNat]) || 0 : 0
      },
      scores_valores: {
        Teorico:   iTeorico   >= 0 ? Number(row[iTeorico])   || 0 : 0,
        Economico: iEconomico >= 0 ? Number(row[iEconomico]) || 0 : 0,
        Estetico:  iEstetico  >= 0 ? Number(row[iEstetico])  || 0 : 0,
        Social:    iSocial    >= 0 ? Number(row[iSocial])    || 0 : 0,
        Politico:  iPolitico  >= 0 ? Number(row[iPolitico])  || 0 : 0,
        Religioso: iReligioso >= 0 ? Number(row[iReligioso]) || 0 : 0
      }
    };

    return colab;
  }

  Logger.log('_evoCarregarColaborador: email nao encontrado — ' + email);
  return null;
}


/**
 * Carrega resultado do Cenário A (Fase 1 — Forms + IA4) da aba Respostas.
 * Retorna nota, nível e payload completo.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {string} competenciaId
 * @returns {Object|null}  { nota, nivel, pontos_fortes, pontos_atencao, payload, respostas }
 */
function _evoCarregarCenarioA(ss, email, competenciaId) {
  var ws = ss.getSheetByName('Respostas');
  if (!ws) { Logger.log('_evoCarregarCenarioA: aba Respostas nao encontrada'); return null; }

  var dados = ws.getDataRange().getValues();
  if (dados.length < 2) return null;

  var headers = dados[0];
  var emailNorm = email.toLowerCase().trim();
  var compNorm  = competenciaId.toLowerCase().trim();

  // Mapear colunas por header
  var iEmail    = headers.findIndex(function(h) { return _norm(h) === 'ID Colaborador'; });
  var iCompId   = headers.findIndex(function(h) { return _norm(h) === 'ID Competência'; });
  var iNivel    = headers.findIndex(function(h) { return _norm(h) === 'Nível IA4'; });
  var iNota     = headers.findIndex(function(h) { return _norm(h) === 'Nota IA4'; });
  var iFortes   = headers.findIndex(function(h) { return _norm(h) === 'Pontos Fortes'; });
  var iAtencao  = headers.findIndex(function(h) { return _norm(h) === 'Pontos de Atenção'; });
  var iPayload  = headers.findIndex(function(h) { return _norm(h) === 'Payload IA4'; });
  var iFeedback = headers.findIndex(function(h) { return _norm(h) === 'Feedback IA4'; });
  var iR1       = headers.findIndex(function(h) { return _norm(h).indexOf('R1') >= 0; });
  var iR2       = headers.findIndex(function(h) { return _norm(h).indexOf('R2') >= 0; });
  var iR3       = headers.findIndex(function(h) { return _norm(h).indexOf('R3') >= 0; });
  var iR4       = headers.findIndex(function(h) { return _norm(h).indexOf('R4') >= 0; });

  if (iEmail < 0) {
    iEmail = headers.findIndex(function(h) { return _norm(h).toLowerCase().indexOf('e-mail') >= 0; });
  }

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail = String(row[iEmail] || '').toLowerCase().trim();
    var rowComp  = String(row[iCompId] || '').toLowerCase().trim();

    if (rowEmail === emailNorm && rowComp === compNorm) {
      var payloadRaw = iPayload >= 0 ? String(row[iPayload] || '') : '';
      var payloadObj = null;
      if (payloadRaw.length > 10) {
        try { payloadObj = JSON.parse(payloadRaw); } catch(e) {
          Logger.log('_evoCarregarCenarioA: erro JSON payload — ' + e.message);
        }
      }

      return {
        nota:           iNota    >= 0 ? String(row[iNota]    || '') : '',
        nivel:          iNivel   >= 0 ? String(row[iNivel]   || '') : '',
        pontos_fortes:  iFortes  >= 0 ? String(row[iFortes]  || '') : '',
        pontos_atencao: iAtencao >= 0 ? String(row[iAtencao] || '') : '',
        feedback:       iFeedback >= 0 ? String(row[iFeedback] || '') : '',
        payload:        payloadObj,
        respostas: {
          r1: iR1 >= 0 ? String(row[iR1] || '') : '',
          r2: iR2 >= 0 ? String(row[iR2] || '') : '',
          r3: iR3 >= 0 ? String(row[iR3] || '') : '',
          r4: iR4 >= 0 ? String(row[iR4] || '') : ''
        }
      };
    }
  }

  Logger.log('_evoCarregarCenarioA: resultado nao encontrado para ' + email + ' / ' + competenciaId);
  return null;
}


/**
 * Carrega resultado do Cenário B (Fase 3 — IA Conversacional) da aba Resultados_Avaliacao.
 * Cenário B é identificado pelo ciclo_id ou pela existência de sessão com cenários B.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {string} competenciaId
 * @returns {Object|null}  { nivel, confianca, evidencias, lacuna }
 */
function _evoCarregarCenarioB(ss, email, competenciaId) {
  // Primeiro, buscar na aba Resultados_Avaliacao (gravado por StateManager.saveSessionResult)
  var wsRes = ss.getSheetByName('Resultados_Avaliacao');
  if (!wsRes) {
    Logger.log('_evoCarregarCenarioB: aba Resultados_Avaliacao nao encontrada');
    return null;
  }

  var dados = wsRes.getDataRange().getValues();
  if (dados.length < 2) return null;

  var headers = dados[0];
  var iEmail   = _evoFindHeader(headers, 'colaborador_id');
  var iCompId  = _evoFindHeader(headers, 'competencia_id');
  var iNivel   = _evoFindHeader(headers, 'nivel');
  var iConf    = _evoFindHeader(headers, 'confianca');
  var iEvid    = _evoFindHeader(headers, 'evidencias');
  var iLacuna  = _evoFindHeader(headers, 'lacuna');
  var iData    = _evoFindHeader(headers, 'created_at');

  var emailNorm = email.toLowerCase().trim();
  var compNorm  = competenciaId.toLowerCase().trim();

  // Pegar o resultado MAIS RECENTE para este email + comp
  // (pode haver múltiplos se re-avaliou mais de uma vez)
  var melhor = null;
  var melhorData = '';

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail = String(row[iEmail] || '').toLowerCase().trim();
    var rowComp  = String(row[iCompId] || '').toLowerCase().trim();

    if (rowEmail === emailNorm && rowComp === compNorm) {
      var dataRow = iData >= 0 ? String(row[iData] || '') : '';
      // Pegar o mais recente — se já temos um resultado do cenário A (Respostas),
      // o cenário B é o segundo resultado cronologicamente
      if (!melhor || dataRow > melhorData) {
        melhor = {
          nivel:      iNivel  >= 0 ? String(row[iNivel]  || '') : '',
          confianca:  iConf   >= 0 ? String(row[iConf]   || '') : '',
          evidencias: iEvid   >= 0 ? String(row[iEvid]   || '') : '',
          lacuna:     iLacuna >= 0 ? String(row[iLacuna] || '') : '',
          data:       dataRow
        };
        melhorData = dataRow;
      }
    }
  }

  if (melhor) {
    // Parsear evidências JSON se possível
    if (melhor.evidencias && melhor.evidencias.length > 2) {
      try { melhor.evidencias_parsed = JSON.parse(melhor.evidencias); } catch(e) {
        melhor.evidencias_parsed = [];
      }
    } else {
      melhor.evidencias_parsed = [];
    }
  }

  // Se não encontrou em Resultados_Avaliacao, tentar buscar da Sessoes diretamente
  if (!melhor) {
    melhor = _evoCarregarCenarioBDaSessao(ss, email, competenciaId);
  }

  return melhor;
}


/**
 * Fallback: busca resultado do cenário B diretamente da aba Sessoes.
 */
function _evoCarregarCenarioBDaSessao(ss, email, competenciaId) {
  var ws = ss.getSheetByName('Sessoes');
  if (!ws) return null;

  var dados = ws.getDataRange().getValues();
  if (dados.length < 2) return null;

  var headers = dados[0];
  var iEmail  = _evoFindHeader(headers, 'colaborador_id');
  var iCompId = _evoFindHeader(headers, 'competencia_id');
  var iStatus = _evoFindHeader(headers, 'status');
  var iNivel  = _evoFindHeader(headers, 'nivel');
  var iConf   = _evoFindHeader(headers, 'confianca');
  var iEvid   = _evoFindHeader(headers, 'evidencias');
  var iLacuna = _evoFindHeader(headers, 'lacuna');
  var iHistory = _evoFindHeader(headers, 'history');

  var emailNorm = email.toLowerCase().trim();
  var compNorm  = competenciaId.toLowerCase().trim();

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail  = String(row[iEmail]  || '').toLowerCase().trim();
    var rowComp   = String(row[iCompId] || '').toLowerCase().trim();
    var rowStatus = String(row[iStatus] || '').toLowerCase().trim();

    if (rowEmail === emailNorm && rowComp === compNorm && rowStatus === 'concluida') {
      var evidRaw = iEvid >= 0 ? String(row[iEvid] || '') : '';
      var evidParsed = [];
      if (evidRaw.length > 2) {
        try { evidParsed = JSON.parse(evidRaw); } catch(e) { evidParsed = []; }
      }

      var historyRaw = iHistory >= 0 ? String(row[iHistory] || '') : '[]';
      var history = [];
      try { history = JSON.parse(historyRaw); } catch(e) { history = []; }

      return {
        nivel:             iNivel >= 0 ? String(row[iNivel]  || '') : '',
        confianca:         iConf  >= 0 ? String(row[iConf]   || '') : '',
        evidencias:        evidRaw,
        evidencias_parsed: evidParsed,
        lacuna:            iLacuna >= 0 ? String(row[iLacuna] || '') : '',
        history:           history,
        data:              ''
      };
    }
  }

  return null;
}


/**
 * Carrega sessão de reavaliação conversacional (conversa semana 15).
 * Busca na aba Sessoes por sessões concluídas que usam cenário B.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {string} competenciaId
 * @returns {Object|null}  { history, resumo }
 */
function _evoCarregarConversaSem15(ss, email, competenciaId) {
  var ws = ss.getSheetByName('Sessoes');
  if (!ws) return null;

  var dados = ws.getDataRange().getValues();
  if (dados.length < 2) return null;

  var headers = dados[0];
  var iEmail   = _evoFindHeader(headers, 'colaborador_id');
  var iCompId  = _evoFindHeader(headers, 'competencia_id');
  var iStatus  = _evoFindHeader(headers, 'status');
  var iHistory = _evoFindHeader(headers, 'history');
  var iData    = _evoFindHeader(headers, 'created_at');

  var emailNorm = email.toLowerCase().trim();
  var compNorm  = competenciaId.toLowerCase().trim();

  // Buscar a sessão concluída mais recente (cenário B)
  var melhor = null;
  var melhorData = '';

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail  = String(row[iEmail]  || '').toLowerCase().trim();
    var rowComp   = String(row[iCompId] || '').toLowerCase().trim();
    var rowStatus = String(row[iStatus] || '').toLowerCase().trim();

    if (rowEmail === emailNorm && rowComp === compNorm && rowStatus === 'concluida') {
      var dataRow = iData >= 0 ? String(row[iData] || '') : '';
      if (!melhor || dataRow > melhorData) {
        var historyRaw = iHistory >= 0 ? String(row[iHistory] || '') : '[]';
        var history = [];
        try { history = JSON.parse(historyRaw); } catch(e) { history = []; }

        melhor = {
          history: history,
          data: dataRow
        };
        melhorData = dataRow;
      }
    }
  }

  if (!melhor) return null;

  // Extrair resumo da conversa: falas do colaborador
  var falasColab = [];
  for (var i = 0; i < melhor.history.length; i++) {
    var msg = melhor.history[i];
    if (msg.role === 'user' && msg.content && msg.content.length > 10) {
      falasColab.push(msg.content);
    }
  }
  melhor.resumo_falas = falasColab.join('\n---\n');

  return melhor;
}


/**
 * Carrega dados da trilha de capacitação (Fase 4) da aba Trilhas.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @returns {Object}  { semanas_concluidas, micro_desafios, cursos, itens[] }
 */
function _evoCarregarTrilha(ss, email) {
  var resultado = {
    semanas_concluidas:      0,
    micro_desafios_aplicados: 0,
    cursos_concluidos:       0,
    itens:                   []
  };

  var ws = ss.getSheetByName('Trilhas');
  if (!ws) return resultado;

  var dados = ws.getDataRange().getValues();
  if (dados.length < 2) return resultado;

  var emailNorm = email.toLowerCase().trim();

  // Colunas da aba Trilhas (1-indexed → ajustar para 0-indexed)
  // F4T_EMAIL=1, F4T_COMPETENCIA=2, F4T_NIVEL_ENTRADA=3, F4T_SEMANA=4,
  // F4T_TIPO_SEMANA=5, F4T_TITULO=6, F4T_URL=7, F4T_DESCRICAO=8,
  // F4T_DESCRITOR=9, F4T_FONTE=10, F4T_STATUS=11
  var semanasSet = {};

  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var rowEmail = String(row[0] || '').toLowerCase().trim(); // col A (0-indexed)
    if (rowEmail !== emailNorm) continue;

    var semana = String(row[3] || '').trim();       // col D
    var tipo   = String(row[4] || '').trim();       // col E
    var titulo = String(row[5] || '').trim();       // col F
    var status = String(row[10] || '').toLowerCase().trim(); // col K

    resultado.itens.push({
      semana:  semana,
      tipo:    tipo,
      titulo:  titulo,
      status:  status,
      descritor: String(row[8] || '').trim() // col I
    });

    if (status === 'concluido' || status === 'concluída' || status === 'concluida') {
      semanasSet[semana] = true;
      if (tipo && tipo.toLowerCase().indexOf('desafio') >= 0) {
        resultado.micro_desafios_aplicados++;
      }
      if (tipo && (tipo.toLowerCase().indexOf('curso') >= 0 || tipo.toLowerCase().indexOf('pilula') >= 0)) {
        resultado.cursos_concluidos++;
      }
    }
  }

  resultado.semanas_concluidas = Object.keys(semanasSet).length;

  // Buscar engajamento na aba Capacitacao (se existir)
  var wsCap = ss.getSheetByName('Capacitacao');
  if (wsCap) {
    var dataCap = wsCap.getDataRange().getValues();
    for (var c = 1; c < dataCap.length; c++) {
      var capEmail = String(dataCap[c][0] || '').toLowerCase().trim();
      if (capEmail === emailNorm) {
        var capStatus = String(dataCap[c][3] || '').toLowerCase().trim();
        if (capStatus === 'true' || capStatus === 'sim') {
          // Pílula concluída
          resultado.cursos_concluidos++;
        }
      }
    }
  }

  return resultado;
}


/**
 * Monta perfil CIS formatado para o prompt de fusão.
 * Reutiliza getCISParaPDI e formatarCISParaPrompt de CISReferencia.js
 *
 * @param {Object} colaborador  Dados do colaborador (com scores)
 * @returns {Object}  { cisData, cisTexto, cisRiscos }
 */
function _evoCarregarPerfilCIS(colaborador) {
  if (!colaborador) return { cisData: null, cisTexto: '', cisRiscos: [] };

  // Montar objeto no formato esperado por getCISParaPDI
  var discScores = colaborador.scores_disc || {};
  var valScores  = colaborador.scores_valores || {};

  // Determinar dominantes DISC (score >= 60)
  var discDominantes = [];
  var discBaixos     = [];
  var dims = ['D', 'I', 'S', 'C'];
  for (var d = 0; d < dims.length; d++) {
    var score = Number(discScores[dims[d]]) || 0;
    if (score >= 60) discDominantes.push(dims[d]);
    if (score <= 35) discBaixos.push(dims[d]);
  }

  // Determinar valores significativos (top 2)
  var valArr = Object.keys(valScores).map(function(k) { return { dim: k, score: Number(valScores[k]) || 0 }; });
  valArr.sort(function(a, b) { return b.score - a.score; });
  var valoresSignif = valArr.slice(0, 2).map(function(v) { return v.dim; });

  var colaboradorCIS = {
    disc_dominantes:        discDominantes,
    disc_baixos:            discBaixos,
    valores_significativos: valoresSignif,
    valores_scores:         valScores,
    tipo_ext_int:           null,
    tipo_sen_int:           null,
    tipo_pen_sen:           null
  };

  var cisData  = getCISParaPDI(colaboradorCIS);
  var cisTexto = formatarCISParaPrompt(cisData, discScores);
  var cisRiscos = getCISRiscos(valScores);

  return { cisData: cisData, cisTexto: cisTexto, cisRiscos: cisRiscos };
}


/**
 * Helper: encontra índice de coluna no header por nome parcial.
 */
function _evoFindHeader(headers, label) {
  var labelLow = label.toLowerCase();
  return headers.findIndex(function(h) {
    return h && String(h).toLowerCase().indexOf(labelLow) >= 0;
  });
}


// ═══════════════════════════════════════════════════════════════════════
// 3. PROMPTS DE FUSÃO
// ═══════════════════════════════════════════════════════════════════════

/**
 * System prompt para a IA de fusão de evolução.
 * Instrui o modelo a cruzar 3 fontes, classificar convergência e gerar feedback.
 *
 * @returns {string}
 */
function _evoBuildSystemPromptFusao() {
  return [
    'Voce e o Mentor IA do programa Vertho — plataforma de desenvolvimento de competencias para profissionais da educacao.',
    '',
    'SUA TAREFA: Analisar a EVOLUCAO de um colaborador comparando a avaliacao inicial (Cenario A) com a reavaliacao (Cenario B + conversa de acompanhamento).',
    '',
    '## FONTES DE DADOS',
    'Voce recebera 3 fontes:',
    '1. **Cenario A** — Diagnostico inicial (nota, nivel, descritores, feedback da IA)',
    '2. **Cenario B** — Reavaliacao situacional (nivel, evidencias demonstradas na conversa)',
    '3. **Conversa de acompanhamento** — Falas do colaborador durante a sessao conversacional (semana 15 da trilha)',
    '',
    '## ANALISE POR DESCRITOR',
    'Para CADA descritor da competencia avaliada:',
    '1. Calcule o delta numerico (nivel_B - nivel_A)',
    '2. Identifique evidencia demonstrada no Cenario B (comportamento observado)',
    '3. Identifique evidencia relatada na conversa (o que o colaborador disse ter mudado)',
    '4. Cruze as 3 fontes e classifique a CONVERGENCIA:',
    '',
    '| Classificacao | Criterio |',
    '|---|---|',
    '| EVOLUCAO_CONFIRMADA | Delta positivo + evidencia no cenario + relato convergente |',
    '| EVOLUCAO_PARCIAL | Delta positivo em apenas 1-2 fontes, ou evidencia fraca |',
    '| SEM_EVOLUCAO | Sem delta significativo + sem evidencia + sem relato |',
    '| EVOLUCAO_INVISIVEL | Sem delta numerico, mas evidencia qualitativa forte na conversa ou cenario |',
    '',
    '## CONSCIENCIA DO GAP',
    'Avalie se o colaborador PERCEBE seus proprios gaps:',
    '- **alta**: reconhece lacunas e fala sobre elas com propriedade',
    '- **media**: reconhece parcialmente, mas minimiza ou generaliza',
    '- **baixa**: nao reconhece, atribui dificuldades a fatores externos',
    '',
    '## CONEXAO CIS',
    'Para gaps persistentes, conecte ao perfil comportamental (DISC + Valores):',
    '- Explique como o perfil pode estar reforçando o gap',
    '- Sugira abordagem para o Ciclo 2 que considere o perfil',
    '',
    '## RECOMENDACAO CICLO 2',
    '- Liste descritores que devem ser FOCO no proximo ciclo',
    '- Justifique com base nos dados',
    '- Sugira formato (1:1, grupo, autodirigido) considerando o perfil CIS',
    '',
    '## FEEDBACK PARA O COLABORADOR',
    'Gere um feedback de 8 a 10 linhas em tom de mentor:',
    '- Comece reconhecendo avancos (mesmo pequenos)',
    '- Nomeie com clareza o que evoluiu e o que ainda precisa de atencao',
    '- Use linguagem acessivel (lembre que e profissional da educacao)',
    '- Finalize com encorajamento e direcao clara para o proximo passo',
    '',
    '## FORMATO DE SAIDA',
    'Retorne SOMENTE um JSON valido (sem markdown, sem texto fora do JSON):',
    '',
    '{',
    '  "resumo_executivo": {',
    '    "nota_cenario_a": <number>,',
    '    "nota_cenario_b": <number>,',
    '    "delta": <number>,',
    '    "nivel_a": <string>,',
    '    "nivel_b": <string>,',
    '    "descritores_que_subiram": <number>,',
    '    "descritores_total": <number>,',
    '    "sintese": "<string — 2 a 3 frases resumindo a evolucao>"',
    '  },',
    '  "evolucao_por_descritor": [',
    '    {',
    '      "descritor": "<codigo>",',
    '      "nome": "<nome curto>",',
    '      "nivel_a": <number>,',
    '      "nivel_b": <number>,',
    '      "delta": <number>,',
    '      "evidencia_cenario_b": "<string>",',
    '      "evidencia_conversa": "<string>",',
    '      "citacao_colaborador": "<string — frase literal do colaborador, se houver>",',
    '      "convergencia": "EVOLUCAO_CONFIRMADA|EVOLUCAO_PARCIAL|SEM_EVOLUCAO|EVOLUCAO_INVISIVEL",',
    '      "conexao_cis": "<string — como o perfil CIS influencia este descritor>",',
    '      "confianca": "alta|media|baixa"',
    '    }',
    '  ],',
    '  "ganhos_qualitativos": "<string — ganhos que nao aparecem nos numeros>",',
    '  "consciencia_do_gap": "alta|media|baixa",',
    '  "trilha_efetividade": {',
    '    "semanas_concluidas": <number>,',
    '    "micro_desafios_aplicados": <number>,',
    '    "cursos_concluidos": <number>,',
    '    "correlacao": "<string — correlacao entre engajamento e evolucao>"',
    '  },',
    '  "recomendacao_ciclo2": {',
    '    "descritores_foco": ["<cod1>", "<cod2>"],',
    '    "justificativa": "<string>",',
    '    "formato_sugerido": "<string — 1:1, grupo, autodirigido, misto>",',
    '    "conexao_cis": "<string — como adaptar ao perfil>"',
    '  },',
    '  "feedback_colaborador": "<string — 8 a 10 linhas, tom de mentor>"',
    '}'
  ].join('\n');
}


/**
 * User prompt para a IA de fusão de evolução.
 * Formata todos os dados em blocos estruturados.
 *
 * @param {Object} colaborador   Dados do colaborador
 * @param {Object} cenarioA      Resultado do cenário A
 * @param {Object} conversaSem15 Conversa de acompanhamento
 * @param {Object} cenarioB      Resultado do cenário B
 * @param {Object} trilha        Dados da trilha de capacitação
 * @param {Object} perfilCIS     Perfil CIS formatado
 * @param {Object} competencia   Dados da competência (com descritores)
 * @returns {string}
 */
function _evoBuildUserPromptFusao(colaborador, cenarioA, conversaSem15, cenarioB, trilha, perfilCIS, competencia) {
  var partes = [];

  // ── Cabeçalho ──────────────────────────────────────────────────────────
  partes.push('=== DADOS DO COLABORADOR ===');
  partes.push('Nome: ' + (colaborador.nome || 'N/A'));
  partes.push('Cargo: ' + (colaborador.cargo || 'N/A'));
  partes.push('Escola: ' + (colaborador.escola || 'N/A'));
  partes.push('Perfil DISC: ' + (colaborador.perfil_disc || 'N/A'));
  partes.push('');

  // ── Competência e Descritores ──────────────────────────────────────────
  partes.push('=== COMPETENCIA AVALIADA ===');
  if (competencia) {
    partes.push('Codigo: ' + (competencia.codigo || ''));
    partes.push('Nome: ' + (competencia.nome || ''));
    partes.push('Descricao: ' + (competencia.descricao || ''));
    partes.push('');
    partes.push('--- DESCRITORES ---');
    var descritores = competencia.descritores || [];
    for (var d = 0; d < descritores.length; d++) {
      var desc = descritores[d];
      partes.push('');
      partes.push('[' + desc.cod + '] ' + desc.nome_curto);
      partes.push('  Completo: ' + (desc.completo || ''));
      partes.push('  N1 (GAP): ' + (desc.n1 || ''));
      partes.push('  N2 (Em Desenvolvimento): ' + (desc.n2 || ''));
      partes.push('  N3 (META): ' + (desc.n3 || ''));
      partes.push('  N4 (Referencia): ' + (desc.n4 || ''));
    }
  }
  partes.push('');

  // ── Cenário A ──────────────────────────────────────────────────────────
  partes.push('=== CENARIO A — AVALIACAO INICIAL (Diagnostico por Forms) ===');
  if (cenarioA) {
    partes.push('Nota: ' + (cenarioA.nota || 'N/A'));
    partes.push('Nivel: ' + (cenarioA.nivel || 'N/A'));
    partes.push('Pontos Fortes: ' + (cenarioA.pontos_fortes || 'N/A'));
    partes.push('Pontos de Atencao: ' + (cenarioA.pontos_atencao || 'N/A'));
    partes.push('Feedback IA: ' + (cenarioA.feedback || 'N/A'));
    if (cenarioA.payload) {
      partes.push('');
      partes.push('Payload completo:');
      partes.push(JSON.stringify(cenarioA.payload, null, 2));
    }
    partes.push('');
    partes.push('Respostas originais do colaborador:');
    partes.push('R1 (Situacao): ' + (cenarioA.respostas.r1 || 'N/A'));
    partes.push('R2 (Acao): ' + (cenarioA.respostas.r2 || 'N/A'));
    partes.push('R3 (Raciocinio): ' + (cenarioA.respostas.r3 || 'N/A'));
    partes.push('R4 (CIS/gap): ' + (cenarioA.respostas.r4 || 'N/A'));
  } else {
    partes.push('(dados nao disponiveis)');
  }
  partes.push('');

  // ── Cenário B ──────────────────────────────────────────────────────────
  partes.push('=== CENARIO B — REAVALIACAO (IA Conversacional) ===');
  if (cenarioB) {
    partes.push('Nivel: ' + (cenarioB.nivel || 'N/A'));
    partes.push('Confianca: ' + (cenarioB.confianca || 'N/A'));
    partes.push('Lacuna identificada: ' + (cenarioB.lacuna || 'N/A'));
    partes.push('');
    if (cenarioB.evidencias_parsed && cenarioB.evidencias_parsed.length > 0) {
      partes.push('Evidencias demonstradas:');
      for (var e = 0; e < cenarioB.evidencias_parsed.length; e++) {
        var ev = cenarioB.evidencias_parsed[e];
        if (typeof ev === 'string') {
          partes.push('  - ' + ev);
        } else if (ev && ev.descritor) {
          partes.push('  - [' + (ev.descritor || '') + '] ' + (ev.texto || ev.evidencia || JSON.stringify(ev)));
        } else {
          partes.push('  - ' + JSON.stringify(ev));
        }
      }
    } else {
      partes.push('Evidencias (raw): ' + (cenarioB.evidencias || 'N/A'));
    }
    if (cenarioB.history && cenarioB.history.length > 0) {
      partes.push('');
      partes.push('Historico da conversa do Cenario B:');
      for (var h = 0; h < cenarioB.history.length; h++) {
        var msg = cenarioB.history[h];
        if (msg && msg.role && msg.content) {
          var roleName = msg.role === 'user' ? 'COLABORADOR' : 'MENTOR IA';
          partes.push('[' + roleName + ']: ' + String(msg.content).substring(0, 2000));
        }
      }
    }
  } else {
    partes.push('(dados nao disponiveis)');
  }
  partes.push('');

  // ── Conversa semana 15 ─────────────────────────────────────────────────
  partes.push('=== CONVERSA DE ACOMPANHAMENTO (Semana 15 / Sessao conversacional) ===');
  if (conversaSem15 && conversaSem15.resumo_falas) {
    partes.push('Falas do colaborador:');
    partes.push(conversaSem15.resumo_falas);
  } else if (conversaSem15 && conversaSem15.history && conversaSem15.history.length > 0) {
    partes.push('Historico da conversa:');
    for (var ch = 0; ch < conversaSem15.history.length; ch++) {
      var cmsg = conversaSem15.history[ch];
      if (cmsg && cmsg.role && cmsg.content) {
        var cRole = cmsg.role === 'user' ? 'COLABORADOR' : 'MENTOR IA';
        partes.push('[' + cRole + ']: ' + String(cmsg.content).substring(0, 2000));
      }
    }
  } else {
    partes.push('(conversa de acompanhamento nao disponivel — analisar apenas cenarios A e B)');
  }
  partes.push('');

  // ── Trilha ─────────────────────────────────────────────────────────────
  partes.push('=== TRILHA DE CAPACITACAO (Fase 4) ===');
  partes.push('Semanas concluidas: ' + (trilha.semanas_concluidas || 0));
  partes.push('Micro-desafios aplicados: ' + (trilha.micro_desafios_aplicados || 0));
  partes.push('Cursos/pilulas concluidos: ' + (trilha.cursos_concluidos || 0));
  if (trilha.itens && trilha.itens.length > 0) {
    partes.push('');
    partes.push('Itens da trilha:');
    for (var t = 0; t < Math.min(trilha.itens.length, 20); t++) {
      var item = trilha.itens[t];
      partes.push('  Sem ' + item.semana + ' | ' + item.tipo + ' | ' + item.titulo + ' | ' + item.status);
    }
  }
  partes.push('');

  // ── Perfil CIS ─────────────────────────────────────────────────────────
  partes.push('=== PERFIL COMPORTAMENTAL (CIS) ===');
  if (perfilCIS && perfilCIS.cisTexto) {
    partes.push(perfilCIS.cisTexto);
  } else {
    partes.push('(perfil CIS nao disponivel)');
  }
  if (perfilCIS && perfilCIS.cisRiscos && perfilCIS.cisRiscos.length > 0) {
    partes.push('');
    partes.push('Riscos de extremo:');
    for (var ri = 0; ri < perfilCIS.cisRiscos.length; ri++) {
      var risco = perfilCIS.cisRiscos[ri];
      partes.push('  - ' + (risco.dim || '') + ' (' + (risco.tipo || '') + '): ' + (risco.texto || ''));
    }
  }
  partes.push('');

  // ── Instrução final ────────────────────────────────────────────────────
  partes.push('=== INSTRUCAO ===');
  partes.push('Analise a evolucao deste colaborador cruzando as 3 fontes.');
  partes.push('Retorne SOMENTE o JSON no formato especificado no system prompt.');

  return partes.join('\n');
}


// ═══════════════════════════════════════════════════════════════════════
// 4. GRAVAÇÃO NAS ABAS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Grava o resultado da fusão nas abas Evolucao e Evolucao_Descritores.
 *
 * @param {Spreadsheet} ss
 * @param {string} email
 * @param {Object} colaborador  Dados do colaborador
 * @param {Object} resultado    JSON retornado pela IA
 * @param {string} competenciaId
 * @param {string} competenciaNome
 */
function _evoGravarEvolucao(ss, email, colaborador, resultado, competenciaId, competenciaNome) {
  _garantirAbasEvolucao(ss);

  var wsEvo  = ss.getSheetByName(_EVO_ABA_EVOLUCAO);
  var wsDesc = ss.getSheetByName(_EVO_ABA_DESCRITORES);

  var resumo = resultado.resumo_executivo || {};
  var descritores = resultado.evolucao_por_descritor || [];
  var reco = resultado.recomendacao_ciclo2 || {};

  // Montar resumo de convergência
  var convergencias = {};
  for (var i = 0; i < descritores.length; i++) {
    var conv = descritores[i].convergencia || 'N/A';
    convergencias[conv] = (convergencias[conv] || 0) + 1;
  }
  var convResumo = Object.keys(convergencias).map(function(k) {
    return k + ': ' + convergencias[k];
  }).join(' | ');

  // Montar gaps persistentes
  var gapsPersistentes = descritores.filter(function(d) {
    return d.convergencia === 'SEM_EVOLUCAO';
  }).map(function(d) { return d.descritor + ' (' + d.nome + ')'; }).join(', ');

  // ── 1 linha na aba Evolucao ────────────────────────────────────────────
  var rowEvo = [
    email,
    colaborador.nome || '',
    colaborador.cargo || '',
    colaborador.escola || '',
    competenciaId,
    competenciaNome || '',
    resumo.nota_cenario_a || '',
    resumo.nivel_a || '',
    resumo.nota_cenario_b || '',
    resumo.nivel_b || '',
    resumo.delta || 0,
    resumo.descritores_que_subiram || 0,
    convResumo,
    resultado.consciencia_do_gap || '',
    gapsPersistentes || 'Nenhum',
    (reco.descritores_foco || []).join(', '),
    resultado.feedback_colaborador || '',
    JSON.stringify(resultado),
    new Date().toISOString(),
    'Gerado'
  ];

  // Verificar se já existe linha para este email + competência (sobrescrever)
  var dadosEvo = wsEvo.getDataRange().getValues();
  var linhaExistente = -1;
  for (var re = 1; re < dadosEvo.length; re++) {
    var reEmail = String(dadosEvo[re][0] || '').toLowerCase().trim();
    var reComp  = String(dadosEvo[re][4] || '').toLowerCase().trim();
    if (reEmail === email.toLowerCase().trim() && reComp === competenciaId.toLowerCase().trim()) {
      linhaExistente = re + 1; // 1-indexed
      break;
    }
  }

  if (linhaExistente > 0) {
    wsEvo.getRange(linhaExistente, 1, 1, rowEvo.length).setValues([rowEvo]);
    Logger.log('_evoGravarEvolucao: atualizada linha ' + linhaExistente + ' para ' + email);
  } else {
    wsEvo.appendRow(rowEvo);
    Logger.log('_evoGravarEvolucao: nova linha para ' + email);
  }

  // ── N linhas na aba Evolucao_Descritores ───────────────────────────────
  // Primeiro, limpar descritores anteriores para este email + comp
  var dadosDesc = wsDesc.getDataRange().getValues();
  var linhasRemover = [];
  for (var rd = dadosDesc.length - 1; rd >= 1; rd--) {
    var rdEmail = String(dadosDesc[rd][0] || '').toLowerCase().trim();
    var rdComp  = String(dadosDesc[rd][1] || '').toLowerCase().trim();
    if (rdEmail === email.toLowerCase().trim() && rdComp === competenciaId.toLowerCase().trim()) {
      linhasRemover.push(rd + 1);
    }
  }
  // Remover de baixo para cima para manter os índices corretos
  for (var lr = 0; lr < linhasRemover.length; lr++) {
    wsDesc.deleteRow(linhasRemover[lr]);
  }

  // Inserir novos descritores
  for (var di = 0; di < descritores.length; di++) {
    var desc = descritores[di];
    wsDesc.appendRow([
      email,
      competenciaId,
      desc.descritor || '',
      desc.nome || '',
      desc.nivel_a || '',
      desc.nivel_b || '',
      desc.delta || 0,
      desc.evidencia_cenario_b || '',
      desc.evidencia_conversa || '',
      desc.citacao_colaborador || '',
      desc.convergencia || '',
      desc.conexao_cis || '',
      desc.confianca || ''
    ]);
  }

  Logger.log('_evoGravarEvolucao: ' + descritores.length + ' descritores gravados para ' + email);
  SpreadsheetApp.flush();
}


// ═══════════════════════════════════════════════════════════════════════
// 5. ROTEAMENTO IA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Chama a IA para gerar a fusão de evolução.
 * Detecta modelo GPT e roteia para OpenAI; caso contrário, usa Claude.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {string}  Texto de resposta da IA
 */
function _evoChamarIA(systemPrompt, userPrompt) {
  _carregarCFG();
  var modelo = _CFG.modelo || 'claude-sonnet-4-6';
  var usarThinking = _CFG.thinking || false;

  Logger.log('_evoChamarIA: modelo=' + modelo + ' thinking=' + usarThinking);

  // Roteamento: GPT → OpenAI, Claude → Anthropic
  if (modelo.toLowerCase().indexOf('gpt') >= 0 || modelo.toLowerCase().indexOf('o1-') >= 0 ||
      modelo.toLowerCase().indexOf('o3-') >= 0 || modelo.toLowerCase().indexOf('o4-') >= 0) {
    return _ia4OpenAIRawV2(modelo, systemPrompt, userPrompt, usarThinking);
  }
  return _ia4ClaudeRawV2(modelo, systemPrompt, userPrompt, usarThinking);
}


// ═══════════════════════════════════════════════════════════════════════
// 6. FUNÇÃO PRINCIPAL — GERAR RELATÓRIO DE EVOLUÇÃO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Gera relatório de evolução para um colaborador + competência.
 * Cruza cenário A, cenário B, conversa, trilha e CIS.
 *
 * @param {string} email         E-mail do colaborador
 * @param {string} competenciaId Código da competência (ex: 'C001')
 * @returns {Object|null}  Resultado da fusão (JSON parseado) ou null se erro
 */
function gerarRelatorioEvolucao(email, competenciaId) {
  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  _garantirAbasEvolucao(ss);

  Logger.log('=== gerarRelatorioEvolucao: ' + email + ' / ' + competenciaId + ' ===');

  // 1. Carregar colaborador
  var colaborador = _evoCarregarColaborador(ss, email);
  if (!colaborador) {
    Logger.log('ERRO: colaborador nao encontrado — ' + email);
    return null;
  }
  Logger.log('Colaborador: ' + colaborador.nome + ' | ' + colaborador.cargo);

  // 2. Carregar competência (com descritores V2)
  var mapaV2 = _lerBaseCompetenciasV2(ss);
  var competencia = mapaV2 ? mapaV2[competenciaId.toUpperCase()] : null;
  if (!competencia) {
    Logger.log('AVISO: competencia ' + competenciaId + ' nao encontrada em Competencias_v2');
  }

  // 3. Carregar cenário A (Respostas / Forms)
  var cenarioA = _evoCarregarCenarioA(ss, email, competenciaId);
  if (!cenarioA) {
    Logger.log('AVISO: cenario A nao encontrado para ' + email + ' / ' + competenciaId);
  }

  // 4. Carregar cenário B (Resultados_Avaliacao / Sessoes)
  var cenarioB = _evoCarregarCenarioB(ss, email, competenciaId);
  if (!cenarioB) {
    Logger.log('AVISO: cenario B nao encontrado para ' + email + ' / ' + competenciaId);
  }

  // Se não tem nem A nem B, não faz sentido gerar fusão
  if (!cenarioA && !cenarioB) {
    Logger.log('ERRO: sem cenario A e sem cenario B — impossivel gerar fusao');
    return null;
  }

  // 5. Carregar conversa semana 15
  var conversaSem15 = _evoCarregarConversaSem15(ss, email, competenciaId);

  // 6. Carregar trilha
  var trilha = _evoCarregarTrilha(ss, email);

  // 7. Carregar perfil CIS
  var perfilCIS = _evoCarregarPerfilCIS(colaborador);

  // 8. Montar prompts e chamar IA
  var systemPrompt = _evoBuildSystemPromptFusao();
  var userPrompt   = _evoBuildUserPromptFusao(
    colaborador, cenarioA, conversaSem15, cenarioB, trilha, perfilCIS, competencia
  );

  Logger.log('Prompt montado. System: ' + systemPrompt.length + ' chars | User: ' + userPrompt.length + ' chars');

  var respostaIA;
  try {
    respostaIA = _evoChamarIA(systemPrompt, userPrompt);
  } catch (e) {
    Logger.log('ERRO na chamada IA: ' + e.message);
    return null;
  }

  if (!respostaIA) {
    Logger.log('ERRO: resposta vazia da IA');
    return null;
  }

  Logger.log('Resposta IA recebida: ' + respostaIA.length + ' chars');

  // 9. Parsear JSON
  var resultado;
  try {
    resultado = _extrairJSON(respostaIA);
  } catch (e) {
    Logger.log('ERRO ao parsear JSON da IA: ' + e.message);
    Logger.log('Resposta bruta (primeiros 500 chars): ' + respostaIA.substring(0, 500));
    return null;
  }

  // 10. Gravar nas abas
  var compNome = competencia ? competencia.nome : competenciaId;
  _evoGravarEvolucao(ss, email, colaborador, resultado, competenciaId, compNome);

  // 11. Retornar resultado
  Logger.log('=== Evolucao gerada com sucesso para ' + email + ' / ' + competenciaId + ' ===');
  return resultado;
}


// ═══════════════════════════════════════════════════════════════════════
// 7. LOTE — GERAR RELATÓRIOS DE EVOLUÇÃO EM MASSA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Entry point de menu: gera relatórios de evolução para todos os
 * colaboradores que possuem AMBOS cenário A e cenário B.
 */
function gerarRelatoriosEvolucaoLote() {
  _carregarCFG();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  _garantirAbasEvolucao(ss);

  // 1. Coletar todos os pares (email, competencia_id) que têm cenário A na aba Respostas
  var wsResp = ss.getSheetByName('Respostas');
  if (!wsResp) {
    ui.alert('Aba Respostas nao encontrada.');
    return;
  }

  var dadosResp = wsResp.getDataRange().getValues();
  var headersResp = dadosResp[0];
  var iEmailResp  = headersResp.findIndex(function(h) { return _norm(h) === 'ID Colaborador'; });
  var iCompResp   = headersResp.findIndex(function(h) { return _norm(h) === 'ID Competência'; });
  var iNivelResp  = headersResp.findIndex(function(h) { return _norm(h) === 'Nível IA4'; });

  if (iEmailResp < 0) {
    iEmailResp = headersResp.findIndex(function(h) { return _norm(h).toLowerCase().indexOf('e-mail') >= 0; });
  }

  // Mapear: email|comp → tem cenário A avaliado
  var cenarioAMap = {};
  for (var ra = 1; ra < dadosResp.length; ra++) {
    var emailA = String(dadosResp[ra][iEmailResp] || '').toLowerCase().trim();
    var compA  = String(dadosResp[ra][iCompResp] || '').toLowerCase().trim();
    var nivelA = iNivelResp >= 0 ? String(dadosResp[ra][iNivelResp] || '').trim() : '';
    if (emailA && compA && nivelA) {
      cenarioAMap[emailA + '|' + compA] = true;
    }
  }

  // 2. Coletar pares que têm cenário B (Resultados_Avaliacao ou Sessoes concluídas)
  var cenarioBMap = {};

  // 2a. Resultados_Avaliacao
  var wsResAval = ss.getSheetByName('Resultados_Avaliacao');
  if (wsResAval) {
    var dadosAval = wsResAval.getDataRange().getValues();
    if (dadosAval.length >= 2) {
      var headersAval = dadosAval[0];
      var iEmailAval = _evoFindHeader(headersAval, 'colaborador_id');
      var iCompAval  = _evoFindHeader(headersAval, 'competencia_id');
      var iNivelAval = _evoFindHeader(headersAval, 'nivel');

      for (var rb = 1; rb < dadosAval.length; rb++) {
        var emailB = String(dadosAval[rb][iEmailAval] || '').toLowerCase().trim();
        var compB  = String(dadosAval[rb][iCompAval]  || '').toLowerCase().trim();
        var nivelB = iNivelAval >= 0 ? String(dadosAval[rb][iNivelAval] || '').trim() : '';
        if (emailB && compB && nivelB) {
          cenarioBMap[emailB + '|' + compB] = true;
        }
      }
    }
  }

  // 2b. Sessoes concluídas (fallback)
  var wsSessoes = ss.getSheetByName('Sessoes');
  if (wsSessoes) {
    var dadosSess = wsSessoes.getDataRange().getValues();
    if (dadosSess.length >= 2) {
      var headersSess = dadosSess[0];
      var iEmailSess  = _evoFindHeader(headersSess, 'colaborador_id');
      var iCompSess   = _evoFindHeader(headersSess, 'competencia_id');
      var iStatusSess = _evoFindHeader(headersSess, 'status');

      for (var rs = 1; rs < dadosSess.length; rs++) {
        var emailS = String(dadosSess[rs][iEmailSess] || '').toLowerCase().trim();
        var compS  = String(dadosSess[rs][iCompSess]  || '').toLowerCase().trim();
        var statusS = String(dadosSess[rs][iStatusSess] || '').toLowerCase().trim();
        if (emailS && compS && statusS === 'concluida') {
          cenarioBMap[emailS + '|' + compS] = true;
        }
      }
    }
  }

  // 3. Encontrar pares que têm AMBOS (cenário A + cenário B)
  var paresAmbos = [];
  var keysA = Object.keys(cenarioAMap);
  for (var k = 0; k < keysA.length; k++) {
    if (cenarioBMap[keysA[k]]) {
      var partes = keysA[k].split('|');
      paresAmbos.push({ email: partes[0], competenciaId: partes[1].toUpperCase() });
    }
  }

  // 4. Verificar se já existem na aba Evolucao (pular já gerados)
  var wsEvoExist = ss.getSheetByName(_EVO_ABA_EVOLUCAO);
  var jaGerados = {};
  if (wsEvoExist) {
    var dadosEvoExist = wsEvoExist.getDataRange().getValues();
    for (var re = 1; re < dadosEvoExist.length; re++) {
      var reEmail = String(dadosEvoExist[re][0] || '').toLowerCase().trim();
      var reComp  = String(dadosEvoExist[re][4] || '').toLowerCase().trim();
      var reStatus = String(dadosEvoExist[re][19] || '').toLowerCase().trim();
      if (reEmail && reComp && reStatus === 'gerado') {
        jaGerados[reEmail + '|' + reComp] = true;
      }
    }
  }

  var pendentes = paresAmbos.filter(function(p) {
    return !jaGerados[p.email + '|' + p.competenciaId.toLowerCase()];
  });

  if (pendentes.length === 0 && paresAmbos.length > 0) {
    ui.alert(
      'Evolucao ja gerada para todos!\n\n' +
      paresAmbos.length + ' colaboradores com A+B.\n' +
      'Todos ja possuem relatorio de evolucao.'
    );
    return;
  }

  if (pendentes.length === 0) {
    ui.alert(
      'Nenhum colaborador com AMBOS cenarios (A + B) encontrado.\n\n' +
      'Cenarios A encontrados: ' + keysA.length + '\n' +
      'Cenarios B encontrados: ' + Object.keys(cenarioBMap).length
    );
    return;
  }

  var resp = ui.alert(
    'Gerar Relatorios de Evolucao',
    pendentes.length + ' colaboradores pendentes (de ' + paresAmbos.length + ' com A+B).\n\n' +
    'Modelo: ' + Config.modelLabel(_CFG.modelo) + '\n\nContinuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  // 5. Processar
  var gerados = 0, erros = 0;
  _limparParada();

  for (var p = 0; p < pendentes.length; p++) {
    if (_deveParar()) { _limparParada(); break; }

    var par = pendentes[p];
    SpreadsheetApp.getActive().toast(
      '[' + Config.modelLabel(_CFG.modelo) + ']\n' +
      par.email + ' / ' + par.competenciaId +
      ' (' + (p + 1) + '/' + pendentes.length + ')',
      'Gerando Evolucao', 30
    );

    try {
      var resultado = gerarRelatorioEvolucao(par.email, par.competenciaId);
      if (resultado) {
        gerados++;
        Logger.log('Evolucao OK: ' + par.email + ' / ' + par.competenciaId);
      } else {
        erros++;
        Logger.log('Evolucao NULL: ' + par.email + ' / ' + par.competenciaId);
      }
    } catch (e) {
      erros++;
      Logger.log('ERRO evolucao ' + par.email + ' / ' + par.competenciaId + ': ' + e.message);
    }

    // Pausa entre chamadas para não sobrecarregar a API
    if (p < pendentes.length - 1) Utilities.sleep(2000);
  }

  var msgFinal = 'Relatorios de Evolucao concluidos!\n\n' +
    'Gerados: ' + gerados + '\n' +
    'Erros: ' + erros + '\n' +
    'Total: ' + pendentes.length;

  SpreadsheetApp.getActive().toast(msgFinal, 'Evolucao', 15);
  try { ui.alert(msgFinal); } catch(e) {}
}
