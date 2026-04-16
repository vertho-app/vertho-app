// =====================================================================
// VERTHO - SimuladorConversaFase3.gs
//
// Gera conversas simuladas para TODAS as sessoes pendentes.
// Fluxo por sessao:
//   1. Carrega contexto completo (cenario B, baseline, regua, DISC)
//   2. Claude gera conversa COMPLETA simulada (ambos os lados)
//   3. Salva historico no Sheets + Drive
//   4. Roda avaliacao [EVAL] normal
//   5. Roda validacao Gemini normal
//   6. Marca sessao como concluida
//
// IMPORTANTE: Apenas para testes. Gera respostas ficticias com
// distribuicao realista de niveis (30% nivel 1-2, 50% nivel 2-3, 20% nivel 3-4)
//
// Dependencias: Config, StateManager, PromptBuilder, AIRouter, DriveStorage
// =====================================================================


// ══════════════════════════════════════════════════════════════════════
// MENU
// ══════════════════════════════════════════════════════════════════════

function simularConversasFase3Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Simular Conversas — Fase 3",
    "Isso vai gerar conversas simuladas para TODAS as sessoes pendentes.\n\n"
    + "Para cada sessao:\n"
    + "1. Claude gera a conversa completa (mentor + colaborador)\n"
    + "2. Avaliacao [EVAL] e executada normalmente\n"
    + "3. Validacao Gemini e executada normalmente\n\n"
    + "Custo: ~3 chamadas por sessao (simulacao + EVAL + validacao).\n\n"
    + "APENAS PARA TESTES. Continuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = simularConversasFase3();
  ui.alert(
    "Simulacao Concluida!",
    "Sessoes simuladas: " + resultado.simuladas + "\n"
    + "Erros: " + resultado.erros + "\n\n"
    + "As sessoes agora estao 'concluida' e podem ser usadas para gerar relatorios.",
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

function simularConversasFase3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=== SIMULANDO CONVERSAS — FASE 3 ===");

  // 1. Buscar todas as sessoes pendentes
  var sessoes = _simBuscarSessoesPendentes(ss);
  Logger.log("Sessoes pendentes encontradas: " + sessoes.length);
  if (sessoes.length === 0) return { simuladas: 0, erros: 0 };

  var simuladas = 0, erros = 0;

  for (var i = 0; i < sessoes.length; i++) {
    var sessao = sessoes[i];
    Logger.log("--- Sessao " + (i + 1) + "/" + sessoes.length
      + ": " + sessao.colaborador_id + " — " + sessao.competencia + " ---");

    SpreadsheetApp.getActive().toast(
      "[" + Config.modelLabel(Config.MODEL_CONVERSA) + "]\n" + sessao.colaborador_id + " — " + sessao.competencia + " (" + (i + 1) + "/" + sessoes.length + ")",
      "Simulando conversa", 15
    );

    try {
      // 2. Inicializar sessao (carrega cenario, baseline, etc.)
      _simInicializarSessao(sessao);

      // 3. Verificar se ja tem historico (conversa ja feita, so faltou avaliar)
      var jaTemHistorico = false;
      var histExistente = sessao.state.history || [];
      if (typeof histExistente === "string") {
        try { histExistente = JSON.parse(histExistente); } catch(e) { histExistente = []; }
      }
      if (histExistente.length >= 6) {
        jaTemHistorico = true;
        sessao.state.history = histExistente;
        Logger.log("Historico existente: " + histExistente.length + " turnos — pulando para avaliacao");
      }

      if (!jaTemHistorico) {
        // 3b. Gerar conversa simulada via Claude
        var conversa = _simGerarConversa(sessao);
        Logger.log("Conversa gerada: " + conversa.length + " turnos");

        // 4. Salvar historico
        _simSalvarHistorico(sessao, conversa);
      }

      // 5. Rodar avaliacao [EVAL]
      var evalResult = _simRodarAvaliacao(sessao);
      Logger.log("EVAL: nivel=" + (evalResult.nivel || "?") + " nota=" + (evalResult.nota_decimal || "?"));

      // 6. Rodar validacao Gemini
      var validation = _simRodarValidacao(sessao, evalResult);
      Logger.log("Validacao: " + (validation.validacao || "?"));

      // 7. Salvar resultados e marcar como concluida
      _simFinalizarSessao(sessao, evalResult, validation);

      simuladas++;
      Logger.log("OK: " + sessao.colaborador_id + " — " + sessao.competencia);

    } catch (e) {
      Logger.log("ERRO sessao " + sessao.sessao_id + ": " + e.message);
      Logger.log("Stack: " + (e.stack || ""));
      erros++;

      // Marcar como erro para nao tentar de novo
      try {
        StateManager.updateSessionStatus(sessao.sessao_id, "erro_simulacao");
      } catch (e2) {}
    }

    // Pausa entre sessoes para nao estourar rate limits
    if (i < sessoes.length - 1) Utilities.sleep(3000);
  }

  Logger.log("=== RESULTADO: " + simuladas + " simuladas, " + erros + " erros ===");
  return { simuladas: simuladas, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// BUSCAR SESSOES PENDENTES
// ══════════════════════════════════════════════════════════════════════

function _simBuscarSessoesPendentes(ss) {
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  if (!ws) return [];

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h === "sessao_id") idx.sessaoId = c;
    if (h === "ciclo_id") idx.cicloId = c;
    if (h === "colaborador_id") idx.email = c;
    if (h === "competencia_id") idx.compId = c;
    if (h === "competencia") idx.comp = c;
    if (h === "status") idx.status = c;
    if (h === "fase") idx.fase = c;
  }

  var sessoes = [];
  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][idx.status] || "").toLowerCase().trim();
    if (status !== "pendente" && status !== "ativa" && status !== "erro_simulacao") continue;

    sessoes.push({
      sessao_id: String(data[r][idx.sessaoId] || ""),
      ciclo_id: String(data[r][idx.cicloId] || ""),
      colaborador_id: String(data[r][idx.email] || "").toLowerCase().trim(),
      competencia_id: String(data[r][idx.compId] || ""),
      competencia: String(data[r][idx.comp] || ""),
      fase: String(data[r][idx.fase] || "nova"),
      row: r + 1 // 1-indexed para Sheets
    });
  }

  return sessoes;
}


