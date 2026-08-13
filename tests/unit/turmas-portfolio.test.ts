import { describe, it, expect } from 'vitest';
import { proximaAcaoDaTurma, semanaDaTrilha } from '@/lib/turmas/portfolio';

describe('proximaAcaoDaTurma', () => {
  it('🔴 prioriza quem está PRONTO e parado, não quem falta mobilizar', () => {
    // O caso de Macaé em 13/08: 127 diretores, 38 avaliados, 0 trilhas. O painel
    // de hoje mostra a pendência dos professores e faz os 38 prontos sumirem.
    expect(proximaAcaoDaTurma({ membros: 127, comResposta: 38, comIa4: 38, comTrilha: 0 }))
      .toBe('gerar trilha para 38 elegível(is)');
  });

  it('avaliação pendente vem antes de mobilização', () => {
    expect(proximaAcaoDaTurma({ membros: 156, comResposta: 10, comIa4: 0, comTrilha: 0 }))
      .toBe('avaliar 10 resposta(s) na IA4');
  });

  it('turma que ninguém respondeu pede mobilização COM denominador', () => {
    expect(proximaAcaoDaTurma({ membros: 156, comResposta: 0, comIa4: 0, comTrilha: 0 }))
      .toBe('mobilizar: 0 de 156 responderam o diagnóstico');
  });

  it('turma andando pede o resto da mobilização', () => {
    expect(proximaAcaoDaTurma({ membros: 100, comResposta: 60, comIa4: 60, comTrilha: 60 }))
      .toBe('seguir mobilização: faltam 40 de 100');
  });

  it('turma completa não inventa ação', () => {
    expect(proximaAcaoDaTurma({ membros: 36, comResposta: 36, comIa4: 36, comTrilha: 36 })).toBeNull();
  });

  it('turma vazia é pendência, não silêncio', () => {
    expect(proximaAcaoDaTurma({ membros: 0, comResposta: 0, comIa4: 0, comTrilha: 0 }))
      .toBe('turma vazia — atribua pessoas');
  });

  it('não pede trilha para quem já tem (evita loop de ação fantasma)', () => {
    expect(proximaAcaoDaTurma({ membros: 36, comResposta: 36, comIa4: 36, comTrilha: 40 }))
      .toBeNull();
  });
});

describe('semanaDaTrilha', () => {
  const hoje = new Date('2026-08-13T12:00:00Z');

  it('Ibipeba: início 13/07 → semana 5 em 13/08', () => {
    expect(semanaDaTrilha('2026-07-13', hoje)).toBe(5);
  });

  it('o primeiro dia é semana 1, não 0', () => {
    expect(semanaDaTrilha('2026-08-13', hoje)).toBe(1);
    expect(semanaDaTrilha('2026-08-07', hoje)).toBe(1);   // dia 6
    expect(semanaDaTrilha('2026-08-06', hoje)).toBe(2);   // dia 7 vira semana 2
  });

  it('safra que ainda não começou não tem semana (não é semana 0 nem 1)', () => {
    // Turma criada com data futura aparece como "planejada", não como
    // "todo mundo na semana 1" — que faria o painel prometer jornada em curso.
    expect(semanaDaTrilha('2026-09-01', hoje)).toBeNull();
  });

  it('sem data, sem semana', () => {
    expect(semanaDaTrilha(null, hoje)).toBeNull();
    expect(semanaDaTrilha(undefined, hoje)).toBeNull();
  });
});
