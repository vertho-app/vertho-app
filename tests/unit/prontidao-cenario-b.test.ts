import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A PRONTIDÃO (admin, antes de liberar) usa a MESMA escolha do fechamento
 * (`escolherCenarioB`), não "existe algum B no cargo" (R-21, 04/10/2026).
 *
 * Antes ela só olhava o cargo: a pessoa aparecia "pronta" com o Cenário B de
 * OUTRA competência na estante, e o fechamento, semanas depois, respondia 424.
 * No Onboarding o fechamento serve UM cenário por competência (5 cenários, 4
 * perguntas cada), e é o B por célula que o lote da Fase 5 gera: cada competência
 * sem B usável é bloqueio, com o nome dela. O Onboarding também não era verificado
 * por esta tela.
 *
 * Mutação: ver o relatório do lote 11.
 */

const h = vi.hoisted(() => ({ sbRaw: null as any, tdb: null as any }));

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
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.sbRaw.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => h.tdb.client }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => null, canViewColabJourney: async () => false }));
vi.mock('@/lib/audit', () => ({ logAdminAction: async () => {} }));
vi.mock('@/actions/ai-client', () => ({ callAI: async () => '' }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import { verificarProntidaoPiloto } from '@/actions/temporadas';

const TOP5 = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
const COMPETENCIAS = TOP5.map((nome, i) => ({ id: `comp-${i}`, nome }));
const PERGUNTAS = { p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4' };
const B = (id: string, competencia_id: string, extra: Record<string, unknown> = {}, cargo = 'Professor') => ({
  id, titulo: `t-${id}`, descricao: `desc ${id}`, cargo, competencia_id, created_at: '2026-09-10T12:00:00Z',
  alternativas: { ...PERGUNTAS, ...extra },
});

let sysConfig: any = {};
let cenariosB: any[] = [];
let avaliadas: string[] = TOP5;
let top5: string[] = TOP5;
/** Competência com poucos descritores avaliados (default: 6 em todas). */
let comPoucosDescritores: { competencia: string; quantos: number } | null = null;

const COLAB = {
  id: 'c1', nome_completo: 'Pessoa Teste', cargo: 'Professor', programa_modo: null,
  pref_video_curto: null, pref_video_longo: null, pref_texto: null, pref_audio: null, pref_estudo_caso: null,
};

function montar() {
  h.sbRaw = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { sys_config: sysConfig } : null),
    lista: (tabela) => {
      if (tabela === 'banco_cenarios') return cenariosB;
      if (tabela === 'competencias') return COMPETENCIAS;
      // Um conteúdo para cada descritor: a conferência de conteúdo passa limpa.
      if (tabela === 'micro_conteudos') return avaliadas.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ descritor: `${c} D${n}`, formato: 'texto' })));
      return [];
    },
  });
  h.tdb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'cargos_empresa' ? { top5_workshop: top5, competencia_foco: 'Comp A', competencias_foco: ['Comp A'] } : null),
    lista: (tabela) => {
      if (tabela === 'colaboradores') return [COLAB];
      if (tabela === 'cargos_empresa') return [{ nome: 'Professor', competencia_foco: 'Comp A' }];
      if (tabela === 'descriptor_assessments') {
        return avaliadas.flatMap((competencia) => [1, 2, 3, 4, 5, 6]
          .slice(0, comPoucosDescritores?.competencia === competencia ? comPoucosDescritores.quantos : 6)
          .map((n) => ({ colaborador_id: 'c1', competencia, descritor: `${competencia} D${n}`, nota: 1.2 + n * 0.3 })));
      }
      return [];
    },
  });
}

const prontidao = async () => {
  const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
  expect(r.success).toBe(true);
  return r.data.resultados[0];
};

beforeEach(() => {
  cenariosB = [];
  avaliadas = TOP5;
  top5 = TOP5;
  comPoucosDescritores = null;
  sysConfig = {};
  montar();
});

