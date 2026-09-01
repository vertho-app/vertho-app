const NATIVE_HOST = 'ai.vertho.whisper';
const ALLOWED_ORIGINS = new Set([
  'https://app.vertho.ai',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function senderIsAllowed(sender) {
  try {
    return ALLOWED_ORIGINS.has(new URL(sender.url).origin);
  } catch {
    return false;
  }
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
