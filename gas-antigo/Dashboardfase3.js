// =====================================================================
// VERTHO - DashboardFase3.gs
//
// Popula a aba "Dashboard_Fase3" com dados flat e limpos para
// conectar diretamente no AppSheet.
//
// Estrutura: 1 linha por colaborador x competência, com todos os
// campos necessários para views, charts e filtros (sem JOINs).
//
// Atualização: botão no painel ou automaticamente após gerar relatórios.
//
// Dependências: Config.gs
// =====================================================================

var SHEET_DASHBOARD_F3 = "Dashboard_Fase3";


// ══════════════════════════════════════════════════════════════════════
// MENU / PAINEL
// ══════════════════════════════════════════════════════════════════════

function atualizarDashboardFase3Menu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    "Atualizar Dashboard Fase 3",
    "Atualiza a aba Dashboard_Fase3 com os dados mais recentes.\n"
    + "Essa aba alimenta o AppSheet.\n\nContinuar?",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  var result = atualizarDashboardFase3();
  ui.alert("Dashboard Atualizado", "Linhas geradas: " + result.linhas, ui.ButtonSet.OK);
}

function atualizarDashboardFase3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=== ATUALIZANDO DASHBOARD FASE 3 ===");

  // 1. Coletar dados
  var dados = _dbColetarTudo(ss);
  Logger.log("Registros coletados: " + dados.length);

  // 2. Criar/limpar aba
  var ws = ss.getSheetByName(SHEET_DASHBOARD_F3);
  if (!ws) {
    ws = ss.insertSheet(SHEET_DASHBOARD_F3);
    Logger.log("Aba criada: " + SHEET_DASHBOARD_F3);
  } else {
    ws.clearContents();
  }

  // 3. Headers — nomes limpos para AppSheet (sem espaços, sem acentos)
  var headers = [
    "ID",
    "Email",
    "Nome",
    "Cargo",
    "Competencia_ID",
    "Competencia",
    "Ciclo",
    "Nivel_F1",
    "Nota_F1",
    "Nivel_F3",
    "Nota_F3",
    "Evolucao",
    "Delta_Nivel",
    "Delta_Nota",
    "Confianca",
    "Lacuna",
    "Validacao",
    "DISC_Dominante",
    "DISC_D",
    "DISC_I",
    "DISC_S",
    "DISC_C",
    "Status",
    "Data_Conclusao",
    "Tem_Relatorio",
    "Email_Enviado"
  ];

  ws.getRange(1, 1, 1, headers.length).setValues([headers]);

  // 4. Dados
  if (dados.length > 0) {
    var rows = [];
    for (var i = 0; i < dados.length; i++) {
      var d = dados[i];
      rows.push([
        d.sessao_id,
        d.email,
        d.nome,
        d.cargo,
        d.competencia_id,
        d.competencia,
        d.ciclo_id,
        d.nivel_fase1,
        d.nota_fase1,
        d.nivel_fase3,
        d.nota_fase3,
        d.evolucao,
        d.delta_nivel,
        d.delta_nota,
        d.confianca,
        d.lacuna,
        d.validacao_status,
        d.disc_dominante,
        d.disc_D,
        d.disc_I,
        d.disc_S,
        d.disc_C,
        d.status,
        d.data_conclusao,
        d.tem_relatorio,
        d.email_enviado
      ]);
    }
    ws.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  // 5. Formatação
  ws.getRange(1, 1, 1, headers.length)
    .setBackground("#0F2B54")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(9);
  ws.setFrozenRows(1);
  for (var c = 1; c <= headers.length; c++) ws.autoResizeColumn(c);

  // 6. Gerar resumo na aba Dashboard_Resumo (para charts do AppSheet)
  _dbGerarResumo(ss, dados);

  Logger.log("=== DASHBOARD ATUALIZADO: " + dados.length + " linhas ===");
  return { linhas: dados.length };
}


