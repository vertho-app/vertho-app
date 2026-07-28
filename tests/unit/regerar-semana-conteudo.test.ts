import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selecionarConteudoDaSemana } from '@/lib/season-engine/build-season';

/**
 * F-I2 do docs/FMEA-PIPELINE.md — fluxo completo de `regerarSemana`:
 *
 *   1. o reparo de conteúdo passa por `selecionarConteudoDaSemana` (a função do
 *      motor) — core órfão é re-selecionado, core válido não se troca;
 *   2. o plano gravado passa por `normalizarSemanas` (antes gravava o JSONB cru);
 *   3. o trabalho da pessoa (reflexão/feedback/tira-dúvidas + status de quem já
 *      respondeu) segue preservado — lógica de 27/07, não regredir;
 *   4. a mensagem enganosa "Semana de avaliação não pode ser regerada" no caso
 *      de semana de CONTEÚDO sem descritor foi corrigida.
 *
 * Validação por mutação: remover `normalizarSemanas(plano)` derruba o 2º teste
 * (labels/descritores_cobertos ficam errados); trocar a re-seleção por escolha
 * local derruba o 1º (a escolha diverge da função do motor).
 */

const h = vi.hoisted(() => ({ state: {} as any }));

vi.mock('@/lib/auth/protected-action', () => ({
  DomainError: class DomainError extends Error {
    codigo?: string;
    constructor(m: string, c?: string) { super(m); this.codigo = c; }
  },
  protectedAction: (_perm: any, schema: any, fn: any) => async (raw: any) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Dados inválidos', code: 'VALIDATION' };
    try {
      return { success: true, data: await fn({ email: 'admin@test.com' }, parsed.data) };
    } catch (e: any) {
      return { success: false, error: String(e?.message ?? e) };
    }
  },
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => ({}),
  requireUserAction: async () => ({}),
  getAuthenticatedEmailFromAction: async () => null,
  assertTenantAccessAction: async () => {},
}));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.state.sb }));
vi.mock('@/lib/repositories/trilhas-repo', () => ({
  findTrilhaComTenant: async () => h.state.trilha,
  updateTrilhaInTenant: async (_sb: any, _e: any, _id: any, campos: any) => {
    h.state.planoGravado = campos.temporada_plano;
    return { id: 't1' };
  },
  updateSemanaProgressoInTenant: async (_sb: any, _e: any, _id: any, _s: any, campos: any) => {
    h.state.progressoGravado = campos;
    return 1;
  },
}));
vi.mock('@/actions/ai-client', () => ({ callAI: async () => 'DESAFIO NOVO GERADO POR IA' }));
vi.mock('@/lib/audit', () => ({ logAdminAction: async () => {} }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: async () => null,
  canViewColabJourney: async () => false,
}));

const POOL = [
  { id: 'cA', titulo: 'Conteúdo A', formato: 'texto', competencia: 'Autocuidado', descritor: 'D1', cargo: 'Professor', ativo: true, versao: 1, taxa_conclusao: 0.5 },
  { id: 'cB', titulo: 'Conteúdo B', formato: 'texto', competencia: 'Autocuidado', descritor: 'D2', cargo: 'Professor', ativo: true, versao: 1, taxa_conclusao: 0.9 },
];

function sbMock() {
  const tabelas: Record<string, any> = {
    colaboradores: { single: { cargo: 'Professor', empresa_id: 'e1' } },
    empresas: { single: { segmento: 'Educação básica' } },
    micro_conteudos: { list: POOL },
    temporada_semana_progresso: { single: h.state.progressoAtual ?? null },
  };
  const mk = (tabela: string) => {
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => { if (c === 'competencia') q._comp = v; return q; },
      is: () => q,
      or: () => q,
      maybeSingle: async () => ({ data: tabelas[tabela]?.single ?? null, error: null }),
      then: (resolve: any) => {
        const list = q._comp ? (tabelas[tabela]?.list ?? []).filter((x: any) => x.competencia === q._comp) : (tabelas[tabela]?.list ?? []);
        resolve({ data: list, error: null });
      },
    };
    return q;
  };
  return { from: mk };
}

