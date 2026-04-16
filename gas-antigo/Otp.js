// ═══════════════════════════════════════════════════════════════════════════════
// OTP.gs — Autenticação por Código de Verificação (One-Time Password)
// Arquivo independente. Usado por: DiagnosticoWebApp, ChatWebApp, DashboardWebApp.
//
// Fluxo:
//   1. Colaborador digita e-mail → frontend chama enviarOTP(email, origem)
//   2. Backend valida e-mail na aba Colaboradores, gera código 6 dígitos
//   3. Salva no CacheService (15 min TTL), envia e-mail com template Vertho
//   4. Colaborador digita código → frontend chama validarOTP(email, codigo)
//   5. Backend valida → retorna { success: true, nome, cargo, ... }
//
// Segurança:
//   - Máx 3 tentativas erradas → bloqueio de 15 min
//   - Máx 5 envios por e-mail por hora (anti-spam)
//   - Código invalidado após uso (single-use)
//   - CacheService = memória volátil (não persiste em Sheets)
// ═══════════════════════════════════════════════════════════════════════════════

var OTP_CONFIG = {
  TAMANHO:          6,          // dígitos
  TTL_SEGUNDOS:     900,        // 15 minutos
  MAX_TENTATIVAS:   3,          // antes de bloquear
  BLOQUEIO_SEG:     900,        // 15 min de bloqueio após 3 erros
  MAX_ENVIOS_HORA:  5,          // anti-spam
  NOME_REMETENTE:   'Vertho',
};


// ═══════════════════════════════════════════════════════════════════════════════
// ENVIAR OTP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera e envia código OTP por e-mail.
 * @param {string} email — e-mail do colaborador
 * @param {string} origem — 'diagnostico' | 'chat' | 'dashboard' (para personalizar o e-mail)
 * @returns {object} { success, message, nome? }
 */
