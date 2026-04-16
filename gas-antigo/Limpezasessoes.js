// =====================================================================
// VERTHO - LimpezaSessoes.gs
//
// Trigger noturno que reseta sessoes com mais de 48h de inatividade.
// A sessao volta para status "pendente" e fase "nova", zerando o
// historico. Quando o colaborador voltar, recomeca do zero.
//
// Dependencias: Config.gs, StateManager.gs, DriveStorage.gs
// =====================================================================

var TIMEOUT_ABANDONO_HORAS = 48; // sessoes inativas por mais de 48h


/**
 * Funcao principal — rode manualmente ou configure como trigger diario.
 * Menu: Vertho > Limpar Sessoes Abandonadas
 */
function limparSessoesAbandonadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  if (!ws) { Logger.log("Aba Sessoes nao encontrada"); return; }

  var data = ws.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var iSessaoId = _lsColIdx(headers, "sessao_id");
  var iColabId  = _lsColIdx(headers, "colaborador_id");
  var iCompId   = _lsColIdx(headers, "competencia_id");
  var iComp     = _lsColIdx(headers, "competencia");
  var iStatus   = _lsColIdx(headers, "status");
  var iFase     = _lsColIdx(headers, "fase");
  var iHistory  = _lsColIdx(headers, "history");
  var iLastAct  = _lsColIdx(headers, "last_activity");
  var iUpdated  = _lsColIdx(headers, "updated_at");
  var iAprofund = _lsColIdx(headers, "aprofundamentos_cenario1");
  var iContra   = _lsColIdx(headers, "contraexemplo_usado");
  var iCenAtual = _lsColIdx(headers, "cenario_atual");
  var iNivel    = _lsColIdx(headers, "nivel");
  var iConf     = _lsColIdx(headers, "confianca");
  var iEvid     = _lsColIdx(headers, "evidencias");
  var iLacuna   = _lsColIdx(headers, "lacuna");
  var iValid    = _lsColIdx(headers, "validacao");

  var agora = new Date();
  var limiteMs = TIMEOUT_ABANDONO_HORAS * 60 * 60 * 1000;
  var resetadas = 0;

  Logger.log("=== LIMPEZA DE SESSOES ABANDONADAS ===");
  Logger.log("Limite: " + TIMEOUT_ABANDONO_HORAS + "h de inatividade");

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var status = String(row[iStatus]).toLowerCase();

    // So processar sessoes ativas (em andamento)
    if (status !== "ativa") continue;

    // Verificar inatividade
    var lastActivity = row[iLastAct] || row[iUpdated] || "";
    if (!lastActivity) continue;

    var lastDate = new Date(lastActivity);
    var diffMs = agora.getTime() - lastDate.getTime();

    if (diffMs < limiteMs) continue; // ainda dentro do prazo

    var sessaoId = String(row[iSessaoId]);
    var email = String(row[iColabId]);
    var compId = String(row[iCompId]);
    var diffHoras = Math.round(diffMs / (1000 * 60 * 60));

    Logger.log("RESETANDO: " + email + " / " + compId
      + " (sessao " + sessaoId.substring(0, 8) + "...)"
      + " — " + diffHoras + "h inativa");

    var rowNum = r + 1;

    // Resetar para estado inicial
    if (iStatus >= 0) ws.getRange(rowNum, iStatus + 1).setValue("pendente");
    if (iFase >= 0) ws.getRange(rowNum, iFase + 1).setValue("nova");
    if (iHistory >= 0) ws.getRange(rowNum, iHistory + 1).setValue("[]");
    if (iAprofund >= 0) ws.getRange(rowNum, iAprofund + 1).setValue(0);
    if (iContra >= 0) ws.getRange(rowNum, iContra + 1).setValue(false);
    if (iCenAtual >= 0) ws.getRange(rowNum, iCenAtual + 1).setValue(0);
    if (iNivel >= 0) ws.getRange(rowNum, iNivel + 1).setValue("");
    if (iConf >= 0) ws.getRange(rowNum, iConf + 1).setValue("");
    if (iEvid >= 0) ws.getRange(rowNum, iEvid + 1).setValue("");
    if (iLacuna >= 0) ws.getRange(rowNum, iLacuna + 1).setValue("");
    if (iValid >= 0) ws.getRange(rowNum, iValid + 1).setValue("");
    if (iUpdated >= 0) ws.getRange(rowNum, iUpdated + 1).setValue(agora.toISOString());
    if (iLastAct >= 0) ws.getRange(rowNum, iLastAct + 1).setValue(agora.toISOString());

    // Limpar JSON do Drive (se existir)
    try {
      DriveStorage.updateConversation(sessaoId, String(row[_lsColIdx(headers, "ciclo_id")]), email, {
        status: "resetada_abandono",
        fase: "nova",
        turnos: [],
        resultado: null,
        validacao: null,
        reset_motivo: "Inatividade de " + diffHoras + "h",
        reset_timestamp: agora.toISOString()
      });
    } catch(e) {
      Logger.log("Erro ao atualizar Drive para " + sessaoId + ": " + e.message);
    }

    resetadas++;
  }

  Logger.log("=== RESULTADO: " + resetadas + " sessoes resetadas ===");
  return resetadas;
}


/**
 * Configura trigger diario para rodar a limpeza (ex: 2h da manha).
 * Rode uma vez manualmente.
 */
function configurarTriggerLimpeza() {
  // Remover triggers existentes desta funcao
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "limparSessoesAbandonadas") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Criar trigger diario as 2h
  ScriptApp.newTrigger("limparSessoesAbandonadas")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  Logger.log("Trigger de limpeza configurado: diario as 2h");
  try {
    SpreadsheetApp.getUi().alert("Trigger configurado! Limpeza rodara diariamente as 2h da manha.");
  } catch(e) {}
}


/**
 * Remove o trigger de limpeza.
 */
function pararTriggerLimpeza() {
  var triggers = ScriptApp.getProjectTriggers();
  var removidos = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "limparSessoesAbandonadas") {
      ScriptApp.deleteTrigger(triggers[i]);
      removidos++;
    }
  }
  Logger.log("Triggers de limpeza removidos: " + removidos);
}


// ── Helper ──────────────────────────────────────────────────────────

function _lsColIdx(headers, name) {
  var n = String(name).toLowerCase().trim();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().trim() === n) return i;
  }
  return -1;
}