// ══════════════════════════════════════════════════════════════════════
// INICIALIZAR SESSAO
// ══════════════════════════════════════════════════════════════════════

function _simInicializarSessao(sessao) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Ler sessao do Sheets
  var state = StateManager.getSession(sessao.sessao_id);
  if (!state) throw new Error("Sessao nao encontrada: " + sessao.sessao_id);

  // Ler cenarios B direto da aba
  var cenarios = [];
  try {
    var wsCenB = ss.getSheetByName(Config.SHEET_CENARIOS_B || "Cenarios_B");
    if (wsCenB) {
      var dataCenB = wsCenB.getDataRange().getValues();
      for (var r = 1; r < dataCenB.length; r++) {
        var emailCen = String(dataCenB[r][0] || "").toLowerCase().trim();
        var compCen = String(dataCenB[r][1] || "").toLowerCase().trim();
        if (emailCen === sessao.colaborador_id && compCen === sessao.competencia_id.toLowerCase()) {
          cenarios.push({
            descricao: String(dataCenB[r][2] || ""),
            personagens: String(dataCenB[r][3] || ""),
            situacao_gatilho: String(dataCenB[r][4] || ""),
            dimensoes: String(dataCenB[r][5] || "")
          });
          break;
        }
      }
    }
  } catch (e) { Logger.log("Aviso: erro ao ler Cenarios_B: " + e.message); }

  // Ler baseline direto da aba Respostas
  var baseline = {};
  try {
    var wsResp = ss.getSheetByName("Respostas");
    if (wsResp) {
      var dataResp = wsResp.getDataRange().getValues();
      for (var r = 1; r < dataResp.length; r++) {
        var emailResp = String(dataResp[r][1] || "").toLowerCase().trim();
        var compResp = String(dataResp[r][5] || "").toLowerCase().trim();
        if (emailResp === sessao.colaborador_id && compResp === sessao.competencia_id.toLowerCase()) {
          baseline = {
            nivel_ia4: Number(dataResp[r][16]) || 0,
            nota_ia4: Number(dataResp[r][17]) || 0,
            pontos_atencao: String(dataResp[r][19] || ""),
            pontos_fortes: String(dataResp[r][18] || "")
          };
          break;
        }
      }
    }
  } catch (e) { Logger.log("Aviso: erro ao ler Respostas: " + e.message); }

  // Ler colaborador direto da aba
  var colaborador = {};
  try {
    var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
    if (wsColab) {
      var dataColab = wsColab.getDataRange().getValues();
      for (var r = 4; r < dataColab.length; r++) {
        var emailColab = String(dataColab[r][6] || "").toLowerCase().trim();
        if (emailColab === sessao.colaborador_id) {
          colaborador = {
            nome: String(dataColab[r][1] || ""),
            cargo: String(dataColab[r][3] || ""),
            email: emailColab
          };
          break;
        }
      }
    }
  } catch (e) { Logger.log("Aviso: erro ao ler Colaboradores: " + e.message); }

  // Montar state em memoria (nao precisa salvar de volta no Sheets)
  var historyRaw = state.history || [];
  if (typeof historyRaw === "string") {
    try { historyRaw = JSON.parse(historyRaw); } catch(e) { historyRaw = []; }
  }

  sessao.state = {
    sessao_id: sessao.sessao_id,
    ciclo_id: sessao.ciclo_id,
    colaborador_id: sessao.colaborador_id,
    competencia_id: sessao.competencia_id,
    competencia: sessao.competencia,
    cenarios: cenarios,
    baseline: baseline,
    colaborador: colaborador,
    history: historyRaw
  };

  Logger.log("Init OK: cenarios=" + cenarios.length + " baseline_nivel=" + (baseline.nivel_ia4 || "?")
    + " colab=" + (colaborador.nome || "?"));
}


