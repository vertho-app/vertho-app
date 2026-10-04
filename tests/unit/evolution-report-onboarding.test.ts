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

function montar(trilha: any, feedback: any, mapeamento: any[] = []) {
  h.trilha = trilha;
  h.prog14 = { status: 'concluido', feedback };
  h.sb = criarSupabaseMock({
    lista: (tabela) => (tabela === 'descriptor_assessments' ? mapeamento : []),
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

// ── O B pontua os 6 descritores de cada competência, e o relatório itera o MESMO conjunto ──────
describe('gerarEvolutionReportCore no Onboarding: itera os descritores que o fechamento pontuou (6 por competência)', () => {
  const NOTAS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]; // d1..d4: os 4 selecionados para o conteúdo
  const COMPS = ['Comp A', 'Comp B'];
  const nome = (c: string, n: number) => `${c.slice(-1)}-d${n}`;
  const selecionados = COMPS.flatMap((c) => [1, 2, 3, 4].map((n) => D(c, nome(c, n), NOTAS[n - 1])));
  const mapeamento = COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: c, descritor: nome(c, n), nota: NOTAS[n - 1] })));
  const saidas = COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => S(nome(c, n), NOTAS[n - 1], NOTAS[n - 1] + 1, NOTAS[n - 1] + 1, c)));
  const cenarios = COMPS.map((competencia) => ({ competencia, cenario: 'caso', perguntas: [], transcript_completo: [] }));

  it('o conjunto inteiro (6 por competência; aqui, 2 competências: 12): os 4 da trilha e os 2 só do mapeamento, cada um com a SUA nota', async () => {
    montar(TRILHA(selecionados), { cenarios, avaliacao_por_descritor: saidas }, mapeamento);
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    const ds = r.evolution_report.descritores;
    expect(ds).toHaveLength(12);
    expect(ds.map((d: any) => d.descritor)).toEqual(COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => nome(c, n))));
    // o descritor que só o mapeamento tem (o 5 e o 6) é um descritor como os outros no relatório
    expect(porNome(r.evolution_report, 'Comp A', 'A-d5')).toMatchObject({ nota_pre: 3, nota_pos: 4, nota_cenario_bruta: 4, justificativa_cenario: 'j A-d5' });
    expect(porNome(r.evolution_report, 'Comp B', 'B-d6')).toMatchObject({ nota_pre: 3.5, nota_pos: 4.5, nota_cenario_bruta: 4.5 });
    expect(porNome(r.evolution_report, 'Comp B', 'B-d1')).toMatchObject({ nota_pre: 1, nota_pos: 2 });
    // sem leitura qualitativa para quem não foi discutido nas semanas, e o formato do descritor é o de sempre
    expect(porNome(r.evolution_report, 'Comp A', 'A-d6')).toMatchObject({ nivel_percebido: null, antes: null, depois: null });
    expect(Object.keys(porNome(r.evolution_report, 'Comp A', 'A-d6')).sort()).toEqual(Object.keys(porNome(r.evolution_report, 'Comp A', 'A-d1')).sort());
    // a média e o resumo saem sobre o conjunto inteiro
    expect(r.evolution_report.nota_media_pos).toBe(Number((saidas.reduce((t, x) => t + x.nota_pos, 0) / 12).toFixed(2)));
    expect(r.evolution_report.resumo.confirmadas + r.evolution_report.resumo.parciais + r.evolution_report.resumo.estagnacoes).toBe(12);
  });

  it('a pontuação e o relatório iteram o MESMO conjunto: o scorer devolveu 12 e o relatório mostra 12', async () => {
    montar(TRILHA(selecionados), { cenarios, avaliacao_por_descritor: saidas }, mapeamento);
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    const doRelatorio = r.evolution_report.descritores.map((d: any) => `${d.competencia}|${d.descritor}`).sort();
    expect(doRelatorio).toEqual(saidas.map((x) => `${x.competencia}|${x.descritor}`).sort());
  });

  it('descritor do mapeamento sem saída do scorer fica com a nota de partida (e o relatório sai)', async () => {
    montar(TRILHA(selecionados), { cenarios, avaliacao_por_descritor: saidas.filter((x) => x.descritor !== 'A-d6') }, mapeamento);
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(porNome(r.evolution_report, 'Comp A', 'A-d6')).toMatchObject({ nota_pre: 3.5, nota_pos: 3.5, nota_cenario_bruta: 3.5 });
  });

  it('o mapeamento não pode ser lido: o relatório NÃO sai (nada de relatório com menos descritores calado) e a trilha segue aberta', async () => {
    montar(TRILHA(selecionados), { cenarios, avaliacao_por_descritor: saidas }, mapeamento);
    h.sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('pool esgotado');
    expect(h.sb.escritas.some((e: any) => e.tabela === 'trilhas')).toBe(false);
  });

  it('o slot de UMA competência (sem `cenarios`) segue iterando só os selecionados, com o mapeamento no banco', async () => {
    montar(TRILHA(selecionados), { avaliacao_por_descritor: saidas }, mapeamento);
    const r: any = await gerarEvolutionReportCore('tr-1', { empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(r.evolution_report.descritores).toHaveLength(8);
    expect(h.sb.usou('descriptor_assessments', 'eq', 'colaborador_id')).toBe(false);
  });
});
