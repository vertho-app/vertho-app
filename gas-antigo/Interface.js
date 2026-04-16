// ═══════════════════════════════════════════════════════════════════════════════
//  VERTHO  —  Interface.gs
//  Painel de Controle: todas as funções chamadas pelo HTML via google.script.run
//
//  COMO USAR NO APPS SCRIPT
//  ─────────────────────────────────────────────────────────────────────────────
//  1. Crie um arquivo chamado "Interface.gs" no projeto e cole este conteúdo.
//  2. Crie um arquivo chamado "Interface.html" e cole o HTML correspondente.
//  3. Remova do codigo.gs as funções: mostrarInterface, _htmlPainel,
//     getStatusDashboard, getConfiguracoes, salvarConfiguracoes,
//     testarConexaoAPIs, getLog, _addLog, limparLog, e todos os painelXxx().
//
//  DEPENDÊNCIAS (definidas em codigo.gs — não duplicar aqui)
//  ─────────────────────────────────────────────────────────────────────────────
//  Constantes  : MODEL_SONNET, MODEL_HAIKU, EMAIL_REMETENTE, DIAS_REENVIO,
//                ABA_RESPOSTAS, _FALLBACK_KEY_CLAUDE, _FALLBACK_KEY_GEMINI
//  Objeto      : _CFG  (mutável — { provedor, modelo, thinking })
//  Funções     : _getApiKey(), _norm(), _garantirAbaRespostas(),
//                _garantirColunasEnvio(), _idxEmailColab()
//  Entry points: rodarIA1(), rodarIA2(), rodarIA3(), popularCenarios(),
//                gerarForms(), dispararEmailsDoDia(), rodarIA4(),
//                gerarPDIs(), gerarDossieGestorManual(),
//                configurarCadenciaEmail(), pararCadenciaEmail()
// ═══════════════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────────────
//  ABRIR PAINEL
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Abre o painel de controle como modal.
 * Chamado pelo menu do Sheets.
 */
function mostrarInterface() {
  const html = HtmlService
    .createHtmlOutputFromFile('Vertho_Interface')
    .setTitle('🤖 Vertho IA')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  SpreadsheetApp.getUi().showSidebar(html);
}


// ───────────────────────────────────────────────────────────────────────────────
//  LOG INTERNO
// ───────────────────────────────────────────────────────────────────────────────

var _LOG_KEY = 'vertho_log';

/**
 * Registra uma entrada no log interno (ScriptProperties).
 * Usado por Interface.gs e por codigo.gs para rastrear execuções.
 */
function _addLog(msg) {
  var props = PropertiesService.getScriptProperties();
  var logs  = [];
  try { logs = JSON.parse(props.getProperty(_LOG_KEY) || '[]'); } catch (e) {}
  var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM HH:mm:ss');
  logs.unshift('[' + ts + '] ' + msg);
  if (logs.length > 100) logs = logs.slice(0, 100);
  props.setProperty(_LOG_KEY, JSON.stringify(logs));
}

/**
 * Retorna as entradas do log para o painel (chamado via google.script.run).
 * @returns {string[]}
 */
