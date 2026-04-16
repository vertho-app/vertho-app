// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — StateManager.gs  (Fase 3 — IA Conversacional)
//
// CRUD completo no Google Sheets para gerenciar sessões, resultados e estado.
// Cria abas automaticamente no primeiro uso.
//
// Inclui métodos do antigo StateManagerPatch (v3):
//   getCompetencia, getCenariosForSession, getCenarioB,
//   getDiagnosticResults, getColaborador, getReguaMaturidade, updateDriveFileId
//
// Dependências: Config.gs
// ═══════════════════════════════════════════════════════════════════════════════

const StateManager = {

  // Cache interno por execução (evita ler a mesma aba múltiplas vezes)
  _cache: {},

  // ══════════════════════════════════════════════════════════════════════════
  // SESSÕES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna sessão ativa (status = 'ativa') do colaborador.
   */
  getActiveSession(userId) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return null;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    const headers = data[0];
    const iColabId = this._colIdx(headers, 'colaborador_id');
    const iStatus  = this._colIdx(headers, 'status');

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (String(row[iColabId]).toLowerCase() === String(userId).toLowerCase()
          && String(row[iStatus]).toLowerCase() === 'ativa') {
        return this._rowToSession(headers, row, r + 1);
      }
    }
    return null;
  },

  /**
   * Retorna sessão pelo ID (com dados completos incluindo history).
   */
  getSession(sessaoId) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return null;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    const headers = data[0];
    const iSessId = this._colIdx(headers, 'sessao_id');

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iSessId]) === String(sessaoId)) {
        return this._rowToSession(headers, data[r], r + 1);
      }
    }
    return null;
  },

  /**
   * Verifica se colaborador já completou alguma sessão antes (para tutorial).
   */
  hasCompletedSessionBefore(colaboradorId) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return false;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return false;

    const headers = data[0];
    const iColabId = this._colIdx(headers, 'colaborador_id');
    const iStatus  = this._colIdx(headers, 'status');

    return data.slice(1).some(row =>
      String(row[iColabId]).toLowerCase() === String(colaboradorId).toLowerCase()
      && String(row[iStatus]).toLowerCase() === 'concluida'
    );
  },

  /**
   * Encontra próxima sessão pendente para o colaborador.
   */
  getNextPendingSession(userId) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return null;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    const headers = data[0];
    const iColabId = this._colIdx(headers, 'colaborador_id');
    const iStatus  = this._colIdx(headers, 'status');

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const status = String(row[iStatus]).toLowerCase();
      if (String(row[iColabId]).toLowerCase() === String(userId).toLowerCase()
          && (status === 'pendente' || status === 'agendada')) {
        const rowNum = r + 1;
        ws.getRange(rowNum, iStatus + 1).setValue('ativa');
        return this._rowToSession(headers, row, rowNum);
      }
    }
    return null;
  },

  /**
   * Conta sessões concluídas hoje pelo colaborador (para limite diário).
   */
  getSessionsCompletedOnDate(userId, dateStr) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return 0;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return 0;

    const headers = data[0];
    const iColabId   = this._colIdx(headers, 'colaborador_id');
    const iStatus    = this._colIdx(headers, 'status');
    const iUpdatedAt = this._colIdx(headers, 'updated_at');

    let count = 0;
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (String(row[iColabId]).toLowerCase() === String(userId).toLowerCase()
          && String(row[iStatus]).toLowerCase() === 'concluida') {
        const updated = String(row[iUpdatedAt] || '');
        if (updated.startsWith(dateStr)) count++;
      }
    }
    return count;
  },

  // ── Atualização de campos da sessão ──────────────────────────────────────

  updateSessionPhase(sessaoId, phase) {
    this._updateSessionField(sessaoId, 'fase', phase);
  },

  updateSessionStatus(sessaoId, status) {
    this._updateSessionField(sessaoId, 'status', status);
    this._updateSessionField(sessaoId, 'updated_at', new Date().toISOString());
  },

  updateLastActivity(sessaoId) {
    this._updateSessionField(sessaoId, 'last_activity', new Date().toISOString());
  },

  setCurrentCenario(sessaoId, num) {
    this._updateSessionField(sessaoId, 'cenario_atual', num);
  },

  incrementAprofundamento(sessaoId, cenarioNum) {
    const session = this.getSession(sessaoId);
    if (!session) return;
    const field = cenarioNum === 1 ? 'aprofundamentos_cenario1' : 'aprofundamentos_cenario2';
    const current = session[field] || 0;
    this._updateSessionField(sessaoId, field, current + 1);
  },

  markContraexemploUsed(sessaoId) {
    this._updateSessionField(sessaoId, 'contraexemplo_usado', true);
  },

  registerConsent(colaboradorId, sessaoId) {
    this._updateSessionField(sessaoId, 'consentimento_lgpd', new Date().toISOString());
    try {
      const wsColab = this._getSheet(Config.SHEET_COLABORADORES);
      if (wsColab) {
        const data = wsColab.getDataRange().getValues();
        const headers = data.length > 3 ? data[3] : data[0];
        const headerRow = data.length > 3 ? 3 : 0;
        const iEmail = this._findEmailCol(headers);
        if (iEmail >= 0) {
          for (let r = headerRow + 1; r < data.length; r++) {
            if (String(data[r][iEmail]).toLowerCase() === String(colaboradorId).toLowerCase()) {
              const iCons = headers.findIndex(h =>
                String(h || '').toLowerCase().includes('consentimento'));
              if (iCons >= 0) {
                wsColab.getRange(r + 1, iCons + 1).setValue(new Date().toISOString());
              }
              break;
            }
          }
        }
      }
    } catch (e) {
      Logger.log('registerConsent colab: ' + e.message);
    }
  },

  // ── Histórico da conversa ────────────────────────────────────────────────

  addToHistory(sessaoId, role, content) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return;

    const data = ws.getDataRange().getValues();
    const headers = data[0];
    const iSessId  = this._colIdx(headers, 'sessao_id');
    const iHistory = this._colIdx(headers, 'history');

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iSessId]) === String(sessaoId)) {
        let history = [];
        try {
          history = JSON.parse(data[r][iHistory] || '[]');
        } catch (e) { history = []; }

        history.push({
          role: role,
          content: content,
          timestamp: new Date().toISOString()
        });

        ws.getRange(r + 1, iHistory + 1).setValue(JSON.stringify(history));
        return;
      }
    }
  },

  // ── Salvar estado completo da sessão (init) ──────────────────────────────

  saveSessionState(state) {
    const ws = this._ensureSheet(Config.SHEET_SESSOES, [
      'sessao_id', 'ciclo_id', 'colaborador_id', 'competencia_id', 'competencia',
      'status', 'fase', 'history', 'cenarios', 'baseline',
      'aprofundamentos_cenario1', 'aprofundamentos_cenario2', 'contraexemplo_usado',
      'cenario_atual', 'consentimento_lgpd', 'nivel', 'confianca', 'evidencias',
      'lacuna', 'validacao', 'created_at', 'updated_at', 'last_activity'
    ]);

    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];

    const data = ws.getDataRange().getValues();
    const iSessId = this._colIdx(headers, 'sessao_id');
    let existingRow = -1;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iSessId]) === String(state.sessao_id)) {
        existingRow = r + 1;
        break;
      }
    }

    const row = headers.map(h => {
      const key = String(h).trim();
      if (key === 'history')   return JSON.stringify(state.history || []);
      if (key === 'cenarios')  return JSON.stringify(state.cenarios || []);
      if (key === 'baseline')  return JSON.stringify(state.baseline || null);
      if (key === 'status')    return state.fase === 'nova' ? 'ativa' : (state.status || 'ativa');
      if (key === 'updated_at') return new Date().toISOString();
      if (key === 'colaborador_id') return state.colaborador_id || state.userId || '';
      return state[key] !== undefined ? state[key] : '';
    });

    if (existingRow > 0) {
      ws.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      ws.appendRow(row);
    }
  },

  // ── Salvar resultados da avaliação ───────────────────────────────────────

  saveSessionResult(sessaoId, evalResult, validation) {
    this._updateSessionField(sessaoId, 'nivel',     evalResult.nivel || '');
    this._updateSessionField(sessaoId, 'confianca', evalResult.confianca || '');
    this._updateSessionField(sessaoId, 'evidencias', JSON.stringify(evalResult.evidencias || []));
    this._updateSessionField(sessaoId, 'lacuna',    evalResult.lacuna || '');
    this._updateSessionField(sessaoId, 'validacao', JSON.stringify(validation || {}));
    this._updateSessionField(sessaoId, 'updated_at', new Date().toISOString());

    const session = this.getSession(sessaoId);
    if (session) {
      const wsRes = this._ensureSheet(Config.SHEET_RESULTADOS_AVAL, [
        'resultado_id', 'ciclo_id', 'colaborador_id', 'competencia_id', 'competencia',
        'nivel', 'confianca', 'evidencias', 'lacuna', 'validacao_status',
        'validacao_detalhes', 'created_at'
      ]);
      wsRes.appendRow([
        Utilities.getUuid(),
        session.ciclo_id,
        session.colaborador_id,
        session.competencia_id,
        session.competencia,
        evalResult.nivel || '',
        evalResult.confianca || '',
        JSON.stringify(evalResult.evidencias || []),
        evalResult.lacuna || '',
        validation ? validation.validacao : 'pendente',
        JSON.stringify(validation || {}),
        new Date().toISOString()
      ]);
    }

    if (validation) {
      const wsVal = this._ensureSheet(Config.SHEET_VALIDACOES, [
        'validacao_id', 'sessao_id', 'resultado_gemini', 'divergencia',
        'nivel_sugerido', 'evidencias_invalidas', 'comentario', 'created_at'
      ]);
      wsVal.appendRow([
        Utilities.getUuid(),
        sessaoId,
        validation.validacao || 'pendente',
        validation.validacao === 'divergente' ? 'sim' : 'nao',
        validation.nivel_sugerido || '',
        JSON.stringify(validation.evidencias_invalidas || []),
        validation.comentario || '',
        new Date().toISOString()
      ]);
    }
  },

  updateSessionResult(sessaoId, evalResult, validation) {
    this.saveSessionResult(sessaoId, evalResult, validation);
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DADOS DE REFERÊNCIA (leitura)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Lê dados do colaborador da aba Colaboradores.
   * Headers na linha 4 (index 3). Inclui perfil DISC e traços CIS.
   */
  getColaborador(userId) {
    var ws = this._getSheet(Config.SHEET_COLABORADORES);
    if (!ws) return null;

    var data = ws.getDataRange().getValues();
    if (data.length < 5) return null;

    var email = String(userId).toLowerCase().trim();

    // Headers na linha 4 (index 3)
    // Col B (1) = Nome, Col D (3) = Cargo, Col E (4) = Area
    // Col G (6) = E-mail Corporativo, Col M (12) = Perfil Comportamental
    // Col N-Q (13-16) = D/I/S/C Natural

    var TRAIT_MAP = {
      12: "Perfil",
      13: "Dominancia", 14: "Influencia", 15: "Estabilidade", 16: "Conformidade",
      17: "D Adaptada", 18: "I Adaptada", 19: "S Adaptada", 20: "C Adaptada",
      21: "Executivo", 22: "Motivador", 23: "Metodico", 24: "Sistematico",
      25: "Estetico", 26: "Economico", 27: "Politico", 28: "Religioso",
      29: "Social", 30: "Teorico",
      31: "Ousadia", 32: "Comando", 33: "Objetividade", 34: "Assertividade",
      35: "Persuasao", 36: "Extroversao", 37: "Entusiasmo", 38: "Sociabilidade",
      39: "Empatia", 40: "Paciencia", 41: "Persistencia",
      42: "Planejamento", 43: "Organizacao", 44: "Detalhismo",
      45: "Prudencia", 46: "Concentracao"
    };

    var TRAIT_ALIASES = {
      "social": "Sociabilidade",
      "dominância": "Dominancia", "dominancia": "Dominancia",
      "influência": "Influencia", "influencia": "Influencia",
      "conformidade": "Conformidade",
      "estabilidade": "Estabilidade",
      "econômico": "Economico", "economico": "Economico",
      "político": "Politico", "politico": "Politico",
      "religioso": "Religioso",
      "estético": "Estetico", "estetico": "Estetico",
      "teórico": "Teorico", "teorico": "Teorico",
      "extroversão": "Extroversao", "extroversao": "Extroversao",
      "persuasão": "Persuasao", "persuasao": "Persuasao",
      "paciência": "Paciencia", "paciencia": "Paciencia",
      "persistência": "Persistencia", "persistencia": "Persistencia",
      "organização": "Organizacao", "organizacao": "Organizacao",
      "prudência": "Prudencia", "prudencia": "Prudencia",
      "concentração": "Concentracao", "concentracao": "Concentracao",
      "metodico": "Metodico", "metódico": "Metodico",
      "sistemático": "Sistematico", "sistematico": "Sistematico",
      "sociabilidade": "Sociabilidade"
    };

    for (var r = 4; r < data.length; r++) {
      var rowEmail = String(data[r][6] || "").toLowerCase().trim();
      if (rowEmail === email) {
        var perfilTipo = String(data[r][12] || "").trim();
        var dNat = Number(data[r][13]) || 0;
        var iNat = Number(data[r][14]) || 0;
        var sNat = Number(data[r][15]) || 0;
        var cNat = Number(data[r][16]) || 0;

        var discDesc = "";
        if (perfilTipo) {
          var discParts = [];
          if (dNat >= 60) discParts.push("D=" + dNat + " (alto)");
          else if (dNat >= 40) discParts.push("D=" + dNat + " (medio)");
          else discParts.push("D=" + dNat + " (baixo)");

          if (iNat >= 60) discParts.push("I=" + iNat + " (alto)");
          else if (iNat >= 40) discParts.push("I=" + iNat + " (medio)");
          else discParts.push("I=" + iNat + " (baixo)");

          if (sNat >= 60) discParts.push("S=" + sNat + " (alto)");
          else if (sNat >= 40) discParts.push("S=" + sNat + " (medio)");
          else discParts.push("S=" + sNat + " (baixo)");

          if (cNat >= 60) discParts.push("C=" + cNat + " (alto)");
          else if (cNat >= 40) discParts.push("C=" + cNat + " (medio)");
          else discParts.push("C=" + cNat + " (baixo)");

          discDesc = "Perfil " + perfilTipo + " | " + discParts.join(", ");
        }

        var traitScores = {};
        var indices = Object.keys(TRAIT_MAP);
        for (var ti = 0; ti < indices.length; ti++) {
          var colIdx = Number(indices[ti]);
          var traitName = TRAIT_MAP[colIdx];
          var score = Number(data[r][colIdx]) || 0;
          if (traitName !== "Perfil" && score > 0) {
            traitScores[traitName] = score;
          }
        }

        return {
          colaborador_id: email,
          nome:  String(data[r][1] || ""),
          cargo: String(data[r][3] || ""),
          area:  String(data[r][4] || ""),
          email: email,
          perfil_disc: perfilTipo,
          disc_d: dNat,
          disc_i: iNat,
          disc_s: sNat,
          disc_c: cNat,
          disc_descricao: discDesc,
          trait_scores: traitScores,
          trait_aliases: TRAIT_ALIASES
        };
      }
    }

    return null;
  },

  /**
   * Lê dados de uma competência via _lerBaseCompetenciasV2 (aba Competencias_v2).
   * Retorna formato legado para compatibilidade com callers existentes.
   */
  getCompetencia(competenciaId) {
    var ss = this.ss || SpreadsheetApp.getActiveSpreadsheet();
    var mapaV2 = _lerBaseCompetenciasV2(ss);
    if (!mapaV2 || Object.keys(mapaV2).length === 0) return null;

    var compId = String(competenciaId).toUpperCase().trim();

    // Busca direta por código
    var comp = mapaV2[compId];

    // Fallback por nome (parcial)
    if (!comp) {
      var keys = Object.keys(mapaV2);
      for (var i = 0; i < keys.length; i++) {
        var c = mapaV2[keys[i]];
        var nomeUp = (c.nome || '').toUpperCase().trim();
        if (nomeUp && compId.indexOf(nomeUp) >= 0) { comp = c; break; }
      }
    }

    if (!comp) return null;

    // Montar strings de descritores e níveis a partir do array V2
    var nomesCurtos = [];
    var niveis1 = [], niveis2 = [], niveis3 = [], niveis4 = [];
    var descs = comp.descritores || [];
    for (var d = 0; d < descs.length; d++) {
      nomesCurtos.push(descs[d].nome_curto || descs[d].cod || '');
      if (descs[d].n1) niveis1.push(descs[d].nome_curto + ': ' + descs[d].n1);
      if (descs[d].n2) niveis2.push(descs[d].nome_curto + ': ' + descs[d].n2);
      if (descs[d].n3) niveis3.push(descs[d].nome_curto + ': ' + descs[d].n3);
      if (descs[d].n4) niveis4.push(descs[d].nome_curto + ': ' + descs[d].n4);
    }

    return {
      competencia_id: comp.codigo || '',
      nome:       comp.nome || '',
      categoria:  comp.pilar || '',
      cargo:      comp.cargo || '',
      descricao:  comp.descricao || '',
      descritores: nomesCurtos.join('; '),
      nivel1:     niveis1.join(' | '),
      nivel2:     niveis2.join(' | '),
      nivel3:     niveis3.join(' | '),
      nivel4:     niveis4.join(' | '),
      nivel5:     '',
      tracos_cis: [],
      descritores_v2: descs
    };
  },

  /**
   * Lê cenários para uma sessão. Busca Cenarios_B por cargo+escola+competencia.
   * Se colaboradorEmail fornecido, resolve cargo+escola automaticamente.
   */
  getCenariosForSession(competenciaId, fase, colaboradorEmail) {
    // Se fase B e temos email, buscar por cargo+escola do colaborador
    if (String(fase).toUpperCase() === "B" && colaboradorEmail) {
      var cenarioB = this.getCenarioB(colaboradorEmail, competenciaId);
      if (cenarioB) return [cenarioB];
    }

    // Fallback: buscar na aba Cenarios_B por competencia apenas
    var ws = this._getSheet(Config.SHEET_CENARIOS_B);
    if (!ws) {
      ws = this._getSheet(Config.SHEET_CENARIOS);
      if (!ws) return [];
    }

    var data = ws.getDataRange().getValues();
    if (data.length < 2) return [];

    var compId = String(competenciaId).toUpperCase().trim();
    var cenarios = [];

    for (var r = 1; r < data.length; r++) {
      // Nova estrutura: col 0=cargo, col 1=escola, col 2=compId, col 3=descricao, ...
      var rowComp = String(data[r][2] || "").toUpperCase().trim();
      if (rowComp === compId) {
        cenarios.push({
          cenario_id: compId + "_B",
          descricao:              String(data[r][3] || ""),
          personagens:            String(data[r][4] || ""),
          situacao_gatilho:       String(data[r][5] || ""),
          pergunta_aprofund_1:    String(data[r][6] || ""),
          pergunta_aprofund_2:    String(data[r][7] || ""),
          pergunta_raciocinio:    String(data[r][8] || ""),
          pergunta_cis:           String(data[r][9] || ""),
          objetivo_conversacional:String(data[r][10] || ""),
          fase: "B"
        });
        break; // pegar o primeiro match por competencia
      }
    }

    return cenarios;
  },

  /**
   * Lê cenário B da aba Cenarios_B por cargo+escola+competencia.
   * Resolve cargo e escola do colaborador automaticamente.
   */
  getCenarioB(colaboradorId, competenciaId) {
    var ws = this._getSheet(Config.SHEET_CENARIOS_B);
    if (!ws) return null;

    // Resolver cargo e escola do colaborador
    var colab = this.getColaborador(colaboradorId);
    if (!colab) return null;

    var cargo = String(colab.cargo || "").toLowerCase().trim();
    var escola = String(colab.area || "").toLowerCase().trim();
    var compId = String(competenciaId).toUpperCase().trim();

    var data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    for (var r = 1; r < data.length; r++) {
      // Nova estrutura: col 0=cargo, col 1=escola, col 2=compId
      var rowCargo = String(data[r][0] || "").toLowerCase().trim();
      var rowEscola = String(data[r][1] || "").toLowerCase().trim();
      var rowComp = String(data[r][2] || "").toUpperCase().trim();

      if (rowCargo === cargo && rowEscola === escola && rowComp === compId) {
        return {
          cenario_id: compId + "_B",
          descricao:              String(data[r][3] || ""),
          personagens:            String(data[r][4] || ""),
          situacao_gatilho:       String(data[r][5] || ""),
          pergunta_aprofund_1:    String(data[r][6] || ""),
          pergunta_aprofund_2:    String(data[r][7] || ""),
          pergunta_raciocinio:    String(data[r][8] || ""),
          pergunta_cis:           String(data[r][9] || ""),
          objetivo_conversacional:String(data[r][10] || ""),
          fase: "B"
        };
      }
    }

    return null;
  },

  /**
   * Lê resultado do diagnóstico (Fase 1 / Forms) para baseline.
   * Busca na aba Respostas + parseia Payload IA4.
   */
  getDiagnosticResults(cicloId, userId, competenciaId) {
    var ws = this._getSheet("Respostas");
    if (!ws) return null;

    var data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    var email = String(userId).toLowerCase().trim();
    var compId = String(competenciaId).toLowerCase().trim();

    // Col B (1) = E-mail, Col F (5) = ID Competência
    // Col Q (16) = Nível IA4, Col R (17) = Nota IA4
    // Col S (18) = Pontos Fortes, Col T (19) = Pontos de Atenção
    // Col W (22) = Payload IA4

    for (var r = 1; r < data.length; r++) {
      var rowEmail = String(data[r][1] || "").toLowerCase().trim();
      var rowComp = String(data[r][5] || "").toLowerCase().trim();

      if (rowEmail === email && rowComp === compId) {
        var nivel = data[r][16] || "";
        var nota = data[r][17] || "";
        var pontosFortes = String(data[r][18] || "");
        var pontosAtencao = String(data[r][19] || "");
        var payloadRaw = String(data[r][22] || "");

        var pdi = null;
        var perfilDados = null;
        if (payloadRaw && payloadRaw.length > 10) {
          try {
            var payload = JSON.parse(payloadRaw);

            var focos = [];
            if (payload.plano) {
              if (payload.plano.semana_1_2 && payload.plano.semana_1_2.foco) {
                focos.push("Sem 1-2: " + payload.plano.semana_1_2.foco);
              }
              if (payload.plano.semana_3 && payload.plano.semana_3.foco) {
                focos.push("Sem 3: " + payload.plano.semana_3.foco);
              }
              if (payload.plano.semana_4 && payload.plano.semana_4.foco) {
                focos.push("Sem 4: " + payload.plano.semana_4.foco);
              }
            }

            var checklist = [];
            if (payload.cola && Array.isArray(payload.cola)) {
              checklist = payload.cola;
            }

            var estudo = payload.links || "";

            if (payload.perfil_dados) {
              perfilDados = {
                perfil: payload.perfil_dados.perfil || "",
                implicacao: payload.perfil_dados.implicacao_no_cargo || ""
              };
            }

            var dicas = [];
            if (payload.dicas && Array.isArray(payload.dicas)) {
              dicas = payload.dicas;
            }

            pdi = {
              focos_desenvolvimento: focos,
              checklist_tatico: checklist,
              estudo_recomendado: estudo,
              dicas: dicas
            };

          } catch(e) {
            Logger.log("getDiagnosticResults: erro ao parsear Payload IA4: " + e.message);
          }
        }

        return {
          nivel: nivel,
          nota: nota,
          pontos_fortes: pontosFortes,
          pontos_atencao: pontosAtencao,
          evidencias_resumo: pontosAtencao,
          lacuna: pontosAtencao,
          pdi: pdi,
          perfil_dados: perfilDados
        };
      }
    }

    return null;
  },

  /**
   * Lê régua completa da aba Regua Maturidade.
   */
  getReguaMaturidade(cargo, competenciaNome) {
    // V2: Gerar régua dinâmica a partir dos descritores da aba Competencias_v2
    try {
      var ss = this._ss || SpreadsheetApp.getActiveSpreadsheet();
      var mapaV2 = _lerBaseCompetenciasV2(ss);
      if (mapaV2 && Object.keys(mapaV2).length > 0) {
        var compNorm = String(competenciaNome || "").toLowerCase().trim();
        var cargoNorm = String(cargo || "").toLowerCase().trim();

        // Buscar por nome da competência (match parcial)
        var keys = Object.keys(mapaV2);
        for (var i = 0; i < keys.length; i++) {
          var comp = mapaV2[keys[i]];
          var nomeNorm = comp.nome.toLowerCase().trim();
          var cargoComp = (comp.cargo || '').toLowerCase().trim();
          var matchComp = nomeNorm === compNorm || nomeNorm.indexOf(compNorm) >= 0 || compNorm.indexOf(nomeNorm) >= 0;
          var matchCargo = !cargoNorm || cargoComp.indexOf(cargoNorm) >= 0 || cargoNorm.indexOf(cargoComp) >= 0;

          if (matchComp && matchCargo) {
            return _gerarReguaDeDescritores(comp);
          }
        }

        // Fallback: match só por competência
        for (var i = 0; i < keys.length; i++) {
          var comp = mapaV2[keys[i]];
          var nomeNorm = comp.nome.toLowerCase().trim();
          if (nomeNorm === compNorm || nomeNorm.indexOf(compNorm) >= 0 || compNorm.indexOf(nomeNorm) >= 0) {
            return _gerarReguaDeDescritores(comp);
          }
        }
      }
    } catch(e) {
      Logger.log('getReguaMaturidade V2 erro: ' + e.message);
    }

    // Fallback legado: aba Regua Maturidade (será removida)
    var ws = this._getSheet("Regua Maturidade");
    if (!ws) return null;

    var data = ws.getDataRange().getValues();
    if (data.length < 2) return null;

    var cargoNorm = String(cargo || "").toLowerCase().trim();
    var compNorm = String(competenciaNome || "").toLowerCase().trim();

    for (var r = 1; r < data.length; r++) {
      var rowCargo = String(data[r][0] || "").toLowerCase().trim();
      var rowComp = String(data[r][1] || "").toLowerCase().trim();

      var matchCargo = rowCargo.indexOf(cargoNorm) >= 0 || cargoNorm.indexOf(rowCargo) >= 0;
      var matchComp = rowComp === compNorm
        || rowComp.indexOf(compNorm) >= 0
        || compNorm.indexOf(rowComp) >= 0;

      if (matchCargo && matchComp) {
        return String(data[r][2] || "");
      }
    }

    for (var r = 1; r < data.length; r++) {
      var rowComp = String(data[r][1] || "").toLowerCase().trim();
      if (rowComp === compNorm || rowComp.indexOf(compNorm) >= 0 || compNorm.indexOf(rowComp) >= 0) {
        return String(data[r][2] || "");
      }
    }

    return null;
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CICLO — verificação de completude
  // ══════════════════════════════════════════════════════════════════════════

  checkAllSessionsCompleted(cicloId) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return false;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return false;

    const headers = data[0];
    const iCiclo  = this._colIdx(headers, 'ciclo_id');
    const iStatus = this._colIdx(headers, 'status');

    const sessoesDoCiclo = data.slice(1).filter(r =>
      String(r[iCiclo]) === String(cicloId));

    if (sessoesDoCiclo.length === 0) return false;

    return sessoesDoCiclo.every(r =>
      String(r[iStatus]).toLowerCase() === 'concluida');
  },

  // ══════════════════════════════════════════════════════════════════════════
  // AÇÕES PENDENTES (polling AppSheet → GAS)
  // ══════════════════════════════════════════════════════════════════════════

  createPendingAction(cicloId, actionType, params) {
    const ws = this._ensureSheet(Config.SHEET_ACOES_PENDENTES, [
      'acao_id', 'tipo', 'parametros', 'status', 'solicitado_por',
      'criado_em', 'processado_em'
    ]);

    ws.appendRow([
      Utilities.getUuid(),
      actionType,
      JSON.stringify(params || {}),
      'pendente',
      'sistema',
      new Date().toISOString(),
      ''
    ]);
  },

  updateAcaoPendente(cicloId, tipo, novoStatus) {
    const ws = this._getSheet(Config.SHEET_ACOES_PENDENTES);
    if (!ws) return;

    const data = ws.getDataRange().getValues();
    const headers = data[0];
    const iTipo   = this._colIdx(headers, 'tipo');
    const iStatus = this._colIdx(headers, 'status');
    const iProc   = this._colIdx(headers, 'processado_em');

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iTipo]) === tipo) {
        const params = JSON.parse(data[r][this._colIdx(headers, 'parametros')] || '{}');
        if (params.ciclo_id === cicloId) {
          ws.getRange(r + 1, iStatus + 1).setValue(novoStatus);
          ws.getRange(r + 1, iProc + 1).setValue(new Date().toISOString());
          return;
        }
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DIAGNÓSTICO (para DiagnosticProcessor)
  // ══════════════════════════════════════════════════════════════════════════

  getFormResponses(cicloId) {
    const ws = this._getSheet(Config.SHEET_RESPOSTAS);
    if (!ws) return [];

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0];
    const iColab    = this._colIdxFlex(headers, ['id colaborador', 'e-mail', 'email']);
    const iComp     = this._colIdxFlex(headers, ['nome competencia', 'competencia']);
    const iCompId   = this._colIdxFlex(headers, ['id competencia', 'competencia_id']);
    const iResposta = this._colIdxFlex(headers, ['resposta', 'resposta colaborador']);
    const iCenario  = this._colIdxFlex(headers, ['cenario', 'cenario_id']);
    const iStatus   = this._colIdxFlex(headers, ['status ia 4', 'status ia4', 'status']);

    return data.slice(1)
      .filter(row => row[iColab] && row[iResposta])
      .map(row => ({
        colaborador_id: String(row[iColab]),
        competencia_id: iCompId >= 0 ? String(row[iCompId]) : String(row[iComp]),
        cenario_id:     iCenario >= 0 ? String(row[iCenario]) : '',
        resposta:       String(row[iResposta]),
        status:         iStatus >= 0 ? String(row[iStatus]) : ''
      }));
  },

  saveDiagnosticResult(cicloId, colaboradorId, competencia, parsed) {
    const ws = this._ensureSheet(Config.SHEET_RESULTADOS_DIAG, [
      'resultado_id', 'ciclo_id', 'colaborador_id', 'competencia',
      'nivel', 'confianca', 'evidencias', 'lacuna', 'resumo', 'created_at'
    ]);

    ws.appendRow([
      Utilities.getUuid(),
      cicloId,
      colaboradorId,
      competencia,
      parsed.nivel || '',
      parsed.confianca || '',
      JSON.stringify(parsed.evidencias || []),
      parsed.lacuna || '',
      parsed.resumo || '',
      new Date().toISOString()
    ]);
  },

  markDiagnosticError(cicloId, colaboradorId, errorMsg) {
    const ws = this._ensureSheet(Config.SHEET_RESULTADOS_DIAG, [
      'resultado_id', 'ciclo_id', 'colaborador_id', 'competencia',
      'nivel', 'confianca', 'evidencias', 'lacuna', 'resumo', 'created_at'
    ]);

    ws.appendRow([
      Utilities.getUuid(),
      cicloId,
      colaboradorId,
      'ERRO',
      '', '', '', '', 'Erro: ' + errorMsg,
      new Date().toISOString()
    ]);
  },

  getCenario(cenarioId) {
    const ws = this._getSheet(Config.SHEET_CENARIOS);
    if (!ws) return null;

    const data = ws.getDataRange().getValues();
    const headers = data[0];
    const iId = this._colIdxFlex(headers, ['cenario_id', 'id']);

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iId]) === String(cenarioId)) {
        return this._rowToCenario(headers, data[r]);
      }
    }
    return null;
  },

  /**
   * Grava o file ID do Drive na aba Sessoes.
   */
  updateDriveFileId(sessaoId, fileId) {
    var ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return;

    var data = ws.getDataRange().getValues();
    var headers = data[0];

    var iFileId = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).toLowerCase().indexOf("drive_file") >= 0) {
        iFileId = c;
        break;
      }
    }

    if (iFileId < 0) {
      iFileId = headers.length;
      ws.getRange(1, iFileId + 1).setValue("drive_file_id");
    }

    var iSessaoId = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).toLowerCase().indexOf("sessao_id") >= 0) {
        iSessaoId = c;
        break;
      }
    }

    for (var r = 1; r < data.length; r++) {
      if (String(data[r][iSessaoId] || "") === sessaoId) {
        ws.getRange(r + 1, iFileId + 1).setValue(fileId);
        return;
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS INTERNOS
  // ══════════════════════════════════════════════════════════════════════════

  _getSheet(name) {
    try {
      const ss = SpreadsheetApp.openById(Config.MAIN_SHEET_ID);
      return ss.getSheetByName(name);
    } catch (e) {
      Logger.log('_getSheet(' + name + '): ' + e.message);
      return null;
    }
  },

  _ensureSheet(name, headers) {
    const ss = SpreadsheetApp.openById(Config.MAIN_SHEET_ID);
    let ws = ss.getSheetByName(name);
    if (!ws) {
      ws = ss.insertSheet(name);
      ws.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      ws.setFrozenRows(1);
      Logger.log('StateManager: aba "' + name + '" criada com ' + headers.length + ' colunas.');
    }
    return ws;
  },

  _colIdx(headers, name) {
    const n = String(name).toLowerCase().trim();
    return headers.findIndex(h => String(h).toLowerCase().trim() === n);
  },

  _colIdxFlex(headers, names) {
    for (const name of names) {
      const n = name.toLowerCase();
      const idx = headers.findIndex(h => {
        const hn = String(h || '').toLowerCase().trim();
        return hn === n || hn.includes(n);
      });
      if (idx >= 0) return idx;
    }
    return -1;
  },

  _findEmailCol(headers) {
    return headers.findIndex(h => {
      const n = String(h || '').toLowerCase();
      return (n.includes('e-mail') || n.includes('email')) &&
        (n.includes('corporat') || n.includes('colaborador') || !n.includes('gestor'));
    });
  },

  _rowToSession(headers, row, rowNum) {
    const obj = { _rowNum: rowNum };
    headers.forEach((h, i) => {
      const key = String(h).trim();
      let val = row[i];

      if (['history', 'cenarios', 'baseline', 'evidencias', 'validacao'].includes(key)) {
        try {
          val = JSON.parse(val || (key === 'history' || key === 'cenarios' ? '[]' : 'null'));
        } catch (e) {
          val = key === 'history' || key === 'cenarios' ? [] : null;
        }
      }

      if (key === 'contraexemplo_usado') {
        val = val === true || val === 'true' || val === 'TRUE';
      }

      if (['aprofundamentos_cenario1', 'aprofundamentos_cenario2', 'cenario_atual',
           'nivel', 'confianca'].includes(key)) {
        val = Number(val) || 0;
      }

      obj[key] = val;
    });
    return obj;
  },

  _rowToCompetencia(headers, row) {
    const obj = {};
    headers.forEach((h, i) => {
      const key = String(h).toLowerCase().trim()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_');
      obj[key] = row[i] || '';
    });

    return {
      competencia_id: obj.competencia_id || obj.id || obj.codigo || '',
      nome:      obj.nome || obj.competencia || obj.compet_ncia || '',
      definicao: obj.definicao || obj.defini__o || obj.descricao || '',
      nivel1:    obj.nivel1 || obj.nivel_1 || obj.n_vel_1 || '',
      nivel2:    obj.nivel2 || obj.nivel_2 || obj.n_vel_2 || '',
      nivel3:    obj.nivel3 || obj.nivel_3 || obj.n_vel_3 || '',
      nivel4:    obj.nivel4 || obj.nivel_4 || obj.n_vel_4 || '',
      nivel5:    obj.nivel5 || obj.nivel_5 || obj.n_vel_5 || ''
    };
  },

  _rowToCenario(headers, row) {
    const obj = {};
    headers.forEach((h, i) => {
      obj[String(h).toLowerCase().trim().replace(/\s+/g, '_')] = row[i] || '';
    });

    return {
      cenario_id:  obj.cenario_id || obj.id || '',
      descricao:   obj.descricao || obj.descrição || obj.cenario || obj.cenário || '',
      fase:        obj.fase || obj.tipo || 'B',
      complexidade_score: obj.complexidade_score || obj.complexidade || '',
      pergunta_aprofund_1: obj.pergunta_aprofund_1 || obj.aprofundamento_1 || obj.aprofundamento_a || '',
      pergunta_aprofund_2: obj.pergunta_aprofund_2 || obj.aprofundamento_2 || obj.aprofundamento_b || '',
      ancora_nivel2: obj.ancora_nivel2 || obj.ancora_n2 || obj.âncora_n2 || '',
      ancora_nivel3: obj.ancora_nivel3 || obj.ancora_n3 || obj.âncora_n3 || '',
      ancora_nivel4: obj.ancora_nivel4 || obj.ancora_n4 || obj.âncora_n4 || '',
      ancora_nivel5: obj.ancora_nivel5 || obj.ancora_n5 || obj.âncora_n5 || ''
    };
  },

  _updateSessionField(sessaoId, fieldName, value) {
    const ws = this._getSheet(Config.SHEET_SESSOES);
    if (!ws) return;

    const data = ws.getDataRange().getValues();
    if (data.length < 2) return;

    const headers = data[0];
    const iSessId = this._colIdx(headers, 'sessao_id');
    const iField  = this._colIdx(headers, fieldName);

    if (iField < 0) {
      Logger.log('_updateSessionField: campo "' + fieldName + '" não encontrado');
      return;
    }

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][iSessId]) === String(sessaoId)) {
        ws.getRange(r + 1, iField + 1).setValue(value);
        return;
      }
    }
  }
};