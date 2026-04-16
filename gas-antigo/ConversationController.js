// =====================================================================
// VERTHO - ConversationController.gs  (Fase 3 v5 — UNIFICADO)
//
// Arquivo UNICO que substitui:
//   - ConversationController.gs (original)
//   - ConversationControllerPatch.gs (v4)
//
// Dependencias: Config.gs, StateManager.gs, DriveStorage.gs,
//               PromptBuilder.gs, AIRouter.gs
// =====================================================================


// ── UTILS GLOBAIS ────────────────────────────────────────────────────

function _stripInvisible(text) {
  if (!text) return "";
  var cleaned = text;
  cleaned = cleaned.replace(/\[META\][\s\S]*?\[\/META\]/g, "");
  cleaned = cleaned.replace(/\[EVAL\][\s\S]*?\[\/EVAL\]/g, "");
  cleaned = cleaned.replace(/```json[\s\S]*?```/g, "");
  return cleaned.trim();
}

function _parseMeta(text) {
  if (!text) return null;
  var match = text.match(/\[META\]([\s\S]*?)\[\/META\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch (e) { return null; }
}

function _parseEval(text) {
  if (!text) return null;
  var match = text.match(/\[EVAL\]([\s\S]*?)\[\/EVAL\]/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch (e) { return null; }
}

function _paraSegundaPessoa(texto, nomeColaborador) {
  if (!texto || !nomeColaborador) return texto;
  var p = nomeColaborador.split(" ")[0];
  var result = texto;
  result = result.replace(new RegExp(p + " e ", "gi"), "Voce e ");
  result = result.replace(new RegExp(p + " esta ", "gi"), "Voce esta ");
  result = result.replace(new RegExp(p + " lidera", "gi"), "Voce lidera");
  result = result.replace(new RegExp(p + " apresenta", "gi"), "Voce apresenta");
  result = result.replace(new RegExp(p + " \\(", "gi"), "Voce (");
  return result;
}

function _resolverNome(state) {
  if (state.colaborador && state.colaborador.nome) {
    return state.colaborador.nome.split(" ")[0];
  }
  if (state.userName && state.userName !== "Colaborador") {
    return state.userName.split(" ")[0];
  }
  try {
    var colab = StateManager.getColaborador(state.colaborador_id);
    if (colab && colab.nome) return colab.nome.split(" ")[0];
  } catch(e) {}
  var email = state.colaborador_id || "";
  var parte = email.split("@")[0] || "";
  if (parte.length > 2) {
    return parte.charAt(0).toUpperCase() + parte.slice(1);
  }
  return "voce";
}

function _salvarTurno(state, role, content) {
  if (role === "assistant") {
    try {
      var hist = DriveStorage.getHistory(state.sessao_id, state.ciclo_id, state.colaborador_id) || [];
      if (hist.length > 0 && hist[hist.length - 1].role === "assistant") {
        Logger.log("AVISO: Turno assistant duplicado prevenido.");
        return;
      }
    } catch(e) {}
  }
  try {
    DriveStorage.addTurn(state.sessao_id, state.ciclo_id, state.colaborador_id, role, content);
  } catch (e) {
    Logger.log("_salvarTurno Drive erro: " + e.message);
  }
  try {
    StateManager.addToHistory(state.sessao_id, role, content);
  } catch (e2) {}
}

function _incrementarAprofundamento(state) {
  var novoValor = (state.aprofundamentos_cenario1 || 0) + 1;
  try { StateManager.incrementAprofundamento(state.sessao_id, 1); } catch(e) {}
  try {
    DriveStorage.updateConversation(state.sessao_id, state.ciclo_id, state.colaborador_id, {
      aprofundamentos_cenario1: novoValor
    });
  } catch(e) {}
  state.aprofundamentos_cenario1 = novoValor;
}


// ══════════════════════════════════════════════════════════════════════
// OBJETO PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

var ConversationController = {

  // ── ENTRY POINT (chamado pelo Main.gs) ─────────────────────────────

  process: function(data) {
    var userId = data.userId;
    var userName = data.userName;
    var message = data.message;

    var state = StateManager.getActiveSession(userId);

    if (!state) {
      state = this._initSession(userId, userName);
      if (!state) {
        return { message: "Nao ha avaliacoes pendentes para voce no momento." };
      }
    }

    if (this._isTimedOut(state)) {
      // Retomar sessao pausada em vez de descartar
      try { StateManager.updateLastActivity(state.sessao_id); } catch(e) {}
      var nomeRetorno = (userName || "").split(" ")[0] || "voce";
      return {
        message: "Ola de novo, " + nomeRetorno
          + "! Vamos continuar de onde paramos. Pode enviar sua resposta."
      };
    }

    try { StateManager.updateLastActivity(state.sessao_id); } catch(e) {}

    return this._routeByPhase(state, message, userName);
  },

  // ── REAVALIACAO (chamado pelo AppSheet) ────────────────────────────

  reevaluate: function(sessaoId) {
    var state = StateManager.getSession(sessaoId);
    if (!state) return { resultado: { erro: "Sessao nao encontrada" } };

    var evalResult = this._runEvaluationForced(state);
    var validation = this._runValidation(state, evalResult);
    StateManager.saveSessionResult(sessaoId, evalResult, validation);
    return { resultado: evalResult };
  },

  // ── ROTEAMENTO ─────────────────────────────────────────────────────

  _routeByPhase: function(state, message, userName) {
    switch (state.fase) {
      case "nova":            return this._handleNova(state, userName);
      case "consentimento":   return this._handleConsentimento(state, message);
      case "introducao":      return this._handleIntroducao(state, message, userName);
      case "cenario":         return this._handleCenario(state, message);
      case "aprofundamento":  return this._handleAprofundamento(state, message);
      case "contraexemplo":   return this._handleContraexemplo(state, message);
      case "segundo_cenario": return this._handleSegundoCenario(state, message);
      case "aprofundamento_2":return this._handleAprofundamento2(state, message);
      case "encerramento":    return this._handleEncerramento(state, message);
      case "concluida":       return { message: "Esta sessao ja foi concluida." };
      default:
        Logger.log("Fase desconhecida: " + state.fase);
        return { message: "Ocorreu um erro na sessao." };
    }
  },


  // ══════════════════════════════════════════════════════════════════
  // HANDLERS POR FASE (do Patch v4)
  // ══════════════════════════════════════════════════════════════════

  // ── FASE: nova ─────────────────────────────────────────────────────

  _handleNova: function(state, userName) {
    // ── Carregar cenarios e baseline se vazios (ex: criarSessaoTeste) ──
    if (!state.cenarios || state.cenarios.length === 0) {
      try {
        state.cenarios = StateManager.getCenariosForSession(
          state.competencia_id, "B", state.colaborador_id
        ) || [];
        Logger.log("Cenarios carregados em _handleNova: " + state.cenarios.length);
      } catch(e) {
        Logger.log("Erro ao carregar cenarios: " + e.message);
      }
    }

    if (!state.baseline) {
      try {
        state.baseline = StateManager.getDiagnosticResults(
          state.ciclo_id, state.colaborador_id, state.competencia_id
        );
      } catch(e) {}
    }

    if (!state.colaborador) {
      try {
        state.colaborador = StateManager.getColaborador(state.colaborador_id);
      } catch(e) {}
    }

    // Salvar state atualizado no Sheets
    try { StateManager.saveSessionState(state); } catch(e) {}

    // ── Fluxo normal ────────────────────────────────────────────────
    var primeiraVez = false;
    try {
      primeiraVez = !StateManager.hasCompletedSessionBefore(state.colaborador_id);
    } catch(e) { primeiraVez = true; }

    var primeiroNome = _resolverNome(state);

    try {
      var fileId = DriveStorage.saveConversation(state);
      if (fileId) StateManager.updateDriveFileId(state.sessao_id, fileId);
    } catch (e) {
      Logger.log("Erro ao criar JSON no Drive: " + e.message);
    }

    if (primeiraVez) {
      StateManager.updateSessionPhase(state.sessao_id, "consentimento");
      var msg = "Ola, " + primeiroNome + "! Sou a Mentor IA da Vertho.\n\n"
        + "Como funciona:\n"
        + "- Teremos uma conversa curta (~10 min)\n"
        + "- Vou apresentar uma situacao do dia a dia para conversarmos\n"
        + "- Nao existem respostas certas ou erradas\n"
        + "- Ao final, voce recebe um plano de desenvolvimento\n\n"
        + "Suas respostas sao confidenciais.\n\n"
        + "Para continuar, digite \"aceito\".";

      _salvarTurno(state, "assistant", msg);
      return { message: msg, tipo: "consentimento" };
    }

    StateManager.updateSessionPhase(state.sessao_id, "introducao");
    return this._gerarIntroducao(state);
  },

  // ── FASE: consentimento ────────────────────────────────────────────

  _handleConsentimento: function(state, message) {
    var aceite = (message || "").toLowerCase().trim();

    if (aceite === "aceito" || aceite === "sim" || aceite === "concordo" || aceite === "ok") {
      try { StateManager.registerConsent(state.colaborador_id, state.sessao_id); } catch(e) {}
      StateManager.updateSessionPhase(state.sessao_id, "introducao");
      _salvarTurno(state, "user", message);
      return this._gerarIntroducao(state);
    }

    // Verificar recusa explicita
    var recusa = (aceite === "nao" || aceite === "não" || aceite === "recuso"
      || aceite === "nao aceito" || aceite === "não aceito" || aceite === "recusar");

    if (recusa) {
      StateManager.updateSessionStatus(state.sessao_id, "recusado_lgpd");
      var msgRecusa = "Tudo bem! Sua participacao e voluntaria. "
        + "Se mudar de ideia, entre em contato com seu gestor. Obrigado!";
      _salvarTurno(state, "assistant", msgRecusa);
      return { message: msgRecusa, tipo: "encerrado" };
    }

    var reply = "Para participar, digite \"aceito\". Se preferir nao participar, digite \"nao\".";
    _salvarTurno(state, "assistant", reply);
    return { message: reply, tipo: "consentimento" };
  },

  // ── FASE: introducao ───────────────────────────────────────────────

  _gerarIntroducao: function(state) {
    var comp = null;
    try { comp = StateManager.getCompetencia(state.competencia_id); } catch(e) {}
    var compNome = comp ? comp.nome : state.competencia;
    var primeiroNome = _resolverNome(state);

    var msg = "Ola, " + primeiroNome + "! Sou a Mentor IA da Vertho.\n\n"
      + "Hoje vamos conversar sobre **" + compNome + "** "
      + "- uma conversa rapida sobre situacoes do seu dia a dia. "
      + "Nao existem respostas certas ou erradas.\n\n"
      + "Pronto para comecar?";

    _salvarTurno(state, "assistant", msg);
    return { message: msg };
  },

  _handleIntroducao: function(state, message, userName) {
    StateManager.updateSessionPhase(state.sessao_id, "cenario");
    _salvarTurno(state, "user", message);
    return this._apresentarCenario(state);
  },

  // ── FASE: cenario — APRESENTACAO ───────────────────────────────────

  _apresentarCenario: function(state) {
    var cenarios = state.cenarios || [];
    if (cenarios.length === 0) {
      return this._iniciarEncerramento(state);
    }

    var cenario = cenarios[0];
    StateManager.updateSessionPhase(state.sessao_id, "cenario");
    StateManager.setCurrentCenario(state.sessao_id, 1);

    var primeiroNome = _resolverNome(state);

    var contexto = _paraSegundaPessoa(cenario.descricao || "", primeiroNome);
    var gatilho = _paraSegundaPessoa(cenario.situacao_gatilho || "", primeiroNome);
    var personagens = _paraSegundaPessoa(cenario.personagens || "", primeiroNome);

    var instrucao = "REGRAS PARA ESTA MENSAGEM:\n"
      + "- NAO se apresente. NAO cumprimente. VA DIRETO ao cenario.\n"
      + "- Trate como VOCE (2a pessoa).\n"
      + "- Descreva a situacao e termine com UMA pergunta aberta.\n"
      + "- NAO julgue, NAO sugira, NAO de exemplos, NAO ofereca opcoes.\n"
      + "- Inclua [META] no final.\n\n"
      + "CENARIO:\n"
      + "Contexto: " + contexto + "\n";
    if (personagens) instrucao += "Personagens: " + personagens + "\n";
    if (gatilho) instrucao += "Situacao-gatilho: " + gatilho + "\n";
    if (cenario.objetivo_conversacional) {
      instrucao += "OBJETIVO: " + cenario.objetivo_conversacional + "\n";
    }

    try {
      var prompt = PromptBuilder.build(state, instrucao);
      var response = AIRouter.callClaude(prompt, "cenario");
      var visible = _stripInvisible(response);

      _salvarTurno(state, "assistant", visible);
      return { message: visible, fase: "cenario" };

    } catch (error) {
      Logger.log("ERRO ao apresentar cenario: " + error.message);
      return {
        message: "Houve uma instabilidade na conexao. Envie qualquer mensagem para continuarmos.",
        retry: true
      };
    }
  },

  // ── HANDLER UNIFICADO DE CONVERSA ──────────────────────────────────

  _handleCenario: function(state, message) {
    return this._handleConversaTurno(state, message);
  },
  _handleAprofundamento: function(state, message) {
    return this._handleConversaTurno(state, message);
  },
  _handleContraexemplo: function(state, message) {
    return this._handleConversaTurno(state, message);
  },
  _handleSegundoCenario: function(state, message) {
    return this._handleConversaTurno(state, message);
  },
  _handleAprofundamento2: function(state, message) {
    return this._handleConversaTurno(state, message);
  },

  _handleConversaTurno: function(state, message) {
    if (!message || message.trim().length < 3) {
      return { message: "Pode compartilhar o que voce faria nessa situacao?" };
    }

    _salvarTurno(state, "user", message);

    if (message.trim().length < Config.MIN_MESSAGE_LENGTH) {
      var shortReply = "Pode contar com mais detalhes?";
      _salvarTurno(state, "assistant", shortReply);
      return { message: shortReply };
    }

    var aprofundamentos = (state.aprofundamentos_cenario1 || 0);

    if (aprofundamentos >= Config.MAX_APROFUNDAMENTOS) {
      Logger.log("Trava: max " + Config.MAX_APROFUNDAMENTOS + " aprofundamentos atingido");
      return this._iniciarEncerramento(state);
    }

    try {
      var prompt = PromptBuilder.build(state, message);
      var response = AIRouter.callClaude(prompt, "aprofundamento");

      var meta = _parseMeta(response);
      var visible = _stripInvisible(response);

      if (meta) {
        Logger.log("META: " + meta.proximo_passo
          + " | confianca=" + meta.confianca_parcial
          + " | evidencias=" + (meta.evidencias_coletadas ? meta.evidencias_coletadas.length : 0)
          + " | aprofundamentos=" + aprofundamentos);
      }

      _salvarTurno(state, "assistant", visible);

      var proximoPasso = meta ? meta.proximo_passo : "aprofundar";

      if (proximoPasso === "encerrar") {
        var confianca = meta ? (meta.confianca_parcial || 0) : 0;

        if (confianca < Config.CONFIANCA_MINIMA_ENCERRAR && aprofundamentos < 2) {
          Logger.log("Trava: confianca " + confianca + " com " + aprofundamentos + " turnos");
          _incrementarAprofundamento(state);
          StateManager.updateSessionPhase(state.sessao_id, "aprofundamento");
          return { message: visible };
        }

        var evalResult = _parseEval(response);
        return this._finalizarSessao(state, visible, evalResult);

      } else if (proximoPasso === "contraexemplo") {
        StateManager.updateSessionPhase(state.sessao_id, "contraexemplo");
        try { StateManager.markContraexemploUsed(state.sessao_id); } catch(e) {}
        _incrementarAprofundamento(state);
        return { message: visible };

      } else {
        StateManager.updateSessionPhase(state.sessao_id, "aprofundamento");
        _incrementarAprofundamento(state);
        return { message: visible };
      }

    } catch (error) {
      Logger.log("ERRO turno sessao " + state.sessao_id + ": " + error.message);
      _salvarTurno(state, "system", "ERRO: " + error.message);
      try { StateManager.updateLastActivity(state.sessao_id); } catch (e) {}

      return {
        message: "Houve uma instabilidade momentanea. Pode repetir o que voce disse?",
        retry: true
      };
    }
  },

  // ── FASE: encerramento ─────────────────────────────────────────────

  _handleEncerramento: function(state, message) {
    return {
      message: "Esta sessao ja foi encerrada. Voce recebera retorno em breve."
    };
  },


  // ══════════════════════════════════════════════════════════════════
  // FINALIZACAO E AVALIACAO
  // ══════════════════════════════════════════════════════════════════

  _finalizarSessao: function(state, feedbackMessage, evalFromMeta) {
    StateManager.updateSessionPhase(state.sessao_id, "encerramento");

    var evalResult = evalFromMeta;

    if (!evalResult) {
      try {
        Logger.log("Rodando avaliacao separada para sessao " + state.sessao_id);
        evalResult = this._runEvaluationForced(state);
      } catch (error) {
        Logger.log("ERRO avaliacao: " + error.message);
        try {
          Utilities.sleep(2000);
          evalResult = this._runEvaluationForced(state);
        } catch (error2) {
          Logger.log("ERRO avaliacao retry: " + error2.message);
          StateManager.updateSessionStatus(state.sessao_id, "erro_avaliacao");
          return { message: feedbackMessage };
        }
      }
    }

    var validation = { validacao: "pendente" };
    try {
      validation = this._runValidation(state, evalResult);
    } catch (error) {
      Logger.log("ERRO validacao: " + error.message);
    }

    try {
      StateManager.saveSessionResult(state.sessao_id, evalResult, validation);
      StateManager.updateSessionStatus(state.sessao_id, "concluida");
    } catch (e) {
      Logger.log("ERRO salvar resultado Sheets: " + e.message);
    }

    try {
      DriveStorage.updateConversation(state.sessao_id, state.ciclo_id, state.colaborador_id, {
        resultado: evalResult,
        validacao: validation,
        status: "concluida",
        fase: "encerramento"
      });
    } catch (e) {
      Logger.log("ERRO salvar resultado Drive: " + e.message);
    }

    try { this._checkCycleCompletion(state); } catch (e) {}

    return { message: feedbackMessage };
  },

  _runEvaluationForced: function(state) {
    var evalPrompt = PromptBuilder.build(
      state,
      "[INSTRUCAO DO SISTEMA — NAO VISIVEL AO COLABORADOR]\n"
      + "A conversa acabou. Gere APENAS o bloco de avaliacao.\n"
      + "Analise todo o historico desta conversa.\n"
      + "Processo: EXTRAIR evidencias -> MAPEAR na regua -> VERIFICAR -> CLASSIFICAR\n\n"
      + "Responda SOMENTE com o bloco [EVAL] completo (estrutura v2 com consolidacao, avaliacao_por_resposta, descritores_destaque, feedback personalizado e recomendacoes_pdi).\n"
      + "Siga TODAS as regras de avaliacao do system prompt (descritores, travas, CIS, PDI)."
    );

    var response = AIRouter.callClaude(evalPrompt, "avaliacao");
    var evalResult = _parseEval(response);

    if (!evalResult) {
      try {
        var cleaned = response.replace(/```json|```/g, "").trim();
        var match = cleaned.match(/\{[\s\S]*\}/);
        if (match) evalResult = JSON.parse(match[0]);
      } catch(e) {}
    }

    if (!evalResult) {
      throw new Error("Nao foi possivel parsear [EVAL] da resposta");
    }

    Logger.log("EVAL gerado: nivel=" + evalResult.nivel + " nota=" + (evalResult.nota_decimal || "N/A") + " confianca=" + evalResult.confianca);
    return evalResult;
  },

  _iniciarEncerramento: function(state) {
    StateManager.updateSessionPhase(state.sessao_id, "encerramento");

    var primeiroNome = _resolverNome(state);

    try {
      var feedbackPrompt = PromptBuilder.build(
        state,
        "ENCERRE A SESSAO AGORA.\n"
        + "Diga apenas: 'Obrigado pela conversa, " + primeiroNome + ". Voce recebera retorno em breve.'\n"
        + "Inclua [META] com proximo_passo='encerrar' e [EVAL] com a avaliacao v2 completa (consolidacao, avaliacao_por_resposta, descritores_destaque, feedback personalizado, recomendacoes_pdi)."
      );

      var response = AIRouter.callClaude(feedbackPrompt, "avaliacao");
      var visible = _stripInvisible(response);
      var evalResult = _parseEval(response);

      _salvarTurno(state, "assistant", visible);
      return this._finalizarSessao(state, visible, evalResult);

    } catch (error) {
      Logger.log("ERRO encerramento: " + error.message);
      var fallbackMsg = "Obrigado pela conversa, " + primeiroNome + ". Voce recebera retorno em breve.";
      _salvarTurno(state, "assistant", fallbackMsg);
      StateManager.updateSessionStatus(state.sessao_id, "erro_avaliacao");
      return { message: fallbackMsg };
    }
  },

  _runValidation: function(state, evalResult) {
    try {
      var fullState = StateManager.getSession(state.sessao_id);

      // Carregar colaborador com DISC e tracos
      var colaborador = state.colaborador || null;
      if (!colaborador) {
        try { colaborador = StateManager.getColaborador(state.colaborador_id); } catch(e) {}
      }
      var cargo = (colaborador && colaborador.cargo) ? colaborador.cargo : "";
      var compNome = state.competencia || "";

      // Carregar regua completa
      var reguaCompleta = "";
      try {
        reguaCompleta = StateManager.getReguaMaturidade(cargo, compNome) || "";
      } catch(e) {}

      if (!reguaCompleta) {
        try {
          var comp = StateManager.getCompetencia(state.competencia_id);
          if (comp) {
            reguaCompleta = "Nivel 1 (GAP): " + (comp.nivel1 || "") + "\n"
              + "Nivel 2 (EM DESENVOLVIMENTO): " + (comp.nivel2 || "") + "\n"
              + "Nivel 3 (META): " + (comp.nivel3 || "") + "\n"
              + "Nivel 4 (REFERENCIA): " + (comp.nivel4 || "");
          }
        } catch(e) {}
      }

      // Carregar competencia para tracos CIS
      var comp = null;
      try { comp = StateManager.getCompetencia(state.competencia_id); } catch(e) {}
      var tracosCIS = (comp && comp.tracos_cis) ? comp.tracos_cis : [];

      // Montar historico resumido
      var histResumo = "";
      var history = (fullState && fullState.history) ? fullState.history : [];
      for (var i = 0; i < history.length; i++) {
        var h = history[i];
        if (h.role === "user" || h.role === "assistant") {
          var speaker = h.role === "user" ? "Colaborador" : "Mentor IA";
          histResumo += speaker + ": " + String(h.content || "").substring(0, 300) + "\n";
        }
      }

      // Baseline
      var baseline = state.baseline || null;

      // Montar prompt completo
      var parts = [];
      parts.push("Voce e um VALIDADOR de avaliacoes comportamentais da plataforma Vertho.");
      parts.push("");
      parts.push("Sua tarefa: verificar se a avaliacao do Claude esta correta, comparando:");
      parts.push("1. O HISTORICO DA CONVERSA (o que o colaborador realmente disse)");
      parts.push("2. A AVALIACAO gerada (nivel, nota, evidencias)");
      parts.push("3. A REGUA DE MATURIDADE (criterios oficiais por nivel)");
      parts.push("4. Os TRACOS CIS do colaborador (gaps comportamentais)");
      parts.push("5. O BASELINE (nivel anterior + evolucao esperada pelo PDI)");
      parts.push("");

      // Competencia
      parts.push("== COMPETENCIA ==");
      parts.push(compNome);
      parts.push("");

      // Regua
      parts.push("== REGUA DE AVALIACAO ==");
      parts.push(reguaCompleta);
      parts.push("");

      // Tracos CIS cruzados
      if (tracosCIS.length > 0 && colaborador && colaborador.trait_scores) {
        parts.push("== TRACOS CIS DO COLABORADOR (relevantes para esta competencia) ==");
        for (var t = 0; t < tracosCIS.length; t++) {
          var tracoNome = tracosCIS[t];
          var score = null;
          var traitScores = colaborador.trait_scores;
          var traitAliases = colaborador.trait_aliases || {};

          score = traitScores[tracoNome] || null;
          if (!score) {
            var alias = traitAliases[tracoNome.toLowerCase()];
            if (alias) score = traitScores[alias] || null;
          }
          if (!score) {
            var keys = Object.keys(traitScores);
            for (var ki = 0; ki < keys.length; ki++) {
              if (keys[ki].toLowerCase().indexOf(tracoNome.toLowerCase()) >= 0
                  || tracoNome.toLowerCase().indexOf(keys[ki].toLowerCase()) >= 0) {
                score = traitScores[keys[ki]];
                break;
              }
            }
          }

          var label = "";
          if (score !== null) {
            if (score <= 30) label = " = " + score + " >>> GAP CRITICO";
            else if (score <= 40) label = " = " + score + " >> ATENCAO";
            else if (score <= 60) label = " = " + score + " (medio)";
            else label = " = " + score + " (alto)";
          }
          parts.push("- " + tracoNome + label);
        }
        parts.push("");
      }

      // Perfil DISC
      if (colaborador && colaborador.disc_descricao) {
        parts.push("== PERFIL DISC ==");
        parts.push(colaborador.disc_descricao);
        parts.push("");
      }

      // Baseline e PDI
      if (baseline) {
        parts.push("== DIAGNOSTICO ANTERIOR (Fase 1) ==");
        if (baseline.nivel) parts.push("Nivel anterior: " + baseline.nivel);
        if (baseline.nota) parts.push("Nota anterior: " + baseline.nota);
        if (baseline.pontos_atencao) parts.push("Lacunas: " + baseline.pontos_atencao);
        parts.push("");

        if (baseline.pdi) {
          parts.push("== PDI (o que foi trabalhado na Fase 2) ==");
          if (baseline.pdi.focos_desenvolvimento && baseline.pdi.focos_desenvolvimento.length > 0) {
            parts.push("Focos:");
            for (var f = 0; f < baseline.pdi.focos_desenvolvimento.length; f++) {
              parts.push("  - " + baseline.pdi.focos_desenvolvimento[f]);
            }
          }
          if (baseline.pdi.checklist_tatico && baseline.pdi.checklist_tatico.length > 0) {
            parts.push("Checklist tatico:");
            for (var k = 0; k < Math.min(baseline.pdi.checklist_tatico.length, 6); k++) {
              parts.push("  - " + baseline.pdi.checklist_tatico[k]);
            }
          }
          parts.push("");
        }
      }

      // Historico
      parts.push("== HISTORICO DA CONVERSA ==");
      parts.push(histResumo);
      parts.push("");

      // Avaliacao do Claude
      parts.push("== AVALIACAO DO CLAUDE ==");
      parts.push(JSON.stringify(evalResult, null, 2));
      parts.push("");

      // Criterios nota decimal
      parts.push("== CRITERIOS DA NOTA DECIMAL ==");
      parts.push("Parte inteira = nivel. Parte decimal = forca dentro do nivel:");
      parts.push(".00-.25 = minimo do nivel | .26-.50 = com lacunas | .51-.75 = solido | .76-.99 = quase proximo nivel");
      parts.push("");

      // Instrucoes
      parts.push("== INSTRUCOES ==");
      parts.push("Verifique:");
      parts.push("a) As evidencias citadas EXISTEM no historico? (nao foram inventadas)");
      parts.push("b) O nivel atribuido CORRESPONDE a regua? (use as evidencias-chave e regras de ouro)");
      parts.push("c) A nota_decimal e coerente com a forca das evidencias?");
      parts.push("d) A lacuna descrita reflete o que foi observado na conversa?");
      parts.push("e) A avaliacao considerou os gaps CIS do colaborador? (tracos com GAP CRITICO)");
      parts.push("f) A evolucao vs Fase 1 e coerente? (subiu/desceu/manteve faz sentido com as evidencias?)");
      parts.push("");
      parts.push("Na duvida entre dois niveis, o INFERIOR e o correto.");
      parts.push("");
      parts.push("Responda SOMENTE em JSON (sem texto adicional):");
      parts.push('{"validacao":"aprovada|divergente","nivel_sugerido":N,"nota_sugerida":0.00,"evidencias_invalidas":["trechos que nao existem no historico"],"comentario":"explicacao breve da validacao"}');

      var validationPrompt = { fullText: parts.join("\n") };

      var geminiResponse = AIRouter.callGemini(validationPrompt);
      try {
        var cleaned = geminiResponse.replace(/```json|```/g, "").trim();
        var match = cleaned.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      } catch(e) {}

      return { validacao: "pendente", comentario: "Erro no parsing da validacao" };

    } catch (error) {
      Logger.log("ERRO validacao sessao " + state.sessao_id + ": " + error.message);
      return { validacao: "pendente", comentario: "Erro: " + error.message };
    }
  },

  _checkCycleCompletion: function(state) {
    try {
      var cicloId = state.ciclo_id;
      var allCompleted = StateManager.checkAllSessionsCompleted(cicloId);
      if (allCompleted) {
        Logger.log("Ciclo " + cicloId + " completo!");
        try {
          StateManager.createPendingAction(cicloId, "gerar_pdis_lote", { ciclo_id: cicloId });
        } catch(e) {}
      }
    } catch(e) {
      Logger.log("_checkCycleCompletion: " + e.message);
    }
  },


  // ══════════════════════════════════════════════════════════════════
  // INICIALIZACAO E UTILIDADES
  // ══════════════════════════════════════════════════════════════════

  _initSession: function(userId, userName) {
    var pendingSession = null;
    try { pendingSession = StateManager.getNextPendingSession(userId); } catch(e) {}
    if (!pendingSession) return null;

    var cenarios = [];
    try {
      cenarios = StateManager.getCenariosForSession(pendingSession.competencia_id, "B", userId);
    } catch(e) {
      Logger.log("Cenarios nao encontrados: " + e.message);
    }

    var baseline = null;
    try {
      baseline = StateManager.getDiagnosticResults(
        pendingSession.ciclo_id, userId, pendingSession.competencia_id
      );
    } catch(e) {}

    var colaborador = null;
    try { colaborador = StateManager.getColaborador(userId); } catch(e) {}

    var state = {
      sessao_id: pendingSession.sessao_id,
      ciclo_id: pendingSession.ciclo_id,
      colaborador_id: userId,
      colaborador: colaborador,
      userName: userName,
      competencia_id: pendingSession.competencia_id,
      competencia: pendingSession.competencia,
      cenarios: cenarios,
      baseline: baseline,
      fase: "nova",
      history: [],
      aprofundamentos_cenario1: 0,
      aprofundamentos_cenario2: 0,
      contraexemplo_usado: false,
      cenario_atual: 0,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString()
    };

    try { StateManager.saveSessionState(state); } catch(e) {}
    return state;
  },

  _isTimedOut: function(state) {
    if (!state.last_activity) return false;
    var lastActivity = new Date(state.last_activity);
    var now = new Date();
    var diffMinutes = (now - lastActivity) / (1000 * 60);
    return diffMinutes > Config.SESSION_TIMEOUT_MINUTES;
  }

};