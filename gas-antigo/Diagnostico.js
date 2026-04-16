// =====================================================================
// VERTHO - Diagnostico.gs  (Funções de Teste e Diagnóstico)
//
// Consolida todas as funções de teste/debug do projeto.
// Uso: menu da planilha ou execução manual no editor GAS.
// NÃO é chamado em produção.
// =====================================================================


// ── TESTE RÁPIDO — 1 clique para nova sessão de teste ────────────────

function testeRapido() {
  var ui = SpreadsheetApp.getUi();
  var email = "rdnaves@gmail.com";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(Config.SHEET_SESSOES);
  if (ws && ws.getLastRow() > 1) {
    ws.deleteRows(2, ws.getLastRow() - 1);
  }
  Logger.log("Sessoes resetadas");

  var resultado = _criarSessaoReal(email);
  if (resultado.erro) {
    ui.alert("Erro: " + resultado.erro);
    return;
  }

  ui.alert(
    "Teste pronto!\n\n"
    + "Colaborador: " + resultado.nome + "\n"
    + "Competencia: " + resultado.competencia + "\n"
    + "Tipo: " + resultado.tipo_cenario + "\n\n"
    + "Acesse o Web App e digite: " + email + "\n\n"
    + "(Nao precisa reimplantar se nao mudou codigo)"
  );
}


// ── TESTE RÁPIDO COM EMAIL CUSTOMIZADO ───────────────────────────────

function testeRapidoCustom() {
  var ui = SpreadsheetApp.getUi();
  var emailResp = ui.prompt("E-mail do colaborador:");
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;
  var email = emailResp.getResponseText().trim().toLowerCase();
  if (!email) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(Config.SHEET_SESSOES);
  if (ws && ws.getLastRow() > 1) {
    ws.deleteRows(2, ws.getLastRow() - 1);
  }

  var resultado = _criarSessaoReal(email);
  if (resultado.erro) {
    ui.alert("Erro: " + resultado.erro);
    return;
  }

  ui.alert(
    "Teste pronto!\n\n"
    + "Colaborador: " + resultado.nome + "\n"
    + "Competencia: " + resultado.competencia + "\n"
    + "Tipo: " + resultado.tipo_cenario + "\n\n"
    + "Acesse o Web App e digite: " + email
  );
}


// ── CRIAR SESSÃO COM DADOS REAIS ─────────────────────────────────────

