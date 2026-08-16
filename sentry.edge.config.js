import * as Sentry from '@sentry/nextjs';
import { scrubPII } from './lib/sentry-scrub-pii';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  enabled: process.env.NODE_ENV === 'production',

  // Descarta negações de autorização esperadas (não são bugs) + scrub de PII
  beforeSend: (event, hint) => {
    const msg = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (/^(FORBIDDEN|UNAUTHORIZED):|^Acesso restrito/.test(msg)) return null;
    return scrubPII(event, hint);
  },
  beforeSendTransaction: scrubPII,
  sendDefaultPii: false,
});
