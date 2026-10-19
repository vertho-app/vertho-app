/**
 * Falha FINAL de task do Trigger.dev vai ao Sentry (19/10/2026).
 *
 * Até aqui uma falha de render de vídeo, de lote de IA ou do Fluxo completo só aparecia no painel
 * do Trigger, que ninguém olha sem motivo. Quem chama isto é `trigger/init.ts`, que o worker do
 * Trigger carrega sozinho antes de qualquer task (o CLI 4.x trata `init.ts` na raiz do diretório
 * de tasks como ponto de entrada; o log do run mostra `Loaded init file from ...`).
 *
 * 🔑 Três regras, cada uma com motivo:
 *  1. Só a falha FINAL (`tasks.onFailure`: "threw and won't be retried anymore"). Tentativa que
 *     falha e depois dá certo não é defeito, e viraria ruído.
 *  2. NUNCA o payload. Ele leva nome, respostas e PDI das pessoas. Vão só o id da task, do run, a
 *     tentativa e a máquina; o resto se lê no painel do Trigger pelo id do run. A mensagem do erro
 *     passa pelo `scrubPII`, que tira e-mail, telefone, CPF e credencial de URL (nome em texto
 *     livre ele não detecta, R-112: por isso a política fala em "dados técnicos de erro").
 *  3. Sem as integrações padrão e sem montar OpenTelemetry: o Trigger tem a telemetria dele, e um
 *     segundo provedor global brigaria com ela. Aqui é só captura de exceção.
 *
 * Sem `SENTRY_DSN` no ambiente do Trigger, tudo vira no-op, avisado UMA vez no log: ausência de
 * captura não pode parecer ausência de falha.
 */
import * as Sentry from '@sentry/node';
import { scrubPII } from './sentry-scrub-pii';

const FLUSH_MS = 2000;

let ligado = false;

/** Liga o Sentry no worker. Devolve se ligou. */
export function iniciarSentryNoTrigger(dsn: string | undefined = process.env.SENTRY_DSN): boolean {
  if (ligado) return true;
  if (!dsn) {
    console.warn('[sentry-trigger] SENTRY_DSN ausente no ambiente do Trigger: falhas de task NÃO vão ao Sentry');
    return false;
  }
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    environment: 'production',
    beforeSend: (event, hint) => scrubPII(event, hint),
    initialScope: { tags: { origem: 'trigger.dev' } },
  });
  ligado = true;
  return true;
}

/** O pedaço do contexto do run que sai para o Sentry. O payload não entra aqui, de propósito. */
export interface ContextoDaFalha {
  task: { id: string };
  run: { id: string };
  attempt?: { number?: number };
  environment?: { type?: string };
  machine?: { name?: string };
}

/** Registra a falha final da task. Só ambiente de PRODUÇÃO: o `trigger dev` local não polui o painel. */
export async function reportarFalhaDaTask({ error, ctx }: { error: unknown; ctx: ContextoDaFalha }): Promise<void> {
  if (!ligado) return;
  const ambiente = ctx.environment?.type;
  if (ambiente && ambiente !== 'PRODUCTION') return;
  try {
    Sentry.captureException(error, {
      tags: { origem: 'trigger.dev', task: ctx.task.id },
      contexts: {
        trigger: {
          run: ctx.run.id,
          tentativa: ctx.attempt?.number ?? null,
          maquina: ctx.machine?.name ?? null,
        },
      },
    });
    await Sentry.flush(FLUSH_MS);
  } catch (e: any) {
    console.warn('[sentry-trigger] não consegui registrar a falha:', e?.message);
  }
}

/** Só para os testes: volta ao estado inicial. */
export function __reiniciarParaTeste(): void {
  ligado = false;
}