function getLog() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(_LOG_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

/** Limpa o log (chamado via google.script.run). */
function limparLog() {
  PropertiesService.getScriptProperties().setProperty(_LOG_KEY, '[]');
}


// ───────────────────────────────────────────────────────────────────────────────
//  CONFIGURAÇÕES
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Retorna as configurações salvas para preencher o formulário do painel.
 * Nunca expõe as chaves de API em texto claro — devolve placeholder se existirem.
 * @returns {Object}
 */
function getConfiguracoes() {
  var p = PropertiesService.getScriptProperties();
  return {
    provedor:     p.getProperty('cfg_provedor')   || (_CFG && _CFG.provedor) || 'CLAUDE',
    modelo:       p.getProperty('cfg_modelo')     || MODEL_SONNET,
    thinking:     p.getProperty('cfg_thinking')   || 'disabled',
    email:        p.getProperty('cfg_email')      || EMAIL_REMETENTE,
    cadenciaHora: p.getProperty('cadenciaHora')   || '8',
    apiKeyClaude: p.getProperty('cfg_key_claude') || p.getProperty('ANTHROPIC_API_KEY') ? '••••••••  (salva — deixe em branco para manter)' : '',
    apiKeyOpenAI: p.getProperty('OPENAI_API_KEY') ? '••••••••  (salva — deixe em branco para manter)' : '',
    apiKeyGemini: p.getProperty('cfg_key_gemini') || p.getProperty('GEMINI_API_KEY') ? '••••••••  (salva — deixe em branco para manter)' : '',
    lookerUrl:    p.getProperty('cfg_looker_url')   || '',
    lookerParam:  p.getProperty('cfg_looker_param') || 'gestor',
    emailsRH:     p.getProperty('cfg_emails_rh')    || '',
    // Fase 3
    f3Conversa:   p.getProperty('cfg_f3_conversa')  || 'claude-haiku-4-5-20251001',
    f3Avaliacao:  p.getProperty('cfg_f3_avaliacao') || 'claude-haiku-4-5-20251001',
    f3Relatorio:  p.getProperty('cfg_f3_relatorio') || 'claude-haiku-4-5-20251001',
    f3Validacao:  p.getProperty('cfg_f3_validacao') || 'gemini-3-flash-preview',
    f3Thinking:   p.getProperty('cfg_f3_thinking')  || 'disabled',
  };
}

/**
 * Persiste as configurações enviadas pelo painel.
 * API keys só são sobrescritas se o usuário digitou algo novo.
 * @param {Object} cfg  { provedor, modelo, email, apiKeyClaude, apiKeyGemini, f3Conversa, f3Avaliacao, f3Validacao }
 * @returns {Object}    { ok: true }
 */
function salvarConfiguracoes(cfg) {
  var p = PropertiesService.getScriptProperties();

  if (cfg.provedor) p.setProperty('cfg_provedor', cfg.provedor);
  if (cfg.modelo)   p.setProperty('cfg_modelo',   cfg.modelo);
  if (cfg.thinking) p.setProperty('cfg_thinking', cfg.thinking);
  if (cfg.email)    p.setProperty('cfg_email',     cfg.email);

  var keyClaude = (cfg.apiKeyClaude || '').trim();
  var keyOpenAI = (cfg.apiKeyOpenAI || '').trim();
  var keyGemini = (cfg.apiKeyGemini || '').trim();
  // Só salva se não for string vazia e não for o placeholder de mascaramento
  if (keyClaude && !keyClaude.startsWith('••')) { p.setProperty('cfg_key_claude', keyClaude); p.setProperty('ANTHROPIC_API_KEY', keyClaude); }
  if (keyOpenAI && !keyOpenAI.startsWith('••')) p.setProperty('OPENAI_API_KEY', keyOpenAI);
  if (keyGemini && !keyGemini.startsWith('••')) { p.setProperty('cfg_key_gemini', keyGemini); p.setProperty('GEMINI_API_KEY', keyGemini); }

  // Looker Studio
  var lookerUrl   = (cfg.lookerUrl   || '').trim();
  var lookerParam = (cfg.lookerParam || '').trim();
  if (lookerUrl)   p.setProperty('cfg_looker_url',   lookerUrl);
  if (lookerParam) p.setProperty('cfg_looker_param', lookerParam);

  // Destinatários do Relatório RH (lista separada por vírgula)
  var emailsRH = (cfg.emailsRH || '').trim();
  if (emailsRH) p.setProperty('cfg_emails_rh', emailsRH);

  // Fase 3 — Modelos IA Conversacional
  if (cfg.f3Conversa)  p.setProperty('cfg_f3_conversa',  cfg.f3Conversa);
  if (cfg.f3Avaliacao) p.setProperty('cfg_f3_avaliacao', cfg.f3Avaliacao);
  if (cfg.f3Relatorio) p.setProperty('cfg_f3_relatorio', cfg.f3Relatorio);
  if (cfg.f3Validacao) p.setProperty('cfg_f3_validacao', cfg.f3Validacao);
  if (cfg.f3Thinking)  p.setProperty('cfg_f3_thinking',  cfg.f3Thinking);

  // Aplica imediatamente na sessão corrente
  if (_CFG) {
    if (cfg.provedor) _CFG.provedor     = cfg.provedor;
    if (cfg.modelo)   _CFG.modelo       = cfg.modelo;
    if (cfg.thinking) {
      _CFG.thinkingMode = cfg.thinking;
      _CFG.thinking     = cfg.thinking !== 'disabled';
    }
  }

  _addLog('⚙️ Config salva — provedor: ' + (cfg.provedor || '?') + ' | modelo: ' + (cfg.modelo || '?')
    + ' | thinking: ' + (cfg.thinking || 'disabled')
    + ' | F3 conversa: ' + (cfg.f3Conversa || '?')
    + ' | F3 aval: ' + (cfg.f3Avaliacao || '?')
    + ' | F3 valid: ' + (cfg.f3Validacao || '?')
    + ' | F3 thinking: ' + (cfg.f3Thinking || 'disabled'));
  return { ok: true };
}


// ───────────────────────────────────────────────────────────────────────────────
//  STATUS DASHBOARD
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Coleta o status de todas as fases e retorna objeto para o painel.
 * Chamado automaticamente pelo JS do HTML a cada 15 s.
 * @returns {Object}
 */
function getStatusDashboard() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  var resultado = {
    preflight: _coletarAvisosPreflight(ss, props),
    fase1: { ia1: 'pendente', ia2: 'pendente', ia3: 'pendente', cenarios: 'pendente' },
    fase2: { forms: 'pendente', cadencia: 'pendente', respostas: { total: 0, respondidas: 0 } },
    fase3: { avaliados: 0, pendentes: 0, erros: 0 },
    fase4: { pdis: 0 },
    relatorioRH: { gerado: false, geradoEm: '' },
    config: {
      modelo:       props.getProperty('cfg_modelo')   || MODEL_SONNET,
      provedor:     props.getProperty('cfg_provedor') || 'CLAUDE',
      cadenciaHora: props.getProperty('cadenciaHora') || '8',
      cadenciaAtiva: ScriptApp.getProjectTriggers()
        .some(function(t) { return t.getHandlerFunction() === 'dispararEmailsDoDia'; }),
    }
  };

  // ── Fase 1 — aba Cargos ─────────────────────────────────────────────────────
  try {
    var wsCargo = ss.getSheetByName('Cargos');
    if (wsCargo) {
      var hdCargo  = wsCargo.getRange(4, 1, 1, wsCargo.getLastColumn()).getValues()[0];
      var dadCargo = wsCargo.getDataRange().getValues().slice(4);
      var iSt      = _idxHdr(hdCargo, 'Status');
      var iTop5    = hdCargo.findIndex(function(h) { return _norm(h).toLowerCase().includes('top 5'); });
      var iTela1   = hdCargo.findIndex(function(h) { return _norm(h).toUpperCase().includes('TELA 1'); });
      var linhas   = dadCargo.filter(function(r) { return r[0]; });

      resultado.fase1.ia1 = linhas.some(function(r) {
        return iSt >= 0 && String(r[iSt] || '').includes('Top 10');
      }) ? 'ok' : (linhas.length > 0 ? 'pendente' : 'vazio');

      resultado.fase1.ia2 = linhas.some(function(r) {
        return iTela1 >= 0 && r[iTela1];
      }) ? 'ok' : 'pendente';

      resultado.fase1.cenarios = linhas.some(function(r) {
        return iTop5 >= 0 && r[iTop5];
      }) ? 'ok' : 'pendente';
    }
  } catch (e) { Logger.log('dashboard fase1 Cargos: ' + e.message); }

  // ── Fase 1 — aba Cenarios (IA3 + forms) ─────────────────────────────────────
  try {
    var wsCen = ss.getSheetByName('Banco_Cenarios');
    if (wsCen) {
      var hdCen  = wsCen.getRange(4, 1, 1, wsCen.getLastColumn()).getValues()[0];
      var dadCen = wsCen.getDataRange().getValues().slice(4);
      var iLink  = hdCen.findIndex(function(h) { return _norm(h).toLowerCase().includes('link'); });
      var iStEnv = hdCen.findIndex(function(h) { return _norm(h) === 'Status Envio'; });
      var iCtx   = hdCen.findIndex(function(h) { return _norm(h).toLowerCase().includes('contexto'); });

      var linhasCen = dadCen.filter(function(r) { return r[0]; });
      var comLink   = linhasCen.filter(function(r) { return iLink >= 0 && r[iLink]; }).length;
      var comCtx    = linhasCen.filter(function(r) { return iCtx  >= 0 && r[iCtx];  }).length;

      resultado.fase1.ia3   = comCtx > 0 ? 'ok' : 'pendente';
      resultado.fase2.forms = comLink > 0 ? 'ok' : 'pendente';

      resultado.fase2.respostas.total = linhasCen.length;
      resultado.fase2.respostas.respondidas = iStEnv >= 0
        ? linhasCen.filter(function(r) { return _norm(String(r[iStEnv] || '')) === 'Respondido'; }).length
        : 0;
    }
  } catch (e) { Logger.log('dashboard fase1 Cenarios: ' + e.message); }

  resultado.fase2.cadencia = resultado.config.cadenciaAtiva ? 'ok' : 'pendente';

  // ── Relatório RH — verificar se já foi gerado (ScriptProperty de controle) ──
  try {
    var tsRelRH = props.getProperty('relatorio_rh_gerado_em');
    if (tsRelRH) {
      resultado.relatorioRH.gerado   = true;
      resultado.relatorioRH.geradoEm = tsRelRH;
    }
  } catch (e) { Logger.log('dashboard relatorioRH: ' + e.message); }

  // ── Fase 3 / 4 — aba Respostas ──────────────────────────────────────────────
  try {
    var wsRes = ss.getSheetByName(ABA_RESPOSTAS);
    if (wsRes) {
      var hdRes  = wsRes.getRange(1, 1, 1, wsRes.getLastColumn()).getValues()[0];
      var dadRes = wsRes.getDataRange().getValues().slice(1).filter(function(r) { return r[0]; });
      var iSt4   = hdRes.findIndex(function(h) { return _norm(h) === 'Status IA 4'; });

      dadRes.forEach(function(row) {
        var st = _norm(String(row[iSt4] || '')).toLowerCase();
        if      (st === 'avaliado' || st === 'pdf enviado') resultado.fase3.avaliados++;
        else if (st.includes('erro'))                       resultado.fase3.erros++;
        else                                                resultado.fase3.pendentes++;
      });

      resultado.fase4.pdis = dadRes.filter(function(r) {
        return _norm(String(r[iSt4] || '')).toLowerCase() === 'pdf enviado';
      }).length;
    }
  } catch (e) { Logger.log('dashboard fase3/4: ' + e.message); }

  return resultado;
}

