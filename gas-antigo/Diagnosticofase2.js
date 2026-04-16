// ═══════════════════════════════════════════════════════════════════════
// DiagnosticoFase2.gs — Backend do Diagnóstico via Web App
// Substitui Google Forms. Colaborador faz 1 competência por dia.
// Mapeamento de colunas baseado na planilha real Macaé
// v2 — matchEmail na busca de cenários + status 'Gerado' aceito
// ═══════════════════════════════════════════════════════════════════════

function serveDiagnostico(emailParam) {
  var html = HtmlService.createHtmlOutputFromFile('DiagnosticoWebApp').getContent();
  // Injetar email + URL do app
  var inject = '<script>';
  if (emailParam) {
    inject += 'var DIAG_EMAIL_PARAM = "' + String(emailParam).replace(/[^a-zA-Z0-9@._\-]/g, '') + '";';
  }
  var safeEmail = emailParam ? String(emailParam).replace(/[^a-zA-Z0-9@._\-]/g, '') : '';
  inject += 'var DIAG_APP_URL = "https://app.vertho.com.br' + (safeEmail ? '?email=' + safeEmail : '') + '";';
  inject += '</script>';
  html = html.replace('</head>', inject + '</head>');
  return HtmlService.createHtmlOutput(html)
    .setTitle('Vertho — Diagnóstico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ─── COLUNAS REAIS DA PLANILHA ──────────────────────────────────────
var DIAG = {
  SHEET_COLAB:       'Colaboradores',
  COLAB_HEADER:      4,        // dados começam na linha 5
  COLAB_ID_COL:      1,        // A: ID Vertho
  COLAB_NOME_COL:    2,        // B: Nome Completo
  COLAB_EMPRESA_COL: 3,        // C: Empresa Cliente
  COLAB_CARGO_COL:   4,        // D: Cargo
  COLAB_AREA_COL:    5,        // E: Área / Depto (= Escola)
  COLAB_EMAIL_COL:   7,        // G: E-mail Corporativo

  SHEET_CENARIOS:    'Banco_Cenarios',
  CEN_HEADER:        4,        // dados a partir de linha 5
  CEN_COLAB_ID_COL:  1,        // A: ID Colaborador (Macaé usa e-mail aqui)
  CEN_COLAB_NOME_COL:2,        // B: Nome Colaborador
  CEN_CARGO_COL:     4,        // D: Cargo
  CEN_COMP_COL:      11,       // K: Competência (ID | Nome | Tipo)
  CEN_STATUS_COL:    12,       // L: Status IA 3 ('Gerado' ou 'Aprovado')
  CEN_CONTEXTO_COL:  13,       // M: Contexto do Cenário
  CEN_PERSON_COL:    14,       // N: Personagens
  CEN_GATILHO_COL:   15,       // O: Situação-Gatilho
  CEN_P1_COL:        16,       // P: P1 — Situação
  CEN_P2_COL:        17,       // Q: P2 — Ação
  CEN_P3_COL:        18,       // R: P3 — Raciocínio
  CEN_P4_COL:        19,       // S: P4 — CIS (gap)
  CEN_REVISAO_COL:   20,       // T: Sim / Ajustar / Não usar
  CEN_CHECK_STATUS:  26,       // Z: Status IA Check

  SHEET_RESPOSTAS:   'Respostas',
  RESP_HEADER:       1,        // header na linha 1, dados a partir de 2
  RESP_TIMESTAMP:    1,        // A: Timestamp
  RESP_EMAIL_COL:    2,        // B: E-mail
  RESP_NOME_COL:     3,        // C: Nome Colaborador
  RESP_EMPRESA_COL:  4,        // D: Empresa
  RESP_CARGO_COL:    5,        // E: Cargo
  RESP_COMP_ID_COL:  6,        // F: ID Competência
  RESP_COMP_NOME_COL:7,        // G: Nome Competência
  RESP_PREF_PDI_COL: 8,        // H: Preferência PDI
  RESP_R1_COL:       10,       // J: R1 — Situação
  RESP_R2_COL:       11,       // K: R2 — Ação
  RESP_R3_COL:       12,       // L: R3 — Raciocínio
  RESP_R4_COL:       13,       // M: R4 — CIS (gap)
  RESP_REPR_COL:     14,       // N: Representatividade
  RESP_CANAL_COL:    15,       // O: Canal
  RESP_STATUS_COL:   16,       // P: Status IA 4
};

// ─── DADOS DO DIAGNÓSTICO ──────────────────────────────────────────
function getDiagnosticoData(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email) return { error: 'E-mail não informado.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var colab = _diagBuscarColaborador(ss, email);
  if (!colab) return { error: 'E-mail não encontrado. Verifique e tente novamente.' };
  var cenarios  = _diagBuscarCenarios(ss, colab);
  Logger.log('getDiagnosticoData: email=' + email + ' cargo=' + colab.cargo + ' escola=' + (colab.area || colab.escola || '') + ' cenarios=' + cenarios.length);
  var respostas = _diagBuscarRespostas(ss, email);
  Logger.log('getDiagnosticoData: respostas=' + respostas.length);
  var respondidas = {};
  respostas.forEach(function(r) { respondidas[r.compId.toLowerCase()] = true; });
  var pendentes  = cenarios.filter(function(c) { return !respondidas[c.compId.toLowerCase()]; });
  var concluidos = cenarios.filter(function(c) { return !!respondidas[c.compId.toLowerCase()]; });
  var hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var respondeuHoje = respostas.some(function(r) { return r.data && r.data.indexOf(hoje) >= 0; });
  var cenarioDoDia = null;
  if (pendentes.length > 0 && !respondeuHoje) cenarioDoDia = pendentes[0];
  return {
    colaborador:       { nome: colab.nome, cargo: colab.cargo, empresa: colab.empresa, email: email },
    cenarioDoDia:      cenarioDoDia,
    respondeuHoje:     respondeuHoje,
    progresso: {
      total:      cenarios.length,
      respondidas: concluidos.length,
      pendentes:  pendentes.length,
      pct:        cenarios.length > 0 ? Math.round((concluidos.length / cenarios.length) * 100) : 0
    },
    proximaCompetencia: pendentes.length > 1 ? pendentes[1].compNome : null,
    concluiuTudo:       pendentes.length === 0
  };
}

// ─── SALVAR RESPOSTA ───────────────────────────────────────────────
function salvarRespostaDiagnostico(email, compId, compNome, respostas) {
  email = String(email || '').toLowerCase().trim();
  if (!email || !compId) return { error: 'Dados incompletos.' };
  var r1 = String(respostas.r1 || '').trim();
  var r2 = String(respostas.r2 || '').trim();
  var r3 = String(respostas.r3 || '').trim();
  var r4 = String(respostas.r4 || '').trim();
  if (r1.length < 20 || r2.length < 20 || r3.length < 20 || r4.length < 20) {
    return { error: 'Todas as 4 perguntas são obrigatórias (mínimo 20 caracteres cada).' };
  }
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var colab = _diagBuscarColaborador(ss, email);
  if (!colab) return { error: 'Colaborador não encontrado.' };
  var existentes = _diagBuscarRespostas(ss, email);
  if (existentes.some(function(r) { return r.compId.toLowerCase() === compId.toLowerCase(); })) {
    return { error: 'Você já respondeu esta competência.' };
  }
  var ws         = ss.getSheetByName(DIAG.SHEET_RESPOSTAS);
  var ultimaLinha = ws.getLastRow() + 1;
  var agora      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var row = [];
  for (var c = 0; c < 27; c++) row.push('');
  row[DIAG.RESP_TIMESTAMP    - 1] = agora;
  row[DIAG.RESP_EMAIL_COL    - 1] = email;
  row[DIAG.RESP_NOME_COL     - 1] = colab.nome;
  row[DIAG.RESP_EMPRESA_COL  - 1] = colab.escola || colab.area || colab.empresa || '';
  row[DIAG.RESP_CARGO_COL    - 1] = colab.cargo;
  row[DIAG.RESP_COMP_ID_COL  - 1] = compId;
  row[DIAG.RESP_COMP_NOME_COL- 1] = compNome;
  row[DIAG.RESP_PREF_PDI_COL - 1] = 'E-mail';
  row[DIAG.RESP_R1_COL       - 1] = r1;
  row[DIAG.RESP_R2_COL       - 1] = r2;
  row[DIAG.RESP_R3_COL       - 1] = r3;
  row[DIAG.RESP_R4_COL       - 1] = r4;
  row[DIAG.RESP_REPR_COL     - 1] = respostas.repr || '';
  row[DIAG.RESP_CANAL_COL    - 1] = 'webapp';
  row[DIAG.RESP_STATUS_COL   - 1] = 'Pendente IA4';
  ws.getRange(ultimaLinha, 1, 1, row.length).setValues([row]);
  var cenarios2    = _diagBuscarCenarios(ss, colab);
  var respondidas2 = {};
  _diagBuscarRespostas(ss, email).forEach(function(r) { respondidas2[r.compId.toLowerCase()] = true; });
  var pend = cenarios2.filter(function(c) { return !respondidas2[c.compId.toLowerCase()]; });
  return {
    success: true,
    message: 'Resposta salva!',
    progresso: {
      total:       cenarios2.length,
      respondidas: cenarios2.length - pend.length,
      pendentes:   pend.length,
      pct:         cenarios2.length > 0 ? Math.round(((cenarios2.length - pend.length) / cenarios2.length) * 100) : 0
    },
    proximaCompetencia: pend.length > 0 ? pend[0].compNome : null,
    concluiuTudo:       pend.length === 0
  };
}

// ─── URLs WEB APP (Cloudflare) ────────────────────────────────────
function salvarURLDiagnostico(url) {
  PropertiesService.getScriptProperties().setProperty('cfg_url_diagnostico', url || '');
}
function getURLDiagnostico() {
  return PropertiesService.getScriptProperties().getProperty('cfg_url_diagnostico') || '';
}
function salvarURLChat(url) {
  PropertiesService.getScriptProperties().setProperty('cfg_url_chat', url || '');
}
function getURLChat() {
  return PropertiesService.getScriptProperties().getProperty('cfg_url_chat') || '';
}

// ─── HELPERS INTERNOS ─────────────────────────────────────────────
function _diagBuscarColaborador(ss, email) {
  var ws = ss.getSheetByName(DIAG.SHEET_COLAB);
  if (!ws) return null;
  var data = ws.getDataRange().getValues();
  for (var i = DIAG.COLAB_HEADER; i < data.length; i++) {
    var rowEmail = String(data[i][DIAG.COLAB_EMAIL_COL - 1] || '').toLowerCase().trim();
    if (rowEmail === email) {
      return {
        id:      String(data[i][DIAG.COLAB_ID_COL      - 1] || ''),
        nome:    String(data[i][DIAG.COLAB_NOME_COL    - 1] || ''),
        empresa: String(data[i][DIAG.COLAB_EMPRESA_COL - 1] || ''),
        cargo:   String(data[i][DIAG.COLAB_CARGO_COL   - 1] || ''),
        area:    String(data[i][DIAG.COLAB_AREA_COL    - 1] || ''),
        escola:  String(data[i][DIAG.COLAB_AREA_COL    - 1] || ''),
        email:   rowEmail
      };
    }
  }
  return null;
}

function _diagBuscarCenarios(ss, colab) {
  // MODO BANCO (v2): cenario fixo por cargo x competencia
  // Verifica Banco_Cenarios primeiro; fallback para aba Cenarios individual (legado)
  var cenariosBanco = bancoBuscarCenarios(ss, colab);
  if (cenariosBanco.length > 0) return cenariosBanco;

  // MODO LEGADO: aba Cenarios individual por colaborador
  return _diagBuscarCenariosLegado(ss, colab);
}

function _diagBuscarCenariosLegado(ss, colab) {
  var ws = ss.getSheetByName(DIAG.SHEET_CENARIOS);
  if (!ws) return [];
  var data = ws.getDataRange().getValues();
  var resultados = [];
  var competenciasVistas = {};
  for (var i = DIAG.CEN_HEADER; i < data.length; i++) {
    // Aceita 'Gerado' (Macaé) e 'Aprovado' (Betão)
    var statusIA3 = String(data[i][DIAG.CEN_STATUS_COL - 1] || '').toLowerCase().trim();
    if (statusIA3 !== 'gerado' && statusIA3 !== 'aprovado') continue;

    var revisao = String(data[i][DIAG.CEN_REVISAO_COL - 1] || '').toLowerCase().trim();
    if (revisao === 'não usar' || revisao === 'nao usar') continue;

    var cenColabId   = String(data[i][DIAG.CEN_COLAB_ID_COL   - 1] || '').toLowerCase().trim();
    var cenColabNome = String(data[i][DIAG.CEN_COLAB_NOME_COL - 1] || '').toLowerCase().trim();

    // Macaé: col A de Cenários = e-mail. Aceita match por e-mail, ID ou nome.
    var matchEmail = cenColabId   === colab.email.toLowerCase();
    var matchId    = colab.id && cenColabId === colab.id.toLowerCase();
    var matchNome  = cenColabNome === colab.nome.toLowerCase();
    if (!matchEmail && !matchId && !matchNome) continue;

    var compRaw   = String(data[i][DIAG.CEN_COMP_COL - 1] || '');
    var compParts = compRaw.split('|').map(function(s) { return s.trim(); });
    var compId    = compParts[0] || compRaw;
    var compNome  = compParts[1] || compRaw;
    if (!compId || competenciasVistas[compId.toLowerCase()]) continue;
    competenciasVistas[compId.toLowerCase()] = true;

    resultados.push({
      compId:      compId,
      compNome:    compNome,
      contexto:    String(data[i][DIAG.CEN_CONTEXTO_COL - 1] || ''),
      personagens: String(data[i][DIAG.CEN_PERSON_COL   - 1] || ''),
      gatilho:     String(data[i][DIAG.CEN_GATILHO_COL  - 1] || ''),
      p1:          String(data[i][DIAG.CEN_P1_COL        - 1] || ''),
      p2:          String(data[i][DIAG.CEN_P2_COL        - 1] || ''),
      p3:          String(data[i][DIAG.CEN_P3_COL        - 1] || ''),
      p4:          String(data[i][DIAG.CEN_P4_COL        - 1] || '')
    });
  }
  return resultados;
}

function _diagBuscarRespostas(ss, email) {
  var ws = ss.getSheetByName(DIAG.SHEET_RESPOSTAS);
  if (!ws) return [];
  var data = ws.getDataRange().getValues();
  var resultados = [];
  for (var i = DIAG.RESP_HEADER; i < data.length; i++) {
    var rowEmail = String(data[i][DIAG.RESP_EMAIL_COL - 1] || '').toLowerCase().trim();
    if (rowEmail !== email) continue;
    resultados.push({
      compId: String(data[i][DIAG.RESP_COMP_ID_COL - 1] || ''),
      data:   String(data[i][DIAG.RESP_TIMESTAMP   - 1] || '')
    });
  }
  return resultados;
}

// ═══════════════════════════════════════════════════════════════════════
// E-MAILS — ONBOARDING + LEMBRETES (2 dias sem resposta)
// ═══════════════════════════════════════════════════════════════════════

var DIAG_EMAIL = {
  DIAS_SEM_RESPOSTA: 2,
  PROP_ONBOARDING:   'diag_onboarding_sent',
  PROP_LEMBRETE:     'diag_lembrete_sent',
  REMETENTE:         'diagnostico@vertho.ai',
};

// ─── DISPARAR ONBOARDING ──────────────────────────────────────────
function painelDisparo() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();
  var sent  = _diagGetTracking(props, DIAG_EMAIL.PROP_ONBOARDING);
  var webAppUrl = _diagGetWebAppUrl(props);
  if (!webAppUrl) {
    Logger.log('⚠️ painelDisparo: URL do Web App não configurada');
    try { SpreadsheetApp.getUi().alert('Configure a URL do Web App antes de disparar.'); } catch(e) {}
    return { enviados: 0, pulados: 0, erros: 1 };
  }
  var colabs = _diagListarColaboradoresAtivos(ss);
  var enviados = 0, pulados = 0, erros = 0;
  colabs.forEach(function(colab) {
    if (sent[colab.email]) { pulados++; return; }
    try {
      _diagEnviarOnboarding(colab, webAppUrl);
      sent[colab.email] = new Date().toISOString();
      enviados++;
      Utilities.sleep(300);
    } catch(e) {
      Logger.log('❌ Onboarding falhou para ' + colab.email + ': ' + e.message);
      erros++;
    }
  });
  _diagSaveTracking(props, DIAG_EMAIL.PROP_ONBOARDING, sent);
  Logger.log('✅ painelDisparo — enviados: ' + enviados + ' | pulados: ' + pulados + ' | erros: ' + erros);
  return { enviados: enviados, pulados: pulados, erros: erros };
}

// ─── LEMBRETES AUTOMÁTICOS (trigger diário) ───────────────────────
function enviarLembretesAusentes() {
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var props     = PropertiesService.getScriptProperties();
  var onboard   = _diagGetTracking(props, DIAG_EMAIL.PROP_ONBOARDING);
  var lembretes = _diagGetTracking(props, DIAG_EMAIL.PROP_LEMBRETE);
  var webAppUrl = _diagGetWebAppUrl(props);
  if (!webAppUrl) { Logger.log('⚠️ enviarLembretesAusentes: URL não configurada'); return; }
  var agora    = new Date();
  var colabs   = _diagListarColaboradoresAtivos(ss);
  var enviados = 0;
  colabs.forEach(function(colab) {
    if (!onboard[colab.email]) return;
    var cenarios  = _diagBuscarCenarios(ss, colab);
    var respostas = _diagBuscarRespostas(ss, colab.email);
    if (respostas.length >= cenarios.length && cenarios.length > 0) return;
    var ultimaAtividade = new Date(onboard[colab.email]);
    respostas.forEach(function(r) {
      if (r.data) { var d = new Date(r.data); if (d > ultimaAtividade) ultimaAtividade = d; }
    });
    var diasInativos = (agora - ultimaAtividade) / (24 * 60 * 60 * 1000);
    if (diasInativos < DIAG_EMAIL.DIAS_SEM_RESPOSTA) return;
    var ultLembrete = lembretes[colab.email] ? new Date(lembretes[colab.email]) : null;
    if (ultLembrete && (agora - ultLembrete) < 24 * 60 * 60 * 1000) return;
    var respondidas = {};
    respostas.forEach(function(r) { respondidas[r.compId.toLowerCase()] = true; });
    var pendentes = cenarios.filter(function(c) { return !respondidas[c.compId.toLowerCase()]; });
    if (pendentes.length === 0) return;
    try {
      _diagEnviarLembrete(colab, webAppUrl, pendentes[0].compNome, Math.floor(diasInativos));
      lembretes[colab.email] = agora.toISOString();
      enviados++;
      Utilities.sleep(300);
    } catch(e) {
      Logger.log('❌ Lembrete falhou para ' + colab.email + ': ' + e.message);
    }
  });
  _diagSaveTracking(props, DIAG_EMAIL.PROP_LEMBRETE, lembretes);
  Logger.log('✅ enviarLembretesAusentes — lembretes enviados: ' + enviados);
}

// ─── TRIGGERS ────────────────────────────────────────────────────
function configurarTriggerLembretes() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enviarLembretesAusentes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarLembretesAusentes').timeBased().everyDays(1).atHour(8).create();
  Logger.log('✅ Trigger diário configurado: enviarLembretesAusentes às 8h');
  try { SpreadsheetApp.getUi().alert('Trigger configurado! Lembretes enviados diariamente às 8h.'); } catch(e) {}
}

