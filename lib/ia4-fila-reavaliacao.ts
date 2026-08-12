/**
 * Quem entra num lote de REAVALIAÇÃO — régua pura, para a tela e os scripts
 * usarem a mesma.
 *
 * As duas exclusões são medidas, não preferência (Macaé, 12/08/2026, 55
 * reprovadas reavaliadas com Sonnet 5 + check no Terra):
 *
 * 1. PISO. Separando pela nota que o check já tinha: quem partiu de ≤60 subiu
 *    +21,4 em média (28 subiram, ZERO caíram); quem partiu de 71+ caiu −7,6, com
 *    6 de 8 piorando (79→58, 78→64, 75→60, 74→60, 73→58, 72→60). Reescrever uma
 *    avaliação que já estava quase passando só sacode a nota.
 * 2. JÁ REAVALIADA. Rodar de novo é pagar para revisar texto já revisado — e o
 *    que sobra em `revisar` depois de uma passada é falta de evidência na
 *    RESPOSTA (notas N1 1,00–1,57), que nenhuma reescrita resolve. Medido: numa
 *    segunda passada, 4 pioraram e 3 melhoraram — ruído puro.
 *
 * O que fica de fora é DEVOLVIDO ao chamador para aparecer na tela: filtro
 * silencioso é indistinguível de "reavaliei tudo".
 */

/** Acima desta nota do check, reavaliar tende a piorar. */
export const PISO_REAVALIACAO = 65;

export type RespostaFila = {
  id: string;
  status_ia4?: string | null;
  payload_ia4?: { nota?: number } | null;
  avaliacao_ia?: { _revisao?: { revisado_em?: string } } | null;
};

export type SelecaoReavaliacao<T> = {
  elegiveis: T[];
  puladas: { jaRevisada: number; acimaDoPiso: number; semCheck: number };
};

export function selecionarParaReavaliar<T extends RespostaFila>(
  respostas: T[],
  opts: { piso?: number; incluirJaRevisadas?: boolean; ignorarPiso?: boolean } = {},
): SelecaoReavaliacao<T> {
  const piso = opts.piso ?? PISO_REAVALIACAO;
  const elegiveis: T[] = [];
  const puladas = { jaRevisada: 0, acimaDoPiso: 0, semCheck: 0 };

  for (const r of respostas || []) {
    if (r.status_ia4 !== 'revisar' && r.status_ia4 !== 'aprovado_com_ajustes') continue;

    const nota = r.payload_ia4?.nota;
    if (typeof nota !== 'number') {
      // Sem veredito não há feedback de auditoria para guiar a revisão — o
      // prompt da reavaliação é justamente "corrija o que a 2ª IA apontou".
      puladas.semCheck++;
      continue;
    }
    if (!opts.incluirJaRevisadas && r.avaliacao_ia?._revisao?.revisado_em) {
      puladas.jaRevisada++;
      continue;
    }
    if (!opts.ignorarPiso && nota > piso) {
      puladas.acimaDoPiso++;
      continue;
    }
    elegiveis.push(r);
  }

  // Piores primeiro: é onde a reavaliação tem mais o que recuperar.
  elegiveis.sort((a, b) => (a.payload_ia4?.nota ?? 0) - (b.payload_ia4?.nota ?? 0));
  return { elegiveis, puladas };
}

/** Frase pronta para a tela dizer o que ficou de fora (vazia se nada ficou). */
export function resumoPuladas(p: SelecaoReavaliacao<any>['puladas']): string {
  const partes: string[] = [];
  if (p.jaRevisada) partes.push(`${p.jaRevisada} já reavaliada(s)`);
  if (p.acimaDoPiso) partes.push(`${p.acimaDoPiso} acima de ${PISO_REAVALIACAO} pts`);
  if (p.semCheck) partes.push(`${p.semCheck} sem check`);
  return partes.join(' · ');
}
