/**
 * CONARH 52 — classificação A/B/C do lead de feira (F4 do sprint).
 *
 * Vive em `lib/` e não dentro de `actions/lead-comercial.ts` por dois motivos:
 * num arquivo `'use server'` todo export vira endpoint HTTP (não dá para
 * exportar a função só para testá-la), e a régua precisa ser exercitada por
 * teste — ela decide quem acorda o fechador em < 30 s e quem entra na cadência.
 *
 * A régua é a da Proposta Resumida (29/07/2026), com os predicados:
 *
 *   A — DENTRO do perfil · dor clara · horizonte quente · aceitou o próximo
 *       passo   → reunião marcada na hora, alerta imediato
 *   B — aderência e dor clara, sem urgência   → Mapa da Evolução + convite
 *   C — curioso, fornecedor, fora do perfil   → material se pedir, FORA da
 *       cadência ativa (é o que mantém alta a taxa de resposta de A e B)
 *
 * Decisões que valem registro:
 *
 * 1. `dor clara` = competência citada com as palavras dele. Estava fora do
 *    predicado de A, então um lead sem dor nenhuma disparava o alerta de A.
 * 2. `decide_ou_recomenda` SAIU do predicado de A (04/08/2026). O formulário
 *    do tablet foi enxugado para um único toggle de qualificação — "aceitou um
 *    próximo passo" — e manter o predicado tornaria A inalcançável: com o campo
 *    nunca preenchido, todo lead conduzido cairia em B e o alerta de < 30 s
 *    nunca dispararia. O campo continua no contrato (a action e o histórico o
 *    aceitam); só não é mais exigido para A.
 * 3. `fora_do_perfil` continua vencendo tudo, pelo mesmo motivo — mas hoje só
 *    chega por outro canal que não o formulário da feira, que deixou de expor
 *    a marcação. Sem ela, C só acontece pela regra automática (sem dor e sem
 *    decisor declarado).
 *
 * A classe é calculada NO SERVIDOR sempre. O formulário roda no navegador: se
 * a classe viesse do cliente, o funil inteiro seria escolhido por quem preenche.
 */

export type HorizonteConarh = 'rodando' | 'ate_3m' | '3_a_6m' | 'sem_data';

export type ClasseConarh = 'A' | 'B' | 'C';

export type EntradaClassificacao = {
  decide_ou_recomenda?: boolean;
  aceitou_proximo_passo?: boolean;
  /** Marcado pelo expositor: curioso, fornecedor, concorrente ou fora do ICP. */
  fora_do_perfil?: boolean;
  /** Competência crítica já normalizada (null = não citou). */
  competencia: string | null;
  /** Horizonte já validado contra a allowlist (null = não informado). */
  horizonte: HorizonteConarh | string | null;
};

/** Horizonte que caracteriza urgência — o "quente" da definição de A. */
export function horizonteQuente(h: EntradaClassificacao['horizonte']): boolean {
  return h === 'rodando' || h === 'ate_3m';
}

export function classificarLeadConarh(e: EntradaClassificacao): ClasseConarh {
  // Fora do perfil vence tudo: fornecedor que decide e tem dor continua sendo C.
  if (e.fora_do_perfil) return 'C';

  const decide = !!e.decide_ou_recomenda;
  const dorClara = !!(e.competencia && e.competencia.trim());

  if (dorClara && horizonteQuente(e.horizonte) && !!e.aceitou_proximo_passo) {
    return 'A';
  }

  // Auto-captura pelo celular do visitante (modo opt-in): sem qualificação
  // nenhuma não há como chamar de "boa aderência e dor clara" — fica fora da
  // cadência ativa e recebe só o T+0 com o recorte.
  if (!decide && !dorClara) return 'C';

  return 'B';
}