/** Semana DUO com core órfão na pílula 1, válido na 2, e derivados dessincronizados. */
function trilhaDuo() {
  return {
    id: 't1', colaborador_id: 'c1', empresa_id: 'e1',
    competencia_foco: 'Autocuidado', competencias_foco: ['Autocuidado'],
    descritores_selecionados: [
      { descritor: 'D1', competencia: 'Autocuidado' },
      { descritor: 'D2', competencia: 'Autocuidado' },
    ],
    temporada_plano: [{
      semana: 1, tipo: 'conteudo', competencia: 'Autocuidado',
      descritor: 'D1', descritores_cobertos: ['STALE'], nivel_atual: 2,
      conteudo: { core_id: 'morto', core_titulo: 'Morto', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: {}, fallback_gerado: false, desafio_texto: 'VELHO' },
      conteudos_dia: [
        { dia: 'terca', label: 'ERRADO', competencia: 'Autocuidado', descritor: 'D1', nivel_atual: 2, conteudo: { core_id: 'morto', core_titulo: 'Morto', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: {}, fallback_gerado: false, desafio_texto: 'VELHO' } },
        { dia: 'segunda', label: 'ERRADO 2', competencia: 'Autocuidado', descritor: 'D2', nivel_atual: 2, conteudo: { core_id: 'cB', core_titulo: 'Conteúdo B', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: { texto: { id: 'cB' } }, fallback_gerado: false, desafio_texto: 'VELHO B' } },
      ],
      status: 'disponivel',
    }],
  };
}

describe('regerarSemana · reparo de conteúdo + normalização (F-I2)', () => {
  beforeEach(() => {
    h.state = {};
    h.state.progressoAtual = { reflexao: { texto: 'minha evidência' }, feedback: null, tira_duvidas: null };
    h.state.trilha = trilhaDuo();
    h.state.sb = sbMock();
  });

  it('core órfão é re-selecionado pela função do motor; core válido não se troca', async () => {
    const { regerarSemana } = await import('@/actions/temporadas');
    const res = await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(res.success).toBe(true);

    const esperado = selecionarConteudoDaSemana(POOL as any, {
      cargo: 'Professor', descritor: 'D1',
      prioridadeFormatos: ['video', 'texto', 'audio', 'case'],
      idsJaUsados: new Set(['cB']),
    });
    const sem = h.state.planoGravado[0];
    expect(sem.conteudos_dia[0].conteudo.core_id).toBe(esperado.coreContent?.id);
    expect(sem.conteudos_dia[0].conteudo.core_id).toBe('cA');
    expect(sem.conteudos_dia[1].conteudo.core_id).toBe('cB'); // válido → intocado
    // O desafio regerado por IA (gravado no topo) sobrevive ao espelho da seleção.
    expect(sem.conteudo.desafio_texto).toBe('DESAFIO NOVO GERADO POR IA');
    expect(sem.conteudo.core_id).toBe('cA');
    expect(res.data.message).toContain('re-selecionado');
  });

  it('o plano gravado passa por normalizarSemanas (labels/dias/descritores reconciliados)', async () => {
    const { regerarSemana } = await import('@/actions/temporadas');
    const res = await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(res.success).toBe(true);

    const sem = h.state.planoGravado[0];
    expect(sem.conteudos_dia.map((e: any) => e.label)).toEqual(['Pílula 1', 'Pílula 2']);
    expect(sem.conteudos_dia.map((e: any) => e.dia)).toEqual(['segunda', 'terca']);
    expect(sem.descritores_cobertos).toEqual(['D1', 'D2']); // estava ['STALE']
    expect(sem.descritor).toBe('D1');
  });

  it('trabalho da pessoa preservado: status não regride, reflexão não é tocada', async () => {
    const { regerarSemana } = await import('@/actions/temporadas');
    const res = await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(res.success).toBe(true);

    expect(h.state.progressoGravado.conteudo_consumido).toBe(false);
    expect(h.state.progressoGravado).not.toHaveProperty('status'); // já trabalhou → mantém
    expect(h.state.progressoGravado).not.toHaveProperty('reflexao');
    expect(res.data.message).toContain('preservados');
  });

  it('semana de conteúdo SEM descritor: mensagem correta (não culpa "avaliação")', async () => {
    h.state.trilha.temporada_plano = [{
      semana: 1, tipo: 'conteudo', competencia: 'Autocuidado',
      descritor: null, descritores_cobertos: [], status: 'disponivel',
    }];
    const { regerarSemana } = await import('@/actions/temporadas');
    const res = await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('sem descritor');
    expect(res.error).not.toContain('avaliação');
  });

  it('semana de avaliação: segue recusada, com a mensagem certa', async () => {
    h.state.trilha.temporada_plano = [{
      semana: 7, tipo: 'avaliacao', descritor: null, descritores_cobertos: [], status: 'bloqueada',
    }];
    const { regerarSemana } = await import('@/actions/temporadas');
    const res = await regerarSemana({ trilhaId: 't1', semana: 7 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('avaliação');
  });
});
