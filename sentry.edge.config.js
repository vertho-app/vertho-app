import * as Sentry from '@sentry/nextjs';
import { scrubPII, scrubLog } from './lib/sentry-scrub-pii';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% como o servidor (19/10/2026): o motivo e a conta estão em sentry.server.config.js.
  tracesSampleRate: 1.0,

  enabled: process.env.NODE_ENV === 'production',

  // Descarta negações de autorização esperadas (não são bugs) + scrub de PII
  beforeSend: (event, hint) => {
    const msg = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (/^(FORBIDDEN|UNAUTHORIZED):|^Acesso restrito/.test(msg)) return null;
    return scrubPII(event, hint);
  },
  beforeSendTransaction: scrubPII,
  sendDefaultPii: false,

  // Logs como o servidor (19/10/2026): só aviso e erro, com a mesma limpeza. Ver sentry.server.config.js.
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  beforeSendLog: scrubLog,
});
