import type {
  CompetenciaRelatorio,
  RegraRelatorio,
} from '@/components/simuladores/relatorio-competencias';
import type { ResumoEncontro } from '@/lib/simulador-lideranca/avaliacao';
import type { AvaliacaoGravada } from '@/lib/simulador-lideranca/schema';

/** O mínimo da matriz que a devolutiva precisa (a da jornada e o recorte do painel servem). */
export type LinhaParaRelatorio = {
  cod_desc: string;
  nome_curto: string;
  n1_gap: string;
  n2_desenvolvimento: string;
  n3_meta: string;
  n4_referencia: string;
};

/** Converte a devolutiva de um encontro no formato comum aos três simuladores. */
export function competenciasParaRelatorio(
  resumo: ResumoEncontro,
  avaliacao: AvaliacaoGravada,
  matriz: LinhaParaRelatorio[],
  origem: (fonte: 'fala' | 'planejamento' | 'reflexao', turno: number) => string,
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
      return {
        codigo,
        nome: linha?.nome_curto || codigo,
        nivel: a?.nivel ?? null,
        justificativa: a?.justificativa ?? null,
        evidencias: (a?.evidencias || []).map((e) => ({
          texto: e.trecho,
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
