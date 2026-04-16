// =====================================================================
// VERTHO - EnvioPDIDescritores.js
//
// Envia PDIs Descritores por e-mail e WhatsApp (Z-API):
//   - Email: PDF anexo + template HTML responsivo
//   - WhatsApp: mensagem de texto + PDF base64
//
// Lê a aba PDI_Descritores (status = "Gerado") e envia para
// cada colaborador. Após envio atualiza status para "Enviado".
//
// Dependências: Config.js, WhatsAppService.js, Código.js
// =====================================================================

var _EPDI_ABA          = 'PDI_Descritores';
var _EPDI_ABA_COLAB    = 'Colaboradores';
var _EPDI_EMAIL_REMET  = 'diagnostico@vertho.ai';
var _EPDI_NOME_REMET   = 'Vertho';

// Colunas da aba PDI_Descritores (1-based)
var _EPDI_COL_EMAIL    = 1;
var _EPDI_COL_NOME     = 2;
var _EPDI_COL_CARGO    = 3;
var _EPDI_COL_DATA     = 4;
var _EPDI_COL_STATUS   = 5;
var _EPDI_COL_URL      = 6;

// ══════════════════════════════════════════════════════════════════════
// MENUS
// ══════════════════════════════════════════════════════════════════════

function enviarPDIsDescritoresMenu() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Enviar PDIs Descritores',
    'Envia o PDI por e-mail e WhatsApp para cada colaborador com status "Gerado".\n\n'
    + '📧 E-mail: PDF anexo\n'
    + '📱 WhatsApp: mensagem + PDF (se tiver telefone cadastrado)\n\n'
    + 'Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var resultado = enviarPDIsDescritores();
  ui.alert(
    'Envio PDIs Descritores',
    '✅ E-mails enviados: ' + resultado.emailOk
    + '\n📱 WhatsApp enviados: ' + resultado.wppOk
    + '\n❌ Erros: ' + resultado.erros
    + (resultado.semFone > 0 ? '\n⚠️ Sem telefone cadastrado: ' + resultado.semFone : ''),
    ui.ButtonSet.OK
  );
}


// ══════════════════════════════════════════════════════════════════════
// ENVIO PRINCIPAL
// ══════════════════════════════════════════════════════════════════════

