import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseMock } from '../helpers/supabase-mock';
import { criarMockDeTabelas } from '../helpers/tabela-filtrada';

/**
 * MONTAGEM: o cargo decide ANTES da faixa de nível (16/09/2026).
 *
 * `montarSemanaConteudo` busca o conteúdo da competência na faixa de nível da
 * pessoa e só amplia (busca sem nível) quando a faixa traz ≤ 1 candidato. A conta
 * era feita sobre os candidatos CRUS, antes do filtro de cargo. Com a mesma
 * competência em 2 cargos, a faixa podia vir cheia só do OUTRO cargo: nada a
 * ampliar, nada servível, e a montagem abortava com "Sem conteúdo" — com o conteúdo
 * do cargo da pessoa existindo fora da faixa.
 *
 * O mock filtra de verdade, inclusive `lte`/`gte` do recorte de nível.
 */

let sb: SupabaseMock;
let tabelas: Record<string, any[]> = {};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => '{}') }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { buildSeason } from '@/lib/season-engine/build-season';
import { PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';

const DESCRITORES = [
  { competencia: 'Comp X', descritor: 'D1', nota_atual: 1.2, semanas_ids: [1] },
  { competencia: 'Comp X', descritor: 'D2', nota_atual: 1.9, semanas_ids: [1] },
  { competencia: 'Comp X', descritor: 'D3', nota_atual: 2.6, semanas_ids: [2] },
  { competencia: 'Comp X', descritor: 'D4', nota_atual: 2.8, semanas_ids: [2] },
];

const conteudo = (id: string, cargo: string, descritor: string, nivel_min: number, nivel_max: number) => ({
  id, titulo: id, formato: 'texto', competencia: 'Comp X', descritor, cargo, empresa_id: 'emp-1',
  ativo: true, kit_id: null, disc: null, url: `u-${id}`, nivel_min, nivel_max,
});

beforeEach(() => {
  tabelas = {
    micro_conteudos: [
      // Na faixa de nível de todo mundo, mas de OUTRO cargo — 2 itens: a conta crua
      // (> 1) não ampliava a busca.
      conteudo('outro-1', 'Gerente', 'D1', 1, 4),
      conteudo('outro-2', 'Gerente', 'D2', 1, 4),
      // Do cargo da pessoa, só FORA da faixa (a busca sem nível acha).
      conteudo('meu-d1', 'Analista', 'D1', 3.9, 4),
      conteudo('meu-d2', 'Analista', 'D2', 3.9, 4),
      conteudo('meu-d3', 'Analista', 'D3', 3.9, 4),
    ],
  };
  sb = criarMockDeTabelas(() => tabelas);
});

describe('buildSeason · faixa de nível contada sobre o que serve ao cargo', () => {
  it('faixa só com conteúdo de outro cargo → amplia e monta com o conteúdo do cargo', async () => {
    const semanas = await buildSeason({
      descritoresSelecionados: DESCRITORES as any,
      competencia: 'Comp X',
      cargo: 'Analista',
      empresaId: 'emp-1',
      programaConfig: PROGRAMA_PILOTO,
    });
    const cores = semanas.map((s: any) => s.conteudo?.core_id).filter(Boolean);
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((id: string) => id.startsWith('meu-'))).toBe(true);
  });

  it('com conteúdo do cargo DENTRO da faixa, não amplia (a faixa continua mandando)', async () => {
    tabelas.micro_conteudos.push(
      conteudo('meu-faixa-d1', 'Analista', 'D1', 1, 4),
      conteudo('meu-faixa-d3', 'Analista', 'D3', 1, 4),
    );
    const semanas = await buildSeason({
      descritoresSelecionados: DESCRITORES as any,
      competencia: 'Comp X',
      cargo: 'Analista',
      empresaId: 'emp-1',
      programaConfig: PROGRAMA_PILOTO,
    });
    const cores = semanas.map((s: any) => s.conteudo?.core_id).filter(Boolean);
    expect(cores.length).toBeGreaterThan(0);
    expect(cores.every((id: string) => id.startsWith('meu-faixa-'))).toBe(true);
  });
});
