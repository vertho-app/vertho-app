/**
 * Região de execução das tasks do trigger.dev — PONTO ÚNICO de troca.
 *
 * SEGUE a "Default region" do projeto (dashboard trigger.dev → Regions). Quando
 * TRIGGER_REGION está vazio, retornamos {} → o dispatch usa o Default do projeto.
 * Assim, em incidente de região, basta trocar o "Default region" no dashboard
 * (sem redeploy nem env). Requisito: o deployment precisa EXISTIR na região alvo
 * (deploy aterrissa na Default) — confirmar com um dispatch de teste.
 *
 *   TRIGGER_REGION=<x> → força uma região específica (override pontual).
 *   vazio              → Default do projeto (recomendado).
 */
export function regionOpts(): { region?: string } {
  const r = process.env.TRIGGER_REGION?.trim();
  return r ? { region: r } : {};
}