function _criarSessaoReal(email) {
  var ss = SpreadsheetApp.openById(Config.MAIN_SHEET_ID);

  var colab = StateManager.getColaborador(email);
  if (!colab) return { erro: "Colaborador " + email + " nao encontrado" };

  var cenarioB = null;
  var tipoCenario = "A (original)";
  var compId = "";
  var compNome = "";

  // Buscar cenário B por cargo+escola+competencia
  var cargoColab = (colab.cargo || "").toLowerCase().trim();
  var escolaColab = (colab.area || "").toLowerCase().trim();
  var wsCenB = ss.getSheetByName(Config.SHEET_CENARIOS_B);
  if (wsCenB && wsCenB.getLastRow() > 1) {
    var dataCenB = wsCenB.getDataRange().getValues();
    // Nova estrutura: col 0=cargo, col 1=escola, col 2=compId, col 3=descricao, ...
    for (var r = 1; r < dataCenB.length; r++) {
      var rowCargo = String(dataCenB[r][0] || "").toLowerCase().trim();
      var rowEscola = String(dataCenB[r][1] || "").toLowerCase().trim();
      var status = String(dataCenB[r][11] || "").toLowerCase();
      if (rowCargo === cargoColab && rowEscola === escolaColab && status !== "reprovar") {
        compId = String(dataCenB[r][2] || "");
        cenarioB = {
          cenario_id: compId + "_B",
          descricao: String(dataCenB[r][3] || ""),
          personagens: String(dataCenB[r][4] || ""),
          situacao_gatilho: String(dataCenB[r][5] || ""),
          pergunta_aprofund_1: String(dataCenB[r][6] || ""),
          pergunta_aprofund_2: String(dataCenB[r][7] || ""),
          pergunta_raciocinio: String(dataCenB[r][8] || ""),
          pergunta_cis: String(dataCenB[r][9] || ""),
          objetivo_conversacional: String(dataCenB[r][10] || ""),
          fase: "B"
        };
        tipoCenario = "B (gerado)";
        break;
      }
    }
  }

  var cenariosFinais = [];
  if (cenarioB) {
    cenariosFinais = [cenarioB];
  } else {
    var wsCen = ss.getSheetByName(Config.SHEET_CENARIOS);
    if (!wsCen) return { erro: "Aba Cenarios nao encontrada" };

    var dataCen = wsCen.getDataRange().getValues();
    for (var r = 4; r < dataCen.length; r++) {
      var rowEmail = String(dataCen[r][0] || "").toLowerCase().trim();
      if (rowEmail !== email) continue;

      var compRaw = String(dataCen[r][10] || "");
      var parts = compRaw.split("|");
      compId = parts[0] ? parts[0].trim() : "";
      compNome = parts[1] ? parts[1].trim() : compRaw;

      cenariosFinais.push({
        cenario_id: compId + "_CEN_A",
        descricao: String(dataCen[r][12] || ""),
        personagens: String(dataCen[r][13] || ""),
        situacao_gatilho: String(dataCen[r][14] || ""),
        pergunta_aprofund_1: String(dataCen[r][15] || ""),
        pergunta_aprofund_2: String(dataCen[r][16] || ""),
        pergunta_raciocinio: String(dataCen[r][17] || ""),
        pergunta_cis: String(dataCen[r][18] || ""),
        fase: "A"
      });
      break;
    }
  }

  if (cenariosFinais.length === 0) return { erro: "Nenhum cenario encontrado para " + email };

  if (!compNome) {
    var comp = StateManager.getCompetencia(compId);
    compNome = comp ? comp.nome : compId;
  }

  var baseline = null;
  var wsResp = ss.getSheetByName(Config.SHEET_RESPOSTAS);
  if (wsResp) {
    var dataResp = wsResp.getDataRange().getValues();
    for (var r = 1; r < dataResp.length; r++) {
      var respEmail = String(dataResp[r][1] || "").toLowerCase().trim();
      var respCompId = String(dataResp[r][5] || "").toLowerCase().trim();
      if (respEmail === email && respCompId === compId.toLowerCase()) {
        baseline = { nivel: "", lacuna: "", evidencias_resumo: "Diagnostico via Forms concluido" };
        break;
      }
    }
  }

  var sessaoId = Utilities.getUuid();
  var cicloId = "ciclo_teste_" + new Date().getTime();

  var state = {
    sessao_id: sessaoId,
    ciclo_id: cicloId,
    colaborador_id: email,
    competencia_id: compId,
    competencia: compNome,
    status: "pendente",
    fase: "nova",
    history: [],
    cenarios: cenariosFinais,
    baseline: baseline,
    colaborador: colab,
    aprofundamentos_cenario1: 0,
    contraexemplo_usado: false,
    cenario_atual: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_activity: new Date().toISOString()
  };

  StateManager.saveSessionState(state);

  var driveOk = false;
  try {
    DriveStorage.saveConversation(state);
    driveOk = true;
  } catch (e) {
    Logger.log("Drive: " + e.message);
  }

  return {
    sessao_id: sessaoId,
    nome: colab.nome,
    competencia: compNome,
    tipo_cenario: tipoCenario,
    drive_ok: driveOk
  };
}


// ── CRIAR SESSÃO DE TESTE SIMPLES ────────────────────────────────────

function criarSessaoTeste(email, compId) {
  email  = email  || 'teste@vertho.ai';
  compId = compId || 'COMP_01';
  var id = Utilities.getUuid();
  StateManager.saveSessionState({
    sessao_id: id, ciclo_id: 'teste_' + Date.now(), colaborador_id: email,
    competencia_id: compId, competencia: compId, status: 'pendente', fase: 'nova',
    history: [], cenarios: [], baseline: null, aprofundamentos_cenario1: 0,
    aprofundamentos_cenario2: 0, contraexemplo_usado: false, cenario_atual: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    last_activity: new Date().toISOString()
  });
  Logger.log('Sessao teste: ' + id + ' para ' + email);
  return id;
}


// ── CRIAR MÚLTIPLAS SESSÕES DE TESTE ─────────────────────────────────

function criarSessoesTeste() {
  var email = "rdnaves@gmail.com";
  var comps = ["C003", "C007", "C011", "C012"];
  for (var i = 0; i < comps.length; i++) {
    criarSessaoTeste(email, comps[i]);
    Logger.log("Sessao criada: " + comps[i]);
  }
}