// ══════════════════════════════════════════════════════════════════════
// GERAR CONVERSA SIMULADA
// ══════════════════════════════════════════════════════════════════════

function _simGerarConversa(sessao) {
  var state = sessao.state;
  var colab = state.colaborador || {};
  var nome = (colab.nome || sessao.colaborador_id).split(" ")[0];

  // Sortear nivel alvo para distribuicao realista
  var rand = Math.random();
  var nivelAlvo, perfilResp;
  if (rand < 0.30) {
    nivelAlvo = Math.random() < 0.5 ? 1 : 2;
    perfilResp = "FRACO: respostas vagas, genericas, defensivas. Evita dar exemplos concretos. "
      + "Usa frases como 'acho que sim', 'depende', 'normalmente eu faco o basico'. "
      + "Nao demonstra reflexao ou autocritica.";
  } else if (rand < 0.80) {
    nivelAlvo = Math.random() < 0.5 ? 2 : 3;
    perfilResp = "MEDIO: respostas com alguma substancia mas inconsistentes. "
      + "Mostra conhecimento parcial, exemplos genericos. "
      + "Reconhece dificuldades mas sem plano claro. "
      + "Mistura boas intencoes com falta de metodo.";
  } else {
    nivelAlvo = Math.random() < 0.5 ? 3 : 4;
    perfilResp = "FORTE: respostas detalhadas, com exemplos concretos e reflexao. "
      + "Demonstra intencionalidade e autocritica. "
      + "Propoe acoes especificas e explica o raciocinio. "
      + "Conecta acoes ao impacto nos alunos.";
  }

  // Cenario
  var cenario = "";
  if (state.cenarios && state.cenarios.length > 0) {
    var cen = typeof state.cenarios === "string" ? JSON.parse(state.cenarios) : state.cenarios;
    if (cen[0]) {
      cenario = JSON.stringify(cen[0]);
    }
  }

  // Baseline
  var baselineStr = "";
  if (state.baseline) {
    var bl = typeof state.baseline === "string" ? JSON.parse(state.baseline) : state.baseline;
    baselineStr = "Nivel anterior (Fase 1): " + (bl.nivel_ia4 || "?")
      + "\nPontos de Atencao: " + (bl.pontos_atencao || "nenhum identificado");
  }

  var system = [
    "Voce vai SIMULAR uma entrevista completa entre um Mentor IA e um colaborador de escola.",
    "Gere EXATAMENTE 8-12 turnos alternados (assistant/user).",
    "",
    "COLABORADOR: " + (colab.nome || nome),
    "CARGO: " + (colab.cargo || "Professor"),
    "COMPETENCIA AVALIADA: " + (sessao.competencia || ""),
    "",
    "CENARIO B:",
    cenario || "(cenario generico sobre a competencia)",
    "",
    "BASELINE:",
    baselineStr || "Sem dados anteriores",
    "",
    "PERFIL DE RESPOSTA DO COLABORADOR (nivel alvo " + nivelAlvo + "):",
    perfilResp,
    "",
    "REGRAS DA SIMULACAO:",
    "1. O Mentor IA (assistant) deve seguir o protocolo: apresentar cenario, fazer perguntas abertas,",
    "   aprofundar com base nas respostas, explorar 4 dimensoes (Situacao, Acao, Raciocinio, Autossensibilidade).",
    "2. O Mentor NUNCA julga, NUNCA sugere, NUNCA elogia. So faz perguntas.",
    "3. O colaborador (user) responde de acordo com o PERFIL acima.",
    "4. As respostas devem ser REALISTAS — linguagem coloquial, erros de raciocinio se for fraco,",
    "   hesitacoes naturais. NAO eh uma redacao perfeita.",
    "5. Explore pelo menos 3 das 4 dimensoes.",
    "6. Ultimo turno do assistant deve ser uma mensagem de encerramento agradecendo.",
    "",
    "FORMATO: Responda SOMENTE em JSON. Sem texto antes ou depois.",
    "Array de objetos: [{\"role\":\"assistant\",\"content\":\"...\"},{\"role\":\"user\",\"content\":\"...\"},...]",
    "Primeiro turno = assistant (apresentacao do cenario).",
    "Ultimo turno = assistant (encerramento).",
    "Sem ```json. Sem preamble."
  ].join("\n");

  var prompt = {
    systemStatic: system,
    systemCompetencia: "",
    messages: [{ role: "user", content: "Gere a conversa simulada agora." }]
  };

  var response = AIRouter.callClaude(prompt, "cenario_b");

  // Parsear conversa
  var cleaned = response.replace(/```json|```/g, "").trim();
  var match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Resposta nao contem array JSON de conversa");

  var conversa = JSON.parse(match[0]);

  // Validar estrutura minima
  if (!Array.isArray(conversa) || conversa.length < 6) {
    throw new Error("Conversa simulada muito curta: " + conversa.length + " turnos");
  }

  // Garantir alternancia
  for (var i = 0; i < conversa.length; i++) {
    if (!conversa[i].role || !conversa[i].content) {
      throw new Error("Turno " + i + " sem role ou content");
    }
  }

  sessao.nivelAlvo = nivelAlvo;
  return conversa;
}


