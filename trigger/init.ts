/**
 * Inicialização global das tasks do Trigger.dev, carregada pelo worker antes de qualquer task (o
 * CLI 4.x trata `init.ts` na raiz de `dirs` como ponto de entrada de init; não é uma task).
 *
 * Hoje: a falha final de qualquer task vai ao Sentry, sem payload. Regras em `lib/sentry-trigger.ts`.
 * ⚠️ Mudou aqui? O `git push` não leva: o deploy do Trigger é manual (skill trigger-dev).
 */
import { tasks } from '@trigger.dev/sdk';
import { iniciarSentryNoTrigger, reportarFalhaDaTask } from '@/lib/sentry-trigger';

iniciarSentryNoTrigger();

tasks.onFailure(({ error, ctx }) => reportarFalhaDaTask({ error, ctx }));
