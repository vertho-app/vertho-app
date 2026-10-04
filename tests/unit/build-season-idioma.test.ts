import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda E (04/10/2026): a missão e o cenário da semana de APLICAÇÃO são escritos pela IA para a PESSOA dona da
 * trilha e ficam no plano dela (`temporada_plano`). O `callAI` recebe o idioma dela como opção EXPLÍCITA:
 * `colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR. Sem a opção o idioma era o do cookie de
 * quem disparou o build (a operação da Vertho) ou, na task, pt-BR.
 *
 * Quem passa a pessoa é o chamador (`trilha-core`, via `colaboradorId`). Sem `colaboradorId` a chamada segue com os
 * mesmos argumentos de sempre (4, sem opções): nada do que roda hoje muda.
 *
 * A semana de conteúdo NÃO escreve texto no build: o conteúdo vem do banco (reaproveitado por cargo) e o desafio
 * vem do kit (por DISC). Por isso a resolução do idioma só acontece quando o programa tem semana de missão.
 */

const h = vi.hoisted(() => ({
  chamadas: [] as any[][],
  locale: { colab: null as string | null, empresa: null as string | null },
}));

let sb: ReturnType<typeof criarSupabaseMock>;
const montar = () => {
  sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'colaboradores') return { locale: h.locale.colab };
      if (tabela === 'empresas') return { default_locale: h.locale.empresa };
      return null;
    },
  });
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (...args: any[]) => { h.chamadas.push(args); return 'Texto gerado pela IA para a semana.'; }),
}));
vi.mock('@/lib/degradacao', async (importOriginal) => ({ ...(await importOriginal<any>()), registrarDegradacao: vi.fn(async () => {}) }));

import { buildSeason } from '@/lib/season-engine/build-season';
import { PROGRAMA_REGULAR } from '@/lib/season-engine/programa-config';

/** Um programa de UMA semana, e ela é de missão: o único texto que a IA escreve no build. */
const PROGRAMA_SO_MISSAO: any = {
  ...PROGRAMA_REGULAR,
  semanas: 1,
  semanasMissao: [1],
  semanasAvaliacao: [],
  semanasCheckpoint: [],
  slotsConteudo: [],
  blocosCobertos: { 1: -1 },
  complexidadeMap: { 1: 'simples' },
};
const DESCRITORES: any[] = [
  { competencia: 'Comp X', descritor: 'D1', nota_atual: 1.2, semanas_ids: [1] },
  { competencia: 'Comp X', descritor: 'D2', nota_atual: 1.9, semanas_ids: [1] },
];

const construir = (extra: any = {}) => buildSeason({
  descritoresSelecionados: DESCRITORES, competencia: 'Comp X', cargo: 'Analista', empresaId: 'emp-1',
  programaConfig: PROGRAMA_SO_MISSAO, ...extra,
});

beforeEach(() => {
  h.chamadas = [];
  h.locale = { colab: null, empresa: null };
  montar();
});

describe('buildSeason: missão e cenário no idioma da pessoa', () => {
  it('com a pessoa informada, a missão e o cenário recebem o idioma dela', async () => {
    h.locale.colab = 'en-US';
    h.locale.empresa = 'es-ES';
    montar();
    const semanas: any[] = await construir({ colaboradorId: 'col-1' });
    expect(semanas[0].tipo).toBe('aplicacao');
    expect(h.chamadas).toHaveLength(2); // a missão e o cenário
    for (const args of h.chamadas) expect(args[4]).toEqual({ locale: 'en-US' });
  });

  it('pessoa sem idioma: o da empresa; sem idioma nenhum, pt-BR explícito', async () => {
    h.locale.empresa = 'pt-PT';
    montar();
    await construir({ colaboradorId: 'col-1' });
    for (const args of h.chamadas) expect(args[4]).toEqual({ locale: 'pt-PT' });

    h.chamadas = [];
    h.locale.empresa = null;
    montar();
    await construir({ colaboradorId: 'col-1' });
    for (const args of h.chamadas) expect(args[4]).toEqual({ locale: 'pt-BR' });
  });

  it('sem `colaboradorId`: a chamada segue com os 4 argumentos de sempre, e a pessoa nem é consultada', async () => {
    h.locale.colab = 'en-US';
    montar();
    await construir();
    expect(h.chamadas).toHaveLength(2);
    for (const args of h.chamadas) expect(args).toHaveLength(4);
    expect(sb.usou('colaboradores', 'select')).toBe(false);
  });
});