function enviarPDIsDescritores() {
  Logger.log('=== ENVIANDO PDIs DESCRITORES ===');
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  // ── 1. Ler aba PDI_Descritores ──────────────────────────────────────
  var ws = ss.getSheetByName(_EPDI_ABA);
  if (!ws || ws.getLastRow() <= 1) {
    Logger.log('Aba ' + _EPDI_ABA + ' vazia ou não encontrada.');
    return { emailOk: 0, wppOk: 0, erros: 0, semFone: 0 };
  }

  var dados = ws.getRange(2, 1, ws.getLastRow() - 1, 6).getValues();

  // ── 2. Mapear telefones da aba Colaboradores ────────────────────────
  var mapaFones = _epdiMapaFones(ss);
  var fonesKeys = Object.keys(mapaFones);
  Logger.log('Telefones mapeados: ' + fonesKeys.length + ' | emails: ' + fonesKeys.join(', '));

  // ── 3. Processar cada PDI com status "Gerado" ──────────────────────
  var emailOk = 0, wppOk = 0, erros = 0, semFone = 0;
  var total = dados.length;

  for (var i = 0; i < total; i++) {
    if (_deveParar()) { _limparParada(); break; }
    var email  = String(dados[i][_EPDI_COL_EMAIL - 1] || '').trim().toLowerCase();
    var nome   = String(dados[i][_EPDI_COL_NOME - 1] || '').trim();
    var cargo  = String(dados[i][_EPDI_COL_CARGO - 1] || '').trim();
    var status = String(dados[i][_EPDI_COL_STATUS - 1] || '').trim();
    var urlPdf = String(dados[i][_EPDI_COL_URL - 1] || '').trim();

    // Log de cada linha para debug
    Logger.log('Linha ' + (i + 2) + ': email=' + email + ' | nome=' + nome + ' | status="' + status + '" | urlPdf=' + (urlPdf ? 'SIM' : 'NÃO'));

    // Só pula se já enviou por AMBOS os canais com sucesso
    var statusNorm = status.toLowerCase();
    var jaCompleto = statusNorm.indexOf('email') >= 0 && statusNorm.indexOf('whatsapp') >= 0;
    if (jaCompleto) {
      Logger.log('Pulando ' + email + ': já enviado por ambos canais (' + status + ')');
      continue;
    }
    if (!email || !urlPdf) {
      Logger.log('Pulando linha ' + (i + 2) + ': email ou URL vazio');
      continue;
    }

    var rowSheet = i + 2; // linha real na planilha (1-based, header = 1)

    SpreadsheetApp.getActive().toast(
      'Enviando ' + (i + 1) + '/' + total + ': ' + (nome || email),
      '📧 PDI Descritores', 10
    );

    // ── Localizar PDF no Drive ──────────────────────────────────────
    var pdfFile = _epdiAbrirPdf(urlPdf);
    if (!pdfFile) {
      Logger.log('❌ PDF não encontrado para ' + nome + ': ' + urlPdf);
      ws.getRange(rowSheet, _EPDI_COL_STATUS).setValue('Erro: PDF não encontrado');
      erros++;
      continue;
    }

    var primeiroNome = (nome || 'Colaborador').split(' ')[0];
    var envioEmailOk = false;
    var envioWppOk   = false;

    // ── Enviar E-mail ──────────────────────────────────────────────
    try {
      var remetenteConfig = props.getProperty('cfg_email') || '';
      var assunto   = 'Seu Plano de Desenvolvimento (PDI) | Vertho';
      // Logo inline: embutir como CID para funcionar em todos os clientes de email
      var logoBlob = null;
      try {
        logoBlob = DriveApp.getFileById('1mA5eddv8335AccTjwoLPQdTWK_UnoGhM').getBlob().setName('logo');
      } catch(eLogo) {
        Logger.log('Logo não encontrado: ' + eLogo.message);
      }
      var corpoHtml = _epdiTemplateEmail(primeiroNome);

      var options = {
        htmlBody:    corpoHtml,
        attachments: [pdfFile.getAs('application/pdf')],
        name:        _EPDI_NOME_REMET
      };
      if (logoBlob) {
        options.inlineImages = { verthoLogo: logoBlob };
      }
      // Só usa alias se for diferente do usuário ativo E for um alias válido
      // Se falhar, envia sem alias (do email padrão da conta)
      if (remetenteConfig && remetenteConfig !== Session.getActiveUser().getEmail()) {
        try {
          var aliases = GmailApp.getAliases();
          if (aliases.indexOf(remetenteConfig) >= 0) {
            options.from = remetenteConfig;
          } else {
            Logger.log('⚠️ Alias "' + remetenteConfig + '" não configurado no Gmail. Enviando do email padrão.');
          }
        } catch(eAlias) {
          Logger.log('⚠️ Erro ao verificar aliases: ' + eAlias.message);
        }
      }

      GmailApp.sendEmail(email, assunto, '', options);
      envioEmailOk = true;
      emailOk++;
      Logger.log('✅ Email PDI enviado: ' + email);
    } catch (e) {
      Logger.log('❌ Erro email ' + email + ': ' + e.message);
      erros++;
    }

    // ── Enviar WhatsApp ────────────────────────────────────────────
    var fone = mapaFones[email] || '';
    if (fone) {
      try {
        // 1. Mensagem de texto primeiro
        var msgWpp = '📋 Olá, ' + primeiroNome + '!\n\n'
          + 'Seu *Plano de Desenvolvimento Individual (PDI)* da Vertho está pronto.\n\n'
          + 'Nele você encontra:\n'
          + '• Análise detalhada dos seus descritores\n'
          + '• Competências prioritárias\n'
          + '• Plano de ação de 30 dias\n'
          + '• Estudos recomendados\n\n'
          + '📎 O PDF segue na próxima mensagem.\n\n'
          + '🔒 _Este documento é confidencial e pessoal._';
        _enviarTextoWpp(fone, msgWpp);

        // 2. PDF base64
        Utilities.sleep(2000);
        var blob = pdfFile.getBlob();
        var blobSize = blob.getBytes().length;
        var nomeArquivo = 'PDI_' + nome.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
        Logger.log('WPP PDF: fone=' + fone + ' blob=' + blobSize + ' bytes, nome=' + nomeArquivo);

        // Chamar envio com log detalhado inline
        var okPdf = false;
        try {
          var p = PropertiesService.getScriptProperties();
          var instId = p.getProperty('ZAPI_INSTANCE_ID');
          var tkn    = p.getProperty('ZAPI_TOKEN');
          var ctkn   = p.getProperty('ZAPI_CLIENT_TOKEN');
          var zapiUrl = 'https://api.z-api.io/instances/' + instId + '/token/' + tkn + '/send-document/pdf';

          var foneLimpo = String(fone).replace(/\D/g, '');
          if (foneLimpo.indexOf('55') !== 0) foneLimpo = '55' + foneLimpo;

          var base64 = Utilities.base64Encode(blob.getBytes());
          Logger.log('WPP PDF: base64 length=' + base64.length + ' fone=' + foneLimpo);

          var pdfPayload = JSON.stringify({
            phone: foneLimpo,
            document: 'data:application/pdf;base64,' + base64,
            fileName: nomeArquivo
          });

          var respPdf = UrlFetchApp.fetch(zapiUrl, {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Client-Token': ctkn || '' },
            payload: pdfPayload,
            muteHttpExceptions: true
          });

          var httpCode = respPdf.getResponseCode();
          var respBody = respPdf.getContentText().substring(0, 500);
          Logger.log('WPP PDF resp: HTTP ' + httpCode + ' body: ' + respBody);
          okPdf = (httpCode === 200 || httpCode === 201);
        } catch(ePdf) {
          Logger.log('WPP PDF EXCEPTION: ' + ePdf.message);
        }

        if (okPdf) {
          envioWppOk = true;
          wppOk++;
          Logger.log('✅ WhatsApp PDI PDF enviado: ' + fone);
        } else {
          Logger.log('⚠️ WhatsApp PDF falhou: ' + fone);
        }
      } catch (e) {
        Logger.log('❌ Erro WhatsApp ' + fone + ': ' + e.message);
      }
    } else {
      semFone++;
      Logger.log('⚠️ Sem telefone para: ' + email);
    }

    // ── Atualizar status na planilha ────────────────────────────────
    var novoStatus = 'Enviado';
    var detalhes = [];
    if (envioEmailOk) detalhes.push('email');
    if (envioWppOk) detalhes.push('whatsapp');
    if (detalhes.length > 0) {
      novoStatus = 'Enviado (' + detalhes.join(' + ') + ')';
    } else {
      novoStatus = 'Erro no envio';
    }
    ws.getRange(rowSheet, _EPDI_COL_STATUS).setValue(novoStatus);

    // Delay entre envios para não estourar rate limit
    Utilities.sleep(1000);
  }

  // ── Resultado ─────────────────────────────────────────────────────
  Logger.log('=== RESULTADO PDI: emails=' + emailOk + ' wpp=' + wppOk + ' erros=' + erros + ' semFone=' + semFone + ' ===');
  SpreadsheetApp.getActive().toast(
    '✅ ' + emailOk + ' emails | 📱 ' + wppOk + ' WhatsApp | ❌ ' + erros + ' erros',
    'PDI Descritores — Envio concluído', 15
  );

  return { emailOk: emailOk, wppOk: wppOk, erros: erros, semFone: semFone };
}


// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

/**
 * Abre arquivo PDF a partir da URL do Drive.
 * Suporta URLs do tipo:
 *   - https://drive.google.com/file/d/FILEID/view
 *   - https://drive.google.com/open?id=FILEID
 */
function _epdiAbrirPdf(url) {
  try {
    var id = '';
    var match = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      id = match[1];
    } else {
      match = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match) id = match[1];
    }
    if (!id) {
      Logger.log('_epdiAbrirPdf: não conseguiu extrair ID de: ' + url);
      return null;
    }
    return DriveApp.getFileById(id);
  } catch (e) {
    Logger.log('_epdiAbrirPdf ERRO: ' + e.message + ' | url: ' + url);
    return null;
  }
}

/**
 * Monta mapa email → telefone da aba Colaboradores.
 * Tenta headers na linha 4 e na linha 1 (fallback).
 * Busca coluna de WhatsApp/telefone e coluna de email.
 */
function _epdiMapaFones(ss) {
  var mapa = {};
  var wsCol = ss.getSheetByName(_EPDI_ABA_COLAB);
  if (!wsCol || wsCol.getLastRow() < 2) {
    Logger.log('_epdiMapaFones: aba Colaboradores não encontrada ou vazia');
    return mapa;
  }

  var dadosCol = wsCol.getDataRange().getValues();

  // Tentar headers na linha 4 (padrão Vertho) e fallback na linha 1
  var headerRows = [3, 0]; // 0-based
  var iFone = -1, iEmail = -1, headerRowUsed = -1, headersCol = [];

  for (var h = 0; h < headerRows.length; h++) {
    var rowIdx = headerRows[h];
    if (rowIdx >= dadosCol.length) continue;
    headersCol = dadosCol[rowIdx];

    iFone = -1; iEmail = -1;
    for (var c = 0; c < headersCol.length; c++) {
      var hNorm = String(headersCol[c] || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      if (iFone < 0 && (hNorm.indexOf('whatsapp') >= 0 || hNorm.indexOf('telefone') >= 0
        || hNorm.indexOf('celular') >= 0 || hNorm.indexOf('fone') >= 0 || hNorm.indexOf('wpp') >= 0)) iFone = c;
      if (iEmail < 0 && (hNorm.indexOf('email') >= 0 || hNorm === 'mail' || hNorm === 'emailid')) iEmail = c;
    }
    if (iFone >= 0 && iEmail >= 0) { headerRowUsed = rowIdx; break; }
  }

  Logger.log('_epdiMapaFones: headerRow=' + (headerRowUsed + 1) + ' iEmail=' + iEmail + ' iFone=' + iFone
    + ' | headers: ' + headersCol.map(function(h,i) { return i + '="' + h + '"'; }).join(' | '));

  if (iFone < 0 || iEmail < 0) {
    Logger.log('_epdiMapaFones: coluna email(' + iEmail + ') ou telefone(' + iFone + ') não encontrada');
    return mapa;
  }

  var dataStart = headerRowUsed + 1;
  for (var r = dataStart; r < dadosCol.length; r++) {
    var email = String(dadosCol[r][iEmail] || '').trim().toLowerCase();
    var fone  = String(dadosCol[r][iFone] || '').replace(/\D/g, '');
    if (email && fone && fone.length >= 8) mapa[email] = fone;
  }

  return mapa;
}


// ══════════════════════════════════════════════════════════════════════
// TEMPLATE E-MAIL
// ══════════════════════════════════════════════════════════════════════

function _epdiTemplateEmail(primeiroNome) {
  return '<div style="font-family:\'Segoe UI\',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px">'
    // Header com logo inline (CID)
    + '<div style="background:#0f2b54;padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">'
    + '<img src="cid:verthoLogo" alt="Vertho Mentor IA" style="max-height:48px;max-width:220px" />'
    + '</div>'
    // Body — HTML entities para acentos, sem emojis
    + '<div style="background:#f7f9fc;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">'
    + '<p style="font-size:16px;color:#1e293b;margin:0 0 16px">Ol&#225;, <strong>' + primeiroNome + '</strong>!</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px">'
    + 'Seu <strong>Plano de Desenvolvimento Individual (PDI)</strong> est&#225; pronto!</p>'
    + '<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 8px">'
    + 'Nele voc&#234; encontra:</p>'
    + '<ul style="font-size:14px;color:#475569;line-height:1.8;margin:0 0 16px;padding-left:20px">'
    + '<li>An&#225;lise detalhada dos seus <strong>descritores por compet&#234;ncia</strong></li>'
    + '<li><strong>Compet&#234;ncias priorit&#225;rias</strong> para desenvolvimento</li>'
    + '<li><strong>Plano de a&#231;&#227;o de 30 dias</strong> com a&#231;&#245;es semanais</li>'
    + '<li><strong>Estudos recomendados</strong> da nossa plataforma</li>'
    + '<li><strong>Checklist t&#225;tico</strong> para autoavalia&#231;&#227;o</li>'
    + '</ul>'
    + '<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">'
    + 'O PDF est&#225; <strong>anexo</strong> a este e-mail.</p>'
    + '<div style="background:#eef3fb;border-left:4px solid #34c5cc;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0">'
    + '<p style="font-size:13px;color:#1e293b;margin:0"><strong>Dica:</strong> '
    + 'Leia com calma, destaque as a&#231;&#245;es mais pr&#225;ticas e comece pela primeira semana. '
    + 'Pequenos passos consistentes geram grandes transforma&#231;&#245;es.</p>'
    + '</div>'
    + '<p style="font-size:13px;color:#94a3b8;margin:16px 0 0">Este documento &#233; confidencial e pessoal.</p>'
    + '</div></div>';
}
