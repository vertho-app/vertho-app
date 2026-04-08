import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Captura 100% dos erros, amostra 10% das transações (performance)
  tracesSampleRate: 0.1,

  // Não enviar em dev
  enabled: process.env.NODE_ENV === 'production',

  // Ignora erros de rede do usuário (não são bugs nossos)
  ignoreErrors: [
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    'AbortError',
    'ChunkLoadError',
  ],
});
