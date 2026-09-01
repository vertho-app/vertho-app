export type LocalAsrState = 'checking' | 'offline' | 'starting' | 'ready' | 'error';

export const LOCAL_ASR_EXTENSION_ID = 'eigabofjjdigicbphdgdolhelcaiebfo';

export type LocalAsrStartResult = 'started' | 'extension_missing' | 'failed';

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

type NativeStartResponse = {
  ok?: boolean;
};

export type LocalAsrChromeRuntime = {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: { type: 'start' },
    callback: (response?: NativeStartResponse) => void,
  ) => void;
};

type RequestLocalAsrStartOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  runtime?: LocalAsrChromeRuntime | null;
};

function chromeRuntime(): LocalAsrChromeRuntime | null {
  const chrome = (globalThis as typeof globalThis & {
    chrome?: { runtime?: LocalAsrChromeRuntime };
  }).chrome;
  return chrome?.runtime?.sendMessage ? chrome.runtime : null;
}

export function requestLocalAsrStart(
  options: RequestLocalAsrStartOptions = {},
): Promise<LocalAsrStartResult> {
  const runtime = options.runtime === undefined ? chromeRuntime() : options.runtime;
  if (!runtime) return Promise.resolve('extension_missing');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: LocalAsrStartResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish('failed');
    const timer = setTimeout(() => finish('failed'), options.timeoutMs ?? 7_000);
    options.signal?.addEventListener('abort', abort, { once: true });

    if (options.signal?.aborted) {
      finish('failed');
      return;
    }

    try {
      runtime.sendMessage(LOCAL_ASR_EXTENSION_ID, { type: 'start' }, (response) => {
        // Ler lastError dentro do callback evita o aviso não tratado do Chrome.
        if (runtime.lastError) {
          finish('extension_missing');
          return;
        }
        finish(response?.ok ? 'started' : 'failed');
      });
    } catch {
      finish('extension_missing');
    }
  });
}
