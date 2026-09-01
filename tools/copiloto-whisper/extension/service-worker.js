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

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!senderIsAllowed(sender) || message?.type !== 'start') {
    sendResponse({ ok: false, error: 'pedido não autorizado' });
    return false;
  }

  chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: 'start' }, (response) => {
    const error = chrome.runtime.lastError?.message;
    if (error) {
      sendResponse({ ok: false, error });
      return;
    }
    sendResponse(response?.ok ? { ok: true } : {
      ok: false,
      error: response?.error || 'o host local não respondeu',
    });
  });
  return true;
});
