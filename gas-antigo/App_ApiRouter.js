/**
 * ============================================================
 * VERTHO APP — API Router (Server-side)
 * ============================================================
 * Ponto único de entrada para chamadas do client.
 * Client chama: google.script.run.appApi(action, params)
 * ============================================================
 */

function appApi(action, params) {
  var startTime = new Date();

  try {
    // 1. Autenticação
    var email = '';

    // Modo teste: params._testEmail
    if (params && params._testEmail) {
      email = params._testEmail;
    } else {
      email = Session.getActiveUser().getEmail();
    }

    if (!email) {
      return { success: false, error: 'AUTH_REQUIRED', message: 'Sessão expirada. Recarregue a página.' };
    }
    email = email.toLowerCase().trim();

    // 2. Roteamento
    var parts = action.split('.');
    var modulo = parts[0] || '';
    var metodo = parts[1] || '';

    if (!metodo) {
      return { success: false, error: 'INVALID_ACTION', message: 'Ação inválida: ' + action };
    }

    var resultado = null;

    // ── Boot (batch: tudo de uma vez) ──
    if (modulo === 'boot' && metodo === 'getAll') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var user = AppData._getColaborador(ss, email);
      if (!user) user = { email: email, nome: email.split('@')[0], cargo: '' };
      user.email = email;
      var gasUrl = '';
      try { gasUrl = ScriptApp.getService().getUrl(); } catch(ue) {}
      resultado = {
        user: user,
        dashboard: AppData.getDashboard(email),
        etapas: AppData.getEtapas(email),
        trilha: AppData.getTrilha(email),
        gasUrl: gasUrl
      };
      // Já seta tudo no retorno — client popula State de uma vez
    }

    // ── Auth ──
    else if (modulo === 'auth') {
      if (metodo === 'getProfile') {
        var user2 = AppData._getColaborador(SpreadsheetApp.getActiveSpreadsheet(), email);
        resultado = user2 || { email: email, nome: email.split('@')[0], cargo: '' };
      }
    }

    // ── Home ──
    else if (modulo === 'home') {
      if (metodo === 'getDashboard') resultado = AppData.getDashboard(email);
    }

    // ── CIS (Perfil Comportamental) ──
    else if (modulo === 'cis') {
      if (metodo === 'check') resultado = consultarResultadoCIS(params && params.email ? params.email : email);
    }

    // ── Jornada ──
    else if (modulo === 'jornada') {
      if (metodo === 'getEtapas') resultado = AppData.getEtapas(email);
    }

    // ── PDI ──
    else if (modulo === 'pdi') {
      if (metodo === 'get')             resultado = AppData.getPDI(email);
      if (metodo === 'getCompetencia')  resultado = AppData.getPDI(email);
    }

    // ── Academia / Trilha ──
    else if (modulo === 'academia') {
      if (metodo === 'getRecomendados') resultado = AppData.getConteudosRecomendados(email);
      if (metodo === 'getTrilha')       resultado = AppData.getTrilha(email);
    }

    // ── BETO / Tutor IA ──
    else if (modulo === 'beto') {
      if (metodo === 'enviar') {
        resultado = AppData.processarMensagemBETO(
          email,
          params.mensagem || '',
          params.contexto || 'geral',
          params.historico || []
        );
      }
      if (metodo === 'getContexto') {
        resultado = getContextoTutor(email);
      }
    }

    // ── Evolução ──
    else if (modulo === 'evolucao') {
      if (metodo === 'getProgresso')   resultado = AppData.getProgressoGeral(email);
      if (metodo === 'getResultado')   resultado = AppData.getResultadoCiclo(email);
    }

    // ── Evidência ──
    else if (modulo === 'evidencia') {
      if (metodo === 'registrar') {
        resultado = AppData.registrarEvidencia(email, params.semana, params.acao, params.resultado);
      }
    }

    // Módulo desconhecido
    if (resultado === null) {
      return { success: false, error: 'NOT_FOUND', message: 'Módulo/método não encontrado: ' + action };
    }

    // Sucesso
    var elapsed = new Date() - startTime;
    Logger.log('appApi: ' + action + ' (' + elapsed + 'ms)');
    return { success: true, data: resultado };

  } catch (err) {
    Logger.log('appApi ERRO: ' + action + ' | ' + err.message);
    return { success: false, error: 'SERVER_ERROR', message: err.message };
  }
}
