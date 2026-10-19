import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O aviso de PLANO PRONTO só anuncia o PDI da jornada ATUAL da pessoa (18/10/2026, Ibipeba Temporada 2).
 *
 * O botão do painel (`dispararAvisoPlanos`) não tem corte de data: alcança todo PDI vivo do tenant. Em Ibipeba, os 13
 * que não responderam a T2 seguem com o PDI de julho vivo em `relatorios`, e receberiam "seu plano está pronto" sobre
 * um plano que a tela já mostra como anterior. Banco falso: a empresa, os PDIs e as participações.
 */
const h = vi.hoisted(() => ({
  relatorios: [] as any[],
  participacoes: [] as any[] | null,
  enviados: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    rpc: async () => ({ data: null, error: null }),
    from(tabela: string) {
      const q: any = {
        select: () => q, or: () => q, gt: () => q, in: () => q, order: () => q, limit: () => q, not: () => q, eq: () => q,
        range: () => q,
        then: (res: any, rej: any) => {
          const r = (data: any, error: any = null) => Promise.resolve({ data, error }).then(res, rej);
          if (tabela === 'empresas') return r([{ id: 'ibi', slug: 'ibipeba', nome: 'Ibipeba', is_demo: false, sys_config: {} }]);
          if (tabela === 'relatorios') return r(h.relatorios);
          if (tabela === 'colaboradores') return r(h.relatorios.map((x) => ({ id: x.colaborador_id, nome_completo: 'Pessoa Teste', whatsapp: '5577999999999' })));
          if (tabela === 'turma_membros') return h.participacoes ? r(h.participacoes) : r(null, { message: 'timeout' });
          return r([]);
        },
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/notifications/pilula-template', () => ({
  enviarPorTemplate: vi.fn(async (_t: string, a: any) => { h.enviados.push(a.colaboradorId); return { ok: true }; }),
}));
vi.mock('@/lib/whatsapp/cadencia', () => ({ criarPaceadorSincrono: () => ({ aguardarVez: async () => {} }) }));

const SEM_CORTE = '1970-01-01T00:00:00.000Z';
const MARCO_T2 = '2026-10-09T12:00:00.000Z';

beforeEach(() => {
  h.enviados.length = 0;
  h.relatorios = [
    { colaborador_id: 'respondeu-t2', gerado_em: '2026-10-18T16:00:00.000Z', auditoria_status: 'pass' },
    { colaborador_id: 'so-t1', gerado_em: '2026-07-20T16:55:12.112Z', auditoria_status: null },
    { colaborador_id: 'sem-turma', gerado_em: '2026-07-20T16:55:12.112Z', auditoria_status: null },
  ];
  h.participacoes = [
    { id: 'p1', turma_id: 't2', colaborador_id: 'respondeu-t2', status: 'ativo', created_at: '2026-10-07T12:00:00.000Z', marco_jornada: MARCO_T2 },
    { id: 'p2', turma_id: 't2', colaborador_id: 'so-t1', status: 'ativo', created_at: '2026-10-07T12:00:00.000Z', marco_jornada: MARCO_T2 },
  ];
});

describe('aviso de plano: só o PDI da jornada atual', () => {
  it('🔴 o PDI de julho de quem está na T2 não é anunciado; o da T2 é; quem não tem turma segue como sempre', async () => {
    const { avisarPlanosProntos } = await import('@/lib/notifications/avisar-plano-pronto');
    const r = await avisarPlanosProntos({ apenasSlug: 'ibipeba', corteIso: SEM_CORTE, executar: true, teto: 120 });
    expect(h.enviados.sort()).toEqual(['respondeu-t2', 'sem-turma']);
    expect(r.deOutraJornada).toBe(1);
    expect(r.elegiveis).toBe(2);
  });

  it('🔴 sem conseguir ler as participações, a empresa fica de fora (não adivinha qual PDI é o de agora)', async () => {
    h.participacoes = null;
    const { avisarPlanosProntos } = await import('@/lib/notifications/avisar-plano-pronto');
    const r = await avisarPlanosProntos({ apenasSlug: 'ibipeba', corteIso: SEM_CORTE, executar: true, teto: 120 });
    expect(h.enviados).toEqual([]);
    expect(r.elegiveis).toBe(0);
  });
});

describe('decidirAvisos: o balde da outra jornada', () => {
  it('daJornadaAtual=false sai no balde próprio; ausente conta como da jornada', async () => {
    const { decidirAvisos } = await import('@/lib/notifications/avisar-plano-pronto');
    const base = { nome: 'Maria', telefone: '5511999999999', geradoEm: '2026-10-18T10:00:00.000Z' };
    const d = decidirAvisos([
      { ...base, colaboradorId: 'anterior', daJornadaAtual: false },
      { ...base, colaboradorId: 'atual', daJornadaAtual: true },
      { ...base, colaboradorId: 'sem-info' },
    ], new Set(), SEM_CORTE);
    expect(d.enviar.map((x) => x.colaboradorId)).toEqual(['atual', 'sem-info']);
    expect([d.deOutraJornada, d.antigos, d.reprovados, d.repetidos, d.semTelefone]).toEqual([1, 0, 0, 0, 0]);
  });
});
