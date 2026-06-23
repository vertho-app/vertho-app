/**
 * Região de execução das tasks do trigger.dev — PONTO ÚNICO de troca.
 *
 * O trigger.dev NÃO tem failover automático entre regiões: a região é uma
 * atribuição fixa por run (define o masterQueue/worker group). Os deploys do
 * projeto vivem em eu-central-1.
 *
 *   default → eu-central-1 (onde há deployment).
 *   TRIGGER_REGION=<x>      → sobrescreve (ex.: migrar de região).
 *
 * Por que hardcodar o default: antes retornávamos {} quando a env estava vazia,
 * caindo na região PADRÃO do projeto = us-east-1, que NÃO tem deployment → o run
 * fica QUEUED sem versão, travado ("Gerando roteiro" eterno). Depender de
 * TRIGGER_REGION no Vercel era frágil (var Sensitive, fácil ficar vazia). O
 * default no código tira a dependência; a env ainda sobrescreve quando setada.
 */
const DEFAULT_TRIGGER_REGION = 'eu-central-1';

export function regionOpts(): { region?: string } {
  const r = process.env.TRIGGER_REGION?.trim();
  return { region: r || DEFAULT_TRIGGER_REGION };
}
