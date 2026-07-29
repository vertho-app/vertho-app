/**
 * CONARH 52 — classificação A/B/C do lead de feira (F4 do sprint).
 *
 * Vive em `lib/` e não dentro de `actions/lead-comercial.ts` por dois motivos:
 * num arquivo `'use server'` todo export vira endpoint HTTP (não dá para
 * exportar a função só para testá-la), e a régua precisa ser exercitada por
 * teste — ela decide quem acorda o fechador em < 30 s e quem entra na cadência.
 *
 * A régua é a da Proposta Resumida (29/07/2026), com os cinco predicados:
 *
 *   A — decide ou recomenda · DENTRO do perfil · dor clara · horizonte quente
 *       · aceitou o próximo passo   → reunião marcada na hora, alerta imediato
 *   B — aderência e dor clara, sem urgência   → Mapa da Evolução + convite
 *   C — curioso, fornecedor, fora do perfil   → material se pedir, FORA da
 *       cadência ativa (é o que mantém alta a taxa de resposta de A e B)
 *
 * Duas decisões que valem registro, porque a versão anterior errava nas duas:
 *
 * 1. `fora_do_perfil` é marcação EXPLÍCITA do expositor. Sem ela, C era
 *    inalcançável pelo tablet — a competência crítica é campo obrigatório no
 *    formulário conduzido, e a regra antiga só dava C quando ela vinha vazia.
 *    Resultado: todo fornecedor e todo curioso virava B e entrava no funil.
 * 2. `dor clara` = competência citada com as palavras dele. Estava fora do
 *    predicado de A, então um lead sem dor nenhuma disparava o alerta de A.
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

  if (decide && dorClara && horizonteQuente(e.horizonte) && !!e.aceitou_proximo_passo) {
    return 'A';
  }

  // Auto-captura pelo celular do visitante (modo opt-in): sem qualificação
  // nenhuma não há como chamar de "boa aderência e dor clara" — fica fora da
  // cadência ativa e recebe só o T+0 com o recorte.
  if (!decide && !dorClara) return 'C';

  return 'B';
}