/**
 * Verifica pré-requisitos silenciosamente e retorna lista de avisos para o painel.
 * Não exibe UI.alert — apenas registra e retorna.
 * @private
 */
function _coletarAvisosPreflight(ss, props) {
  var avisos = [];

  if (!props.getProperty('masterSpreadsheetId'))
    avisos.push('⚠️ masterSpreadsheetId não configurado — será auto-configurado ao rodar IA 1');

  if (!ss.getSheetByName(ABA_RESPOSTAS))
    avisos.push('⚠️ Aba "' + ABA_RESPOSTAS + '" ainda não existe — criada automaticamente ao rodar IA 1');

  var temCadencia = ScriptApp.getProjectTriggers()
    .some(function(t) { return t.getHandlerFunction() === 'dispararEmailsDoDia'; });
  if (!temCadencia)
    avisos.push('⚠️ Cadência de e-mails inativa — configure na Fase 2 após gerar os Forms');

  return avisos;
}

/** Helper: localiza índice de coluna por substring (case-insensitive). */
function _idxHdr(headers, kw) {
  var kwL = kw.toLowerCase();
  return headers.findIndex(function(h) { return _norm(String(h || '')).toLowerCase().includes(kwL); });
}


// ───────────────────────────────────────────────────────────────────────────────
//  TESTE DE CONEXÃO DAS APIs
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Testa Claude e Gemini com uma chamada mínima.
 * @returns {{ api: string, ok: boolean, detalhe: string }[]}
 */
