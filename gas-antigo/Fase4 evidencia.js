// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: WEBAPP DE EVIDÊNCIA v1
// Arquivo: Fase4_Evidencia.gs — adicione ao projeto GAS
//
// Rota: ?view=evidencia&semana=N&email=fulano@escola.com
// Sem OTP — acesso direto pelo link do e-mail/WPP
// Chama registrarEvidenciaFase4() do Fase4.gs após submit
// ═══════════════════════════════════════════════════════════════════════════════

function serveEvidencia(e) {
  var email  = (e && e.parameter && e.parameter.email)  || '';
  var semana = (e && e.parameter && e.parameter.semana) || '';

  // Busca contexto do colaborador para mostrar competência/pílula
  var ctx = _ev_buscarContexto(email, parseInt(semana) || 0);

  var template    = HtmlService.createTemplate(_ev_html());
  template.email  = email;
  template.semana = String(semana);
  template.nome   = ctx ? ctx.nome  : '';
  template.pilula = ctx ? ctx.pilula : '';
  template.comp   = ctx ? ctx.comp  : '';
  template.ehImpl = ctx ? (ctx.ehImpl ? 'true' : 'false') : 'false';

  return template.evaluate()
    .setTitle('Evidência — Vertho')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ── Busca nome, pílula e competência para contextualizar o form ───────────────
function _ev_buscarContexto(email, semana) {
  if (!email) return null;
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var wsEnv = ss.getSheetByName(F4_ABA_ENVIOS);
    if (!wsEnv) return null;

    var dados = wsEnv.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      var l = dados[i];
      if (String(l[F4E_EMAIL - 1]).trim().toLowerCase() !== email.toLowerCase()) continue;
      if (String(l[F4E_STATUS - 1]).trim() !== 'Ativo') continue;

      var nome      = String(l[F4E_NOME - 1]).trim();
      var sequencia = [];
      try { sequencia = JSON.parse(String(l[F4E_SEQUENCIA - 1])); } catch(ex) {}

      var pilula = '', comp = '', ehImpl = false;
      for (var s = 0; s < sequencia.length; s++) {
        if (sequencia[s].semana === semana) {
          if (sequencia[s].tipo === 'implementacao') {
            ehImpl = true;
            comp   = sequencia[s].competencia || '';
            pilula = 'Semana de Implementação';
          } else {
            comp   = sequencia[s].competencia || '';
            pilula = sequencia[s].titulo      || '';
          }
          break;
        }
      }
      return { nome: nome, pilula: pilula, comp: comp, ehImpl: ehImpl };
    }
  } catch(e) {
    Logger.log('_ev_buscarContexto erro: ' + e.message);
  }
  return null;
}

