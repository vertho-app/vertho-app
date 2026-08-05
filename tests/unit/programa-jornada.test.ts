import { describe, it, expect } from 'vitest';
import {
  PROGRAMA_JORNADA,
  PROGRAMA_ONBOARDING,
  PROGRAMA_PILOTO,
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
  getProgramaConfigByModo,
  resolverModoColab,
  type ProgramaConfig,
} from '@/lib/season-engine/programa-config';

/**
 * A JORNADA (05/08/2026) — 7 semanas: 6 de conteúdo + 1 de avaliação, uma
 * competência, 2 conteúdos por semana e UM desafio semanal cobrindo os dois.
 * O DUO passa a ser duas jornadas em sequência, cada uma com fechamento
 * próprio.
 *
 * O que estes testes protegem: `buildSeason` monta o plano iterando
 * `1..config.semanas` e perguntando à config o que cada semana é. Um buraco
 * (semana que não é conteúdo, nem missão, nem avaliação) vira uma semana vazia
 * na trilha de alguém; uma sobreposição faz a semana ser classificada pela
 * ordem dos `if`, não pela intenção. Nada disso aparece no typecheck.
 */

/**
 * Semanas que de propósito não recebem conteúdo selecionado, missão nem
 * avaliação. Hoje só o onboarding tem uma: a semana 1 é calibragem (DISC +
 * diagnóstico + institucional). Ela ainda entra no plano como `conteudo` — o
 * `buildSeason` classifica por exclusão —, só não recebe descritor.
 *
 * A lista é explícita para que um buraco NOVO (slot esquecido num modo novo)
 * falhe aqui, em vez de virar uma semana muda na trilha de alguém.
 */
const SEM_CONTEUDO_DECLARADO: Record<string, number[]> = {
  jornada: [],
  regular: [],
  regular_duo: [],
  onboarding: [1], // calibragem
  piloto: [],
};

const MODOS: Array<[string, ProgramaConfig]> = [
  ['jornada', PROGRAMA_JORNADA],
  ['regular', PROGRAMA_REGULAR],
  ['regular_duo', PROGRAMA_REGULAR_DUO],
  ['onboarding', PROGRAMA_ONBOARDING],
  ['piloto', PROGRAMA_PILOTO],
];

describe('forma do plano — vale para todo modo', () => {
  it.each(MODOS)('%s: nenhuma semana é classificada duas vezes', (nome, cfg) => {
    const todas = [...cfg.slotsConteudo, ...cfg.semanasMissao, ...cfg.semanasAvaliacao];
    expect(new Set(todas).size, `${nome}: semana em duas listas`).toBe(todas.length);
    for (const s of todas) {
      expect(s, `${nome}: semana ${s} fora de 1..${cfg.semanas}`).toBeGreaterThanOrEqual(1);
      expect(s, `${nome}: semana ${s} fora de 1..${cfg.semanas}`).toBeLessThanOrEqual(cfg.semanas);
    }
  });

  it.each(MODOS)('%s: as semanas sem conteúdo são as declaradas', (nome, cfg) => {
    const cobertas = new Set([...cfg.slotsConteudo, ...cfg.semanasMissao, ...cfg.semanasAvaliacao]);
    const buracos = Array.from({ length: cfg.semanas }, (_, i) => i + 1).filter((s) => !cobertas.has(s));
    expect(buracos, `${nome}: semana sem papel definido`).toEqual(SEM_CONTEUDO_DECLARADO[nome] ?? []);
  });

  it.each(MODOS)('%s: o fechamento acontece numa semana de avaliação', (nome, cfg) => {
    expect(cfg.semanasAvaliacao, `${nome}: Cenário B fora da avaliação`).toContain(cfg.semanaCenarioB);
    expect(cfg.semanaAcumulada, `${nome}: acumulada depois do fechamento`).toBeLessThanOrEqual(cfg.semanaCenarioB);
  });
});

describe('modo jornada', () => {
  it('são 7 semanas: 6 de conteúdo e a última de avaliação', () => {
    expect(PROGRAMA_JORNADA.semanas).toBe(7);
    expect(PROGRAMA_JORNADA.slotsConteudo).toEqual([1, 2, 3, 4, 5, 6]);
    expect(PROGRAMA_JORNADA.semanasAvaliacao).toEqual([7]);
    expect(PROGRAMA_JORNADA.semanaCenarioB).toBe(7);
  });

  it('não tem semana dedicada de missão — a tarefa é o desafio da semana', () => {
    // As semanas 4/8/12 do formato antigo não têm conteúdo novo. Na jornada,
    // toda semana entrega as 2 pílulas E uma tarefa; ressuscitar `semanasMissao`
    // aqui traria de volta a semana sem conteúdo, em silêncio.
    expect(PROGRAMA_JORNADA.semanasMissao).toEqual([]);
    expect(PROGRAMA_JORNADA.blocosCobertos).toEqual({});
  });

  it('é UMA competência com 2 conteúdos por semana', () => {
    expect(PROGRAMA_JORNADA.numCompetencias).toBe(1);
    expect(PROGRAMA_JORNADA.conteudosPorSemana).toBe(2);
  });

  it('roda como programa regular, não como piloto', () => {
    // `modo: 'piloto'` liga trava de piso na nota, spec_version 'piloto-v1' e
    // evidência por cobertos — comportamento de degustação. A jornada é
    // programa cheio.
    expect(PROGRAMA_JORNADA.modo).toBe('regular');
    expect(PROGRAMA_JORNADA.nivelMetaAlvo).toBe(3);
  });

  it('o rótulo "jornada" resolve na geração e no runtime', () => {
    expect(getProgramaConfigByModo('jornada')).toBe(PROGRAMA_JORNADA);
    expect(resolverModoColab({ programa_modo: 'jornada' }, null)).toBe('jornada');
    // Empresa no default segue no DUO de 14 semanas — a jornada é opt-in, e é
    // isso que mantém as trilhas em andamento fora do caminho.
    expect(getProgramaConfigByModo(null)).toBe(PROGRAMA_REGULAR_DUO);
  });
});
