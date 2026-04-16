// =====================================================================
// VERTHO - EnvioRelatoriosFase3.gs
//
// Envia relatórios da Fase 3 por e-mail:
//   - Individual → colaborador recebe o próprio PDF
//   - Gestor → coordenador/diretor recebe o da equipe
//   - RH → destinatários configurados no painel
//
// Os PDFs já devem ter sido gerados anteriormente.
// Este script apenas localiza e envia.
//
// Dependências: Config.gs
// =====================================================================

var EMAIL_REMETENTE_F3 = 'diagnostico@vertho.ai';
var NOME_REMETENTE_F3  = 'Vertho';


// ══════════════════════════════════════════════════════════════════════
// MENUS
// ══════════════════════════════════════════════════════════════════════

function enviarRelatoriosIndividuaisFase3Menu() {
  return _enviarComConfirmacao(
    "Enviar Relatórios Individuais — Fase 3",
    "Envia o PDF individual para cada colaborador por e-mail.\n"
    + "Apenas colaboradores com PDF gerado e ainda não enviado.\n\nContinuar?",
    enviarRelatoriosIndividuaisFase3
  );
}

function enviarRelatoriosGestorFase3Menu() {
  return _enviarComConfirmacao(
    "Enviar Relatórios do Gestor — Fase 3",
    "Envia o PDF consolidado para cada Coordenador e Diretor.\n\nContinuar?",
    enviarRelatoriosGestorFase3
  );
}

function enviarRelatorioRHFase3Menu() {
  return _enviarComConfirmacao(
    "Enviar Relatório RH — Fase 3",
    "Envia o relatório consolidado para os destinatários RH configurados no painel.\n\nContinuar?",
    enviarRelatorioRHFase3
  );
}

