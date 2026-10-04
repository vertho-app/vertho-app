import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A regeração do admin (`regerarScoringComFeedback`) refaz a pontuação com o MESMO
 * conjunto do fechamento da pessoa. No Onboarding (slot com `cenarios`) são os descritores
 * de cada competência que o Cenário A avaliou (6), e não só os selecionados para o
 * conteúdo (4): senão a regeração mudaria o conjunto que a nota original usou.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  slot: null as any,
  trilha: null as any,
  mapeamento: [] as any[],
  pontuar: vi.fn(),
  evidencias: vi.fn(async (..._args: any[]) => 'evidências'),
}));

vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.sb.client }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: async () => ({}) }));
vi.mock('@/lib/season-engine/trilha-runtime', async () => {
  const { PROGRAMA_ONBOARDING } = await import('@/lib/season-engine/programa-config');
  return { resolverConfigDaTrilha: async () => PROGRAMA_ONBOARDING };
});
vi.mock('@/lib/season-engine/regua', () => ({
  enriquecerComRegua: async ({ descritores }: any) => descritores,
  sobreporNotaFresh: async (_db: any, _c: string, _comp: string, d: any[]) => d,
}));
vi.mock('@/lib/season-engine/evidencias-fechamento', () => ({
  agregarEvidenciasAteAcumulada: (...args: any[]) => h.evidencias(...args),
  normalizarAcumuladoPrimaria: () => null,
}));
vi.mock('@/lib/season-engine/fechamento-scorer', () => ({ pontuarFechamento: h.pontuar }));
vi.mock('@/lib/pdf-locale', () => ({ idiomaDaPessoa: async () => 'pt-BR' }));
vi.mock('@/actions/evolution-report', () => ({ gerarEvolutionReport: vi.fn(async () => ({ success: true })) }));

import { regerarScoringComFeedback } from '@/app/admin/vertho/auditoria-sem14/actions';

const NOTAS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
const COMPS = ['Comp A', 'Comp B'];
const nome = (c: string, n: number) => `${c.slice(-1)}-d${n}`;
const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map((d) => ({ dimensao: d, texto: `pergunta ${d}` }));
const transcript = (c: string) => [
  { role: 'assistant', content: '**SITUAÇÃO**' }, { role: 'user', content: `${c} r1` },
  { role: 'assistant', content: '**p2**' }, { role: 'user', content: `${c} r2` },
  { role: 'assistant', content: '**p3**' }, { role: 'user', content: `${c} r3` },
  { role: 'assistant', content: '**p4**' }, { role: 'user', content: `${c} r4` },
];
const AUDITORIA = { nota_auditoria: 60, status: 'revisar', resumo_auditoria: 'frágil', alertas: [], ajustes_sugeridos: [] };

const TRILHA_ONB = {
  id: 'tr-1', empresa_id: 'emp-1', colaborador_id: 'col-1', competencia_foco: COMPS[0], competencias_foco: COMPS,
  descritores_selecionados: COMPS.flatMap((c) => [1, 2, 3, 4].map((n) => ({ competencia: c, descritor: nome(c, n), nota_atual: NOTAS[n - 1] }))),
  programa_modo: 'onboarding', programa_config: {},
};
const TRILHA_UMA = {
  ...TRILHA_ONB, competencia_foco: 'Comp A', competencias_foco: ['Comp A'], programa_modo: 'jornada',
  descritores_selecionados: [1, 2, 3, 4].map((n) => ({ competencia: 'Comp A', descritor: nome('Comp A', n), nota_atual: NOTAS[n - 1] })),
};

beforeEach(() => {
  h.pontuar.mockReset().mockResolvedValue({ ok: true, parsed: { avaliacao_por_descritor: [] }, auditoria: AUDITORIA, meta: { warnings: [] } });
  h.evidencias.mockClear();
  h.mapeamento = COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: c, descritor: nome(c, n), nota: NOTAS[n - 1] })));
  h.trilha = TRILHA_ONB;
  h.slot = {
    id: 'prog-12', trilha_id: 'tr-1', empresa_id: 'emp-1', colaborador_id: 'col-1',
    feedback: {
      auditoria: AUDITORIA,
      cenarios: COMPS.map((competencia) => ({ competencia, cenario_b_id: `b-${competencia}`, cenario: `## ${competencia}`, perguntas: PERGUNTAS, transcript_completo: transcript(competencia) })),
    },
  };
  h.sb = criarSupabaseMock({
    lista: (tabela) => (tabela === 'descriptor_assessments' ? h.mapeamento : []),
    resolver: (tabela, cols) => {
      if (tabela === 'trilhas') return h.trilha;
      if (tabela === 'colaboradores') return { nome_completo: 'Ana Souza', cargo: 'Professor', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return cols === 'feedback' ? { feedback: { acumulado: null } } : h.slot;
      return null;
    },
  });
});

