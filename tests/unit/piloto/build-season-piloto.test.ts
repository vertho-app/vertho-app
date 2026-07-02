import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * buildSeason em modo PILOTO (Supabase + IA mockados):
 *   - 3 entradas: sems 1-2 conteúdo (2 entregas/semana, descritores DISTINTOS,
 *     mesma competência) + slot 3 fechamento com calendario_semana=2 (espelho).
 *   - ZERO chamadas de IA (sem missões; desafio IA off por default).
 * + Regressão DUO no MESMO harness: estrutura de 14 semanas intocada, sem
 *   calendario_semana em lugar nenhum (garantia por construção do espelho).
 */

const MICRO_CONTEUDOS = [
  { id: 'c1', titulo: 'Vídeo D1', formato: 'video', competencia: 'Comp X', descritor: 'D1', ativo: true, url: 'u1' },
  { id: 'c2', titulo: 'Texto D2', formato: 'texto', competencia: 'Comp X', descritor: 'D2', ativo: true, url: 'u2' },
  { id: 'c3', titulo: 'Texto D3', formato: 'texto', competencia: 'Comp X', descritor: 'D3', ativo: true, url: 'u3' },
  // D4 sem conteúdo próprio → reusa pool da competência (nunca slot vazio)
];

function chainable(result: any[]) {
  const q: any = {};
  const self = () => q;
  for (const m of ['select', 'eq', 'lte', 'gte', 'or', 'is', 'in', 'not', 'order', 'limit']) q[m] = vi.fn(self);
  q.maybeSingle = vi.fn(async () => ({ data: null }));
  q.then = (resolve: any) => resolve({ data: result });
  return q;
}

const mockSb = { from: vi.fn((table: string) => chainable(table === 'micro_conteudos' ? MICRO_CONTEUDOS : [])) };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mockSb }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => '{}') }));

import { buildSeason } from '@/lib/season-engine/build-season';
import { PROGRAMA_PILOTO, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { selectDescriptorsPiloto, selectDescriptorsDuo } from '@/lib/season-engine/select-descriptors';
import { callAI } from '@/actions/ai-client';

beforeEach(() => { vi.mocked(callAI).mockClear(); });

const ASSESSMENT = [
  { descritor: 'D1', nota: 1.2 },
  { descritor: 'D2', nota: 1.9 },
  { descritor: 'D3', nota: 2.6 },
  { descritor: 'D4', nota: 2.8 },
];

describe('buildSeason — modo piloto', () => {
  it('gera 3 entradas: 2 semanas de conteúdo (2 entregas cada) + fechamento espelhado', async () => {
    const descritores = selectDescriptorsPiloto('Comp X', ASSESSMENT, PROGRAMA_PILOTO.slotsConteudo, PROGRAMA_PILOTO.conteudosPorSemana);
    const semanas = await buildSeason({
      descritoresSelecionados: descritores,
      competencia: 'Comp X',
      cargo: 'Analista',
      programaConfig: PROGRAMA_PILOTO,
    });

    expect(semanas).toHaveLength(3);
    const [s1, s2, s3] = semanas as any[];

    // Sems 1-2: conteúdo com 2 entregas por DESCRITOR (mesma competência)
    for (const s of [s1, s2]) {
      expect(s.tipo).toBe('conteudo');
      expect(s.conteudos_dia).toHaveLength(2);
      expect(s.conteudos_dia.every((e: any) => e.competencia === 'Comp X')).toBe(true);
      expect(s.descritores_cobertos).toHaveLength(2);
    }
    // 4 descritores DISTINTOS no total, top-4 por gap
    const todos = [...s1.descritores_cobertos, ...s2.descritores_cobertos];
    expect(new Set(todos).size).toBe(4);
    expect(todos).toEqual(['D1', 'D2', 'D3', 'D4']);

    // Slot 3: fechamento com calendário espelhado na sem 2
    expect(s3.tipo).toBe('avaliacao');
    expect(s3.calendario_semana).toBe(2);
    expect(s3.descritores_cobertos).toEqual(['D1', 'D2', 'D3', 'D4']);

    // Semana 1 nasce disponível, demais bloqueadas
    expect(s1.status).toBe('disponivel');
    expect(s2.status).toBe('bloqueada');
    expect(s3.status).toBe('bloqueada');
  });

  it('conteúdo resolvido pela via EXISTENTE: core por descritor + reuso do pool sem slot vazio', async () => {
    const descritores = selectDescriptorsPiloto('Comp X', ASSESSMENT, [1, 2], 2);
    const semanas = await buildSeason({
      descritoresSelecionados: descritores,
      competencia: 'Comp X',
      cargo: 'Analista',
      programaConfig: PROGRAMA_PILOTO,
    });
    const entregas = (semanas as any[]).filter(s => s.tipo === 'conteudo').flatMap(s => s.conteudos_dia);
    // D1-D3 têm conteúdo próprio; D4 reusa pool — NENHUMA entrega sem conteúdo
    expect(entregas.every((e: any) => e.conteudo)).toBe(true);
    // core_id sem repetição entre entregas (idsJaUsados) até esgotar o pool
    const coreIds = entregas.map((e: any) => e.conteudo.core_id).filter(Boolean);
    expect(new Set(coreIds.slice(0, 3)).size).toBe(3);
  });

  it('NÃO faz nenhuma chamada de IA (sem missões; desafio IA off)', async () => {
    const descritores = selectDescriptorsPiloto('Comp X', ASSESSMENT, [1, 2], 2);
    await buildSeason({
      descritoresSelecionados: descritores,
      competencia: 'Comp X',
      cargo: 'Analista',
      programaConfig: PROGRAMA_PILOTO,
    });
    expect(vi.mocked(callAI)).not.toHaveBeenCalled();
  });
});

describe('buildSeason — regressão DUO (estrutura intocada pelo piloto)', () => {
  it('14 semanas, missões 4/8/12, avaliação 13/14, SEM calendario_semana', async () => {
    const descritores = selectDescriptorsDuo(
      'Comp A', [{ descritor: 'A1', nota: 1.5 }, { descritor: 'A2', nota: 2.5 }],
      'Comp B', [{ descritor: 'B1', nota: 2.0 }, { descritor: 'B2', nota: 2.8 }],
      PROGRAMA_REGULAR_DUO.slotsConteudo,
    );
    const semanas = await buildSeason({
      descritoresSelecionados: descritores,
      competencia: 'Comp A',
      competencias: ['Comp A', 'Comp B'],
      cargo: 'Analista',
      programaConfig: PROGRAMA_REGULAR_DUO,
    });

    expect(semanas).toHaveLength(14);
    const tipos = Object.fromEntries((semanas as any[]).map(s => [s.semana, s.tipo]));
    expect(tipos[4]).toBe('aplicacao');
    expect(tipos[8]).toBe('aplicacao');
    expect(tipos[12]).toBe('aplicacao');
    expect(tipos[13]).toBe('avaliacao');
    expect(tipos[14]).toBe('avaliacao');

    // Espelho de calendário NÃO vaza pro DUO
    expect((semanas as any[]).every(s => s.calendario_semana === undefined)).toBe(true);

    // Semana de conteúdo DUO segue com 2 entregas (uma por competência)
    const s1: any = (semanas as any[]).find(s => s.semana === 1);
    expect(s1.conteudos_dia).toHaveLength(2);
    expect(new Set(s1.conteudos_dia.map((e: any) => e.competencia))).toEqual(new Set(['Comp A', 'Comp B']));
  });
});