// ── HTML self-contained ───────────────────────────────────────────────────────
function _ev_html() {
  return '<!DOCTYPE html>\n<html>\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<title>Evidência — Vertho</title>\n'
    + '<style>\n'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }\n'
    + 'body { font-family: Arial, sans-serif; background: #f4f7fb; min-height: 100vh; padding: 0 0 40px; }\n'
    + '.header { background: #0f2b54; padding: 16px 24px; display: flex; align-items: center; gap: 10px; }\n'
    + '.logo { color: #34c5cc; font-size: 19px; font-weight: 700; letter-spacing: .5px; }\n'
    + '.logo span { color: #fff; font-size: 12px; opacity: .5; margin-left: 8px; font-weight: 400; }\n'
    + '.card { max-width: 540px; margin: 28px auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(15,43,84,.08); overflow: hidden; }\n'
    + '.ctx { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 16px 24px; }\n'
    + '.ctx .semana { font-size: 11px; font-weight: 700; color: #34c5cc; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 3px; }\n'
    + '.ctx .pilula { font-size: 15px; font-weight: 600; color: #0f2b54; }\n'
    + '.ctx .comp   { font-size: 12px; color: #64748b; margin-top: 2px; }\n'
    + '.body { padding: 24px; }\n'
    + '.saudacao { font-size: 15px; color: #0f2b54; font-weight: 600; margin-bottom: 6px; }\n'
    + '.subtitulo { font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 22px; }\n'
    + '.campo { margin-bottom: 20px; }\n'
    + '.campo label { display: block; font-size: 13px; font-weight: 700; color: #0f2b54; margin-bottom: 6px; }\n'
    + '.campo .hint { font-size: 11px; color: #94a3b8; margin-bottom: 6px; display: block; }\n'
    + 'textarea { width: 100%; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; font-size: 14px; font-family: Arial, sans-serif; resize: vertical; min-height: 90px; outline: none; color: #1e293b; transition: border .2s; line-height: 1.6; }\n'
    + 'textarea:focus { border-color: #34c5cc; }\n'
    + '.pts-badge { display: inline-flex; align-items: center; gap: 6px; background: #e0f7f8; color: #0f2b54; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 20px; margin-bottom: 20px; }\n'
    + 'button { width: 100%; padding: 14px; background: linear-gradient(135deg,#34c5cc,#2ba8af); color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; transition: opacity .2s; letter-spacing: .3px; }\n'
    + 'button:disabled { opacity: .45; cursor: default; }\n'
    + '.feedback { display: none; text-align: center; padding: 32px 24px; }\n'
    + '.feedback .icon { font-size: 52px; margin-bottom: 12px; }\n'
    + '.feedback h2 { color: #0f2b54; font-size: 20px; margin-bottom: 8px; }\n'
    + '.feedback p { color: #64748b; font-size: 14px; line-height: 1.6; }\n'
    + '.feedback .pts { display: inline-block; background: linear-gradient(135deg,#34c5cc,#9e4edd); color: #fff; font-size: 18px; font-weight: 700; padding: 8px 24px; border-radius: 30px; margin: 16px 0; }\n'
    + '.erro-msg { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #b91c1c; margin-top: 12px; display: none; }\n'
    + '.impl-aviso { background: #fff8ed; border: 1px solid #fcd34d; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #92400e; margin-bottom: 20px; line-height: 1.5; }\n'
    + '</style>\n'
    + '</head>\n<body>\n'

    + '<div class="header"><div class="logo">Vertho <span>Mentor IA</span></div></div>\n'

    + '<div class="card">\n'

    // Contexto (semana + pílula)
    + '  <div class="ctx">\n'
    + '    <div class="semana">Semana <?= semana ?> de 14 — Registro de Evidência</div>\n'
    + '    <div class="pilula" id="pilula-titulo"><?= pilula ?></div>\n'
    + '    <div class="comp" id="comp-nome"><?= comp ?></div>\n'
    + '  </div>\n'

    // Formulário
    + '  <div class="body" id="form-area">\n'
    + '    <div class="saudacao" id="saudacao"></div>\n'
    + '    <div class="subtitulo" id="subtitulo"></div>\n'

    // Aviso semana de implementação
    + '    <div class="impl-aviso" id="impl-aviso" style="display:none">\n'
    + '      🧘 <strong>Semana de implementação</strong> — não há conteúdo novo esta semana. '
    + 'Relate o que praticou a partir das pílulas anteriores.\n'
    + '    </div>\n'

    + '    <div class="campo">\n'
    + '      <label>1. O que você tentou fazer?</label>\n'
    + '      <span class="hint">Descreva a situação, o contexto e o que você colocou em prática.</span>\n'
    + '      <textarea id="txt-acao" placeholder="Ex: Na HTPC desta semana, tentei aplicar a escuta ativa ao invés de já chegar com as respostas..." maxlength="1500"></textarea>\n'
    + '    </div>\n'

    + '    <div class="campo">\n'
    + '      <label>2. O que você observou?</label>\n'
    + '      <span class="hint">Qual foi o resultado, reação dos alunos/equipe ou aprendizado?</span>\n'
    + '      <textarea id="txt-resultado" placeholder="Ex: Os professores participaram mais, trouxeram exemplos próprios. Percebi que dar espaço gera mais engajamento..." maxlength="1500"></textarea>\n'
    + '    </div>\n'

    + '    <div class="erro-msg" id="erro-msg"></div>\n'
    + '    <button id="btn-enviar" onclick="enviar()">Registrar evidência →</button>\n'
    + '  </div>\n'

    // Tela de sucesso
    + '  <div class="feedback" id="feedback-ok">\n'
    + '    <div class="icon">🎯</div>\n'
    + '    <h2>Evidência registrada!</h2>\n'
    + '    <p>Parabéns por refletir sobre sua prática.<br>Continue assim na próxima semana! 💪</p>\n'
    + '  </div>\n'

    // Tela de erro irrecuperável
    + '  <div class="feedback" id="feedback-erro">\n'
    + '    <div class="icon">⚠️</div>\n'
    + '    <h2>Não foi possível registrar</h2>\n'
    + '    <p id="feedback-erro-msg">Verifique se o link está correto ou fale com seu gestor.</p>\n'
    + '  </div>\n'

    + '</div>\n' // .card

    + '<script>\n'
    + 'var _email  = "<?= email ?>";\n'
    + 'var _semana = "<?= semana ?>";\n'
    + 'var _nome   = "<?= nome ?>";\n'
    + 'var _ehImpl = <?= ehImpl ?>;\n'
    + '\n'
    + 'window.onload = function() {\n'
    + '  var fn = (_nome || "").split(" ")[0] || "colaborador(a)";\n'
    + '  document.getElementById("saudacao").textContent = "Olá, " + fn + "!";\n'
    + '  if (_ehImpl) {\n'
    + '    document.getElementById("subtitulo").textContent = "Conte o que praticou a partir das pílulas anteriores.";\n'
    + '    document.getElementById("impl-aviso").style.display = "block";\n'
    + '  } else {\n'
    + '    document.getElementById("subtitulo").textContent = "Conte como foi aplicar o conteúdo da pílula desta semana. Respostas honestas valem mais do que respostas perfeitas.";\n'
    + '  }\n'
    + '  // Validação de link mínima\n'
    + '  if (!_email || !_semana) {\n'
    + '    document.getElementById("form-area").style.display = "none";\n'
    + '    document.getElementById("feedback-erro").style.display = "block";\n'
    + '    document.getElementById("feedback-erro-msg").textContent = "Link inválido — e-mail ou semana não identificados.";\n'
    + '  }\n'
    + '};\n'
    + '\n'
    + 'function enviar() {\n'
    + '  var acao      = document.getElementById("txt-acao").value.trim();\n'
    + '  var resultado = document.getElementById("txt-resultado").value.trim();\n'
    + '  var erroEl    = document.getElementById("erro-msg");\n'
    + '\n'
    + '  erroEl.style.display = "none";\n'
    + '\n'
    + '  if (acao.length < 20) {\n'
    + '    erroEl.textContent = "Descreva o que tentou fazer com pelo menos 20 caracteres.";\n'
    + '    erroEl.style.display = "block";\n'
    + '    document.getElementById("txt-acao").focus();\n'
    + '    return;\n'
    + '  }\n'
    + '  if (resultado.length < 20) {\n'
    + '    erroEl.textContent = "Descreva o que observou com pelo menos 20 caracteres.";\n'
    + '    erroEl.style.display = "block";\n'
    + '    document.getElementById("txt-resultado").focus();\n'
    + '    return;\n'
    + '  }\n'
    + '\n'
    + '  var btn = document.getElementById("btn-enviar");\n'
    + '  btn.disabled    = true;\n'
    + '  btn.textContent = "Registrando...";\n'
    + '\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      if (r && r.ok) {\n'
    + '        document.getElementById("form-area").style.display    = "none";\n'
    + '        document.getElementById("feedback-ok").style.display  = "block";\n'
    + '      } else {\n'
    + '        erroEl.textContent    = (r && r.msg) || "Erro ao registrar. Tente novamente.";\n'
    + '        erroEl.style.display  = "block";\n'
    + '        btn.disabled          = false;\n'
    + '        btn.textContent       = "Registrar evidência →";\n'
    + '      }\n'
    + '    })\n'
    + '    .withFailureHandler(function(err) {\n'
    + '      erroEl.textContent   = "Erro de conexão. Tente novamente em alguns instantes.";\n'
    + '      erroEl.style.display = "block";\n'
    + '      btn.disabled         = false;\n'
    + '      btn.textContent      = "Registrar evidência →";\n'
    + '    })\n'
    + '    .registrarEvidenciaFase4(_email, parseInt(_semana), acao, resultado);\n'
    + '}\n'
    + '</script>\n'
    + '</body>\n</html>';
}