// ── FUNÇÕES DE MENU ──────────────────────────────────────────────────

function criarSessaoTesteMenu() {
  testeRapidoCustom();
}

function resetarSessoesTeste() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert("Resetar TODAS as sessoes?", ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Config.SHEET_SESSOES);
  if (ws && ws.getLastRow() > 1) {
    ws.deleteRows(2, ws.getLastRow() - 1);
  }
  ui.alert("Sessoes resetadas!");
}

function listarCenariosBGerados() {
  var ui = SpreadsheetApp.getUi();
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(Config.SHEET_CENARIOS_B);

  if (!ws || ws.getLastRow() < 2) {
    ui.alert("Nenhum cenario B gerado ainda.");
    return;
  }

  var data = ws.getDataRange().getValues();
  var msg = "Cenarios B gerados:\n\n";
  for (var r = 1; r < data.length; r++) {
    msg += "- " + data[r][0] + " | " + data[r][1] + " | " + (data[r][10] || "pendente") + "\n";
  }
  ui.alert(msg);
}

function mostrarURLWebApp() {
  SpreadsheetApp.getUi().alert(
    "URL do Web App:\n\n"
    + "Implantar > Gerenciar implantacoes > Copiar URL"
  );
}


// ── TESTE DO WEBAPP ──────────────────────────────────────────────────

function testeWebApp() {
  var r1 = identificarColaborador('rdnaves@gmail.com');
  Logger.log('identificar: ' + JSON.stringify(r1));
  var r2 = processarMensagemChat('rdnaves@gmail.com', 'Teste', 'oi');
  Logger.log('mensagem: ' + JSON.stringify(r2));
}


// ── DIAGNÓSTICO DO FLUXO REAL DE AVALIAÇÃO ───────────────────────────

