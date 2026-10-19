import * as Sentry from '@sentry/nextjs';
import { scrubPII, scrubLog } from './lib/sentry-scrub-pii';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% no servidor desde 19/10/2026 (plano Team, teto de US$ 200/mês): todo cron, webhook e
  // chamada de IA com o caminho completo. Medido antes: 1,29M spans de servidor em 30 dias a 10%,
  // então o teto é ~13M/mês (~US$ 17 acima da cota). Pedido vindo do navegador segue a decisão
  // dele (10%, no client), porque a amostragem respeita o trace pai.
  tracesSampleRate: 1.0,

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

  // Logs no Sentry (19/10/2026): só AVISO e ERRO do console do servidor, ligados ao trace da
  // requisição e guardados por semanas (a Vercel guarda pouco e corta na leitura). Medido antes:
  // ~9,3 mil avisos e 390 erros em 7 dias, longe dos 5 GB incluídos. Passam pela mesma limpeza
  // dos erros (`scrubLog`); `info`/`log` não saem.
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  beforeSendLog: scrubLog,
});
