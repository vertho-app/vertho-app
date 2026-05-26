/**
 * Instrumentation hook do Next 16 — ponto oficial de init do Sentry no
 * server/edge (os plugins de webpack estão desabilitados no next.config, então
 * os sentry.*.config.js NÃO eram carregados automaticamente: o backend ficava
 * sem telemetria). register() carrega o config certo por runtime e
 * onRequestError encaminha erros de SSR/route handlers/server actions ao Sentry.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>) {
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
