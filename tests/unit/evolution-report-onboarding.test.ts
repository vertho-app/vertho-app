import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O Evolution Report lê a pontuação do fechamento (`feedback.avaliacao_por_descritor`) e
 * a consolida pelos descritores da trilha. No Onboarding (5 competências, o scorer roda por
 * competência) o nome de um descritor pode se repetir em duas competências: o fechamento
 * grava a `competencia` de cada saída, e o relatório casa pelas duas. As saídas de uma
 * competência só não têm o campo e seguem casando pelo nome, como sempre.
 */

const h = vi.hoisted(() => ({ sb: null as any, trilha: null as any, prog14: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('@/lib/season-engine/trilha-runtime', async () => {
  const { PROGRAMA_ONBOARDING } = await import('@/lib/season-engine/programa-config');
  return { resolverConfigDaTrilha: async () => PROGRAMA_ONBOARDING };
});
vi.mock('@/lib/season-engine/encadear-jornada', () => ({ encadearAposConclusao: vi.fn(async () => {}) }));

import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';

const porNome = (r: any, competencia: string, descritor: string) => r.descritores.find((d: any) => d.competencia === competencia && d.descritor === descritor);

function montar(trilha: any, feedback: any) {
  h.trilha = trilha;
  h.prog14 = { status: 'concluido', feedback };
  h.sb = criarSupabaseMock({
    resolver: (tabela, cols) => {
      if (tabela === 'trilhas') return h.trilha;
      if (tabela === 'temporada_semana_progresso') return cols.includes('reflexao') ? { reflexao: { evolucao_percebida: [] } } : h.prog14;
      return null;
    },
  });
}

const TRILHA = (descritores: any[]) => ({
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Comp A', competencias_foco: ['Comp A', 'Comp B'],
  descritores_selecionados: descritores, programa_modo: 'onboarding', programa_config: {},
});
const D = (competencia: string, descritor: string, nota_atual: number) => ({ competencia, descritor, nota_atual });
const S = (descritor: string, nota_pre: number, nota_cenario: number, nota_pos: number, competencia?: string) => ({
  ...(competencia ? { competencia } : {}), descritor, nota_pre, nota_cenario, nota_pos, justificativa: `j ${descritor}`,
});

beforeEach(() => { h.sb = null; });

describe('gerarEvolutionReportCore com os 5 resultados juntos', () => {
  it('descritor com o MESMO nome em duas competências: cada um pega a SUA nota (a competência desempata)', async () => {
    montar(
      TRILHA([D('Comp A', 'Escuta ativa', 1.5), D('Comp B', 'Escuta ativa', 2.0)]),
      { avaliacao_por_descritor: [S('Escuta ativa', 1.5, 2.5, 2.5, 'Comp A'), S('Escuta ativa', 2.0, 3.5, 3.5, 'Comp B')], resumo_avaliacao: { mensagem_geral: 'm' } },
    );
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(porNome(r.evolution_report, 'Comp A', 'Escuta ativa')).toMatchObject({ nota_pre: 1.5, nota_pos: 2.5, nota_cenario_bruta: 2.5 });
    expect(porNome(r.evolution_report, 'Comp B', 'Escuta ativa')).toMatchObject({ nota_pre: 2, nota_pos: 3.5, nota_cenario_bruta: 3.5 });
  });

  it('a competência casa sem diferença de caixa e espaços', async () => {
    montar(TRILHA([D('Comp A', 'D1', 1.5)]), { avaliacao_por_descritor: [S('D1', 1.5, 3, 3, ' comp a ')] });
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(porNome(r.evolution_report, 'Comp A', 'D1')).toMatchObject({ nota_cenario_bruta: 3 });
  });

  it('saída de UMA competência (sem o campo `competencia`): casa pelo nome, como sempre', async () => {
    montar(TRILHA([D('Comp A', 'D1', 1.5), D('Comp A', 'D2', 2.0)]), { avaliacao_por_descritor: [S('D1', 1.5, 3, 3), S('D2', 2.0, 2.5, 2.5)] });
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(porNome(r.evolution_report, 'Comp A', 'D1')).toMatchObject({ nota_pos: 3, nota_cenario_bruta: 3 });
    expect(porNome(r.evolution_report, 'Comp A', 'D2')).toMatchObject({ nota_pos: 2.5 });
  });

  it('o relatório nunca rebaixa o patamar: nota do cenário abaixo da inicial mantém a inicial', async () => {
    montar(TRILHA([D('Comp A', 'D1', 2.5)]), { avaliacao_por_descritor: [S('D1', 2.5, 1.5, 1.5, 'Comp A')] });
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(porNome(r.evolution_report, 'Comp A', 'D1')).toMatchObject({ nota_pre: 2.5, nota_pos: 2.5, nota_cenario_bruta: 1.5 });
  });

  it('o descritor da trilha sem saída do scorer fica com a nota de partida (e o relatório sai)', async () => {
    montar(TRILHA([D('Comp A', 'D1', 1.5), D('Comp B', 'D9', 2.0)]), { avaliacao_por_descritor: [S('D1', 1.5, 3, 3, 'Comp A')] });
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(porNome(r.evolution_report, 'Comp B', 'D9')).toMatchObject({ nota_pre: 2, nota_pos: 2, nota_cenario_bruta: 2 });
  });
});
