/**
 * Painel da equipe do Simulador de liderança: rótulos de situação por
 * competência e o CSV exportado. Núcleo puro, testado sem tela.
 *
 * Duas correções de 27/09/2026:
 *   - o mesmo traço servia para "ainda não avaliada" (a competência não
 *     apareceu em nenhum encontro concluído) e "evidência insuficiente"
 *     (apareceu, e não juntou os comportamentos que dão nível); no CSV as duas
 *     ficavam vazias. Agora cada uma tem o seu rótulo, na tela e no CSV;
 *   - a última atividade saía em ISO UTC no CSV. Agora sai no horário de
 *     Brasília, e o cabeçalho diz isso.
 */
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import type { CompetenciaNaJornada } from '@/lib/simulador-lideranca/avaliacao';
import type { LinhaPainel } from '@/lib/simulador-lideranca/equipe';
import { dataHoraBrasilia } from '@/lib/simuladores/csv';

// A data no horário de Brasília é comum aos três simuladores desde 03/10/2026.
export { dataHoraBrasilia, diaBrasilia } from '@/lib/simuladores/csv';

export interface RotulosSituacao {
  /** Na tela, "Nível 3"; no CSV, o número (a coluna segue somável). */
  nivel: (n: number) => string | number;
  /** Avaliada em algum encontro, sem os comportamentos que dão nível. */
  semNivel: string;
  /** Ainda não apareceu em nenhum encontro concluído. */
  naoAvaliada: string;
}

export function situacaoCompetencia(c: CompetenciaNaJornada | undefined, r: RotulosSituacao): string | number {
  if (c?.nivelAlcancado != null) return r.nivel(c.nivelAlcancado);
  return c?.avaliada ? r.semNivel : r.naoAvaliada;
}

export interface RotulosCsv extends RotulosSituacao {
  cabecalho: {
    pessoa: string;
    cargo: string;
    trilha: string;
    encontros: string;
    media: string;
    ultimaAtividade: string;
  };
  trilha: (v: LinhaPainel['variante']) => string;
  semMedia: string;
}

export function linhasCsvEquipe(pessoas: LinhaPainel[], r: RotulosCsv): unknown[][] {
  const nomes = EPISODIOS.map((e) => e.nome);
  return [
    [
      r.cabecalho.pessoa,
      r.cabecalho.cargo,
      r.cabecalho.trilha,
      r.cabecalho.encontros,
      ...nomes,
      r.cabecalho.media,
      r.cabecalho.ultimaAtividade,
    ],
    ...pessoas.map((p) => [
      p.nome,
      p.cargo || '',
      r.trilha(p.variante),
      p.encontrosConcluidos,
      ...nomes.map((n) => situacaoCompetencia(p.sintese?.competencias.find((x) => x.nome === n), r)),
      p.sintese?.media.nivel != null ? r.nivel(p.sintese.media.nivel) : r.semMedia,
      dataHoraBrasilia(p.ultimaAtividade),
    ]),
  ];
}