// ══════════════════════════════════════════════════════════════════════
// COLETA (flat: 1 linha por sessão)
// ══════════════════════════════════════════════════════════════════════

function _dbColetarTudo(ss) {
  var wsSessoes = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  var wsResp = ss.getSheetByName("Respostas");
  if (!wsSessoes) return [];

  // Colaboradores
  var colaboradores = {};
  if (wsColab) {
    var dataColab = wsColab.getDataRange().getValues();
    for (var r = 4; r < dataColab.length; r++) {
      var email = String(dataColab[r][6] || "").trim().toLowerCase();
      if (!email) continue;
      var dD = Number(dataColab[r][13]) || 0;
      var dI = Number(dataColab[r][14]) || 0;
      var dS = Number(dataColab[r][15]) || 0;
      var dC = Number(dataColab[r][16]) || 0;
      var scores = { D: dD, I: dI, S: dS, C: dC };
      var dom = "D"; var maxS = 0;
      for (var k in scores) { if (scores[k] > maxS) { maxS = scores[k]; dom = k; } }
      colaboradores[email] = {
        nome: String(dataColab[r][1] || "").trim(),
        cargo: String(dataColab[r][3] || "").trim(),
        disc_D: dD, disc_I: dI, disc_S: dS, disc_C: dC,
        disc_dominante: dom
      };
    }
  }

  // Fase 1
  var fase1 = {};
  if (wsResp) {
    var dataResp = wsResp.getDataRange().getValues();
    for (var r = 1; r < dataResp.length; r++) {
      var email = String(dataResp[r][1] || "").trim().toLowerCase();
      var compId = String(dataResp[r][5] || "").trim().toLowerCase();
      if (!email || !compId) continue;
      if (!fase1[email]) fase1[email] = {};
      fase1[email][compId] = {
        nivel: Number(dataResp[r][16]) || 0,
        nota: Number(dataResp[r][17]) || 0
      };
    }
  }

  // Verificar PDFs gerados
  var pdfGerados = {};
  try {
    var folderIndiv = DriveApp.getFolderById(RELATORIO_F3_PASTA);
    var files = folderIndiv.getFilesByType("application/pdf");
    while (files.hasNext()) {
      var f = files.next();
      pdfGerados[f.getName()] = true;
    }
  } catch (e) {}

  // Sessoes
  var dataSess = wsSessoes.getDataRange().getValues();
  var headers = dataSess[0];
  var idx = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h === "sessao_id") idx.id = c;
    if (h === "ciclo_id") idx.ciclo = c;
    if (h === "colaborador_id") idx.email = c;
    if (h === "competencia_id") idx.compId = c;
    if (h === "competencia") idx.comp = c;
    if (h === "status") idx.status = c;
    if (h === "nivel") idx.nivel = c;
    if (h === "nota_decimal") idx.nota = c;
    if (h === "confianca") idx.conf = c;
    if (h === "lacuna") idx.lacuna = c;
    if (h === "validacao") idx.valid = c;
    if (h === "updated_at") idx.updated = c;
  }

  var resultado = [];
  for (var r = 1; r < dataSess.length; r++) {
    var email = String(dataSess[r][idx.email] || "").toLowerCase().trim();
    if (!email) continue;

    var sessaoId = String(dataSess[r][idx.id] || "");
    var compId = String(dataSess[r][idx.compId] || "").toLowerCase();
    var comp = String(dataSess[r][idx.comp] || "");
    var status = String(dataSess[r][idx.status] || "");
    var nivelF3 = Number(dataSess[r][idx.nivel]) || 0;
    var notaF3 = Number(dataSess[r][idx.nota]) || 0;
    var confianca = Number(dataSess[r][idx.conf]) || 0;
    var lacuna = String(dataSess[r][idx.lacuna] || "").substring(0, 200);
    var colab = colaboradores[email] || {};
    var f1 = (fase1[email] || {})[compId] || {};
    var nivelF1 = Math.floor(Number(f1.nivel) || 0);
    var notaF1 = Number(f1.nota) || 0;

    var evolucao = "pendente";
    if (status.toLowerCase() === "concluida") {
      evolucao = nivelF3 > nivelF1 ? "Subiu" : (nivelF3 < nivelF1 ? "Desceu" : "Manteve");
    }

    // Validação
    var validStr = String(dataSess[r][idx.valid] || "");
    var validStatus = "pendente";
    try {
      var vObj = JSON.parse(validStr);
      validStatus = vObj.validacao || "pendente";
    } catch (e) {
      if (validStr.indexOf("aprovada") >= 0) validStatus = "aprovada";
      else if (validStr.indexOf("divergente") >= 0) validStatus = "divergente";
    }

    // Tem relatório?
    var temRel = false;
    for (var pdfName in pdfGerados) {
      if (pdfName.indexOf(colab.nome || "XXXXXXXXX") >= 0) { temRel = true; break; }
    }

    var dataConclusao = "";
    if (dataSess[r][idx.updated]) {
      try {
        var dt = new Date(dataSess[r][idx.updated]);
        if (!isNaN(dt.getTime())) {
          dataConclusao = Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
        }
      } catch (e) {}
    }

    resultado.push({
      sessao_id: sessaoId,
      email: email,
      nome: colab.nome || email,
      cargo: colab.cargo || "",
      competencia_id: compId.toUpperCase(),
      competencia: comp,
      ciclo_id: String(dataSess[r][idx.ciclo] || ""),
      nivel_fase1: nivelF1,
      nota_fase1: notaF1,
      nivel_fase3: nivelF3,
      nota_fase3: notaF3,
      evolucao: evolucao,
      delta_nivel: nivelF3 - nivelF1,
      delta_nota: Math.round((notaF3 - notaF1) * 100) / 100,
      confianca: confianca,
      lacuna: lacuna,
      validacao_status: validStatus,
      disc_dominante: colab.disc_dominante || "",
      disc_D: colab.disc_D || 0,
      disc_I: colab.disc_I || 0,
      disc_S: colab.disc_S || 0,
      disc_C: colab.disc_C || 0,
      status: status,
      data_conclusao: dataConclusao,
      tem_relatorio: temRel ? "Sim" : "Não",
      email_enviado: "Não"
    });
  }

  return resultado;
}


