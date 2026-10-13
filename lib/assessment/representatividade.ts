/**
 * Representatividade: a nota de 1 a 10 que a pessoa dá, depois de cada cenário do
 * mapeamento, para "a representatividade desta situação no seu cotidiano"
 * (`respostas.representatividade`, obrigatória desde a mig 044).
 *
 * Plano de cenários de 11/10/2026, Fase 1. A nota era gravada e NADA a lia. `Medido:
 * 09/10/2026`: média 4,7 na Amazon Bowling (74% das notas em 5 ou menos), 4,8 em Macaé,
 * 6,5 na 4Life e 6,9 em Ibipeba, o cliente que disse "parece a nossa realidade". A queixa
 * da Amazon ("situações fictícias") chegou numa reunião, três dias depois de as notas
 * baixas já estarem no banco.
 *
 * Duas cautelas que a leitura precisa carregar:
 *  - PESSOAS, não respostas: na Amazon 10 dos 11 cargos têm uma pessoa só, e "6 respostas"
 *    quase sempre é uma pessoa respondendo os seus 6 cenários.
 *  - efeito de ORDEM: o supervisor de Eletrônica deu 9 ao primeiro cenário e 2 ou 3 aos cinco
 *    seguintes. A nota mistura a opinião sobre o cenário com o cansaço de responder vários.
 *
 * Contas internas (`@vertho.ai`) ficam de fora: são a equipe testando, não o cliente.
 */
import { isInternalEmail } from '@/lib/internal-emails';

export interface LinhaRepresentatividade {
  cenario_id?: string | null;
  colaborador_id?: string | null;
  cargo?: string | null;
  email_colaborador?: string | null;
  representatividade?: number | string | null;
}

export interface ResumoRepresentatividade {
  /** Média com 1 casa decimal; `null` sem nenhuma nota válida. */
  media: number | null;
  respostas: number;
  /** Pessoas distintas (`colaborador_id`). */
  pessoas: number;
  /** Notas de 1 a 5. */
  ate5: number;
}

/**
 * Linha de alerta da regra R22 e do selo da tela. Valor INICIAL, do medido em 09/10/2026
 * (Ibipeba, que elogiou o realismo, 6,9; Amazon e Macaé, 4,7 e 4,8). Rever com os dados
 * das próximas gerações: não é régua por analogia, é a melhor separação observada até aqui.
 */
export const LIMIAR_REPRESENTATIVIDADE = 6;
/** Mínimo de pessoas distintas para a média valer como sinal (abaixo disso é uma opinião). */
export const MIN_PESSOAS_REPRESENTATIVIDADE = 3;

/** A nota válida da linha (1 a 10), ou `null`. A coluna chega como número ou texto. */
export function notaDaLinha(linha: LinhaRepresentatividade): number | null {
  const n = Number(linha?.representatividade);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

function resumir(linhas: LinhaRepresentatividade[]): ResumoRepresentatividade {
  const notas: number[] = [];
  const pessoas = new Set<string>();
  for (const l of linhas) {
    const n = notaDaLinha(l);
    if (n == null) continue;
    notas.push(n);
    if (l.colaborador_id) pessoas.add(String(l.colaborador_id));
  }
  const media = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
  return { media, respostas: notas.length, pessoas: pessoas.size, ate5: notas.filter((n) => n <= 5).length };
}

/** Por cenário, por cargo e da empresa, sem as contas internas. */
export function agregarRepresentatividade(linhas: LinhaRepresentatividade[]): {
  porCenario: Record<string, ResumoRepresentatividade>;
  porCargo: Record<string, ResumoRepresentatividade>;
  empresa: ResumoRepresentatividade;
} {
  const validas = (linhas || []).filter((l) => !isInternalEmail(l?.email_colaborador));
  const agrupar = (chave: (l: LinhaRepresentatividade) => string | null | undefined) => {
    const grupos = new Map<string, LinhaRepresentatividade[]>();
    for (const l of validas) {
      const k = chave(l);
      if (!k) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(l);
    }
    return Object.fromEntries([...grupos].map(([k, ls]) => [k, resumir(ls)]));
  };
  return {
    porCenario: agrupar((l) => l.cenario_id),
    porCargo: agrupar((l) => l.cargo),
    empresa: resumir(validas),
  };
}

/** A média vale como sinal de alerta? Precisa de pessoas suficientes e ficar abaixo da linha. */
export function emAlertaDeRepresentatividade(
  r: ResumoRepresentatividade | null | undefined,
  limiar: number = LIMIAR_REPRESENTATIVIDADE,
  minPessoas: number = MIN_PESSOAS_REPRESENTATIVIDADE,
): boolean {
  return !!r && r.media != null && r.pessoas >= minPessoas && r.media < limiar;
}