function testarConexaoAPIs() {
  var resultados = [];

  // ── Claude ──────────────────────────────────────────────────────────────────
  try {
    var rC = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:  'post',
      headers: {
        'x-api-key':         _getApiKey('CLAUDE'),
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      payload: JSON.stringify({
        model:      MODEL_HAIKU,
        max_tokens: 5,
        messages:   [{ role: 'user', content: 'ping' }],
      }),
      muteHttpExceptions: true,
    });
    var codeC = rC.getResponseCode();
    resultados.push({ api: 'Claude', ok: codeC === 200, detalhe: codeC === 200 ? 'OK (' + MODEL_HAIKU + ')' : 'HTTP ' + codeC });
  } catch (e) {
    resultados.push({ api: 'Claude', ok: false, detalhe: e.message });
  }

  // ── Gemini ───────────────────────────────────────────────────────────────────
  try {
    var urlG = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + _getApiKey('GEMINI');
    var rG   = UrlFetchApp.fetch(urlG, {
      method:             'post',
      contentType:        'application/json',
      payload:            JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
      muteHttpExceptions: true,
    });
    var codeG = rG.getResponseCode();
    resultados.push({ api: 'Gemini', ok: codeG === 200, detalhe: codeG === 200 ? 'OK (gemini-2.0-flash)' : 'HTTP ' + codeG });
  } catch (e) {
    resultados.push({ api: 'Gemini', ok: false, detalhe: e.message });
  }

  _addLog('🔌 Teste de APIs: ' + resultados.map(function(r) {
    return r.api + ' ' + (r.ok ? '✅' : '❌') + ' ' + r.detalhe;
  }).join(' | '));

  return resultados;
}


