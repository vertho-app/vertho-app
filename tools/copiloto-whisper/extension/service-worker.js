const NATIVE_HOST = 'ai.vertho.whisper';
const ALLOWED_ORIGINS = new Set([
  'https://app.vertho.ai',
]);

function originIsAllowed(value) {
  try {
    const url = new URL(value);
    return ALLOWED_ORIGINS.has(url.origin)
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}

function senderIsAllowed(sender) {
  return originIsAllowed(sender.origin) || originIsAllowed(sender.url);
}

const COMANDOS = new Set(['start', 'status']);

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!senderIsAllowed(sender) || !COMANDOS.has(message?.type)) {
    sendResponse({ ok: false, error: 'pedido não autorizado' });
    return false;
  }

  chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: message.type }, (response) => {
    const error = chrome.runtime.lastError?.message;
    if (error) {
      sendResponse({ ok: false, error });
      return;
    }
    // `status` devolve o motivo da última falha do servidor: ele é `null` quando
    // não houve falha, e essa diferença é o que a tela usa para saber se o
    // problema foi carregar o modelo ou alcançar o WebSocket.
    if (message.type === 'status') {
      sendResponse({ ok: true, failure: response?.failure ?? null });
      return;
    }
    sendResponse(response?.ok ? { ok: true } : {
      ok: false,
      error: response?.error || 'o host local não respondeu',
    });
  });
  return true;
});