function removerTriggerLembretes() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enviarLembretesAusentes') ScriptApp.deleteTrigger(t);
  });
  Logger.log('⏹ Trigger de lembretes removido');
  try { SpreadsheetApp.getUi().alert('Trigger removido.'); } catch(e) {}
}

// ─── TEMPLATES DE E-MAIL ──────────────────────────────────────────
function _diagEnviarOnboarding(colab, webAppUrl) {
  var primeiroNome = colab.nome.split(' ')[0];
  var link = webAppUrl + (webAppUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=diagnostico&email=' + encodeURIComponent(colab.email);
  var assunto = 'Sua avaliação de competências está disponível — Vertho';
  var corpo = '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1c2e4a">'
    + '<p>Olá, <strong>' + primeiroNome + '</strong>!</p>'
    + '<p>Sua avaliação de competências profissionais está disponível na plataforma <strong>Vertho Mentor IA</strong>.</p>'
    + '<p>O processo é simples:</p>'
    + '<ul>'
    + '<li>Você responderá <strong>1 competência por dia</strong>, no seu tempo.</li>'
    + '<li>Cada avaliação leva cerca de <strong>10 minutos</strong>.</li>'
    + '<li>Suas respostas são <strong>confidenciais</strong>.</li>'
    + '</ul>'
    + '<p style="margin:24px 0">'
    + '<a href="' + link + '" style="background:#0f2240;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">▶ Iniciar avaliação</a>'
    + '</p>'
    + '<p style="font-size:12px;color:#6b7fa3">Se o botão não funcionar, copie e cole este link:<br>' + link + '</p>'
    + '<hr style="border:none;border-top:1px solid #dde6f4;margin:24px 0">'
    + '<p style="font-size:11px;color:#6b7fa3">Vertho · ' + colab.empresa + '</p>'
    + '</div>';
  GmailApp.sendEmail(colab.email, assunto, '', { htmlBody: corpo, name: 'Vertho Diagnóstico' });
  Logger.log('📧 Onboarding enviado → ' + colab.email);
}

function _diagEnviarLembrete(colab, webAppUrl, proxComp, diasInativos) {
  var primeiroNome = colab.nome.split(' ')[0];
  var link = webAppUrl + (webAppUrl.indexOf('?') >= 0 ? '&' : '?') + 'view=diagnostico&email=' + encodeURIComponent(colab.email);
  var assunto = 'Lembrete: próxima competência aguardando — ' + proxComp;
  var corpo = '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1c2e4a">'
    + '<p>Olá, <strong>' + primeiroNome + '</strong>!</p>'
    + '<p>Faz <strong>' + diasInativos + ' dia' + (diasInativos > 1 ? 's' : '') + '</strong> desde sua última atividade.</p>'
    + '<div style="background:#f0f7ff;border-left:4px solid #3584e4;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0">'
    + '<strong style="font-size:15px">📌 ' + proxComp + '</strong>'
    + '</div>'
    + '<p style="margin:24px 0">'
    + '<a href="' + link + '" style="background:#0f2240;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">▶ Continuar avaliação</a>'
    + '</p>'
    + '<p style="font-size:12px;color:#6b7fa3">Se o botão não funcionar, copie e cole este link:<br>' + link + '</p>'
    + '<hr style="border:none;border-top:1px solid #dde6f4;margin:24px 0">'
    + '<p style="font-size:11px;color:#6b7fa3">Vertho · ' + colab.empresa + '</p>'
    + '</div>';
  GmailApp.sendEmail(colab.email, assunto, '', { htmlBody: corpo, name: 'Vertho Diagnóstico' });
  Logger.log('📧 Lembrete enviado → ' + colab.email);
}

// ─── HELPERS INTERNOS DE E-MAIL ───────────────────────────────────
function _diagListarColaboradoresAtivos(ss) {
  var ws = ss.getSheetByName(DIAG.SHEET_COLAB);
  if (!ws) return [];
  var data   = ws.getDataRange().getValues();
  var result = [];
  for (var i = DIAG.COLAB_HEADER; i < data.length; i++) {
    var email = String(data[i][DIAG.COLAB_EMAIL_COL - 1] || '').toLowerCase().trim();
    var nome  = String(data[i][DIAG.COLAB_NOME_COL  - 1] || '').trim();
    if (!email || email.indexOf('@') < 0) continue;
    result.push({
      id:      String(data[i][DIAG.COLAB_ID_COL      - 1] || ''),
      nome:    nome,
      empresa: String(data[i][DIAG.COLAB_EMPRESA_COL - 1] || ''),
      cargo:   String(data[i][DIAG.COLAB_CARGO_COL   - 1] || ''),
      area:    String(data[i][DIAG.COLAB_AREA_COL    - 1] || ''),
      escola:  String(data[i][DIAG.COLAB_AREA_COL    - 1] || ''),
      email:   email
    });
  }
  return result;
}

function _diagGetWebAppUrl(props) {
  var saved = props.getProperty('cfg_url_diagnostico');
  if (saved) return saved;
  try { return ScriptApp.getService().getUrl() + '?view=diagnostico'; } catch(e) { return ''; }
}

function _diagGetTracking(props, key) {
  try { return JSON.parse(props.getProperty(key) || '{}'); } catch(e) { return {}; }
}

function _diagSaveTracking(props, key, obj) {
  props.setProperty(key, JSON.stringify(obj));
}

// ─── DEBUG ────────────────────────────────────────────────────────
function debugDiagnostico() {
  var resultado = getDiagnosticoData('rdnaves@gmail.com');
  Logger.log(JSON.stringify(resultado));
}