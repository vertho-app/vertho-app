import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * A home do Onboarding (04/10/2026): do dia em que a trilha nasce até a segunda em
 * que a semana 2 abre, o calendário aponta para a semana 1, que é o Mapeamento
 * (concluído, sem conteúdo nem Evidências). A home não pode anunciar uma "pílula
 * da semana 1" nem cobrar um prazo de evidência que não existe; o "próximo marco"
 * diz quando a semana 2 chega. Depois da segunda de início, os cards voltam ao
 * normal, sobre a semana 2.
 *
 * `data_inicio` é a segunda ANTERIOR ao início do conteúdo (ver `persistirTrilha`).
 */

let sb: ReturnType<typeof criarSupabaseMock>;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

import { carregarHomeKpis } from '@/lib/home/loaders';

const COLAB = { id: 'colab-1', empresa_id: 'emp-1' };
const DATA_INICIO = '2026-11-09'; // a semana 2 abre em 16/11

const PLANO: any[] = [
  { semana: 1, tipo: 'mapeamento', descritor: null, descritores_cobertos: [], competencias_cobertas: ['A'] },
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((semana) => ({ semana, tipo: 'conteudo', descritor: `D${semana}` })),
  { semana: 12, tipo: 'avaliacao' },
];
const shared = { trilha: { id: 'tr-1', cursos: [], competencia_foco: 'A', temporada_plano: PLANO, data_inicio: DATA_INICIO, programa_modo: 'onboarding', programa_config: null } };

function montar() {
  sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'temporada_semana_progresso'
      ? { semana: 1, conteudo_consumido: false, iniciado_em: '2026-11-04T18:00:00Z', concluido_em: '2026-11-04T18:00:00Z' }
      : null),
  });
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); montar(); });
afterEach(() => { vi.useRealTimers(); });

describe('home na semana de mapeamento (antes da segunda de início)', () => {
  it('sem pílula e sem prazo de evidência: nada a anunciar nem a cobrar de uma semana sem conteúdo', async () => {
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    const r = await carregarHomeKpis(COLAB, { fases: [] }, shared);
    expect(r.error).toBeUndefined();
    expect(r.pilula).toBeNull();
    expect(r.evidencia).toBeNull();
  });

  it('o próximo marco é a semana 2, em dias', async () => {
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    const r = await carregarHomeKpis(COLAB, { fases: [] }, shared);
    expect(r.proximoMarco).toMatchObject({ tipo: 'pilula', semana: 2 });
    expect(r.proximoMarco.diasAte).toBe(4); // quinta 12/11 15:00 até segunda 16/11 06:00
  });

  it('a home NÃO consulta a evidência da semana de mapeamento', async () => {
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    await carregarHomeKpis(COLAB, { fases: [] }, shared);
    expect(sb.usou('capacitacao', 'select')).toBe(false);
  });
});

describe('home depois que a semana 2 abre', () => {
  it('a pílula e o prazo da semana 2 voltam, com o total de 12', async () => {
    vi.setSystemTime(new Date('2026-11-17T15:00:00Z'));
    const r = await carregarHomeKpis(COLAB, { fases: [] }, shared);
    expect(r.pilula).toMatchObject({ semana: 2, totalSemanas: 12 });
    expect(r.evidencia).toMatchObject({ status: 'pendente' });
  });
});

describe('o contraste: outro modo, mesma data, semana 1 de conteúdo', () => {
  it('a Jornada na semana 1 continua com pílula e prazo', async () => {
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    const jornada = { trilha: { ...shared.trilha, programa_modo: 'jornada', temporada_plano: [1, 2, 3, 4, 5, 6].map((semana) => ({ semana, tipo: 'conteudo', descritor: `D${semana}` })).concat([{ semana: 7, tipo: 'avaliacao' } as any]) } };
    const r = await carregarHomeKpis(COLAB, { fases: [] }, jornada);
    expect(r.pilula).toMatchObject({ semana: 1, totalSemanas: 7 });
    expect(r.evidencia).not.toBeNull();
  });
});
