/**
 * EIXO X da matriz — o ESTILO: aderência do perfil comportamental da pessoa ao
 * gabarito do cargo-alvo, lida do motor de adequação (`aggregateAdequacao`).
 *
 * Puro: recebe a `PessoaAdequacao` já calculada.
 *
 * O que este eixo NÃO faz, e é decisão de método (medido 10/09/2026 em 311
 * colaboradores): os quatro blocos do fit são o mesmo DISC sob nomes diferentes
 * (`lid = DISC/2` em 294 de 311; `comp_comando × D = 0,992`), e perfil não
 * separa cargos vizinhos (índice de separação 0,47 em Ibipeba; 0,50 é o acaso).
 * Por isso o estilo NÃO entra na conta da posição — ele só diz onde a pessoa vai
 * gastar mais energia no papel. `bloqueadoNoAlvo` é leitura, nunca veredito.
 */
import type { PessoaAdequacao } from '@/lib/adequacao-cargo/aggregate';
import type { Status } from '@/lib/scoring/engine';

export type Estilo = 'aderente' | 'distante';

export const ESTILO_LABEL: Record<Estilo, string> = {
  aderente: 'Estilo aderente ao perfil-alvo',
  distante: 'Estilo distante do perfil-alvo',
};

export interface Faixas { recomendadoMin: number; ressalvasMin: number }

export interface EstiloPessoa {
  colaboradorId: string | null;
  nome: string;
  /** Aderência (Beta) ao gabarito do cargo-alvo, em %. */
  aderenciaPct: number;
  estilo: Estilo;
  status: Status;
  statusLabel: string;
  /** Reprovou um requisito eliminatório do gabarito. Aviso no parecer, não decisão. */
  bloqueadoNoAlvo: boolean;
  motivosBloqueio: string[];
  /** Os traços mais distantes do alvo — onde o papel vai custar mais. */
  lacunas: { traco: string; bloco: string; fitPct: number }[];
  borderline: boolean;
}

export const LACUNAS_MAX = 3;

/**
 * Aderente = passou nos gates E aderência ≥ piso "com ressalvas" da régua do
 * cargo-alvo (a mesma que gera "abaixo do corte" no Ranking). Sem `faixas`
 * (snapshot pré-enriquecimento) cai no status do motor.
 */
export function lerEstilo(p: PessoaAdequacao, faixas: Faixas | null | undefined): EstiloPessoa {
  const pct = Number(p?.beta?.pct) || 0;
  const bloqueado = !!p?.knockoutFailed;
  const aderente = !bloqueado && (
    faixas
      ? pct >= faixas.ressalvasMin
      : (p.status === 'recomendado' || p.status === 'recomendado_com_ressalvas')
  );
  const lacunas = [...(p?.gaps || [])]
    .sort((a, b) => a.fitPct - b.fitPct)
    .slice(0, LACUNAS_MAX)
    .map((g) => ({ traco: g.traco, bloco: g.bloco, fitPct: g.fitPct }));
  return {
    colaboradorId: p?.id ?? null,
    nome: p?.nome || '',
    aderenciaPct: pct,
    estilo: aderente ? 'aderente' : 'distante',
    status: p.status,
    statusLabel: p.statusLabel,
    bloqueadoNoAlvo: bloqueado,
    motivosBloqueio: [...(p?.knockoutMotivos || [])],
    lacunas,
    borderline: !!p?.borderline,
  };
}
