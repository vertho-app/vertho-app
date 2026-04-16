// ═══════════════════════════════════════════════════════════════════════════════
// VERTHO — FASE 4: AUTENTICAÇÃO OTP v1
// Arquivo: Fase4_OTP.gs — adicione ao projeto GAS junto com Fase4.gs
//
// Cobre (doc seção 10):
//   · enviarCodigoOTP(email)       — gera código 6 dígitos, salva no Cache, envia e-mail
//   · validarCodigoOTP(email, cod) — valida código, retorna token de sessão (4h)
//   · verificarSessao(token)       — retorna email ou null se expirada
//   · renovarSessao(token)         — estende sessão por mais 4h
//   · invalidarSessao(token)       — logout explícito
//   · reenviarCodigoOTP(email)     — throttle: máx 1 reenvio/minuto
//   · _otp_templateEmail(codigo)   — HTML do e-mail de código
//
// Onde aplicar OTP (doc 10.4):
//   ✅ Dashboard Web   (?view=dashboard)
//   ✅ Tutor IA        (?view=tutor)
//   ❌ Chat Fase 5     (login simples por e-mail — sessão curta)
//   ❌ Painel controle (já autenticado pelo Google Workspace)
// ═══════════════════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÕES ──────────────────────────────────────────────────────────────
var OTP_EXPIRACAO_SEG  = 600;    // 10 minutos (doc: "válido por 10 minutos")
var OTP_SESSAO_SEG     = 14400;  // 4 horas
var OTP_THROTTLE_SEG   = 60;     // mínimo entre reenvios
var OTP_ABA_COLAB      = 'Colaboradores';

// Prefixos de chave no CacheService (evita colisão com outros módulos)
var OTP_PREFIX_CODIGO  = 'otp_cod_';
var OTP_PREFIX_THROTTLE= 'otp_thr_';
var OTP_PREFIX_SESSAO  = 'otp_ses_';


// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 1 — Enviar código OTP
// Retorna: { success: true } | { success: false, message: "..." }
// ═══════════════════════════════════════════════════════════════════════════════
function enviarCodigoOTP(email) {
  email = String(email || '').toLowerCase().trim();
  if (!email || email.indexOf('@') < 0) {
    return { success: false, message: 'E-mail inválido.' };
  }

  // Verifica se colaborador existe na plataforma
  var verificacao = _otp_verificarColaborador(email);
  if (!verificacao.encontrado) {
    return { success: false, message: 'E-mail não encontrado na plataforma.' };
  }

  // Throttle: não reenviar em menos de OTP_THROTTLE_SEG segundos
  var cache = CacheService.getScriptCache();
  var throttle = cache.get(OTP_PREFIX_THROTTLE + email);
  if (throttle) {
    return { success: false, message: 'Aguarde 1 minuto antes de solicitar novo código.' };
  }

  // Gera código de 6 dígitos
  var codigo = String(Math.floor(100000 + Math.random() * 900000));
  var payload = JSON.stringify({
    codigo:  codigo,
    expira:  Date.now() + OTP_EXPIRACAO_SEG * 1000,
    nome:    verificacao.nome
  });

  // Salva código e throttle no cache
  cache.put(OTP_PREFIX_CODIGO   + email, payload,  OTP_EXPIRACAO_SEG);
  cache.put(OTP_PREFIX_THROTTLE + email, '1',      OTP_THROTTLE_SEG);

  // Envia e-mail
  try {
    GmailApp.sendEmail(
      email,
      'Seu código de acesso — Vertho',
      'Seu código de acesso Vertho: ' + codigo + '\nVálido por 10 minutos.',
      { htmlBody: _otp_templateEmail(codigo, verificacao.nome), name: 'Vertho' }
    );
  } catch(e) {
    Logger.log('OTP — erro ao enviar e-mail para ' + email + ': ' + e.message);
    return { success: false, message: 'Erro ao enviar e-mail. Tente novamente.' };
  }

  Logger.log('OTP enviado para: ' + email);
  return { success: true, message: 'Código enviado para ' + email };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASSO 2 — Validar código e abrir sessão
// Retorna: { success: true, token: "uuid", nome: "..." } | { success: false, message: "..." }
// ═══════════════════════════════════════════════════════════════════════════════
function validarCodigoOTP(email, codigoDigitado) {
  email = String(email || '').toLowerCase().trim();
  codigoDigitado = String(codigoDigitado || '').trim();

  if (!email || !codigoDigitado) {
    return { success: false, message: 'E-mail e código são obrigatórios.' };
  }

  var cache  = CacheService.getScriptCache();
  var dados  = cache.get(OTP_PREFIX_CODIGO + email);

  if (!dados) {
    return { success: false, message: 'Código expirado ou não solicitado. Peça um novo.' };
  }

  var otp;
  try { otp = JSON.parse(dados); } catch(e) {
    return { success: false, message: 'Erro interno. Solicite novo código.' };
  }

  if (Date.now() > otp.expira) {
    cache.remove(OTP_PREFIX_CODIGO + email);
    return { success: false, message: 'Código expirado. Solicite um novo.' };
  }

  if (otp.codigo !== codigoDigitado) {
    Logger.log('OTP incorreto para: ' + email);
    return { success: false, message: 'Código incorreto.' };
  }

  // Código válido — invalida para uso único
  cache.remove(OTP_PREFIX_CODIGO + email);

  // Cria token de sessão (UUID)
  var token = Utilities.getUuid();
  var sessao = JSON.stringify({
    email: email,
    nome:  otp.nome,
    criada: Date.now()
  });
  cache.put(OTP_PREFIX_SESSAO + token, sessao, OTP_SESSAO_SEG);

  Logger.log('OTP validado — sessão criada para: ' + email);
  return { success: true, token: token, nome: otp.nome };
}


// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICAR SESSÃO — chamado em toda request autenticada
// Retorna: { email, nome } | null (sessão inválida/expirada)
// ═══════════════════════════════════════════════════════════════════════════════
function verificarSessao(token) {
  if (!token) return null;
  token = String(token).trim();

  var cache  = CacheService.getScriptCache();
  var dados  = cache.get(OTP_PREFIX_SESSAO + token);
  if (!dados) return null;

  try {
    var sessao = JSON.parse(dados);
    return { email: sessao.email, nome: sessao.nome };
  } catch(e) {
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// RENOVAR SESSÃO — estende por mais 4h (slide window)
// Chame a cada request autenticada para manter usuário logado
// ═══════════════════════════════════════════════════════════════════════════════
function renovarSessao(token) {
  if (!token) return false;
  token = String(token).trim();

  var cache = CacheService.getScriptCache();
  var dados = cache.get(OTP_PREFIX_SESSAO + token);
  if (!dados) return false;

  cache.put(OTP_PREFIX_SESSAO + token, dados, OTP_SESSAO_SEG);
  return true;
}


// ═══════════════════════════════════════════════════════════════════════════════
// INVALIDAR SESSÃO — logout explícito
// ═══════════════════════════════════════════════════════════════════════════════
function invalidarSessao(token) {
  if (!token) return;
  CacheService.getScriptCache().remove(OTP_PREFIX_SESSAO + String(token).trim());
}


// ═══════════════════════════════════════════════════════════════════════════════
// REENVIAR CÓDIGO — respeita throttle de 1 min
// ═══════════════════════════════════════════════════════════════════════════════
function reenviarCodigoOTP(email) {
  return enviarCodigoOTP(email); // throttle já está dentro de enviarCodigoOTP
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — verifica se e-mail existe na aba Colaboradores
// Retorna: { encontrado: bool, nome: string }
// ═══════════════════════════════════════════════════════════════════════════════
function _otp_verificarColaborador(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(OTP_ABA_COLAB);
  if (!ws) return { encontrado: false, nome: '' };

  var dados = ws.getDataRange().getValues();

  // Detecta dinamicamente a coluna de e-mail (procura header "E-mail Corporativo" ou "e-mail")
  var colEmail = -1, colNome = -1;
  for (var j = 0; j < dados.length; j++) {
    for (var k = 0; k < dados[j].length; k++) {
      var cell = String(dados[j][k]).toLowerCase().trim();
      if (colEmail < 0 && (cell.includes('e-mail corporativo') || cell === 'e-mail')) colEmail = k;
      if (colNome  < 0 && (cell === 'nome completo' || cell.includes('nome completo'))) colNome = k;
    }
    if (colEmail >= 0 && colNome >= 0) break;
  }

  // Fallback: estrutura conhecida da planilha Betão (col G = e-mail, col B = nome)
  if (colEmail < 0) colEmail = 6; // col G (0-indexed)
  if (colNome  < 0) colNome  = 1; // col B (0-indexed)

  for (var i = 1; i < dados.length; i++) {
    var emailCell = String(dados[i][colEmail] || '').toLowerCase().trim();
    if (emailCell === email) {
      return {
        encontrado: true,
        nome: String(dados[i][colNome] || '').trim()
      };
    }
  }

  // Segunda tentativa: busca na aba Respostas (colaboradores que já fizeram diagnóstico)
  var r2 = _otp_verificarEmRespostas(email);
  if (r2.encontrado) return r2;

  // Terceira tentativa: busca em Fase4_Envios (colaboradores Ativos da Fase 4)
  return _otp_verificarEmFase4Envios(email);
}

function _otp_verificarEmRespostas(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName('Respostas');
  if (!ws) return { encontrado: false, nome: '' };

  var dados = ws.getDataRange().getValues();
  // col B = email (idx 1), col C = nome (idx 2)
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][1] || '').toLowerCase().trim() === email) {
      return { encontrado: true, nome: String(dados[i][2] || '').trim() };
    }
  }
  return { encontrado: false, nome: '' };
}