// ───────────────────────────────────────────────────────────────────────────────
//  CADÊNCIA — configuração via painel
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Instala (ou reinstala) o trigger diário de e-mails na hora informada.
 * @param {string|number} hora  0-23
 * @returns {{ ok: boolean, hora: number }}
 */
function configurarCadenciaPainel(hora) {
  hora = parseInt(hora, 10);
  if (isNaN(hora) || hora < 0 || hora > 23) hora = 8;

  // Remove triggers existentes da cadência
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'dispararEmailsDoDia'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('dispararEmailsDoDia')
    .timeBased()
    .everyDays(1)
    .atHour(hora)
    .create();

  PropertiesService.getScriptProperties().setProperty('cadenciaHora', String(hora));
  _addLog('📧 Cadência instalada: dispararEmailsDoDia diariamente às ' + hora + 'h');

  return { ok: true, hora: hora };
}


// ───────────────────────────────────────────────────────────────────────────────
//  WRAPPERS DAS FASES  (chamados pelo painel via google.script.run)
// ───────────────────────────────────────────────────────────────────────────────
//  Padrão: cada wrapper chama a função real de codigo.gs, registra no log
//  e retorna { ok: true, preflight: [...] } em caso de sucesso.
//  Em caso de erro, lança exceção — o withFailureHandler do JS a captura.

/**
 * Executor genérico: chama fnNome, loga e retorna preflight atualizado.
 * @private
 */