// ══════════════════════════════════════════════════════════════════════
// SALVAR HISTORICO
// ══════════════════════════════════════════════════════════════════════

function _simSalvarHistorico(sessao, conversa) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");

  // Salvar historico direto na aba Sessoes (coluna history)
  try {
    var data = ws.getDataRange().getValues();
    var headers = data[0];
    var colHistory = -1, colFase = -1, colStatus = -1;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).toLowerCase().trim();
      if (h === "history") colHistory = c;
      if (h === "fase") colFase = c;
      if (h === "status") colStatus = c;
    }

    // Encontrar a linha da sessao
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0] || "") === sessao.sessao_id) {
        // Salvar historico como JSON
        if (colHistory >= 0) {
          ws.getRange(r + 1, colHistory + 1).setValue(JSON.stringify(conversa));
        }
        // Atualizar fase e status
        if (colFase >= 0) {
          ws.getRange(r + 1, colFase + 1).setValue("encerramento");
        }
        if (colStatus >= 0) {
          ws.getRange(r + 1, colStatus + 1).setValue("ativa");
        }
        break;
      }
    }
  } catch (e) {
    Logger.log("Aviso: erro ao salvar historico no Sheets: " + e.message);
  }

  // Salvar no Drive
  try {
    DriveStorage.saveHistory(
      sessao.sessao_id,
      sessao.ciclo_id,
      sessao.colaborador_id,
      conversa
    );
  } catch (e) {
    Logger.log("Aviso: erro ao salvar no Drive: " + e.message);
  }

  // Atualizar state em memoria
  sessao.state.history = conversa;
}


// ══════════════════════════════════════════════════════════════════════
// AVALIACAO [EVAL]
// ══════════════════════════════════════════════════════════════════════

