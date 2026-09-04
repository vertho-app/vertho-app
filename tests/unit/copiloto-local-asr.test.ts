import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_ASR_EXTENSION_ID,
  probeLocalAsr,
  readLocalAsrFailure,
  requestLocalAsrStart,
  waitForLocalAsr,
  type LocalAsrChromeRuntime,
} from '@/app/copiloto/local-asr';

type FakeSocket = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
};

function fakeSocket(): { socket: FakeSocket; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  return {
    close,
    socket: { onopen: null, onerror: null, onclose: null, close: () => close() },
  };
}

describe('acionamento local do Whisper', () => {
  it('considera o ASR disponível quando o WebSocket abre', async () => {
    const { socket, close } = fakeSocket();
    const result = probeLocalAsr('ws://127.0.0.1:8765', 50, () => {
      queueMicrotask(() => socket.onopen?.());
      return socket;
    });

    await expect(result).resolves.toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('considera o ASR indisponível quando a conexão falha', async () => {
    const { socket } = fakeSocket();
    const result = probeLocalAsr('ws://127.0.0.1:8765', 50, () => {
      queueMicrotask(() => socket.onerror?.());
      return socket;
    });

    await expect(result).resolves.toBe(false);
  });

  it('aguarda o processo local ficar pronto sem iniciar captura prematuramente', async () => {
    let attempts = 0;
    const ready = await waitForLocalAsr('ws://127.0.0.1:8765', {
      timeoutMs: 100,
      intervalMs: 1,
      probe: async () => ++attempts === 3,
    });

    expect(ready).toBe(true);
    expect(attempts).toBe(3);
  });

  it('solicita o modelo ao host nativo por meio do complemento do Chrome', async () => {
    const sendMessage = vi.fn((_id, _message, callback) => callback({ ok: true }));
    const runtime: LocalAsrChromeRuntime = { sendMessage };

    await expect(requestLocalAsrStart({ runtime })).resolves.toBe('started');
    expect(sendMessage).toHaveBeenCalledWith(
      LOCAL_ASR_EXTENSION_ID,
      { type: 'start' },
      expect.any(Function),
    );
  });

  it('informa que o complemento não está instalado', async () => {
    await expect(requestLocalAsrStart({ runtime: null })).resolves.toBe('extension_missing');
  });

  it('trata o erro de conexão do Chrome como complemento ausente', async () => {
    const runtime: LocalAsrChromeRuntime = {
      lastError: { message: 'Could not establish connection.' },
      sendMessage: (_id, _message, callback) => callback(),
    };

    await expect(requestLocalAsrStart({ runtime })).resolves.toBe('extension_missing');
  });

  it('informa falha quando o host nativo rejeita o acionamento', async () => {
    const runtime: LocalAsrChromeRuntime = {
      sendMessage: (_id, _message, callback) => callback({ ok: false }),
    };

    await expect(requestLocalAsrStart({ runtime })).resolves.toBe('failed');
  });
});

describe('readLocalAsrFailure', () => {
  const runtimeCom = (response: unknown, lastError?: { message?: string }) => ({
    lastError,
    sendMessage: (_id: string, _msg: { type: 'start' | 'status' }, callback: (r?: any) => void) => {
      callback(response);
    },
  });

  it('devolve a linha que o servidor registrou antes de morrer', async () => {
    const motivo = await readLocalAsrFailure({
      runtime: runtimeCom({ ok: true, failure: "[Errno 13] Permission denied: 'virtual_file.log'" }),
    });
    expect(motivo).toContain('Permission denied');
  });

  it('sem falha registrada, não inventa causa', async () => {
    expect(await readLocalAsrFailure({ runtime: runtimeCom({ ok: true, failure: null }) })).toBeNull();
    expect(await readLocalAsrFailure({ runtime: runtimeCom({ ok: true, failure: '   ' }) })).toBeNull();
  });

  it('sem extensão, o diagnóstico simplesmente não acontece', async () => {
    expect(await readLocalAsrFailure({ runtime: null })).toBeNull();
  });

  it('erro do próprio canal não vira mensagem para o vendedor', async () => {
    const motivo = await readLocalAsrFailure({
      runtime: runtimeCom({ failure: 'algo' }, { message: 'host não encontrado' }),
    });
    expect(motivo).toBeNull();
  });

  it('host mudo não trava a tela: responde nulo no prazo', async () => {
    const mudo = {
      sendMessage: () => { /* nunca chama o callback */ },
    };
    expect(await readLocalAsrFailure({ runtime: mudo as any, timeoutMs: 30 })).toBeNull();
  });
});
