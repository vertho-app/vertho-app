import type {
  CompetenciaRelatorio,
  RegraRelatorio,
} from '@/components/simuladores/relatorio-competencias';
import type { ResumoEncontro } from '@/lib/simulador-lideranca/avaliacao';

/** O mínimo da matriz que a devolutiva precisa (a da jornada e o recorte do painel servem). */
export type LinhaParaRelatorio = {
  cod_desc: string;
  nome_curto: string;
  n1_gap: string;
  n2_desenvolvimento: string;
  n3_meta: string;
  n4_referencia: string;
};

type Fonte = 'fala' | 'planejamento' | 'reflexao';

/**
 * A devolutiva como chega à tela: a da pessoa (com todos os trechos) ou a da
 * equipe (`lib/simulador-lideranca/visao-equipe.ts`), em que a evidência da
 * preparação e da reflexão vem SEM `trecho` (decisão do dono, 27/09/2026).
 */
export type AvaliacaoParaRelatorio = {
  descartados?: string[];
  descritores: Array<{
    codigo: string;
    nivel?: number | null;
    justificativa?: string | null;
    evidencias: Array<{ fonte: Fonte; turno: number; trecho?: string }>;
  }>;
};

/**
 * Converte a devolutiva de um encontro no formato comum aos três simuladores.
 * Evidência sem `trecho` não vira citação: o rótulo da fonte (ex.: "Evidência
 * da preparação") entra no lugar da justificativa, e o nível continua visível.
 */
export function competenciasParaRelatorio(
  resumo: ResumoEncontro,
  avaliacao: AvaliacaoParaRelatorio,
  matriz: LinhaParaRelatorio[],
  origem: (fonte: Fonte, turno: number) => string,
): { competencias: CompetenciaRelatorio[]; regra: RegraRelatorio } {
  const descartados = new Set(avaliacao.descartados || []);
  const competencias = resumo.competencias.map((c) => ({
    codigo: c.codigo,
    nome: c.nome,
    foco: c.foco,
    nota: c.nota,
    nivel: c.nivel,
    observados: c.observados,
    total: c.total,
    suficiente: c.suficiente,
    descritores: c.descritores.map((codigo) => {
      const linha = matriz.find((l) => l.cod_desc === codigo);
      const a = avaliacao.descritores.find((d) => d.codigo === codigo);
      const citadas = (a?.evidencias || []).filter((e) => !!e.trecho);
      const reservadas = [...new Set((a?.evidencias || []).filter((e) => !e.trecho).map((e) => origem(e.fonte, e.turno)))];
      return {
        codigo,
        nome: linha?.nome_curto || codigo,
        nivel: a?.nivel ?? null,
        justificativa: reservadas.length ? reservadas.join(' · ') : (a?.justificativa ?? null),
        evidencias: citadas.map((e) => ({
          texto: e.trecho!,
          origem: origem(e.fonte, e.turno),
        })),
        regua: linha
          ? ([linha.n1_gap, linha.n2_desenvolvimento, linha.n3_meta, linha.n4_referencia] as [
              string,
              string,
              string,
              string,
            ])
          : null,
        descartado: descartados.has(codigo),
      };
    }),
  }));
  const regra =
    resumo.regra.versao === 'legado'
      ? null
      : { minDescritores: resumo.regra.minDescritores, minCompetencias: resumo.regra.minCompetencias };
  return { competencias, regra };
}
