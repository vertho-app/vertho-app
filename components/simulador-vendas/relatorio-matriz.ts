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
  minimoDescritores,
  regraDaVersao,
  usaRegraCobertura,
  type AvaliacaoMatrizGravada,
} from '@/lib/simulador-vendas/matriz-avaliacao';

type Evidencia = AvaliacaoMatrizGravada['descritores'][number]['evidencias'][number];

/**
 * Converte a matriz PACE gravada no formato da devolutiva comum aos três
 * simuladores. As notas saem de `consolidarMatriz` com a regra da VERSÃO do
 * treino e, na pace-7, a regra GRAVADA no relatório (`regraGravada`): dois
 * terços dos comportamentos avaliáveis (D5, 27/09/2026) ou 4 fixos nos
 * relatórios anteriores, e E5/E6 fora da avaliação (não aparecem nem como "sem
 * oportunidade"); antes da pace-7, o relatório é lido como foi gerado.
 */
export function competenciasDaMatriz(
  matriz: AvaliacaoMatrizGravada,
  versao: string | undefined,
  rotulos: {
    nome: (codigo: CodigoCompetencia) => string;
    origem: (e: Evidencia) => string;
    /**
     * Rótulo da evidência que chegou SEM texto (visão da equipe, R-42: o plano
     * fica com a pessoa, `lib/simulador-vendas/visao-equipe.ts`). Sem ele, vale
     * o `origem`.
     */
    reservada?: (e: Evidencia) => string;
  },
  narrativas: Partial<Record<CodigoCompetencia, string | null | undefined>> = {},
  regraGravada?: string | null,
): { competencias: CompetenciaRelatorio[]; media: MediaRelatorio; regra: RegraRelatorio } {
  const consolidadas = consolidarMatriz(matriz, versao, regraGravada);
  const fora = usaRegraCobertura(versao) ? FORA_DA_REUNIAO_INICIAL : [];
  const descartados = new Set(matriz.descartados || []);
  const regra = regraDaVersao(versao, regraGravada);
  const competencias = COMPETENCIAS_PACE.map((c) => {
    const r = consolidadas.find((x) => x.codigo === c.codigo)!;
    const aplicaveis = c.descritores.filter((d) => !fora.includes(d.codigo)).length;
    return {
      codigo: c.codigo,
      nome: rotulos.nome(c.codigo),
      resumo: narrativas[c.codigo] || null,
      nota: r.nota,
      nivel: r.nivel,
      observados: r.observados,
      total: r.total,
      suficiente: r.suficiente,
      // O mesmo mínimo com que `consolidarMatriz` decidiu `suficiente`: a frase
      // "o nível aparece a partir de N" não pode citar outra régua.
      minDescritores: minimoDescritores(regra, aplicaveis),
      descritores: c.descritores
        .filter((d) => !fora.includes(d.codigo))
        .map((d) => {
          const a = matriz.descritores.find((x) => x.codigo === d.codigo);
          // Evidência sem texto não vira citação (aspas vazias): o rótulo da
          // fonte ocupa o lugar da justificativa, como na liderança.
          const todas = a?.evidencias || [];
          const citadas = todas.filter((e) => !!e.citacao);
          const rotuloReservada = rotulos.reservada || rotulos.origem;
          const reservadas = [...new Set(todas.filter((e) => !e.citacao).map((e) => rotuloReservada(e)))];
          return {
            codigo: d.codigo,
            nome: d.nome,
            nivel: a?.nivel ?? null,
            justificativa: reservadas.length ? reservadas.join(' · ') : (a?.justificativa ?? null),
            evidencias: citadas.map((e) => ({ texto: e.citacao, origem: rotulos.origem(e) })),
            regua: [d.niveis.n1, d.niveis.n2, d.niveis.n3, d.niveis.n4] as [string, string, string, string],
            descartado: descartados.has(d.codigo),
          };
        }),
    };
  });
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