function _otp_verificarEmFase4Envios(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(F4_ABA_ENVIOS);
  if (!ws) return { encontrado: false, nome: '' };

  var dados = ws.getDataRange().getValues();
  // F4E_EMAIL = col 2 (idx 1), F4E_NOME = col 1 (idx 0), F4E_STATUS = col 8 (idx 7)
  for (var i = 1; i < dados.length; i++) {
    var emailCell  = String(dados[i][F4E_EMAIL  - 1] || '').toLowerCase().trim();
    var statusCell = String(dados[i][F4E_STATUS - 1] || '').trim();
    if (emailCell === email && (statusCell === 'Ativo' || statusCell === 'Concluído')) {
      return { encontrado: true, nome: String(dados[i][F4E_NOME - 1] || '').trim() };
    }
  }
  return { encontrado: false, nome: '' };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE HTML — E-mail com código OTP
// ═══════════════════════════════════════════════════════════════════════════════
function _otp_templateEmail(codigo, nome) {
  var saudacao = nome ? ('Olá, <strong>' + nome.split(' ')[0] + '</strong>!') : 'Olá!';
  return '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f4f7fb;border-radius:12px;overflow:hidden">'
    + '<div style="background:#0f2b54;padding:18px 28px">'
    + '<span style="color:#34c5cc;font-size:19px;font-weight:700;letter-spacing:.5px">Vertho</span>'
    + '<span style="color:#fff;font-size:12px;opacity:.5;margin-left:8px">Mentor IA</span>'
    + '</div>'
    + '<div style="padding:32px 28px;text-align:center">'
    + '<p style="color:#0f2b54;font-size:15px;margin:0 0 4px">' + saudacao + '</p>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 24px">Seu código de acesso à plataforma Vertho:</p>'
    + '<div style="background:#fff;border-radius:12px;padding:24px;border:2px solid #34c5cc;display:inline-block;margin-bottom:20px">'
    + '<span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0f2b54;font-family:monospace">'
    + codigo
    + '</span>'
    + '</div>'
    + '<p style="color:#64748b;font-size:13px;margin:0 0 6px">⏱️ Válido por <strong>10 minutos</strong>.</p>'
    + '<p style="color:#94a3b8;font-size:12px;margin:0 0 24px">Uso único — não compartilhe este código.</p>'
    + '<div style="background:#fff8ed;border-radius:8px;padding:12px 16px;border:1px solid #fcd34d;margin-bottom:0">'
    + '<p style="color:#92400e;font-size:12px;margin:0">Se você não solicitou este código, ignore este e-mail.</p>'
    + '</div>'
    + '</div>'
    + '<div style="padding:0 28px 20px;text-align:center">'
    + '<p style="color:#94a3b8;font-size:11px;margin:0">Vertho © 2026 — Plataforma de Desenvolvimento de Competências</p>'
    + '</div>'
    + '</div>';
}


// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE DE AUTENTICAÇÃO — use no doGet() para proteger rotas
//
// Uso no Main.gs (doGet):
//
//   var VIEW_OTP = ['dashboard', 'tutor'];  // views que exigem OTP
//
//   function doGet(e) {
//     var view  = (e && e.parameter && e.parameter.view) || '';
//     var token = (e && e.parameter && e.parameter.token) || '';
//
//     if (VIEW_OTP.indexOf(view) >= 0) {
//       var sessao = verificarSessao(token);
//       if (!sessao) return serveLoginOTP(view);   // redireciona para tela de login
//       renovarSessao(token);                      // slide window
//       // continua para servir a view autenticada
//     }
//     ...
//   }
// ═══════════════════════════════════════════════════════════════════════════════

// Serve a tela de login OTP (HTML self-contained)
// viewDestino: view para redirecionar após login bem-sucedido
function serveLoginOTP(viewDestino) {
  var template = HtmlService.createTemplate(_otp_htmlLogin());
  template.viewDestino = viewDestino || 'dashboard';
  try { template.baseUrl = getURLWebApp() || ''; } catch(e2) { template.baseUrl = ''; }
  return template.evaluate()
    .setTitle('Acesso — Vertho')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// HTML da tela de login (2 etapas: e-mail → código)
function _otp_htmlLogin() {
  return '<!DOCTYPE html>\n<html>\n<head>\n'
    + '<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '<style>\n'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }\n'
    + 'body { font-family: Arial, sans-serif; background: #f4f7fb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }\n'
    + '.card { background: #fff; border-radius: 16px; padding: 40px 36px; max-width: 400px; width: 100%; box-shadow: 0 4px 24px rgba(15,43,84,.10); text-align: center; }\n'
    + '.logo { color: #34c5cc; font-size: 22px; font-weight: 700; letter-spacing: .5px; margin-bottom: 4px; }\n'
    + '.logo span { color: #0f2b54; font-size: 13px; opacity: .5; margin-left: 6px; font-weight: 400; }\n'
    + 'h2 { color: #0f2b54; font-size: 18px; margin: 20px 0 6px; }\n'
    + 'p.sub { color: #64748b; font-size: 13px; margin-bottom: 24px; line-height: 1.5; }\n'
    + 'input { width: 100%; padding: 13px 16px; border: 1.5px solid #e2e8f0; border-radius: 10px; font-size: 14px; color: #1e293b; outline: none; transition: border .2s; margin-bottom: 12px; }\n'
    + 'input:focus { border-color: #34c5cc; }\n'
    + 'input.codigo { font-size: 28px; font-weight: 700; letter-spacing: 10px; text-align: center; font-family: monospace; }\n'
    + 'button { width: 100%; padding: 13px; background: linear-gradient(135deg,#34c5cc,#2ba8af); color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity .2s; }\n'
    + 'button:disabled { opacity: .55; cursor: default; }\n'
    + '.msg { margin-top: 12px; font-size: 13px; min-height: 20px; }\n'
    + '.msg.erro { color: #ef4444; }\n'
    + '.msg.ok   { color: #10b981; }\n'
    + '.link { color: #34c5cc; font-size: 12px; cursor: pointer; margin-top: 10px; display: inline-block; background: none; border: none; text-decoration: underline; }\n'
    + '#tela-codigo { display: none; }\n'
    + '</style>\n'
    + '</head>\n<body>\n'
    + '<div class="card">\n'
    + '  <div class="logo">Vertho <span>Mentor IA</span></div>\n'
    + '\n'
    + '  <!-- Tela 1: E-mail -->\n'
    + '  <div id="tela-email">\n'
    + '    <h2 id="otp-titulo">Acesso</h2>\n'
    + '    <p class="sub">Digite seu e-mail para receber o código de acesso.</p>\n'
    + '    <input type="email" id="inp-email" placeholder="seu@email.com" />\n'
    + '    <button id="btn-enviar" onclick="enviarCodigo()">Enviar código</button>\n'
    + '    <div id="msg-email" class="msg"></div>\n'
    + '  </div>\n'
    + '\n'
    + '  <!-- Tela 2: Código -->\n'
    + '  <div id="tela-codigo">\n'
    + '    <h2>Código enviado!</h2>\n'
    + '    <p class="sub" id="txt-destino">Verifique sua caixa de entrada.</p>\n'
    + '    <input type="text" id="inp-codigo" class="codigo" maxlength="6" placeholder="000000" inputmode="numeric" />\n'
    + '    <button id="btn-verificar" onclick="verificarCodigo()">Verificar</button>\n'
    + '    <div id="msg-codigo" class="msg"></div>\n'
    + '    <button class="link" onclick="reenviar()" id="btn-reenviar">Não recebeu? Reenviar</button>\n'
    + '  </div>\n'
    + '</div>\n'
    + '\n'
    + '<script>\n'
    + 'var _email = "";\n'
    + 'var _viewDestino = "<?= viewDestino ?>";\n'
    + 'var _tituloMap = { dashboard: "Bem-vindo ao Dashboard", tutor: "Acesso ao Tutor IA", painel: "Acesso ao Painel" };\n'
    + '(function(){ var el = document.getElementById("otp-titulo"); if(el) el.textContent = _tituloMap[_viewDestino] || "Acesso à Plataforma"; })();\n'
    + 'var _baseUrl    = "<?= baseUrl ?>";\n'
    + '\n'
    + 'function setLoading(btn, loading) {\n'
    + '  document.getElementById(btn).disabled = loading;\n'
    + '  document.getElementById(btn).textContent = loading ? "Aguarde..." : (btn === "btn-enviar" ? "Enviar código" : "Verificar");\n'
    + '}\n'
    + '\n'
    + 'function mostrarMsg(id, texto, tipo) {\n'
    + '  var el = document.getElementById(id);\n'
    + '  el.textContent = texto;\n'
    + '  el.className = "msg " + (tipo || "");\n'
    + '}\n'
    + '\n'
    + 'function enviarCodigo() {\n'
    + '  _email = document.getElementById("inp-email").value.trim();\n'
    + '  if (!_email || _email.indexOf("@") < 0) { mostrarMsg("msg-email","E-mail inválido.","erro"); return; }\n'
    + '  setLoading("btn-enviar", true);\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      setLoading("btn-enviar", false);\n'
    + '      if (r.success) {\n'
    + '        document.getElementById("tela-email").style.display = "none";\n'
    + '        document.getElementById("tela-codigo").style.display = "block";\n'
    + '        document.getElementById("txt-destino").textContent = "Código enviado para " + _email;\n'
    + '        document.getElementById("inp-codigo").focus();\n'
    + '      } else {\n'
    + '        mostrarMsg("msg-email", r.message, "erro");\n'
    + '      }\n'
    + '    })\n'
    + '    .withFailureHandler(function() { setLoading("btn-enviar",false); mostrarMsg("msg-email","Erro ao enviar. Tente novamente.","erro"); })\n'
    + '    .enviarCodigoOTP(_email);\n'
    + '}\n'
    + '\n'
    + 'function verificarCodigo() {\n'
    + '  var codigo = document.getElementById("inp-codigo").value.trim();\n'
    + '  if (codigo.length !== 6) { mostrarMsg("msg-codigo","Digite os 6 dígitos.","erro"); return; }\n'
    + '  setLoading("btn-verificar", true);\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      setLoading("btn-verificar", false);\n'
    + '      if (r.success) {\n'
    + '        mostrarMsg("msg-codigo", "Acesso liberado! Carregando...","ok");\n'
    + '        // Redireciona para a view com o token na URL\n'
    + '        var _base = (_baseUrl && _baseUrl.indexOf("http") === 0) ? _baseUrl : window.location.href.split("?")[0];\n'
    + '        var url = _base + "?view=" + _viewDestino + "&token=" + r.token;\n'
    + '        window.top.location.href = url;\n'
    + '      } else {\n'
    + '        mostrarMsg("msg-codigo", r.message, "erro");\n'
    + '      }\n'
    + '    })\n'
    + '    .withFailureHandler(function() { setLoading("btn-verificar",false); mostrarMsg("msg-codigo","Erro ao verificar. Tente novamente.","erro"); })\n'
    + '    .validarCodigoOTP(_email, codigo);\n'
    + '}\n'
    + '\n'
    + 'function reenviar() {\n'
    + '  document.getElementById("btn-reenviar").disabled = true;\n'
    + '  google.script.run\n'
    + '    .withSuccessHandler(function(r) {\n'
    + '      mostrarMsg("msg-codigo", r.message, r.success ? "ok" : "erro");\n'
    + '      setTimeout(function(){ document.getElementById("btn-reenviar").disabled = false; }, 60000);\n'
    + '    })\n'
    + '    .reenviarCodigoOTP(_email);\n'
    + '}\n'
    + '\n'
    + '// Enter nos inputs\n'
    + 'document.addEventListener("keydown", function(e) {\n'
    + '  if (e.key !== "Enter") return;\n'
    + '  if (document.getElementById("tela-email").style.display !== "none" ||\n'
    + '      document.getElementById("tela-codigo").style.display === "none") {\n'
    + '    enviarCodigo();\n'
    + '  } else {\n'
    + '    verificarCodigo();\n'
    + '  }\n'
    + '});\n'
    + '</script>\n'
    + '</body>\n</html>';
}


