/**
 * Semana concluída da persona navegável carrega a conversa que a concluiu.
 *
 * 🔴 17/09/2026: o reset gravava as semanas 1 e 2 da Marina como `concluido`
 * com `reflexao: null`. A lista da jornada, o gate e o card do gestor liam o
 * status e davam a semana por concluída; a tela da semana só se dá por concluída
 * com o transcript gravado e mostrava "0 de 6 respostas". Clicar em "Levantar
 * evidências" abria conversa nova, que regrava a semana como em andamento. O
 * produto real nunca produz semana de conteúdo concluída sem conversa (0 nos
 * clientes, medido no mesmo dia), então a demo também não pode.
 */
import { describe, it, expect } from 'vitest';
import { DEMO_ROSTERS } from '@/lib/demo/rosters';
import { construirPercursoDaPersona } from '@/lib/demo/percurso-persona';
import { turnosIaNecessarios } from '@/lib/season-engine/week-gating';
import fixtureEscolas from '@/lib/demo/escolas-demo-fixture.json';

const comPercurso = Object.entries(DEMO_ROSTERS)
  .filter(([, roster]) => roster.percursoDaPersona)
  .map(([key, roster]) => ({ key, roster, percurso: roster.percursoDaPersona! }));

describe('percurso da persona navegável', () => {
  it('existe ao menos um roster com percurso (o guard não mede o nada)', () => {
    expect(comPercurso.length).toBeGreaterThan(0);
  });

  for (const { key, percurso } of comPercurso) {
    it(`${key}: toda semana concluída tem a conversa completa congelada`, () => {
      const linhas = construirPercursoDaPersona(percurso);
      const concluidas = linhas.filter((l) => l.status === 'concluido');
      expect(concluidas).toHaveLength(percurso.concluidas);
      for (const linha of concluidas) {
        const transcript = linha.reflexao?.transcript_completo;
        expect(Array.isArray(transcript), `semana ${linha.semana} sem transcript`).toBe(true);
        // A MESMA régua que a tela e a rota usam para dar a conversa por encerrada.
        const turnosIa = transcript.filter((m: any) => m.role === 'assistant').length;
        expect(turnosIa, `semana ${linha.semana}`).toBe(turnosIaNecessarios(linha.semana, linha.tipo));
        expect(linha.reflexao.qualidade_reflexao, `semana ${linha.semana} sem extração`).toBeTruthy();
        // O timestamp acompanha a data da conclusão, não a da captura.
        expect(new Set(transcript.map((m: any) => m.timestamp))).toEqual(new Set([linha.concluido_em]));
      }
    });
  }

  it('escolar: a conversa de cada semana é sobre o descritor daquela semana no plano da Marina', () => {
    const percurso = DEMO_ROSTERS.escolar.percursoDaPersona!;
    const persona = DEMO_ROSTERS.escolar.personas.find((p) => p.key === percurso.personaKey)!;
    const plano = (fixtureEscolas as any).personaArtifacts[persona.email].trilha.row.temporada_plano;
    for (const evidencia of percurso.evidencias || []) {
      const semana = plano.find((s: any) => s.semana === evidencia.semana);
      expect(evidencia.descritor, `semana ${evidencia.semana}`).toBe(semana?.descritor);
    }
  });
});
