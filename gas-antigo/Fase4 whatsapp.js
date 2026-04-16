// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4 — WHATSAPP (Z-API) — Vertho Mentor IA
// ═══════════════════════════════════════════════════════════════════════════════
// ScriptProperties necessárias:
//   ZAPI_INSTANCE_ID   → ID da instância Z-API
//   ZAPI_TOKEN         → Token da instância Z-API
//   ZAPI_CLIENT_TOKEN  → Client-Token da CONTA Z-API (app.z-api.io → Security)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retorna os headers padrão Z-API (inclui Client-Token obrigatório)
 */
function _zapiHeaders() {
  const clientToken = PropertiesService.getScriptProperties().getProperty('ZAPI_CLIENT_TOKEN') || '';
  return {
    'Content-Type': 'application/json',
    'Client-Token': clientToken
  };
}

/**
 * Retorna a URL base da instância Z-API
 */
function _zapiBaseUrl() {
  const p = PropertiesService.getScriptProperties();
  const instanceId = p.getProperty('ZAPI_INSTANCE_ID') || '';
  const token      = p.getProperty('ZAPI_TOKEN') || '';
  return `https://api.z-api.io/instances/${instanceId}/token/${token}`;
}

/**
 * Limpa e formata o telefone para o padrão Z-API (DDI 55 + DDD + número)
 */
function _formatarTelefone(telefone) {
  let fone = String(telefone).replace(/\D/g, '');
  if (!fone.startsWith('55')) fone = '55' + fone;
  return fone;
}

// ───────────────────────────────────────────────────────────────────────────────
// ENVIO DE TEXTO
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Envia mensagem de texto simples via Z-API
 * @param {string} telefone - Número com DDD (ex: 11999998888)
 * @param {string} mensagem - Texto a enviar
 * @returns {boolean} true se HTTP 200/201
 */