describe('regerarScoringComFeedback no Onboarding: o conjunto é o dos 6 descritores de cada competência', () => {
  it('cada competência vai ao scorer com os 6 (4 da trilha + 2 do mapeamento), e o conjunto com os 12', async () => {
    const r: any = await regerarScoringComFeedback('prog-12');
    expect(r.ok).toBe(true);
    const a = h.pontuar.mock.calls[0][0];
    expect(a.porCompetencia.map((e: any) => e.competencia)).toEqual(COMPS);
    for (const [i, e] of a.porCompetencia.entries()) {
      expect(e.descritores.map((d: any) => d.descritor), COMPS[i]).toEqual([1, 2, 3, 4, 5, 6].map((n) => nome(COMPS[i], n)));
    }
    expect(a.descritores).toHaveLength(12);
    // as evidências das semanas são pedidas para os 6 de cada competência
    expect(h.evidencias).toHaveBeenCalledTimes(2);
    expect(h.evidencias.mock.calls.every((c) => c[2].length === 6)).toBe(true);
  });

  it('a defesa oral de cada competência (no cenário dela) vai na entrada dela, mascarada; a que não concluiu fica sem extração', async () => {
    const extracao = (c: string) => ({
      resumo: { leitura_geral: `leitura de ${c}`, sustentacao_mais_forte: 'a', fragilidade_mais_relevante: 'b' },
      evidencias_por_descritor: [{ descritor: nome(c, 1), sustentou: 'aprofundou', forca: 'forte', citacao: `Ana defendeu ${c}` }],
    });
    h.slot.feedback.cenarios[0].arguicao = { turno: 6, concluida: true, historico: [], extracao: extracao('Comp A') };
    h.slot.feedback.cenarios[1].arguicao = { turno: 2, concluida: false, historico: [] };
    await regerarScoringComFeedback('prog-12');
    const a = h.pontuar.mock.calls[0][0];
    expect(a.porCompetencia[0].evidenciasArguicao.resumo.leitura_geral).toBe('leitura de Comp A');
    expect(a.porCompetencia[0].evidenciasArguicao.evidencias_por_descritor[0].citacao).not.toContain('Ana');
    expect(a.porCompetencia[1].evidenciasArguicao).toBeNull();
    // o conjunto não leva uma extração única: o scorer junta as das entradas
    expect(a.evidenciasArguicao).toBeNull();
  });

  it('a leitura do mapeamento leva o filtro de empresa (client raw, sem o escopo do tenant)', async () => {
    await regerarScoringComFeedback('prog-12');
    expect(h.sb.usou('descriptor_assessments', 'eq', 'empresa_id')).toBe(true);
    expect(h.sb.usou('descriptor_assessments', 'eq', 'colaborador_id')).toBe(true);
  });

  it('o mapeamento não pode ser lido: erro, e o scorer NÃO é pago', async () => {
    h.sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await regerarScoringComFeedback('prog-12');
    expect(r.error).toContain('pool esgotado');
    expect(h.pontuar).not.toHaveBeenCalled();
    expect(h.sb.escritas.some((e: any) => e.tabela === 'temporada_semana_progresso')).toBe(false);
  });

  it('uma competência (sem `cenarios`): só os selecionados, sem porCompetencia, como sempre', async () => {
    h.trilha = TRILHA_UMA;
    h.slot = { ...h.slot, feedback: { auditoria: AUDITORIA, cenario: '## caso', cenario_resposta: 'r', perguntas: PERGUNTAS, transcript_completo: transcript('Comp A'), arguicao: { concluida: true, extracao: { resumo: { leitura_geral: 'leu' }, evidencias_por_descritor: [] } } } };
    const r: any = await regerarScoringComFeedback('prog-12');
    expect(r.ok).toBe(true);
    const a = h.pontuar.mock.calls[0][0];
    expect(a).not.toHaveProperty('porCompetencia');
    expect(a.descritores).toEqual(TRILHA_UMA.descritores_selecionados);
    // a defesa oral de uma competência segue sendo o `feedback.arguicao` do slot, como sempre
    expect(a.evidenciasArguicao).toEqual({ resumo: { leitura_geral: 'leu' }, evidencias_por_descritor: [] });
    expect(h.evidencias.mock.calls[0][2]).toEqual(TRILHA_UMA.descritores_selecionados);
    expect(h.sb.usou('descriptor_assessments', 'eq', 'colaborador_id')).toBe(false);
  });
});