// ══════════════════════════════════════════════════════════════════════
// RESUMO (aba auxiliar para charts agregados)
// ══════════════════════════════════════════════════════════════════════

function _dbGerarResumo(ss, dados) {
  var wsName = "Dashboard_Resumo";
  var ws = ss.getSheetByName(wsName);
  if (!ws) ws = ss.insertSheet(wsName);
  else ws.clearContents();

  var concluidos = dados.filter(function(d) { return d.status.toLowerCase() === "concluida"; });

  // ── 1. Resumo geral ────────────────────────────────────────────────
  ws.getRange(1, 1).setValue("RESUMO GERAL").setFontWeight("bold");
  var subiram = concluidos.filter(function(d) { return d.evolucao === "Subiu"; }).length;
  var mantiveram = concluidos.filter(function(d) { return d.evolucao === "Manteve"; }).length;
  var desceram = concluidos.filter(function(d) { return d.evolucao === "Desceu"; }).length;
  var total = concluidos.length || 1;

  var resumoData = [
    ["Métrica", "Valor"],
    ["Total sessões", dados.length],
    ["Concluídas", concluidos.length],
    ["Pendentes", dados.length - concluidos.length],
    ["Evoluíram", subiram],
    ["Mantiveram", mantiveram],
    ["Regrediram", desceram],
    ["% Evolução", Math.round(subiram / total * 100) + "%"],
    ["Média Fase 1", _dbMedia(concluidos, "nivel_fase1")],
    ["Média Fase 3", _dbMedia(concluidos, "nivel_fase3")]
  ];
  ws.getRange(2, 1, resumoData.length, 2).setValues(resumoData);

  // ── 2. Por cargo ───────────────────────────────────────────────────
  ws.getRange(1, 4).setValue("POR CARGO").setFontWeight("bold");
  var cargosHeaders = [["Cargo", "Total", "Media_F1", "Media_F3", "Pct_Evolucao"]];
  ws.getRange(2, 4, 1, 5).setValues(cargosHeaders);

  var porCargo = {};
  for (var i = 0; i < concluidos.length; i++) {
    var c = concluidos[i].cargo || "Sem cargo";
    if (!porCargo[c]) porCargo[c] = [];
    porCargo[c].push(concluidos[i]);
  }

  var rowCargo = 3;
  for (var cargo in porCargo) {
    var regs = porCargo[cargo];
    var sub = regs.filter(function(r) { return r.evolucao === "Subiu"; }).length;
    ws.getRange(rowCargo, 4, 1, 5).setValues([[
      cargo,
      regs.length,
      _dbMedia(regs, "nivel_fase1"),
      _dbMedia(regs, "nivel_fase3"),
      Math.round(sub / regs.length * 100) + "%"
    ]]);
    rowCargo++;
  }

  // ── 3. Por competência ─────────────────────────────────────────────
  ws.getRange(1, 10).setValue("POR COMPETÊNCIA").setFontWeight("bold");
  var compHeaders = [["Competencia", "Total", "Media_F1", "Media_F3", "Pct_N1_N2"]];
  ws.getRange(2, 10, 1, 5).setValues(compHeaders);

  var porComp = {};
  for (var i = 0; i < concluidos.length; i++) {
    var comp = concluidos[i].competencia || "?";
    if (!porComp[comp]) porComp[comp] = [];
    porComp[comp].push(concluidos[i]);
  }

  var rowComp = 3;
  for (var comp in porComp) {
    var regs = porComp[comp];
    var n1n2 = regs.filter(function(r) { return r.nivel_fase3 <= 2; }).length;
    ws.getRange(rowComp, 10, 1, 5).setValues([[
      comp,
      regs.length,
      _dbMedia(regs, "nivel_fase1"),
      _dbMedia(regs, "nivel_fase3"),
      Math.round(n1n2 / regs.length * 100) + "%"
    ]]);
    rowComp++;
  }

  // ── 4. Distribuição DISC ───────────────────────────────────────────
  ws.getRange(1, 16).setValue("DISTRIBUIÇÃO DISC").setFontWeight("bold");
  var discHeaders = [["Perfil", "Quantidade"]];
  ws.getRange(2, 16, 1, 2).setValues(discHeaders);
  var discCount = { D: 0, I: 0, S: 0, C: 0 };
  var emailsContados = {};
  for (var i = 0; i < dados.length; i++) {
    var em = dados[i].email;
    if (emailsContados[em]) continue;
    emailsContados[em] = true;
    var dd = dados[i].disc_dominante;
    if (dd && discCount[dd] !== undefined) discCount[dd]++;
  }
  ws.getRange(3, 16, 4, 2).setValues([
    ["Dominância (D)", discCount.D],
    ["Influência (I)", discCount.I],
    ["Estabilidade (S)", discCount.S],
    ["Conformidade (C)", discCount.C]
  ]);

  // Formatação headers
  var boldRanges = [[1,1],[1,4],[1,10],[1,16]];
  for (var b = 0; b < boldRanges.length; b++) {
    ws.getRange(boldRanges[b][0], boldRanges[b][1])
      .setBackground("#0F2B54").setFontColor("#FFFFFF").setFontWeight("bold");
  }
}


function _dbMedia(arr, campo) {
  var vals = arr.map(function(r) { return r[campo] || 0; }).filter(function(v) { return v > 0; });
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce(function(a,b) { return a+b; }, 0) / vals.length * 100) / 100;
}