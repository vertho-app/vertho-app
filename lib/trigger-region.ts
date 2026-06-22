/**
 * Região de execução das tasks do trigger.dev — FALLBACK config-driven.
 *
 * O trigger.dev NÃO tem failover automático entre regiões: a região é uma
 * atribuição fixa por run (define o masterQueue/worker group). Este helper é o
 * PONTO ÚNICO de troca: injeta `{ region }` em todos os dispatches a partir de
 * uma env var.
 *
 *   TRIGGER_REGION vazio  → usa a região PADRÃO do projeto (dashboard "Regions").
 *   TRIGGER_REGION=eu-central-1 → reroteia TODOS os dispatches p/ eu-central-1
 *                                 (ex.: durante um outage de us-east-1).
 *
 * Ativar: setar TRIGGER_REGION no Vercel (dispatches do app) E no dashboard do
 * trigger.dev (dispatches task→task, ex.: render-video/render-chunk). Reverter:
 * remover a env.
 */
export function regionOpts(): { region?: string } {
  const r = process.env.TRIGGER_REGION?.trim();
  return r ? { region: r } : {};
}
