// =====================================================================
// VERTHO - Main.gs  (Fase 3/5 - IA Conversacional)
// Entry point do Web App + bridge functions para ChatWebApp.html
// =====================================================================

// Views que exigem autenticação OTP (Fase 4)
// Arquivos: Fase4_OTP.gs · Fase4_Tutor.gs · Fase4_Painel.gs · Fase4_Evidencia.gs
var VIEWS_PROTEGIDAS = ['dashboard', 'tutor', 'painel'];

function doGet(e) {
  try {
    var view  = (e && e.parameter && e.parameter.view)  || '';
    var token = (e && e.parameter && e.parameter.token) || '';

    // ── Diagnóstico API: chamado pelo Cloudflare Worker via GET ──
    if (view === 'diagapi' && e.parameter.fn) {
      try {
        var fn = e.parameter.fn;
        var fnArgs = e.parameter.args ? JSON.parse(decodeURIComponent(e.parameter.args)) : {};
        var fnArgsArr = fnArgs.args || [];
        var diagResult = null;

        if (fn === 'getDiagnosticoData' && fnArgsArr[0]) {
          diagResult = getDiagnosticoData(fnArgsArr[0]);
        } else if (fn === 'salvarRespostaDiagnostico' && fnArgsArr.length >= 4) {
          diagResult = salvarRespostaDiagnostico(fnArgsArr[0], fnArgsArr[1], fnArgsArr[2], fnArgsArr[3]);
        } else if (fn === 'enviarOTP' && fnArgsArr.length >= 2) {
          diagResult = enviarOTP(fnArgsArr[0], fnArgsArr[1]);
        } else if (fn === 'validarOTP' && fnArgsArr.length >= 2) {
          diagResult = validarOTP(fnArgsArr[0], fnArgsArr[1]);
        } else {
          diagResult = { error: 'Função não suportada: ' + fn };
        }
        return ContentService.createTextOutput(JSON.stringify(diagResult)).setMimeType(ContentService.MimeType.JSON);
      } catch(diagErr) {
        return ContentService.createTextOutput(JSON.stringify({ error: diagErr.message })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── App API: chamado pelo Cloudflare Worker via GET ──
    if (view === 'appapi' && e.parameter.action) {
      try {
        var action = e.parameter.action;
        var params = e.parameter.params ? JSON.parse(decodeURIComponent(e.parameter.params)) : {};
        var apiResult = appApi(action, params);
        return ContentService.createTextOutput(JSON.stringify(apiResult)).setMimeType(ContentService.MimeType.JSON);
      } catch(apiErr) {
        Logger.log('appapi error: ' + apiErr.message);
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'API_ERROR', message: apiErr.message })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── CIS: Consultar resultado existente (chamado pelo Cloudflare Worker) ──
    if (view === 'cis_check' && e.parameter.email) {
      try {
        var checkResult = consultarResultadoCIS(decodeURIComponent(e.parameter.email));
        return ContentService.createTextOutput(JSON.stringify(checkResult)).setMimeType(ContentService.MimeType.JSON);
      } catch(chkErr) {
        return ContentService.createTextOutput(JSON.stringify({ exists: false, error: chkErr.message })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── CIS Assessment via GET (chamado pelo Cloudflare Worker) ──
    if (view === 'cis_save' && e.parameter.payload) {
      try {
        var cisPayload = JSON.parse(decodeURIComponent(e.parameter.payload));
        var result = salvarResultadoCIS(cisPayload);
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      } catch(cisErr) {
        Logger.log('CIS save error: ' + cisErr.message);
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: cisErr.message })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // ── Autenticação OTP (dashboard e tutor) ───────────────────────────
    // BYPASS TESTE: ?view=tutor&token=TESTE&email=xxx@xxx.com
    var testBypass = (token === 'TESTE' && e.parameter.email);
    if (VIEWS_PROTEGIDAS.indexOf(view) >= 0 && !testBypass) {
      var sessao = verificarSessao(token);
      if (!sessao) return serveLoginOTP(view);
      try { renovarSessao(token); } catch(re) { Logger.log('renovarSessao erro: ' + re.message); }
    }

    // ── Roteamento ─────────────────────────────────────────────────────
    if (view === 'dashboard')   return serveDashboard(token);
    if (view === 'tutor')       return serveTutor(testBypass ? 'TESTE__' + e.parameter.email : token);
    if (view === 'painel')      return servePainel(token);
    if (view === 'evidencia')   return serveEvidencia(e);
    if (view === 'diagnostico') return serveDiagnostico(e.parameter.email || '');

    // ── App SPA (frontend do colaborador) ──
    if (view === 'app') return serveApp(e);

    // Default: ChatWebApp (Fase 5) — sem OTP
    var template = HtmlService.createTemplateFromFile('ChatWebApp');
    template.userEmail = (e && e.parameter && e.parameter.email) ? e.parameter.email : '';
    template.cicloId   = (e && e.parameter && e.parameter.ciclo) ? e.parameter.ciclo  : '';
    return template.evaluate()
      .setTitle('Mentor IA - Vertho')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  } catch(err) {
    var msg = err ? (err.message || String(err)) : 'erro desconhecido';
    Logger.log('doGet ERRO [view=' + ((e && e.parameter && e.parameter.view) || '') + ']: ' + msg);
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erro</title>' +
      '<style>body{font-family:sans-serif;padding:40px;background:#fff8f8;color:#1e293b}' +
      'pre{background:#fee2e2;padding:16px;border-radius:8px;color:#991b1b;white-space:pre-wrap;font-size:13px}' +
      'h2{color:#ef4444}</style></head><body>' +
      '<h2>\u26a0\ufe0f Erro interno no Vertho</h2>' +
      '<p style="color:#64748b;font-size:14px">Detalhe (copie e envie para o suporte):</p>' +
      '<pre>' + msg.replace(/</g,"&lt;") + '</pre>' +
      '<p style="margin-top:20px"><a href="?view=painel" style="color:#3b82f6">Tentar novamente</a></p>' +
      '</body></html>'
    ).setTitle('Erro \u2014 Vertho').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function serveDashboard(token) {
  return HtmlService.createHtmlOutputFromFile('Dashboardwebfase3')
    .setTitle('Dashboard - Vertho')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// serveTutor → Fase4 tutor.js | serveEvidencia → Fase4 evidencia.js

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data._func)            return _jsonResponse(_dispatchDiagnostico(data._func, data._args || []));
    if (data._cis)             return _jsonResponse(salvarResultadoCIS(data._cis));
    if (data.action)           return _handleAppSheetAction(data);
    if (data.source === 'web') return _handleWebAppMessage(data);
    return _jsonResponse({ status: 'ok' });
  } catch (error) {
    Logger.log('ERRO doPost: ' + error.message);
    return _jsonResponse({ status: 'erro', mensagem: 'Erro interno' });
  }
}

// ── DISPATCH para chamadas vindas do Cloudflare Worker (polyfill fetch) ──
function _dispatchDiagnostico(funcName, args) {
  try {
    if (funcName === 'enviarOTP')                return enviarOTP(args[0], args[1]);
    if (funcName === 'validarOTP')               return validarOTP(args[0], args[1]);
    if (funcName === 'getDiagnosticoData')        return getDiagnosticoData(args[0]);
    if (funcName === 'salvarRespostaDiagnostico') return salvarRespostaDiagnostico(args[0], args[1], args[2], args[3]);
    return { error: 'Função desconhecida: ' + funcName };
  } catch(e) {
    Logger.log('_dispatchDiagnostico ERRO [' + funcName + ']: ' + e.message);
    return { error: e.message };
  }
}

// ── BRIDGE: google.script.run calls from ChatWebApp.html ──────────────

function processarMensagemChat(email, nome, message) {
  try {
    if (!email) return { reply: 'Sessao expirada. Recarregue a pagina.' };
    if (!message || message.trim().length === 0) return { reply: '' };
    if (message.length > Config.MAX_MESSAGE_LENGTH) message = message.substring(0, Config.MAX_MESSAGE_LENGTH);
    var result = ConversationController.process({ userId: email, userName: nome || 'Colaborador', message: message, channel: 'web' });
    return { reply: result.message || '', tipo: result.tipo || 'normal', fase: result.fase || '' };
  } catch (error) {
    Logger.log('processarMensagemChat ERRO: ' + error.message);
    return { reply: 'Desculpe, ocorreu um erro. Tente novamente.', retry: true };
  }
}

function identificarColaborador(email) {
  if (!email || email.trim().length === 0) return { success: false, message: 'Informe seu e-mail corporativo.' };
  email = email.trim().toLowerCase();
  var colab = StateManager.getColaborador(email);
  if (!colab) return { success: false, message: 'E-mail nao encontrado. Verifique se digitou corretamente.' };
  var session = StateManager.getActiveSession(email);
  if (!session) session = StateManager.getNextPendingSession(email);
  if (!session) return { success: true, userName: colab.nome, message: 'Nao ha avaliacoes pendentes no momento.' };
  return { success: true, userName: colab.nome || 'Colaborador', hasSession: true, message: 'Bem-vindo(a)!' };
}

function getRecentHistory(email) {
  try {
    var state = StateManager.getActiveSession(email);
    if (!state || !state.history) return [];
    var history = state.history;
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch(e) { return []; }
    }
    var msgs = [];
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if ((h.role === 'user' || h.role === 'assistant') && h.content && h.content.length > 5) {
        msgs.push({ role: h.role, content: String(h.content).substring(0, 500) });
      }
    }
    return msgs.slice(-3);
  } catch(e) {
    return [];
  }
}

// ── URL DO WEB APP ────────────────────────────────────────────────────

function salvarURLWebApp(url) {
  PropertiesService.getScriptProperties().setProperty('cfg_webapp_url', url || '');
}
function getURLWebApp() {
  var saved = PropertiesService.getScriptProperties().getProperty('cfg_webapp_url');
  if (saved) return saved;
  try { return ScriptApp.getService().getUrl(); } catch(e) { return ''; }
}

// ── HANDLERS internos ─────────────────────────────────────────────────

function _handleWebAppMessage(data) {
  var n = { userId: data.userId || data.email || '', userName: data.userName || 'Colaborador', message: data.message || '', channel: 'web' };
  if (!n.userId) return _jsonResponse({ reply: 'Informe seu e-mail.' });
  if (!n.message) return _jsonResponse({ reply: '' });
  try {
    var reply = ConversationController.process(n);
    return _jsonResponse({ reply: reply.message || '', tipo: reply.tipo || 'normal' });
  } catch (error) {
    return _jsonResponse({ reply: 'Erro. Tente novamente.', retry: true });
  }
}

function _handleAppSheetAction(data) {
  try {
    switch (data.action) {
      case 'reavaliar': return _jsonResponse({ status: 'reavaliado', resultado: ConversationController.reevaluate(data.sessao_id) });
      default: Logger.log('Acao recebida: ' + data.action); return _jsonResponse({ status: 'recebido' });
    }
  } catch (error) {
    return _jsonResponse({ status: 'erro', mensagem: error.message });
  }
}

// ── POLLING ações pendentes (trigger 1 min) ───────────────────────────

function processarAcoesPendentes() {
  var ws = StateManager._getSheet(Config.SHEET_ACOES_PENDENTES);
  if (!ws) return;
  var data = ws.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0];
  var iTipo = StateManager._colIdx(h, 'tipo');
  var iSt   = StateManager._colIdx(h, 'status');
  var iProc = StateManager._colIdx(h, 'processado_em');
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iSt]).toLowerCase() !== 'pendente') continue;
    try {
      ws.getRange(r+1, iSt+1).setValue('processando');
      Logger.log('Processando: ' + data[r][iTipo]);
      ws.getRange(r+1, iSt+1).setValue('concluido');
      ws.getRange(r+1, iProc+1).setValue(new Date().toISOString());
    } catch (e) {
      ws.getRange(r+1, iSt+1).setValue('erro: ' + e.message);
    }
  }
}

