import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type ExternalListener = (
  message: { type?: string },
  sender: { origin?: string; url?: string },
  sendResponse: (response: { ok: boolean; error?: string }) => void,
) => boolean;

function loadServiceWorker() {
  const source = readFileSync(
    'tools/copiloto-whisper/extension/service-worker.js',
    'utf8',
  );
  let listener: ExternalListener | undefined;
  const sendNativeMessage = vi.fn((
    _host: string,
    _message: { type: string },
    callback: (response: { ok: boolean }) => void,
  ) => callback({ ok: true }));
  const addListener = vi.fn((next: ExternalListener) => { listener = next; });

  runInNewContext(source, {
    URL,
    Set,
    chrome: {
      runtime: {
        lastError: undefined,
        onMessageExternal: { addListener },
        sendNativeMessage,
      },
    },
  });

  if (!listener) throw new Error('listener externo não registrado');
  return { listener, sendNativeMessage };
}

describe('extensão do Whisper local', () => {
  it('aceita app.vertho.ai quando o Chrome informa sender.origin', () => {
    const { listener, sendNativeMessage } = loadServiceWorker();
    const sendResponse = vi.fn();

    expect(listener({ type: 'start' }, { origin: 'https://app.vertho.ai' }, sendResponse)).toBe(true);
    expect(sendNativeMessage).toHaveBeenCalledWith(
      'ai.vertho.whisper',
      { type: 'start' },
      expect.any(Function),
    );
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
  });

  it('mantém origens externas fora da ponte nativa', () => {
    const { listener, sendNativeMessage } = loadServiceWorker();
    const sendResponse = vi.fn();

    expect(listener({ type: 'start' }, { origin: 'https://malicioso.example' }, sendResponse)).toBe(false);
    expect(sendNativeMessage).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'pedido não autorizado' });
  });
});
