/**
 * Painel da equipe do Simulador de liderança (revisão de 27/09/2026, L-13):
 * rótulos distintos para "ainda não avaliada" e "evidência insuficiente", na
 * tela e no CSV, e o CSV com a última atividade no horário de Brasília (saía
 * em ISO UTC).
 */
import { describe, expect, it } from 'vitest';
import { dataHoraBrasilia, diaBrasilia, linhasCsvEquipe, situacaoCompetencia } from '@/components/simulador-lideranca/csv-equipe';
import type { CompetenciaNaJornada, SinteseJornada } from '@/lib/simulador-lideranca/avaliacao';
import type { LinhaPainel } from '@/lib/simulador-lideranca/equipe';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';

const competencia = (nome: string, extra: Partial<CompetenciaNaJornada>): CompetenciaNaJornada => ({
  nome,
  avaliada: 0,
  comNivel: 0,
  primeiroNivel: null,
  nivelAlcancado: null,
  notaAlcancada: null,
  subiu: false,
  ...extra,
});
const [ANALISE, DESENVOLVIMENTO] = EPISODIOS.map((e) => e.nome);
const sintese: SinteseJornada = {
  competencias: EPISODIOS.map((e) =>
    e.nome === ANALISE
      ? competencia(e.nome, { avaliada: 2, comNivel: 1, nivelAlcancado: 3, notaAlcancada: 3 })
      : e.nome === DESENVOLVIMENTO
        ? competencia(e.nome, { avaliada: 1 })
        : competencia(e.nome, {}),
  ),
  media: { nota: null, nivel: null, competencias: 1, suficiente: false } as any,
  encontrosConcluidos: 2,
  concluida: false,
  sugestaoRepetir: null,
};
const pessoas: LinhaPainel[] = [
  {
    colaboradorId: 'p1',
    nome: 'Pessoa em treino',
    cargo: 'Analista',
    variante: 'futuro',
    encontrosConcluidos: 2,
    emAndamento: null,
    ultimaAtividade: '2026-09-18T02:30:00Z',
    sintese,
  },
  {
    colaboradorId: 'p2',
    nome: 'Pessoa sem início',
    cargo: null,
    variante: null,
    encontrosConcluidos: 0,
    emAndamento: null,
    ultimaAtividade: null,
    sintese: null,
  },
];
const rotulos = {
  cabecalho: { pessoa: 'Pessoa', cargo: 'Cargo', trilha: 'Trilha', encontros: 'Encontros', media: 'Nível médio', ultimaAtividade: 'Última atividade (horário de Brasília)' },
  trilha: (v: LinhaPainel['variante']) => (v === 'futuro' ? 'Futuro líder' : v === 'lider' ? 'Líder' : ''),
  nivel: (n: number) => n,
  semNivel: 'evidência insuficiente',
  naoAvaliada: 'ainda não avaliada',
  semMedia: 'sem média',
};

describe('painel da equipe: situação por competência e CSV', () => {
  it('🔴 "ainda não avaliada" e "evidência insuficiente" têm rótulos distintos', () => {
    const r = { nivel: (n: number) => `Nível ${n}`, semNivel: 'evidência insuficiente', naoAvaliada: 'ainda não avaliada' };
    expect(situacaoCompetencia(sintese.competencias[0], r)).toBe('Nível 3');
    expect(situacaoCompetencia(sintese.competencias[1], r)).toBe('evidência insuficiente');
    expect(situacaoCompetencia(sintese.competencias[2], r)).toBe('ainda não avaliada');
    expect(situacaoCompetencia(undefined, r)).toBe('ainda não avaliada');
  });

  it('🔴 o CSV diz a situação em vez de deixar vazio, e a data sai no horário de Brasília', () => {
    const [cabecalho, p1, p2] = linhasCsvEquipe(pessoas, rotulos);
    expect(cabecalho.at(-1)).toBe('Última atividade (horário de Brasília)');
    const colunas = EPISODIOS.map((e) => cabecalho.indexOf(e.nome));
    expect(colunas.map((i) => p1[i])).toEqual([3, 'evidência insuficiente', 'ainda não avaliada', 'ainda não avaliada', 'ainda não avaliada']);
    expect(colunas.map((i) => p2[i])).toEqual(Array(5).fill('ainda não avaliada'));
    // 02:30 UTC de 18/09 é 23:30 de 17/09 em Brasília.
    expect(p1.at(-1)).toBe('2026-09-17 23:30');
    expect(p1.at(-2)).toBe('sem média');
    expect(p2.at(-1)).toBe('');
    // Nenhum traço (o travessão servia de "sem dado" e não dizia qual).
    expect(JSON.stringify([p1, p2])).not.toContain('—');
  });

  it('data e dia em Brasília, inclusive na virada do dia', () => {
    expect(dataHoraBrasilia('2026-09-18T12:00:00Z')).toBe('2026-09-18 09:00');
    expect(dataHoraBrasilia(null)).toBe('');
    expect(dataHoraBrasilia('não é data')).toBe('');
    expect(diaBrasilia(new Date('2026-09-28T01:00:00Z'))).toBe('2026-09-27');
  });
});
