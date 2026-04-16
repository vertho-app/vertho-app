import * as Sentry from '@sentry/nextjs';
import { scrubPII } from './lib/sentry-scrub-pii.js';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  enabled: process.env.NODE_ENV === 'production',

  // LGPD — filtra emails/telefones/CPF/headers sensíveis antes de enviar
  beforeSend: scrubPII,
  beforeSendTransaction: scrubPII,
  sendDefaultPii: false,
});
