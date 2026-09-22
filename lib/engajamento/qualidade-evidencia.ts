/**
 * Qualidade da evidência semanal, na leitura de RH e gestor.
 *
 * Decisão do dono (22/09/2026): RH e gestor veem SÓ a qualidade da reflexão
 * (alta, média ou baixa), nunca o texto nem a conversa. A reflexão é franca
 * justamente porque não vai para o chefe; o conteúdo continua restrito à
 * Vertho (`/admin/vertho/evidencias`). Por isso o roll-up lê apenas a chave
 * `reflexao->>qualidade_reflexao`: o texto nem sai do banco nesta leitura.
 *
 * Quem classifica é a extração da conversa de reflexão
 * (`app/api/temporada/reflection/route.ts`), só em semana de CONTEÚDO. Semana
 * de aplicação (missão) não tem classificação: ela entra em "entregou", mas
 * não em nenhum nível, e a tela diz isso em vez de inventar um.
 *
 * Arquivo puro (sem `server-only`): as telas importam os rótulos daqui.
 */

export type QualidadeEvidencia = 'alta' | 'media' | 'baixa';

export const NIVEIS_QUALIDADE: readonly QualidadeEvidencia[] = ['alta', 'media', 'baixa'];

export const ROTULO_QUALIDADE: Record<QualidadeEvidencia, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export function normalizarQualidade(valor: unknown): QualidadeEvidencia | null {
  return typeof valor === 'string' && (NIVEIS_QUALIDADE as readonly string[]).includes(valor)
    ? (valor as QualidadeEvidencia)
    : null;
}

export type ContagemQualidade = Record<QualidadeEvidencia, number>;

export const contagemVazia = (): ContagemQualidade => ({ alta: 0, media: 0, baixa: 0 });

/**
 * Por pessoa: a qualidade da reflexão MAIS RECENTE (maior semana) no recorte.
 * Com filtro de semana é a daquela semana; sem filtro, a última entregue.
 */
export function qualidadeMaisRecente(
  linhas: Array<{ semana: unknown; qualidade: QualidadeEvidencia | null }>,
): QualidadeEvidencia | null {
  let melhor: { semana: number; qualidade: QualidadeEvidencia } | null = null;
  for (const linha of linhas) {
    if (!linha.qualidade) continue;
    const semana = Number(linha.semana) || 0;
    if (!melhor || semana > melhor.semana) melhor = { semana, qualidade: linha.qualidade };
  }
  return melhor?.qualidade ?? null;
}