function _painelRodar(fnNome) {
  _addLog('▶ ' + fnNome + ' — iniciando...');
  try {
    var fn = globalThis[fnNome];
    if (typeof fn !== 'function') throw new Error('Função não encontrada: ' + fnNome);
    fn();
    _addLog('✅ ' + fnNome + ' — concluído');
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    return { ok: true, preflight: _coletarAvisosPreflight(ss, props) };
  } catch (e) {
    _addLog('❌ ' + fnNome + ': ' + e.message);
    throw e;   // propaga para withFailureHandler no JS
  }
}

// Fase 1
function painelIA1()      { return _painelRodar('rodarIA1');             }
function painelIA2()      { return _painelRodar('rodarIA2');             }
function painelIA3()      { return _painelRodar('rodarIA3');             }
function painelCenarios() { return _painelRodar('popularCenarios');      }
// Fase 2
function painelForms()    { return _painelRodar('gerarForms');           }
function painelDisparo()  { return _painelRodar('dispararEmailsDoDia');  }
// Fase 3 (IA4 — diagnóstico)
function painelIA4()      { return _painelRodar('rodarIA4');             }
// Relatório RH
function painelRelatorioRH() { return _painelRodar('gerarRelatorioRHManual'); }
// Fase 4 — PDIs e Dossiê
function painelPDIs()            { return _painelRodar('gerarPDIs');               }
function painelPDIsDescritores() { return _painelRodar('gerarPDIsDescritores'); }
// Relatório de Plenária
function painelRelatorioPlenaria() { return _painelRodar('gerarRelatorioPlenaria'); }
// Envio PDIs Descritores
function painelEnviarPDIsDescritores() { return _painelRodar('enviarPDIsDescritoresMenu'); }
// Envio Link CIS via WhatsApp
function painelEnviarLinksCIS() { return _painelRodar('enviarLinksCIS'); }
function painelDossie()   { return _painelRodar('gerarDossieGestorManual'); }
// Fase 2 — Utils
function painelColetar()       { return _painelRodar('coletarRespostas');  }
function painelStatusEnvios()  { return _painelRodar('verStatusEnvios');   }
// Fase 3 — Fila IA4
function painelFilaIA4()       { return _painelRodar('verFilaIA4');        }
// Fase 1 — PPP
function painelExtrairPPPs()         { return _painelRodar('extrairPPPsMenu');           }
// Fase 4 — Moodle
function painelImportarCatalogo()    { return _painelRodar('moodleImportarCatalogo');    }
function painelCatalogarConteudos()  { return _painelRodar('catalogarConteudosMoodle');  }
function painelCatalogarReset()      { return _painelRodar('catalogarConteudosReset');   }
function painelCoberturaConteudo()   { return _painelRodar('gerarCoberturaConteudo');    }
// Fase 4 — Capacitação / Trilhas
function painelMontarTrilhas()             { return _painelRodar('montarTrilhasLote');       }
function painelCriarEstruturaFase4()    { return _painelRodar('criarEstruturaFase4');    }
function painelConfigurarTriggersFase4(){ return _painelRodar('configurarTriggersFase4'); }
function painelIniciarFase4()           { return _painelRodar('iniciarFase4ParaTodos');  }
function painelTriggerSegFase4()        { return _painelRodar('triggerSegundaFase4');    }
function painelTriggerQuiFase4()        { return _painelRodar('triggerQuintaFase4');     }
function painelStatusFase4() {
  _addLog('\u25b6 getStatusFase4 — consultando...');
  try {
    var st = getStatusFase4();
    _addLog('\u2705 getStatusFase4 — conclu\u00eddo');
    var ui = SpreadsheetApp.getUi();
    var msg = 'Ativos    : ' + (st.ativos    || 0);
    msg += '\nConclu\u00eddos: ' + (st.concluidos || 0);
    msg += '\nPausados  : ' + (st.pausados  || 0);
    msg += '\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
    msg += '\nTotal     : ' + (st.total     || 0);
    ui.alert('\uD83D\uDCDA Fase 4 — Status', msg, ui.ButtonSet.OK);
    return { ok: true };
  } catch(e) {
    _addLog('\u274c getStatusFase4: ' + e.message);
    throw e;
  }
}

