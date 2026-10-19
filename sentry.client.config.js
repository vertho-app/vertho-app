import * as Sentry from '@sentry/nextjs';
import { scrubPII } from './lib/sentry-scrub-pii';
import { podeGravarReplay, opcoesDoReplay } from './lib/sentry-replay';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Captura 100% dos erros, amostra 10% das transações (performance)
  tracesSampleRate: 0.1,

  // Replay (19/10/2026): nenhuma sessão gravada por padrão; só a que tem ERRO, com a tela
  // mascarada. As regras de privacidade estão em lib/sentry-replay.ts.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Não enviar em dev
  enabled: process.env.NODE_ENV === 'production',

  // LGPD — filtra emails/telefones/CPF antes de enviar
  beforeSend: scrubPII,
  beforeSendTransaction: scrubPII,
  sendDefaultPii: false,

  // Ignora erros de rede do usuário (não são bugs nossos)
  ignoreErrors: [
    'Failed to fetch',
    'Load failed',
    'NetworkError',
    'AbortError',
    'ChunkLoadError',
    // Chrome Android reporta falha de rede com esta string (não casa com as acima)
    'network error',
    // Navigator LockManager do supabase auth: disputa de lock entre abas — benigno
    /Lock "lock:sb-.+-auth-token"/,
    // Bots HeadlessChrome e tradução automática do Chrome alteram o DOM sob o
    // React — ruído conhecido, sem ação possível no app
    "Cannot read properties of null (reading 'parentNode')",
  ],
});

// O `replay_event` (a lista das páginas da sessão) não passa pelo `beforeSend`: passa pelos
// processadores de evento. Sem isto, uma URL com credencial iria crua.
Sentry.addEventProcessor((event, hint) => (event.type === 'replay_event' ? scrubPII(event, hint) : event));

// O Replay entra DEPOIS, com a página ociosa, por import dinâmico: fica fora do carregamento
// inicial. E nem liga em tela de acesso ou com credencial na URL (lib/sentry-replay.ts).
if (typeof window !== 'undefined' && podeGravarReplay(window.location)) {
  const ligarReplay = () => {
    import('@sentry/nextjs')
      .then(({ replayIntegration }) => Sentry.addIntegration(replayIntegration(opcoesDoReplay())))
      .catch(() => { /* sem Replay, os erros continuam chegando */ });
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(ligarReplay, { timeout: 5000 });
  else setTimeout(ligarReplay, 3000);
}