function _enviarTextoWpp(telefone, mensagem) {
  try {
    const url = _zapiBaseUrl() + '/send-text';
    const payload = {
      phone:   _formatarTelefone(telefone),
      message: mensagem
    };
    const response = UrlFetchApp.fetch(url, {
      method:             'post',
      headers:            _zapiHeaders(),
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    _addLog(`📱 WPP Texto → ${payload.phone} | HTTP ${status}`);
    return status === 200 || status === 201;
  } catch (e) {
    _addLog(`❌ WPP Texto erro: ${e.message}`);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// ENVIO DE DOCUMENTO (PDF em Base64)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Envia um PDF via Z-API (base64)
 * @param {string} telefone    - Número com DDD
 * @param {Blob}   blobPdf     - Blob do PDF
 * @param {string} nomeArquivo - Nome do arquivo (ex: "PDI_Rodrigo.pdf")
 * @returns {boolean}
 */
function _enviarDocumentoWpp(telefone, blobPdf, nomeArquivo) {
  try {
    const url = _zapiBaseUrl() + '/send-document-64';
    const base64 = Utilities.base64Encode(blobPdf.getBytes());
    const payload = {
      phone:     _formatarTelefone(telefone),
      document:  `data:application/pdf;base64,${base64}`,
      fileName:  nomeArquivo,
      extension: 'pdf'
    };
    const response = UrlFetchApp.fetch(url, {
      method:             'post',
      headers:            _zapiHeaders(),
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body   = response.getContentText();
    _addLog(`📱 WPP PDF → ${payload.phone} | HTTP ${status} | body: ${body.substring(0, 300)}`);
    Logger.log('Z-API PDF resp: HTTP ' + status + ' body: ' + body.substring(0, 500));
    return status === 200 || status === 201;
  } catch (e) {
    _addLog(`❌ WPP PDF erro: ${e.message}`);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// ENVIO DE IMAGEM (URL pública)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Envia imagem por URL via Z-API
 * @param {string} telefone
 * @param {string} urlImagem - URL pública da imagem
 * @param {string} legenda   - Texto abaixo da imagem (opcional)
 * @returns {boolean}
 */
function _enviarImagemWpp(telefone, urlImagem, legenda) {
  try {
    const url = _zapiBaseUrl() + '/send-image';
    const payload = {
      phone:   _formatarTelefone(telefone),
      image:   urlImagem,
      caption: legenda || ''
    };
    const response = UrlFetchApp.fetch(url, {
      method:             'post',
      headers:            _zapiHeaders(),
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    _addLog(`📱 WPP Imagem → ${payload.phone} | HTTP ${status}`);
    return status === 200 || status === 201;
  } catch (e) {
    _addLog(`❌ WPP Imagem erro: ${e.message}`);
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// VERIFICAÇÃO DE STATUS DA INSTÂNCIA
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se a instância Z-API está conectada
 * @returns {boolean}
 */
function _verificarConexaoZapi() {
  try {
    const url = _zapiBaseUrl() + '/status';
    const response = UrlFetchApp.fetch(url, {
      method:             'get',
      headers:            _zapiHeaders(),
      muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200) {
      const body = JSON.parse(response.getContentText());
      return body.connected === true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// FUNÇÕES DE TESTE (rodar manualmente no GAS Editor)
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Testa envio de texto — substitua o número antes de rodar
 */
function testarEnvioTexto() {
  const numero   = '5511973882303'; // ← seu número aqui com DDI+DDD
  const mensagem = '✅ Teste Vertho Mentor IA — Z-API funcionando!';
  const ok = _enviarTextoWpp(numero, mensagem);
  SpreadsheetApp.getUi().alert(ok ? '✅ Mensagem enviada!' : '❌ Falha — veja o log');
}

/**
 * Testa conexão da instância e mostra diagnóstico completo
 */
function testarConexaoZapi() {
  const p = PropertiesService.getScriptProperties();
  const instanceId  = p.getProperty('ZAPI_INSTANCE_ID')  || '(vazio)';
  const token       = p.getProperty('ZAPI_TOKEN')        || '(vazio)';
  const clientToken = p.getProperty('ZAPI_CLIENT_TOKEN') || '(vazio)';
  
  const conectado = _verificarConexaoZapi();
  
  let msg = `ZAPI_INSTANCE_ID: ${instanceId !== '(vazio)' ? instanceId.slice(0,8)+'...' : '❌ não configurado'}\n`;
  msg += `ZAPI_TOKEN: ${token !== '(vazio)' ? token.slice(0,8)+'...' : '❌ não configurado'}\n`;
  msg += `ZAPI_CLIENT_TOKEN: ${clientToken !== '(vazio)' ? clientToken.slice(0,8)+'...' : '❌ NÃO CONFIGURADO'}\n\n`;
  msg += `Status instância: ${conectado ? '✅ Conectado' : '❌ Desconectado ou erro'}`;
  
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Diagnóstico com retorno bruto da API — útil para depurar erros
 */
function diagnosticarZapi() {
  const p = PropertiesService.getScriptProperties();
  const instanceId  = p.getProperty('ZAPI_INSTANCE_ID')  || '';
  const token       = p.getProperty('ZAPI_TOKEN')        || '';
  const clientToken = p.getProperty('ZAPI_CLIENT_TOKEN') || '';
  
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
  
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': clientToken
      },
      payload: JSON.stringify({
        phone:   '5511999999999',
        message: 'teste diagnóstico vertho'
      }),
      muteHttpExceptions: true
    });
    
    SpreadsheetApp.getUi().alert(
      `HTTP: ${response.getResponseCode()}\n\n` +
      `Client-Token: ${clientToken ? '✅ ' + clientToken.slice(0,6)+'...' : '❌ NÃO CONFIGURADO'}\n\n` +
      `Resposta da API:\n${response.getContentText().slice(0, 500)}`
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Erro de rede: ' + e.message);
  }
}