function painelIniciarUmFase4(email) {
  _addLog('▶ iniciarFase4UmColaborador — ' + email);
  try {
    iniciarFase4UmColaborador(email);
    _addLog('✅ iniciarFase4UmColaborador — concluído para ' + email);
    return { ok: true };
  } catch(e) {
    _addLog('❌ iniciarFase4UmColaborador: ' + e.message);
    throw e;
  }
}
// Fase 3 Conversacional — Relatórios
function gerarRelatoriosFase3Menu_painel() { return _painelRodar('gerarRelatoriosFase3Menu'); }
function gerarRelatoriosGestorFase3_painel() { return _painelRodar('gerarRelatoriosGestorFase3'); }
// Simulador de conversas Fase 3
function simularConversasFase3_painel() { return _painelRodar('simularConversasFase3'); }
// Relatório RH Fase 3
function gerarRelatorioRHFase3_painel() { return _painelRodar('gerarRelatorioRHFase3'); }
// Envio de relatórios por e-mail
function enviarRelIndividualF3_painel() { return _painelRodar('enviarRelatoriosIndividuaisFase3'); }
function enviarRelGestorF3_painel() { return _painelRodar('enviarRelatoriosGestorFase3'); }
function enviarRelRHF3_painel() { return _painelRodar('enviarRelatorioRHFase3'); }
// Fase 5 — Reavaliação e Evolução
function painelReavConversacional() { return _painelRodar('iniciarReavaliacaoLote'); }
function painelRelatorioEvolucao()  { return _painelRodar('gerarRelatoriosEvolucaoLote'); }
function painelPlenariaEvolucao()   { return _painelRodar('gerarPlenariaEvolucao'); }
// Dashboard Fase 3 (AppSheet)
function atualizarDashboardF3_painel() { return _painelRodar('atualizarDashboardFase3'); }
// Dashboard Web (página para o cliente)
function abrirDashboardWeb() {
  try {
    var url = getURLWebApp();
    url += (url.indexOf('?') >= 0 ? '&' : '?') + 'view=dashboard';
    var ui = SpreadsheetApp.getUi();
    ui.alert('Dashboard Web', 'Abra no navegador:\n\n' + url, ui.ButtonSet.OK);
  } catch(e) {
    SpreadsheetApp.getUi().alert('Erro', e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
// Check IA
function checkCenarios()  { return _painelRodar('checkCenarios');        }
function painelCheckAvaliacoes(){ return _painelRodar('checkAvaliacoes'); }

/**
 * Retorna a URL do Web App.
 * Prioridade: automático (ScriptApp) > manual (ScriptProperties)
 * 
 * DICA: Para manter a URL fixa, use Deploy > Manage deployments > editar
 * o deploy existente (lápis) > nova versão. NÃO crie um novo deployment.
 * 
 * @returns {string}
 */
function getURLWebApp() {
  // 1. Prioridade: URL salva manualmente (mais confiável)
  var manualUrl = PropertiesService.getScriptProperties().getProperty('cfg_webapp_url');
  if (manualUrl && manualUrl.indexOf('/exec') > 0) return manualUrl;

  // 2. Fallback: auto-detect
  try {
    var autoUrl = ScriptApp.getService().getUrl();
    if (autoUrl && autoUrl.indexOf('/exec') > 0) return autoUrl;
  } catch(e) {}

  throw new Error('URL do Web App não configurada. Cole a URL no campo do painel e salve.');
}

/**
 * Salva a URL do Web App manualmente (fallback).
 * @param {string} url
 */
function salvarURLWebApp(url) {
  if (!url || !url.trim()) throw new Error('URL vazia.');
  PropertiesService.getScriptProperties().setProperty('cfg_webapp_url', url.trim());
  _addLog('🌐 URL Web App salva: ' + url.trim());
  return { ok: true };
}