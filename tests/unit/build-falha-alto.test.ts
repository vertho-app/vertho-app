import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * buildSeason · semana sem core de conteúdo (decisão de produto 28/07):
 * na CONSTRUÇÃO, falha alto. Pool vazio (mesmo após o recorte por nível cair
 * pro pool inteiro) = o conteúdo da célula competência × descritor × cargo NÃO
 * EXISTE → registra `conteudo-ausente` E ABORTA o build com a célula exata na
 * mensagem. Antes a semana saía com `fallback_gerado` (título templated) e
 * ninguém ficava sabendo.
 *
 * NÃO confundir com: recorte por nível caindo pro pool inteiro (seleção
 * legítima — teste do caminho feliz abaixo) nem com repararCoreOrfaoDaSemana
 * (reparo de plano legado, NÃO passa por montarSemanaConteudo — não bloqueia).
 *
 * Validado por mutação: trocar o `throw` por `fallback_gerado: true` em
 * montarSemanaConteudo derruba o 1º teste; remover o registrarDegradacao,
 * derruba a assertiva do spy.
 */

let POOL: any[] = [];

function chainable(result: any[]) {
  const q: any = {};
  const self = () => q;
  for (const m of ['select', 'eq', 'lte', 'gte', 'or', 'is', 'in', 'not', 'order', 'limit']) q[m] = vi.fn(self);
  q.maybeSingle = vi.fn(async () => ({ data: null }));
  q.then = (resolve: any) => resolve({ data: result });
  return q;
}

const mockSb = { from: vi.fn((table: string) => chainable(table === 'micro_conteudos' ? POOL : [])) };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mockSb }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => '{}') }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { buildSeason } from '@/lib/season-engine/build-season';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';

const registrarSpy = vi.mocked(registrarDegradacao);

const DESCRITORES = [
  { competencia: 'Comp X', descritor: 'D1', nota_atual: 1.2, semanas_ids: [1] },
  { competencia: 'Comp X', descritor: 'D2', nota_atual: 1.9, semanas_ids: [1] },
  { competencia: 'Comp X', descritor: 'D3', nota_atual: 2.6, semanas_ids: [2] },
  { competencia: 'Comp X', descritor: 'D4', nota_atual: 2.8, semanas_ids: [2] },
];

beforeEach(() => {
  registrarSpy.mockClear();
  POOL = [];
});

describe('buildSeason · semana sem core (pool vazio)', () => {
  it('registra conteudo-ausente E aborta o build com a célula exata — nada de fallback_gerado persistido', async () => {
    await expect(
      buildSeason({
        descritoresSelecionados: DESCRITORES as any,
        competencia: 'Comp X',
        cargo: 'Analista',
        empresaId: 'emp-1',
        programaConfig: PROGRAMA_PILOTO,
      }),
    ).rejects.toThrow('Sem conteúdo para Comp X × D1 × Analista (semana 1) — gere o conteúdo antes de construir a trilha');

    expect(registrarSpy).toHaveBeenCalledTimes(1);
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'build',
      tipo: DEGRADACAO.CONTEUDO_AUSENTE,
      chave: 'emp-1:1:D1',
      empresaId: 'emp-1',
    }));
  });
});

describe('buildSeason · caminho feliz (pool com conteúdo)', () => {
  it('constrói normalmente: fallback_gerado false e NENHUM registro conteudo-ausente', async () => {
    POOL = [
      { id: 'c1', titulo: 'Vídeo D1', formato: 'video', competencia: 'Comp X', descritor: 'D1', ativo: true, url: 'u1' },
      { id: 'c2', titulo: 'Texto D2', formato: 'texto', competencia: 'Comp X', descritor: 'D2', ativo: true, url: 'u2' },
      { id: 'c3', titulo: 'Texto D3', formato: 'texto', competencia: 'Comp X', descritor: 'D3', ativo: true, url: 'u3' },
    ];

    const semanas = await buildSeason({
      descritoresSelecionados: DESCRITORES as any,
      competencia: 'Comp X',
      cargo: 'Analista',
      empresaId: 'emp-1',
      programaConfig: PROGRAMA_PILOTO,
    });

    expect(semanas).toHaveLength(3);
    const entregas = (semanas as any[]).filter(s => s.tipo === 'conteudo').flatMap(s => s.conteudos_dia);
    expect(entregas.length).toBeGreaterThan(0);
    expect(entregas.every((e: any) => e.conteudo.fallback_gerado === false)).toBe(true);
    expect(registrarSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ tipo: DEGRADACAO.CONTEUDO_AUSENTE }),
    );
  });
});