// ── SETUP ─────────────────────────────────────────────────────────────

function setupFase3() {
  var abas = [
    { n: Config.SHEET_SESSOES,          h: ['sessao_id','ciclo_id','colaborador_id','competencia_id','competencia','status','fase','history','cenarios','baseline','aprofundamentos_cenario1','aprofundamentos_cenario2','contraexemplo_usado','cenario_atual','consentimento_lgpd','nivel','confianca','evidencias','lacuna','validacao','created_at','updated_at','last_activity'] },
    { n: Config.SHEET_RESULTADOS_DIAG,  h: ['resultado_id','ciclo_id','colaborador_id','competencia','nivel','confianca','evidencias','lacuna','resumo','created_at'] },
    { n: Config.SHEET_RESULTADOS_AVAL,  h: ['resultado_id','ciclo_id','colaborador_id','competencia_id','competencia','nivel','confianca','evidencias','lacuna','validacao_status','validacao_detalhes','created_at'] },
    { n: Config.SHEET_VALIDACOES,       h: ['validacao_id','sessao_id','resultado_gemini','divergencia','nivel_sugerido','evidencias_invalidas','comentario','created_at'] },
    { n: Config.SHEET_ACOES_PENDENTES,  h: ['acao_id','tipo','parametros','status','solicitado_por','criado_em','processado_em'] },
    { n: Config.SHEET_CICLOS,           h: ['ciclo_id','cliente_id','nome','data_inicio','data_fim','status','competencias','created_at'] }
  ];
  abas.forEach(function(a) { StateManager._ensureSheet(a.n, a.h); });
  Logger.log('Setup Fase 3 concluido: ' + abas.length + ' abas verificadas/criadas.');
  try { SpreadsheetApp.getUi().alert('Setup Fase 3 concluido! Proximo: Deploy > New deployment > Web App'); } catch(e) {}
}

// ── HELPERS ───────────────────────────────────────────────────────────

function _jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body || { status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Serve o App SPA (frontend do colaborador)
 * Acesso: ?view=app ou ?view=app&email=teste@teste.com (modo teste)
 */
function serveApp(e) {
  var template = HtmlService.createTemplateFromFile('App_index');
  // Passar email de teste se fornecido
  template.testEmail = (e && e.parameter && e.parameter.email) ? e.parameter.email : '';
  return template.evaluate()
    .setTitle('Vertho — Sua jornada de desenvolvimento')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