function _enviarComConfirmacao(titulo, msg, fn) {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(titulo, msg, ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  var resultado = fn();
  ui.alert(titulo, "Enviados: " + resultado.enviados + "\nErros: " + resultado.erros, ui.ButtonSet.OK);
}


// ══════════════════════════════════════════════════════════════════════
// 1. ENVIO INDIVIDUAL
// ══════════════════════════════════════════════════════════════════════

function enviarRelatoriosIndividuaisFase3() {
  Logger.log("=== ENVIANDO RELATÓRIOS INDIVIDUAIS — FASE 3 ===");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folder = DriveApp.getFolderById(RELATORIO_F3_PASTA);
  var enviados = 0, erros = 0;

  // Buscar colaboradores com sessões concluídas
  var wsSessoes = ss.getSheetByName(Config.SHEET_SESSOES || "Sessoes");
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  if (!wsSessoes || !wsColab) return { enviados: 0, erros: 0 };

  // Mapear nomes
  var nomes = {};
  var dataColab = wsColab.getDataRange().getValues();
  for (var r = 4; r < dataColab.length; r++) {
    var email = String(dataColab[r][6] || "").trim().toLowerCase();
    var nome = String(dataColab[r][1] || "").trim();
    if (email && nome) nomes[email] = nome;
  }

  // Buscar e-mails com sessão concluída
  var dataSess = wsSessoes.getDataRange().getValues();
  var headers = dataSess[0];
  var idxEmail = -1, idxStatus = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c]).toLowerCase().trim();
    if (h === "colaborador_id") idxEmail = c;
    if (h === "status") idxStatus = c;
  }

  var emailsEnviados = {};
  for (var r = 1; r < dataSess.length; r++) {
    var status = String(dataSess[r][idxStatus] || "").toLowerCase();
    if (status !== "concluida") continue;
    var email = String(dataSess[r][idxEmail] || "").toLowerCase().trim();
    if (!email || emailsEnviados[email]) continue;

    var nome = nomes[email] || email;
    var pdf = _encontrarPDF(folder, nome);
    if (!pdf) {
      Logger.log("PDF não encontrado para: " + nome);
      continue;
    }

    try {
      _enviarEmail(
        email,
        "Seu Relatório de Avaliação — Fase 3 | Vertho",
        _templateEmailIndividual(nome),
        pdf
      );
      emailsEnviados[email] = true;
      enviados++;
      Logger.log("✅ Enviado para: " + email);
    } catch (e) {
      Logger.log("❌ Erro ao enviar para " + email + ": " + e.message);
      erros++;
    }
  }

  Logger.log("=== RESULTADO: " + enviados + " enviados, " + erros + " erros ===");
  return { enviados: enviados, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// 2. ENVIO GESTOR
// ══════════════════════════════════════════════════════════════════════

function enviarRelatoriosGestorFase3() {
  Logger.log("=== ENVIANDO RELATÓRIOS DO GESTOR — FASE 3 ===");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folder = DriveApp.getFolderById(RELGESTOR_F3_PASTA);
  var enviados = 0, erros = 0;

  // Identificar gestores
  var wsColab = ss.getSheetByName(Config.SHEET_COLABORADORES || "Colaboradores");
  if (!wsColab) return { enviados: 0, erros: 0 };

  var dataColab = wsColab.getDataRange().getValues();
  for (var r = 4; r < dataColab.length; r++) {
    var email = String(dataColab[r][6] || "").trim().toLowerCase();
    var nome = String(dataColab[r][1] || "").trim();
    var cargo = String(dataColab[r][3] || "").toLowerCase();

    if (!email || !nome) continue;
    if (cargo.indexOf("coordenador") < 0 && cargo.indexOf("diretor") < 0) continue;

    var pdf = _encontrarPDF(folder, nome);
    if (!pdf) {
      Logger.log("PDF do gestor não encontrado para: " + nome);
      continue;
    }

    try {
      _enviarEmail(
        email,
        "Relatório da Equipe — Fase 3 | Vertho",
        _templateEmailGestor(nome),
        pdf
      );
      enviados++;
      Logger.log("✅ Enviado para gestor: " + email);
    } catch (e) {
      Logger.log("❌ Erro ao enviar para gestor " + email + ": " + e.message);
      erros++;
    }
  }

  Logger.log("=== RESULTADO: " + enviados + " enviados, " + erros + " erros ===");
  return { enviados: enviados, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// 3. ENVIO RH
// ══════════════════════════════════════════════════════════════════════

function enviarRelatorioRHFase3() {
  Logger.log("=== ENVIANDO RELATÓRIO RH — FASE 3 ===");
  var folder = DriveApp.getFolderById(RELRH_F3_PASTA);
  var enviados = 0, erros = 0;

  // Buscar destinatários do painel
  var props = PropertiesService.getScriptProperties();
  var emailsRH = String(props.getProperty('cfg_emails_rh') || "").trim();
  if (!emailsRH) {
    // Fallback: enviar para o dono do script
    emailsRH = Session.getActiveUser().getEmail();
    Logger.log("Sem destinatários RH configurados, enviando para: " + emailsRH);
  }

  var destinatarios = emailsRH.split(",").map(function(e) { return e.trim(); }).filter(function(e) { return e; });
  if (destinatarios.length === 0) return { enviados: 0, erros: 0 };

  // Buscar PDF mais recente na pasta
  var pdf = _encontrarPDFMaisRecente(folder, "Relatório RH Fase 3");
  if (!pdf) {
    Logger.log("PDF do RH não encontrado na pasta");
    return { enviados: 0, erros: 1 };
  }

  for (var i = 0; i < destinatarios.length; i++) {
    try {
      _enviarEmail(
        destinatarios[i],
        "Relatório Consolidado RH — Fase 3 | Vertho",
        _templateEmailRH(),
        pdf
      );
      enviados++;
      Logger.log("✅ Enviado para RH: " + destinatarios[i]);
    } catch (e) {
      Logger.log("❌ Erro ao enviar para " + destinatarios[i] + ": " + e.message);
      erros++;
    }
  }

  Logger.log("=== RESULTADO: " + enviados + " enviados, " + erros + " erros ===");
  return { enviados: enviados, erros: erros };
}


// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

/**
 * Encontra PDF pelo nome do colaborador/gestor na pasta.
 */
function _encontrarPDF(folder, nome) {
  var files = folder.getFilesByType("application/pdf");
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().indexOf(nome) >= 0) {
      return file;
    }
  }
  return null;
}

/**
 * Encontra o PDF mais recente com prefixo específico.
 */
function _encontrarPDFMaisRecente(folder, prefixo) {
  var files = folder.getFilesByType("application/pdf");
  var maisRecente = null;
  var dataRecente = new Date(0);
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().indexOf(prefixo) >= 0) {
      var data = file.getDateCreated();
      if (data > dataRecente) {
        dataRecente = data;
        maisRecente = file;
      }
    }
  }
  return maisRecente;
}