function enviarOTP(email, origem) {
  email = String(email || '').toLowerCase().trim();
  if (!email || email.indexOf('@') < 0) {
    return { success: false, message: 'Informe um e-mail válido.' };
  }

  // ── Verificar se e-mail existe na aba Colaboradores ─────────────────────
  var colab = _otpBuscarColaborador(email);
  if (!colab) {
    return { success: false, message: 'E-mail não encontrado. Verifique e tente novamente.' };
  }

  var cache = CacheService.getScriptCache();

  // ── Anti-spam: máx envios por hora ──────────────────────────────────────
  var chaveEnvios = 'otp_envios_' + email;
  var enviosRaw   = cache.get(chaveEnvios);
  var envios      = enviosRaw ? parseInt(enviosRaw, 10) : 0;
  if (envios >= OTP_CONFIG.MAX_ENVIOS_HORA) {
    return { success: false, message: 'Muitos códigos enviados. Aguarde alguns minutos e tente novamente.' };
  }

  // ── Gerar código ────────────────────────────────────────────────────────
  var codigo = _otpGerarCodigo(OTP_CONFIG.TAMANHO);

  // ── Salvar no cache ─────────────────────────────────────────────────────
  var chaveOTP = 'otp_code_' + email;
  cache.put(chaveOTP, codigo, OTP_CONFIG.TTL_SEGUNDOS);

  // Resetar tentativas
  var chaveTentativas = 'otp_tries_' + email;
  cache.put(chaveTentativas, '0', OTP_CONFIG.TTL_SEGUNDOS);

  // Incrementar contador de envios (TTL de 1 hora)
  cache.put(chaveEnvios, String(envios + 1), 3600);

  // ── Enviar e-mail ───────────────────────────────────────────────────────
  try {
    _otpEnviarEmail(colab, codigo, origem);
  } catch (e) {
    Logger.log('OTP envio falhou: ' + e.message);
    return { success: false, message: 'Erro ao enviar e-mail. Tente novamente.' };
  }

  var primeiroNome = colab.nome.split(' ')[0];
  return {
    success: true,
    message: 'Código enviado para ' + _otpMascararEmail(email) + '. Verifique sua caixa de entrada.',
    nome: primeiroNome,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// VALIDAR OTP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida o código OTP informado.
 * @param {string} email
 * @param {string} codigo — 6 dígitos informados pelo usuário
 * @returns {object} { success, message, nome?, cargo?, empresa? }
 */
function validarOTP(email, codigo) {
  email  = String(email  || '').toLowerCase().trim();
  codigo = String(codigo || '').trim();

  if (!email || !codigo) {
    return { success: false, message: 'Informe o e-mail e o código.' };
  }

  var cache = CacheService.getScriptCache();

  // ── Verificar bloqueio ──────────────────────────────────────────────────
  var chaveBloqueio = 'otp_block_' + email;
  if (cache.get(chaveBloqueio)) {
    return { success: false, message: 'Acesso bloqueado temporariamente. Aguarde 15 minutos e solicite um novo código.' };
  }

  // ── Buscar código no cache ──────────────────────────────────────────────
  var chaveOTP    = 'otp_code_' + email;
  var codigoSalvo = cache.get(chaveOTP);

  if (!codigoSalvo) {
    return { success: false, message: 'Código expirado ou não solicitado. Solicite um novo código.' };
  }

  // ── Verificar tentativas ────────────────────────────────────────────────
  var chaveTentativas = 'otp_tries_' + email;
  var tentativasRaw   = cache.get(chaveTentativas);
  var tentativas      = tentativasRaw ? parseInt(tentativasRaw, 10) : 0;

  if (codigo !== codigoSalvo) {
    tentativas++;
    if (tentativas >= OTP_CONFIG.MAX_TENTATIVAS) {
      // Bloquear
      cache.put(chaveBloqueio, 'true', OTP_CONFIG.BLOQUEIO_SEG);
      cache.remove(chaveOTP);
      cache.remove(chaveTentativas);
      return { success: false, message: 'Código incorreto 3 vezes. Acesso bloqueado por 15 minutos.' };
    }
    cache.put(chaveTentativas, String(tentativas), OTP_CONFIG.TTL_SEGUNDOS);
    var restantes = OTP_CONFIG.MAX_TENTATIVAS - tentativas;
    return { success: false, message: 'Código incorreto. ' + restantes + ' tentativa(s) restante(s).' };
  }

  // ── Código correto — invalidar (single-use) ────────────────────────────
  cache.remove(chaveOTP);
  cache.remove(chaveTentativas);

  // ── Retornar dados do colaborador ───────────────────────────────────────
  var colab = _otpBuscarColaborador(email);
  if (!colab) {
    return { success: false, message: 'Colaborador não encontrado.' };
  }

  return {
    success: true,
    message: 'Código validado com sucesso!',
    nome:    colab.nome,
    cargo:   colab.cargo,
    empresa: colab.empresa,
    email:   email,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera código numérico aleatório com N dígitos.
 */
function _otpGerarCodigo(tamanho) {
  var min = Math.pow(10, tamanho - 1);      // 100000
  var max = Math.pow(10, tamanho) - 1;      // 999999
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/**
 * Mascara o e-mail para exibição: r****s@gmail.com
 */
function _otpMascararEmail(email) {
  var partes = email.split('@');
  var local  = partes[0];
  if (local.length <= 2) return local[0] + '***@' + partes[1];
  return local[0] + '****' + local[local.length - 1] + '@' + partes[1];
}

/**
 * Busca colaborador na aba Colaboradores pelo e-mail.
 * Retorna { nome, cargo, empresa, email } ou null.
 */
function _otpBuscarColaborador(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Tentar primeiro pela função do DiagnosticoFase2 (se existir)
  if (typeof _diagBuscarColaborador === 'function') {
    var colab = _diagBuscarColaborador(ss, email);
    if (colab) return colab;
  }

  // Fallback: busca direta na aba Colaboradores
  var ws = ss.getSheetByName('Colaboradores');
  if (!ws) return null;

  var dados   = ws.getDataRange().getValues();
  var headers = dados[3]; // header na linha 4

  // Buscar coluna de e-mail
  var iEmail = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if ((h.includes('e-mail') || h.includes('email')) && h.includes('corporat')) {
      iEmail = c;
      break;
    }
  }
  // Fallback: qualquer coluna com "e-mail" ou "email"
  if (iEmail < 0) {
    for (var c2 = 0; c2 < headers.length; c2++) {
      var h2 = String(headers[c2] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (h2 === 'e-mail' || h2 === 'email' || h2.includes('e-mail')) {
        iEmail = c2;
        break;
      }
    }
  }
  if (iEmail < 0) return null;

  // Buscar colunas de nome, cargo, empresa
  var _find = function(keyword) {
    for (var j = 0; j < headers.length; j++) {
      if (String(headers[j] || '').toLowerCase().replace(/\s+/g, ' ').trim().includes(keyword)) return j;
    }
    return -1;
  };
  var iNome    = _find('nome completo');
  if (iNome < 0) iNome = _find('nome');
  var iCargo   = _find('cargo');
  var iEmpresa = _find('empresa');

  // Buscar por e-mail (dados começam na linha 5 = index 4)
  for (var r = 4; r < dados.length; r++) {
    var rowEmail = String(dados[r][iEmail] || '').toLowerCase().trim();
    if (rowEmail === email) {
      return {
        nome:    String(dados[r][iNome]    || '').trim(),
        cargo:   iCargo >= 0 ? String(dados[r][iCargo]   || '').trim() : '',
        empresa: iEmpresa >= 0 ? String(dados[r][iEmpresa] || '').trim() : '',
        email:   rowEmail,
      };
    }
  }

  return null;
}

/**
 * Envia e-mail com o código OTP usando template visual Vertho.
 */
function _otpEnviarEmail(colab, codigo, origem) {
  var primeiroNome = colab.nome.split(' ')[0];
  var minutos      = Math.floor(OTP_CONFIG.TTL_SEGUNDOS / 60);

  var origemTexto = {
    diagnostico: 'Diagnóstico de Competências',
    chat:        'Avaliação de Aprendizagem',
    dashboard:   'Dashboard',
  }[origem] || 'Plataforma Vertho';

  var assunto = codigo + ' — Seu código de acesso Vertho';

  var corpoHtml =
    '<div style="font-family:\'DM Sans\',Arial,sans-serif;max-width:480px;margin:0 auto;background:#ffffff">' +

    // Header
    '<div style="background:linear-gradient(135deg,#0f2b54 0%,#3b0a6d 100%);padding:28px 24px;border-radius:12px 12px 0 0;text-align:center">' +
    '<div style="color:#34c5cc;font-size:22px;font-weight:700;letter-spacing:1px">VERTHO</div>' +
    '<div style="color:#9ae2e6;font-size:12px;margin-top:4px">Mentor IA — ' + origemTexto + '</div>' +
    '</div>' +

    // Body
    '<div style="padding:32px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none">' +

    '<p style="color:#0f2b54;font-size:15px;margin:0 0 20px">Olá, <strong>' + primeiroNome + '</strong>!</p>' +

    '<p style="color:#475569;font-size:14px;margin:0 0 24px">Use o código abaixo para acessar a plataforma:</p>' +

    // Código em destaque
    '<div style="background:#0f2b54;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">' +
    '<div style="color:#9ae2e6;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Seu código de acesso</div>' +
    '<div style="color:#ffffff;font-size:36px;font-weight:700;letter-spacing:8px;font-family:\'Courier New\',monospace">' + codigo + '</div>' +
    '</div>' +

    // Info
    '<div style="background:#f0fdf4;border-left:4px solid #34c5cc;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px">' +
    '<p style="color:#0f2b54;font-size:13px;margin:0">' +
    '⏱ Válido por <strong>' + minutos + ' minutos</strong><br>' +
    '🔒 Não compartilhe este código com ninguém' +
    '</p>' +
    '</div>' +

    '<p style="color:#94a3b8;font-size:12px;margin:0">Se você não solicitou este código, ignore este e-mail.</p>' +

    '</div>' +

    // Footer
    '<div style="padding:16px 24px;text-align:center;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;background:#f1f5f9">' +
    '<p style="color:#94a3b8;font-size:11px;margin:0">Vertho · ' + (colab.empresa || 'vertho.com.br') + '</p>' +
    '</div>' +

    '</div>';

  var corpoTexto = 'Olá, ' + primeiroNome + '!\n\n' +
    'Seu código de acesso Vertho: ' + codigo + '\n\n' +
    'Válido por ' + minutos + ' minutos.\n' +
    'Não compartilhe este código.\n\nEquipe Vertho';

  // Tentar enviar com alias, fallback sem alias
  var opcoes = { name: OTP_CONFIG.NOME_REMETENTE, htmlBody: corpoHtml };
  try {
    GmailApp.sendEmail(colab.email, assunto, corpoTexto,
      Object.assign({}, opcoes, { from: 'diagnostico@vertho.ai' }));
  } catch (e) {
    GmailApp.sendEmail(colab.email, assunto, corpoTexto, opcoes);
  }

  Logger.log('OTP enviado → ' + colab.email + ' | origem=' + origem);
}