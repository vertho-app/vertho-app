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

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 'AAAA-MM-DD HH:mm' no horário de Brasília; vazio sem data. */
export function dataHoraBrasilia(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(PARTES.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** O dia de hoje em Brasília (nome do arquivo). */
export const diaBrasilia = (agora: Date) => dataHoraBrasilia(agora.toISOString()).slice(0, 10);

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