/**
 * Envia e-mail com PDF anexo.
 */
function _enviarEmail(destinatario, assunto, corpoHtml, pdfFile) {
  var props = PropertiesService.getScriptProperties();
  var remetente = props.getProperty('cfg_email') || EMAIL_REMETENTE_F3;

  var options = {
    htmlBody: corpoHtml,
    attachments: [pdfFile.getAs("application/pdf")],
    name: NOME_REMETENTE_F3
  };

  // Usar alias se configurado
  if (remetente && remetente !== Session.getActiveUser().getEmail()) {
    options.from = remetente;
  }

  GmailApp.sendEmail(destinatario, assunto, "", options);
}


// ══════════════════════════════════════════════════════════════════════
// TEMPLATES DE E-MAIL
// ══════════════════════════════════════════════════════════════════════

function _templateEmailIndividual(nome) {
  var primeiroNome = (nome || "").split(" ")[0] || "Colaborador";
  return '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">'
    + '<div style="background:#0f2b54;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">'
    + '<span style="color:#fff;font-size:18px;font-weight:700">Vertho</span>'
    + '<span style="color:#34c5cc;font-size:14px;margin-left:8px">Mentor IA</span>'
    + '</div>'
    + '<div style="background:#f7f9fc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">'
    + '<p style="font-size:15px;color:#1e293b;margin:0 0 16px">Olá, <strong>' + primeiroNome + '</strong>!</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'Seu relatório da <strong>Fase 3 — Avaliação Conversacional</strong> está pronto.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'Nele você encontra o comparativo entre a Fase 1 e a Fase 3, com análise detalhada '
    + 'de cada competência avaliada, pontos de evolução e próximos passos.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + '📎 O PDF está anexo a este e-mail.</p>'
    + '<p style="font-size:13px;color:#94a3b8;margin:16px 0 0">🔒 Este relatório é confidencial e pessoal.</p>'
    + '</div></div>';
}

function _templateEmailGestor(nome) {
  var primeiroNome = (nome || "").split(" ")[0] || "Gestor";
  return '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">'
    + '<div style="background:#0f2b54;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">'
    + '<span style="color:#fff;font-size:18px;font-weight:700">Vertho</span>'
    + '<span style="color:#34c5cc;font-size:14px;margin-left:8px">Mentor IA</span>'
    + '</div>'
    + '<div style="background:#f7f9fc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">'
    + '<p style="font-size:15px;color:#1e293b;margin:0 0 16px">Olá, <strong>' + primeiroNome + '</strong>!</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'O <strong>Relatório Consolidado da sua Equipe — Fase 3</strong> está pronto.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'Nele você encontra a evolução da equipe, ranking de atenção, análise por competência, '
    + 'perfil comportamental do grupo e recomendações práticas com prazos.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + '📎 O PDF está anexo a este e-mail.</p>'
    + '<p style="font-size:13px;color:#94a3b8;margin:16px 0 0">🔒 Este relatório é confidencial e destinado à gestão.</p>'
    + '</div></div>';
}

function _templateEmailRH() {
  return '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">'
    + '<div style="background:#0f2b54;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">'
    + '<span style="color:#fff;font-size:18px;font-weight:700">Vertho</span>'
    + '<span style="color:#34c5cc;font-size:14px;margin-left:8px">Mentor IA</span>'
    + '</div>'
    + '<div style="background:#f7f9fc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">'
    + '<p style="font-size:15px;color:#1e293b;margin:0 0 16px">Olá!</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'O <strong>Relatório Consolidado de RH — Fase 3</strong> está pronto.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'Nele você encontra a visão completa da organização: indicadores quantitativos, '
    + 'comparativo Fase 1 vs Fase 3, competências críticas, sugestões de treinamento, '
    + 'decisões-chave e plano de ação.</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + '📎 O PDF está anexo a este e-mail.</p>'
    + '<p style="font-size:13px;color:#94a3b8;margin:16px 0 0">🔒 Este relatório é confidencial e destinado ao RH / T&D.</p>'
    + '</div></div>';
}