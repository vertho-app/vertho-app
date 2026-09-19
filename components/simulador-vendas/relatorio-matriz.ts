import type {
  CompetenciaRelatorio,
  MediaRelatorio,
  RegraRelatorio,
} from '@/components/simuladores/relatorio-competencias';
import { mediaGeral } from '@/lib/simuladores/cobertura';
import { COMPETENCIAS_PACE, type CodigoCompetencia } from '@/lib/simulador-vendas/matriz';
import {
  consolidarMatriz,
  FORA_DA_REUNIAO_INICIAL,
  regraDaVersao,
  usaRegraCobertura,
  type AvaliacaoMatrizGravada,
} from '@/lib/simulador-vendas/matriz-avaliacao';

type Evidencia = AvaliacaoMatrizGravada['descritores'][number]['evidencias'][number];

/**
 * Converte a matriz PACE gravada no formato da devolutiva comum aos três
 * simuladores. As notas saem de `consolidarMatriz` com a regra da VERSÃO do
 * treino: da pace-7 em diante, 4 comportamentos por competência e E5/E6 fora da
 * avaliação (não aparecem nem como "sem oportunidade"); antes disso, o relatório
 * é lido como foi gerado.
 */
export function competenciasDaMatriz(
  matriz: AvaliacaoMatrizGravada,
  versao: string | undefined,
  rotulos: {
    nome: (codigo: CodigoCompetencia) => string;
    origem: (e: Evidencia) => string;
  },
  narrativas: Partial<Record<CodigoCompetencia, string | null | undefined>> = {},
): { competencias: CompetenciaRelatorio[]; media: MediaRelatorio; regra: RegraRelatorio } {
  const consolidadas = consolidarMatriz(matriz, versao);
  const fora = usaRegraCobertura(versao) ? FORA_DA_REUNIAO_INICIAL : [];
  const descartados = new Set(matriz.descartados || []);
  const competencias = COMPETENCIAS_PACE.map((c) => {
    const r = consolidadas.find((x) => x.codigo === c.codigo)!;
    return {
      codigo: c.codigo,
      nome: rotulos.nome(c.codigo),
      resumo: narrativas[c.codigo] || null,
      nota: r.nota,
      nivel: r.nivel,
      observados: r.observados,
      total: r.total,
      suficiente: r.suficiente,
      descritores: c.descritores
        .filter((d) => !fora.includes(d.codigo))
        .map((d) => {
          const a = matriz.descritores.find((x) => x.codigo === d.codigo);
          return {
            codigo: d.codigo,
            nome: d.nome,
            nivel: a?.nivel ?? null,
            justificativa: a?.justificativa ?? null,
            evidencias: (a?.evidencias || []).map((e) => ({ texto: e.citacao, origem: rotulos.origem(e) })),
            regua: [d.niveis.n1, d.niveis.n2, d.niveis.n3, d.niveis.n4] as [string, string, string, string],
            descartado: descartados.has(d.codigo),
          };
        }),
    };
  });
  const regra = regraDaVersao(versao);
  return {
    competencias,
    media: mediaGeral(consolidadas, regra),
    regra: usaRegraCobertura(versao)
      ? { minDescritores: regra.minDescritores, minCompetencias: regra.minCompetencias }
      : null,
  };
}

/** Nome do comportamento (descritor) para as recomendações, no lugar do código. */
export function nomeDoDescritor(codigo: string) {
  for (const c of COMPETENCIAS_PACE)
    for (const d of c.descritores) if (d.codigo === codigo) return d.nome;
  return codigo;
}