function diagnosticoFluxoReal() {
  Logger.log("=== DIAGNOSTICO FLUXO REAL ===");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName("Sessoes");
  if (!ws) { Logger.log("Aba Sessoes nao encontrada"); return; }

  var data    = ws.getDataRange().getValues();
  var headers = data[0];
  Logger.log("Headers Sessoes: " + JSON.stringify(headers));

  var colMap = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h.indexOf("sessao") >= 0 && h.indexOf("id") >= 0) colMap.sessao_id = c;
    if (h === "sessao_id")      colMap.sessao_id      = c;
    if (h === "ciclo_id")       colMap.ciclo_id       = c;
    if (h.indexOf("colaborador") >= 0 && h.indexOf("id") >= 0) colMap.colaborador_id = c;
    if (h === "colaborador_id") colMap.colaborador_id = c;
    if (h.indexOf("competencia_id") >= 0 || h === "competencia_id") colMap.competencia_id = c;
    if (h === "competencia")    colMap.competencia    = c;
    if (h === "status")         colMap.status         = c;
    if (h === "fase")           colMap.fase           = c;
    if (h === "history")        colMap.history        = c;
    if (h.indexOf("cenario") >= 0 && h.indexOf("atual") < 0) colMap.cenarios = c;
    if (h === "baseline")       colMap.baseline       = c;
  }
  Logger.log("Colunas mapeadas: " + JSON.stringify(colMap));

  var lastRow  = data[data.length - 1];
  var sessaoId = colMap.sessao_id !== undefined ? lastRow[colMap.sessao_id] : "N/A";
  var status   = colMap.status    !== undefined ? lastRow[colMap.status]    : "N/A";
  var fase     = colMap.fase      !== undefined ? lastRow[colMap.fase]      : "N/A";

  Logger.log("Ultima sessao: " + sessaoId);
  Logger.log("Status: " + status);
  Logger.log("Fase: " + fase);

  var state = {
    sessao_id:      sessaoId,
    ciclo_id:       colMap.ciclo_id       !== undefined ? lastRow[colMap.ciclo_id]       : "",
    colaborador_id: colMap.colaborador_id !== undefined ? lastRow[colMap.colaborador_id] : "",
    competencia_id: colMap.competencia_id !== undefined ? lastRow[colMap.competencia_id] : "",
    competencia:    colMap.competencia    !== undefined ? lastRow[colMap.competencia]    : ""
  };
  Logger.log("State reconstruido: " + JSON.stringify(state));

  var history = [];
  if (colMap.history !== undefined) {
    var histRaw = lastRow[colMap.history];
    if (histRaw) {
      try {
        history = JSON.parse(histRaw);
        Logger.log("History do Sheets: " + history.length + " turnos");
      } catch(e) {
        Logger.log("History no Sheets nao e JSON valido: " + String(histRaw).substring(0, 100));
      }
    }
  }

  if (history.length === 0) {
    try {
      history = DriveStorage.getHistory(state.sessao_id, state.ciclo_id, state.colaborador_id) || [];
      Logger.log("History do Drive: " + history.length + " turnos");
    } catch(e) {
      Logger.log("DriveStorage.getHistory erro: " + e.message);
    }
  }

  if (history.length === 0) {
    Logger.log("SEM HISTORICO — nao da pra simular avaliacao");
    return;
  }

  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    Logger.log("Turno " + i + " [" + h.role + "]: " + String(h.content || "").substring(0, 80));
  }

  Logger.log("\n=== MONTANDO PROMPT DE AVALIACAO ===");
  state.history = history;

  try {
    var evalPrompt = PromptBuilder.build(
      state,
      "[INSTRUCAO DO SISTEMA]\n"
      + "A conversa acabou. Gere APENAS o bloco de avaliacao.\n"
      + "Analise todo o historico desta conversa.\n"
      + "Processo: EXTRAIR evidencias -> MAPEAR na regua -> VERIFICAR -> CLASSIFICAR\n\n"
      + "Responda SOMENTE com o bloco abaixo:\n"
      + '[EVAL]{"competencia":"nome","nivel":0,"confianca":0,"evidencias":[{"trecho":"","indicador":"","tipo":""}],"lacuna":"","cenario_usado":"","aprofundamentos_total":0,"contraexemplo_usado":false}[/EVAL]'
    );

    Logger.log("Prompt montado OK");
    Logger.log("System static length: " + (evalPrompt.systemStatic || "").length);
    Logger.log("System comp length: "   + (evalPrompt.systemCompetencia || "").length);
    Logger.log("Messages count: "       + (evalPrompt.messages || []).length);

    var msgs = evalPrompt.messages || [];
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j];
      Logger.log("  msg[" + j + "] role=" + m.role + " len=" + (m.content || "").length);
      if (m.role !== "user" && m.role !== "assistant") {
        Logger.log("  >>> PROBLEMA: role invalido!");
      }
    }
    for (var k = 1; k < msgs.length; k++) {
      if (msgs[k].role === msgs[k-1].role) {
        Logger.log("  >>> PROBLEMA: turnos consecutivos com mesmo role na posicao " + (k-1) + " e " + k);
      }
    }
    if (msgs.length > 0 && msgs[0].role !== "user") {
      Logger.log("  >>> PROBLEMA: primeira mensagem nao e 'user', e '" + msgs[0].role + "'");
    }

  } catch(e) {
    Logger.log("ERRO ao montar prompt: " + e.message);
    Logger.log("Stack: " + e.stack);
    return;
  }

  Logger.log("\n=== CHAMANDO AIRouter.callClaude (avaliacao) ===");
  try {
    var result = AIRouter.callClaude(evalPrompt, "avaliacao");
    Logger.log("SUCESSO! Resposta (" + result.length + " chars): " + result.substring(0, 300));

    var evalMatch = result.match(/\[EVAL\]([\s\S]*?)\[\/EVAL\]/);
    if (evalMatch) {
      Logger.log("EVAL encontrado!");
      try {
        var evalObj = JSON.parse(evalMatch[1].trim());
        Logger.log("EVAL parseado: nivel=" + evalObj.nivel + " confianca=" + evalObj.confianca);
      } catch(pe) {
        Logger.log("EVAL encontrado mas JSON invalido: " + pe.message);
        Logger.log("EVAL raw: " + evalMatch[1].substring(0, 200));
      }
    } else {
      Logger.log("EVAL NAO encontrado na resposta!");
      Logger.log("Resposta completa: " + result);
    }

  } catch(e) {
    Logger.log("ERRO na chamada: " + e.message);
    Logger.log("Stack: " + e.stack);
  }

  Logger.log("\n=== FIM DIAGNOSTICO ===");
}