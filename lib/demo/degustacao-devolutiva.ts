/**
 * Quando a devolutiva da degustação deixa de ser "espera" e passa a ser falha
 * (R-103, 04/10/2026). Puro, sem dependência de servidor.
 *
 * A análise da resposta do lead roda em `after()` e leva 107,5 s de mediana e
 * 153,6 s no p90 (60 dias de `ia_usage_log`). Se ela falha, a página dele ficava
 * em "suas respostas estão em análise" para sempre. Passada a janela abaixo, a
 * página admite que está demorando e manda avisar quem convidou.
 */

/** Mais de 4 vezes o p90: a essa altura não é espera, é falha. */
export const DEVOLUTIVA_ATRASADA_MIN = 10;

/** Há resposta sem análise pronta e mais velha que a janela? */
export function devolutivaAtrasada(
  respostas: Array<{ nivel_ia4?: number | null; nota_ia4?: number | null; timestamp_resposta?: string | null }>,
  agora: Date = new Date(),
): boolean {
  const corte = agora.getTime() - DEVOLUTIVA_ATRASADA_MIN * 60_000;
  return (respostas || []).some((r) => {
    if (r.nivel_ia4 != null || r.nota_ia4 != null) return false;
    const quando = r.timestamp_resposta ? Date.parse(r.timestamp_resposta) : NaN;
    return Number.isFinite(quando) && quando < corte;
  });
}