describe('prontidão: Personalizado (uma competência por trilha)', () => {
  beforeEach(() => {
    sysConfig = { programa_modo: 'custom', programa_custom: { semanas: 3, numCompetencias: 1, fechamento: true } };
    montar();
  });

  it('só existe o B de OUTRA competência no cargo: NÃO está pronto (antes: "pronto")', async () => {
    cenariosB = [B('b-outra', 'comp-3')];
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('Comp A');
    expect(r.bloqueadores.join(' ')).toContain('Cenário B da competência');
  });

  it('o B da competência da trilha existe: pronto', async () => {
    cenariosB = [B('b-a', 'comp-0'), B('b-outra', 'comp-3')];
    montar();
    const r = await prontidao();
    expect(r.bloqueadores).toEqual([]);
    expect(r.pronto).toBe(true);
  });

  it('sem nenhum B: bloqueador, como sempre foi', async () => {
    const r = await prontidao();
    expect(r.pronto).toBe(false);
  });

  it('falha de leitura do B não vira "pronto": é bloqueador com a causa', async () => {
    h.sbRaw.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'timeout no pool' });
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('timeout no pool');
  });
});

describe('prontidão: Onboarding (fecha nas 5 competências)', () => {
  beforeEach(() => {
    sysConfig = { programa_modo: 'onboarding' };
    montar();
  });

  it('o Onboarding agora é verificado (a tela só olhava piloto e personalizado)', async () => {
    const r = await prontidao();
    expect(r.modo).toBe('onboarding');
    expect(r.competencia).toBe(TOP5.join(' + '));
    // 4 descritores distintos por competência (2 por semana, 2 semanas): 20 no programa.
    expect(r.descritores).toHaveLength(20);
  });

  it('um B por competência (o que o lote da Fase 5 gera) é o que o fechamento serve: pronto', async () => {
    cenariosB = TOP5.map((_, i) => B(`b-${i}`, `comp-${i}`));
    montar();
    const r = await prontidao();
    expect(r.bloqueadores).toEqual([]);
    expect(r.pronto).toBe(true);
  });

  it('falta o B de duas das 5: bloqueador com o NOME de cada uma (e só delas)', async () => {
    cenariosB = [B('b-0', 'comp-0'), B('b-2', 'comp-2'), B('b-3', 'comp-3')];
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    const aviso = r.bloqueadores.join(' ');
    expect(aviso).toContain('"Comp B", "Comp E"');
    for (const presente of ['"Comp A"', '"Comp C"', '"Comp D"']) expect(aviso).not.toContain(presente);
    expect(aviso).toContain('um cenário por competência');
    expect(aviso).not.toContain('integrador');
  });

  it('sem nenhum B: as 5 aparecem pelo nome', async () => {
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    for (const c of TOP5) expect(r.bloqueadores.join(' ')).toContain(`"${c}"`);
  });

  it('o B de OUTRA competência do cargo não conta como o B de uma das 5', async () => {
    cenariosB = [...TOP5.slice(0, 4).map((_, i) => B(`b-${i}`, `comp-${i}`)), B('b-fora', 'comp-9')];
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('"Comp E"');
  });

  it('B sem texto ou sem perguntas não vale (a mesma régua do fechamento)', async () => {
    cenariosB = TOP5.map((_, i) => B(`b-${i}`, `comp-${i}`));
    cenariosB[3] = { ...cenariosB[3], alternativas: {} };
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('"Comp D"');
  });

  it('falha ao ler o B: bloqueador com a causa, nunca "pronto"', async () => {
    h.sbRaw.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'timeout no pool' });
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('timeout no pool');
  });

  it('o Top 5 do cargo tem 3 competências: bloqueador com a MESMA mensagem da geração', async () => {
    top5 = TOP5.slice(0, 3);
    avaliadas = TOP5.slice(0, 3);
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores[0]).toContain('cobre 5 competências em sequência');
  });

  it('competência com só 3 descritores avaliados: bloqueador com a MESMA conta da geração (4 por competência)', async () => {
    comPoucosDescritores = { competencia: 'Comp E', quantos: 3 };
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('Comp E (3 de 4)');
    expect(r.bloqueadores.join(' ')).not.toContain('Comp A (');
  });

  it('com 4 descritores por competência (o mínimo) a conta fecha e nenhum bloqueador de descritor aparece', async () => {
    comPoucosDescritores = { competencia: 'Comp E', quantos: 4 };
    montar();
    const r = await prontidao();
    expect(r.bloqueadores.join(' ')).not.toContain('descritores distintos');
  });

  it('competência do Top 5 sem avaliação: bloqueador diz qual', async () => {
    avaliadas = TOP5.slice(0, 4);
    montar();
    const r = await prontidao();
    expect(r.pronto).toBe(false);
    expect(r.bloqueadores.join(' ')).toContain('Comp E');
  });
});