function _simRodarAvaliacao(sessao) {
  var fullState = sessao.state;
  var history = fullState.history || [];
  if (typeof history === "string") {
    try { history = JSON.parse(history); } catch(e) { history = []; }
  }

  // Tentar via PromptBuilder se funcionar
  try {
    var prompt = PromptBuilder.build(
      fullState,
      "[INSTRUCAO DO SISTEMA — NAO VISIVEL AO COLABORADOR]\n"
      + "A conversa acabou. Gere APENAS o bloco de avaliacao.\n"
      + "Analise todo o historico desta conversa.\n"
      + "Processo: EXTRAIR evidencias -> MAPEAR na regua -> VERIFICAR -> CLASSIFICAR\n\n"
      + "Responda SOMENTE com o bloco abaixo (nenhuma outra mensagem):\n"
      + '[EVAL]{"competencia":"nome","nivel":0,"nota_decimal":0.00,"confianca":0,"evidencias":[{"trecho":"","indicador":"","tipo":""}],"lacuna":"","cenario_usado":"","aprofundamentos_total":0,"contraexemplo_usado":false}[/EVAL]'
    );

    var result = AIRouter.callClaude(prompt, "avaliacao");
    return _simParsearEval(result);
  } catch (e) {
    Logger.log("PromptBuilder falhou, usando prompt direto: " + e.message);
  }

  // Fallback: prompt montado direto (sem PromptBuilder)
  var historySummary = [];
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    var speaker = h.role === "user" ? "Colaborador" : "Mentor IA";
    historySummary.push(speaker + ": " + String(h.content || "").substring(0, 500));
  }

  var systemDirect = [
    "Voce e uma avaliadora de competencias comportamentais da plataforma Vertho.",
    "Analise o historico de conversa abaixo e gere uma avaliacao.",
    "",
    "COMPETENCIA AVALIADA: " + (sessao.competencia || ""),
    "COLABORADOR: " + ((fullState.colaborador || {}).nome || sessao.colaborador_id),
    "CARGO: " + ((fullState.colaborador || {}).cargo || ""),
    "",
    "NIVEIS (regua simplificada):",
    "Nivel 1: Comportamento reativo, defensivo, sem intencionalidade",
    "Nivel 2: Reconhece mas executa com limitacoes, abertura parcial",
    "Nivel 3: Executa com consistencia, intencionalidade e proatividade",
    "Nivel 4: Inspira, ensina, eleva o padrao, transforma cultura",
    "",
    "NOTA DECIMAL (1.00-4.00): parte inteira = nivel, parte decimal = forca dentro do nivel",
    ".00-.25 = minimo | .26-.50 = adequado | .51-.75 = bom | .76-.99 = quase proximo nivel",
    "",
    "REGRA: Na duvida entre dois niveis, escolher o INFERIOR.",
    "",
    "Responda SOMENTE com o bloco abaixo:",
    '[EVAL]{"competencia":"nome","nivel":0,"nota_decimal":0.00,"confianca":0,"evidencias":[{"trecho":"","indicador":"","tipo":""}],"lacuna":"","cenario_usado":"simulado","aprofundamentos_total":0,"contraexemplo_usado":false}[/EVAL]'
  ].join("\n");

  var messages = [{ role: "user", content: "HISTORICO DA CONVERSA:\n\n" + historySummary.join("\n\n") }];

  var prompt2 = {
    systemStatic: systemDirect,
    systemCompetencia: "",
    messages: messages
  };

  var result2 = AIRouter.callClaude(prompt2, "avaliacao");
  return _simParsearEval(result2);
}

