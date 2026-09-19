import type {
  CompetenciaRelatorio,
  MediaRelatorio,
  RegraRelatorio,
} from '@/components/simuladores/relatorio-competencias';
import { nivelDaNota } from '@/lib/nivel-regua';
import { REGRA_COBERTURA } from '@/lib/simuladores/cobertura';
import { competenciasAtendimento, MATRIZ_ATENDIMENTO_VERSION } from '@/lib/recepcao/matriz';
import type { Estado } from '@/lib/recepcao/model';

type Relatorio = NonNullable<Estado['relatorio']>;
type Ref = { mensagemId: string; trecho: string };

/** Posição de uma mensagem na conversa, para rotular a citação sem mostrar ids. */
export function posicaoNaConversa(
  historico: Array<{ id: string; role: 'user' | 'assistant' }>,
  id: string,
): { papel: 'user' | 'assistant'; ordem: number } | null {
  const i = historico.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const papel = historico[i].role;
  return { papel, ordem: historico.slice(0, i + 1).filter((m) => m.role === papel).length };
}

/**
 * Converte o relatório com matriz do atendimento no formato comum aos três
 * simuladores (18/09/2026). A régua dos 4 níveis sai da matriz do segmento do
 * caso quando a versão gravada é a vigente; a regra de cobertura só é dita para
 * relatórios avaliados com ela (`regraCobertura`), os anteriores são lidos
 * como foram gerados.
 */
export function competenciasDoAtendimento(
  r: Relatorio,
  dominio: string | undefined,
  rotulo: (ref: Ref) => string | null,
): { competencias: CompetenciaRelatorio[]; media: MediaRelatorio; regra: RegraRelatorio } {
  const matriz =
    r.matrizVersao === MATRIZ_ATENDIMENTO_VERSION
      ? new Map(competenciasAtendimento(dominio).flatMap((c) => c.descritores).map((d) => [d.codigo, d]))
      : new Map();
  const descartados = new Set(r.descartados || []);
  const competencias = (r.competencias || []).map((c) => ({
    codigo: c.codigo,
    nome: c.nome,
    nota: c.nota,
    nivel: c.nivel,
    observados: c.observados,
    total: c.total,
    suficiente: c.suficiente ?? c.nota !== null,
    descritores: c.descritores.map((id) => {
      const d = r.dimensoes.find((x) => x.id === id);
      const base = matriz.get(id);
      const nivel = d && /^n[1-4]$/.test(d.classificacao) ? Number(d.classificacao.slice(1)) : null;
      return {
        codigo: id,
        nome: d?.nome || base?.nome || id,
        nivel,
        justificativa: d?.justificativa ?? null,
        evidencias: (d?.evidencias || []).map((e) => ({ texto: e.trecho, origem: rotulo(e) })),
        oportunidades: (d?.oportunidades || []).map((e) => ({ texto: e.trecho, origem: rotulo(e) })),
        regua: base
          ? ([base.niveis.n1, base.niveis.n2, base.niveis.n3, base.niveis.n4] as [string, string, string, string])
          : null,
        descartado: descartados.has(id),
      };
    }),
  }));
  const comNivel = competencias.filter((c) => c.nivel !== null).length;
  return {
    competencias,
    media: {
      nota: r.nota,
      nivel: r.nota === null ? null : nivelDaNota(r.nota),
      competencias: comNivel,
      suficiente: r.nota !== null,
    },
    regra: r.regraCobertura
      ? { minDescritores: REGRA_COBERTURA.minDescritores, minCompetencias: REGRA_COBERTURA.minCompetencias }
      : null,
  };
}
