/**
 * Régua de CONVERGÊNCIA — como um descritor é classificado ao comparar a nota
 * de partida (T0, mapeamento) com a nota do fechamento (T1, cenário da semana
 * 14) e a leitura qualitativa da semana 13.
 *
 * POR QUE ISTO VIVE NUM ARQUIVO PRÓPRIO (01/09/2026): a função nasceu privada
 * dentro de `evolution-report-core.ts`, e no instante em que um segundo produtor
 * apareceu (o fixture de evolução da ACME Demo) ela teria sido reimplementada
 * ali. É exatamente o caminho que a régua nota→nível já percorreu uma vez, com
 * NOVE cópias e 42 de 288 descritores de Macaé exibindo um nível que contradizia
 * o texto da própria avaliação. Régua duplicada não diverge só no código: ela
 * vaza para o documento que a pessoa recebe.
 *
 * Quem consome: `evolution-report-core` (produção) e `lib/demo/acme-evolucao-fixture`
 * (demonstração). Guard de paridade: `tests/unit/convergencia-regua.test.ts`.
 */

/**
 * Os três vereditos possíveis, no VALOR gravado em `trilhas.evolution_report`.
 *
 * 🔑 NÃO EXISTE VEREDITO DE REGRESSÃO, e a ausência é uma decisão do dono do
 * produto (01/09/2026): **ninguém desaprende uma competência**. Uma nota que
 * cai entre o diagnóstico e o fechamento não descreve alguém que piorou;
 * descreve a variação do instrumento, que avalia conversas diferentes com
 * prompts diferentes. Carimbar isso como "regressão" seria transformar ruído
 * de medição numa afirmação sobre a pessoa, dentro de um relatório que o
 * gestor dela lê.
 *
 * Queda entra em `ESTAVEL`: o patamar de partida se manteve, e é só isso que a
 * medição sustenta. Foi removido antes de existir um único registro
 * (`Medido:` 0 linhas com `regressao` em todos os tenants), então não há
 * histórico a migrar.
 */
export const CONVERGENCIA = {
  CONFIRMADA: 'evolucao_confirmada',
  PARCIAL: 'evolucao_parcial',
  ESTAVEL: 'estagnacao',
} as const;

export type Convergencia = typeof CONVERGENCIA[keyof typeof CONVERGENCIA];

/**
 * Cortes da régua. Ficam nomeados para que mudar a calibragem seja uma decisão
 * visível num diff, e não um número solto no meio de um `if`.
 */
export const CORTE_CONFIRMADA = 0.5;
export const CORTE_PARCIAL = 0.2;

/**
 * Rótulos de APRESENTAÇÃO. O valor gravado no banco (`estagnacao`) é
 * vocabulário de engenharia; o que a pessoa lê é outra coisa. Trocar o valor
 * exigiria migrar histórico e reescrever a régua do gestor por nada — trocar o
 * rótulo custa uma linha e é reversível.
 *
 * ⚠️ Toda tela que mostrar convergência usa esta função. Escrever "Estagnação"
 * à mão numa tela recria a divergência que este arquivo existe para impedir.
 */
const ROTULOS: Record<Convergencia, string> = {
  [CONVERGENCIA.CONFIRMADA]: 'Evolução confirmada',
  [CONVERGENCIA.PARCIAL]: 'Evolução parcial',
  [CONVERGENCIA.ESTAVEL]: 'Estável',
};

export function rotuloConvergencia(valor: string | null | undefined): string {
  if (!valor) return 'Sem medição';
  return ROTULOS[valor as Convergencia] || 'Sem medição';
}

/**
 * Classifica um descritor comparando nota_pre (início da temporada), nota_pos
 * (cenário do fechamento) e nivel_percebido (qualitativa da semana anterior).
 *
 * A leitura qualitativa NÃO é um empate técnico: ela promove para confirmada
 * (junto com o delta) e sustenta sozinha uma evolução parcial. Um número que
 * sobe sem nenhuma evidência de percepção é justamente o caso que a régua
 * quer manter em "parcial", não em "confirmada".
 */
export function classificarConvergencia({
  nota_pre,
  nota_pos,
  nivel_percebido,
}: {
  nota_pre: number;
  nota_pos: number;
  nivel_percebido: number | null;
}): Convergencia {
  const delta = nota_pos - nota_pre;
  const qualitativaPositiva = nivel_percebido != null && nivel_percebido > nota_pre;

  if (delta >= CORTE_CONFIRMADA && qualitativaPositiva) return CONVERGENCIA.CONFIRMADA;
  if (delta >= CORTE_PARCIAL || qualitativaPositiva) return CONVERGENCIA.PARCIAL;
  // Queda cai aqui de propósito: sem veredito de regressão, o piso da régua é
  // "manteve o patamar". Ver o cabeçalho de CONVERGENCIA.
  return CONVERGENCIA.ESTAVEL;
}
