import { describe, expect, it, vi } from 'vitest';
import {
  LOCAL_ASR_LAUNCH_URI,
  probeLocalAsr,
  requestLocalAsrStart,
  waitForLocalAsr,
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

  it('abre o protocolo registrado no Windows a partir do clique', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const link = {
      href: '',
      hidden: false,
      setAttribute: vi.fn(),
      click,
      remove,
    };
    const launcherDocument = {
      createElement: vi.fn(() => link),
      body: { appendChild },
    } as unknown as Pick<Document, 'createElement' | 'body'>;

    expect(requestLocalAsrStart(launcherDocument)).toBe(true);
    expect(link.href).toBe(LOCAL_ASR_LAUNCH_URI);
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
