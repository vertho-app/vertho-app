export type LocalAsrState = 'checking' | 'offline' | 'starting' | 'ready' | 'error';

export const LOCAL_ASR_LAUNCH_URI = 'vertho-whisper://start';

type ProbeSocket = {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
};

type SocketFactory = (url: string) => ProbeSocket;

export async function probeLocalAsr(
  url: string,
  timeoutMs: number = 1_200,
  createSocket: SocketFactory = (target) => new WebSocket(target) as unknown as ProbeSocket,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let socket: ProbeSocket | null = null;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket?.close(); } catch { /* conexão já encerrada */ }
      resolve(available);
    };

    try {
      socket = createSocket(url);
      socket.onopen = () => finish(true);
      socket.onerror = () => finish(false);
      socket.onclose = () => finish(false);
      timer = setTimeout(() => finish(false), timeoutMs);
    } catch {
      finish(false);
    }
  });
}

type WaitForLocalAsrOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  probe?: (url: string) => Promise<boolean>;
};

function wait(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve(true);
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function waitForLocalAsr(
  url: string,
  options: WaitForLocalAsrOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const probe = options.probe ?? ((target: string) => probeLocalAsr(target));
  const deadline = Date.now() + timeoutMs;

  while (!options.signal?.aborted && Date.now() < deadline) {
    if (await probe(url)) return true;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    if (!await wait(Math.min(intervalMs, remaining), options.signal)) return false;
  }
  return false;
}
