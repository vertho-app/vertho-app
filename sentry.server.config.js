import * as Sentry from '@sentry/nextjs';
import { scrubPII } from './lib/sentry-scrub-pii';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  enabled: process.env.NODE_ENV === 'production',

  // LGPD — filtra emails/telefones/CPF/headers sensíveis antes de enviar
  // Também descarta negações de autorização esperadas (requireAdminAction e cia
  // lançam Error('FORBIDDEN: ...')/'UNAUTHORIZED: ...' de propósito — não são bugs).
  beforeSend: (event, hint) => {
    const msg = event.exception?.values?.[0]?.value ?? event.message ?? '';
    if (/^(FORBIDDEN|UNAUTHORIZED):|^Acesso restrito/.test(msg)) return null;
    return scrubPII(event, hint);
  },
  beforeSendTransaction: scrubPII,
  sendDefaultPii: false,
});