function _simParsearEval(result) {
  // Extrair [EVAL]
  var evalMatch = result.match(/\[EVAL\]([\s\S]*?)\[\/EVAL\]/);
  if (evalMatch) {
    try { return JSON.parse(evalMatch[1].trim()); } catch (e) {}
  }
  // Fallback JSON
  var jsonMatch = result.match(/\{[\s\S]*"competencia"[\s\S]*"nivel"[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) {}
  }
  throw new Error("Avaliacao nao retornou formato [EVAL]");
}


// ══════════════════════════════════════════════════════════════════════
// VALIDACAO GEMINI
// ══════════════════════════════════════════════════════════════════════

function _simRodarValidacao(sessao, evalResult) {
  try {
    var fullState = sessao.state;
    var history = fullState.history || [];
    if (typeof history === "string") {
      try { history = JSON.parse(history); } catch(e) { history = []; }
    }

    // Tentar via ValidationService se existe
    if (typeof ValidationService !== "undefined" && ValidationService.validate) {
      try {
        var competencyData = StateManager.getCompetencia(sessao.competencia_id);
        return ValidationService.validate(history, evalResult, competencyData);
      } catch(e) {
        Logger.log("ValidationService falhou, usando Gemini direto: " + e.message);
      }
    }

    // Fallback: validacao simplificada via Gemini
    var historySummary = [];
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      historySummary.push("[" + (h.role || "?") + "] " + String(h.content || "").substring(0, 200));
    }

    var fullText = [
      "VALIDACAO DE AVALIACAO COMPORTAMENTAL",
      "",
      "COMPETENCIA: " + (sessao.competencia || ""),
      "",
      "AVALIACAO DO CLAUDE:",
      JSON.stringify(evalResult, null, 2),
      "",
      "HISTORICO DA CONVERSA:",
      historySummary.join("\n"),
      "",
      "Verifique:",
      "a) As evidencias citadas EXISTEM no historico?",
      "b) O nivel corresponde ao que foi observado?",
      "c) A nota_decimal e coerente?",
      "d) A lacuna reflete o observado?",
      "",
      "Responda SOMENTE em JSON:",
      '{"validacao":"aprovada|divergente","nivel_sugerido":0,"nota_sugerida":0.00,"evidencias_invalidas":[],"comentario":"..."}'
    ].join("\n");

    var geminiResult = AIRouter.callGemini({ fullText: fullText });
    var cleaned = geminiResult.replace(/```json|```/g, "").trim();
    var match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);

    return { validacao: "pendente", comentario: "Resposta Gemini invalida" };
  } catch (e) {
    Logger.log("Erro validacao: " + e.message);
    return { validacao: "pendente", comentario: "Erro: " + e.message };
  }
}


// ══════════════════════════════════════════════════════════════════════
// FINALIZAR SESSAO
// ══════════════════════════════════════════════════════════════════════

function _simFinalizarSessao(sessao, evalResult, validation) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");

  try {
    var data = ws.getDataRange().getValues();
    var headers = data[0];
    var cols = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).toLowerCase().trim();
      cols[h] = c;
    }

    // Encontrar linha da sessao
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0] || "") === sessao.sessao_id) {
        var row = r + 1; // 1-indexed

        // Status
        if (cols["status"] !== undefined)
          ws.getRange(row, cols["status"] + 1).setValue("concluida");

        // Fase
        if (cols["fase"] !== undefined)
          ws.getRange(row, cols["fase"] + 1).setValue("concluida");

        // Nivel
        if (cols["nivel"] !== undefined)
          ws.getRange(row, cols["nivel"] + 1).setValue(evalResult.nivel || 0);

        // Nota decimal
        if (cols["nota_decimal"] !== undefined)
          ws.getRange(row, cols["nota_decimal"] + 1).setValue(evalResult.nota_decimal || 0);

        // Confianca
        if (cols["confianca"] !== undefined)
          ws.getRange(row, cols["confianca"] + 1).setValue(evalResult.confianca || 0);

        // Evidencias
        if (cols["evidencias"] !== undefined)
          ws.getRange(row, cols["evidencias"] + 1).setValue(
            JSON.stringify(evalResult.evidencias || []).substring(0, 50000)
          );

        // Lacuna
        if (cols["lacuna"] !== undefined)
          ws.getRange(row, cols["lacuna"] + 1).setValue(evalResult.lacuna || "");

        // Validacao
        if (cols["validacao"] !== undefined)
          ws.getRange(row, cols["validacao"] + 1).setValue(
            JSON.stringify(validation || {}).substring(0, 50000)
          );

        break;
      }
    }
  } catch (e) {
    Logger.log("Erro ao finalizar sessao no Sheets: " + e.message);
    // Fallback: tentar via StateManager
    try {
      StateManager.saveSessionResult(sessao.sessao_id, evalResult, validation);
      StateManager.updateSessionStatus(sessao.sessao_id, "concluida");
    } catch (e2) {
      Logger.log("Fallback StateManager tb falhou: " + e2.message);
    }
  }

  Logger.log("Sessao " + sessao.sessao_id + " finalizada: nivel="
    + (evalResult.nivel || "?") + " nota=" + (evalResult.nota_decimal || "?")
    + " validacao=" + (validation.validacao || "?")
    + " (alvo era " + sessao.nivelAlvo + ")");
}