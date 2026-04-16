// =====================================================================
// EnvioLinkCIS.js — Envio de links CIS por WhatsApp (Z-API)
//
// Aba: "Envio Link CIS"
// Colunas: A=ID | B=Nome | C=Telefone | D=Email | E=Link | F=Status
// =====================================================================

var _CIS_ABA = 'Envio Link CIS';
var _CIS = { ID: 1, NOME: 2, FONE: 3, EMAIL: 4, LINK: 5, STATUS: 6 };

/**
 * Envia links CIS por WhatsApp para todos na aba.
 * Pula quem já tem status "Enviado". Reenvia quem tem "Erro".
 */
function enviarLinksCIS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ws = ss.getSheetByName(_CIS_ABA);

  if (!ws) {
    // Criar aba com headers se não existir
    ws = ss.insertSheet(_CIS_ABA);
    ws.getRange(1, 1, 1, 6).setValues([[
      'ID', 'Nome', 'Telefone (+DDD)', 'Email', 'Link', 'Status'
    ]]).setFontWeight('bold').setBackground('#0F2B54').setFontColor('#FFFFFF');
    ws.setFrozenRows(1);
    ws.setColumnWidth(5, 300);
    ws.setColumnWidth(6, 150);
    SpreadsheetApp.getUi().alert(
      'Aba "' + _CIS_ABA + '" criada!\n\n'
      + 'Preencha as colunas ID, Nome, Telefone, Email e Link.\n'
      + 'Depois rode novamente.'
    );
    return;
  }

  var lastRow = ws.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('Aba "' + _CIS_ABA + '" está vazia.\nPreencha os dados e rode novamente.');
    return;
  }

  var dados = ws.getRange(2, 1, lastRow - 1, 6).getValues();
  var total = dados.length;
  var enviados = 0, erros = 0, pulados = 0;

  SpreadsheetApp.getActive().toast('Iniciando envio de ' + total + ' links CIS...', '📨 CIS WhatsApp', 5);

  for (var i = 0; i < total; i++) {
    var nome   = String(dados[i][_CIS.NOME - 1] || '').trim();
    var fone   = String(dados[i][_CIS.FONE - 1] || '').replace(/\D/g, '');
    var link   = String(dados[i][_CIS.LINK - 1] || '').trim();
    var status = String(dados[i][_CIS.STATUS - 1] || '').trim().toLowerCase();
    var rowNum = i + 2;

    // Pular já enviados
    if (status === 'enviado') { pulados++; continue; }

    // Validações
    if (!fone || fone.length < 10) {
      ws.getRange(rowNum, _CIS.STATUS).setValue('Erro: telefone inválido');
      erros++;
      continue;
    }
    if (!link) {
      ws.getRange(rowNum, _CIS.STATUS).setValue('Erro: link vazio');
      erros++;
      continue;
    }

    // Montar mensagem
    var primeiroNome = nome.split(' ')[0] || 'Olá';
    var msg = '*' + primeiroNome + ', tudo bem?* 😊\n\n'
      + 'Seu questionário *CIS* (Perfil Comportamental) está disponível!\n\n'
      + '🔗 Acesse aqui: ' + link + '\n\n'
      + '⏱️ Leva apenas alguns minutos.\n'
      + 'Responda com calma e sinceridade — não há respostas certas ou erradas.\n\n'
      + 'Qualquer dúvida, estamos à disposição! 🙌\n\n'
      + '_Equipe Vertho_';

    // Enviar via Z-API
    try {
      ws.getRange(rowNum, _CIS.STATUS).setValue('Enviando...');
      SpreadsheetApp.flush();

      _enviarTextoWpp(fone, msg);
      ws.getRange(rowNum, _CIS.STATUS).setValue('Enviado');
      enviados++;

      SpreadsheetApp.getActive().toast(
        primeiroNome + ' (' + (i + 1) + '/' + total + ')',
        '📨 CIS: ' + enviados + ' enviados', 3
      );
    } catch(e) {
      Logger.log('Erro CIS WhatsApp [' + nome + ']: ' + e.message);
      ws.getRange(rowNum, _CIS.STATUS).setValue('Erro: ' + e.message.substring(0, 100));
      erros++;
    }

    // Rate limit — 1s entre envios
    Utilities.sleep(1000);
  }

  // Resultado
  var msg = '✅ ' + enviados + ' enviados | ⏭️ ' + pulados + ' já enviados | ❌ ' + erros + ' erros';
  Logger.log('=== CIS WhatsApp: ' + msg + ' ===');
  SpreadsheetApp.getActive().toast(msg, '📨 CIS — Concluído', 15);
}
