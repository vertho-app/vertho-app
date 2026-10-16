import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Kit só da semana 1" pela tela (pedido do dono, 16/10/2026, testando a criação de vídeo). O motor já aceitava o limite
 * (`ParamsFluxo.kitSemanaMax`, lido pela task desde 03/10), mas o botão não o mandava: o fluxo pela tela gerava o Kit de
 * todas as semanas. Aqui: a action grava o limite no job, recusa valor fora da faixa (é endpoint), e o painel o devolve.
 */
const h = vi.hoisted(() => ({
  inseridos: [] as any[],
  trigger: vi.fn(async () => ({ id: 'run-1' })),
  jobLido: null as any,
}));

/** Supabase do teste: grava o `insert` de `ia_jobs` e responde o mínimo que a action lê. */
function sbDoTeste() {
  return {
    from(tabela: string) {
      const q: any = { op: 'select', payload: null };
      const api: any = {
        select: () => api, eq: () => api, in: () => api, limit: () => api, order: () => api,
        insert: (row: any) => { q.op = 'insert'; q.payload = row; h.inseridos.push(row); return api; },
        update: () => { q.op = 'update'; return api; },
        maybeSingle: async () => {
          if (tabela === 'empresas') return { data: { id: 'e1', is_demo: false }, error: null };
          if (tabela === 'ia_jobs') return { data: h.jobLido, error: null };
          return { data: null, error: null };
        },
        single: async () => ({ data: q.op === 'insert' ? { id: 'job-1' } : null, error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej),
      };
      return api;
    },
  };
}

vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => (h.trigger as any)(...a) }, runs: { cancel: vi.fn() } }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'dono@x' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sbDoTeste()) }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sbDoTeste() }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/turmas/escopo', () => ({ idsDoEscopoOuFalhar: vi.fn(async () => null), mensagemEscopoObrigatorio: () => null }));
vi.mock('@/lib/pipeline-fluxo/coletar', () => ({ coletarEntradaPrevia: vi.fn(), lerTudoPaginado: vi.fn() }));
vi.mock('@/lib/pipeline-fluxo/conteudo', () => ({ filaConteudoEscopo: vi.fn() }));
vi.mock('@/lib/pipeline-fluxo/prerequisitos-coleta', () => ({ coletarPrerequisitos: vi.fn() }));

import { iniciarFluxoCompleto, statusFluxoCompleto } from '@/actions/pipeline-fluxo';

beforeEach(() => { h.inseridos.length = 0; h.trigger.mockClear(); h.jobLido = null; });

describe('iniciarFluxoCompleto: limite de semanas do Kit', () => {
  it('grava o limite pedido no job que a task lê', async () => {
    const r = await iniciarFluxoCompleto({ empresaId: 'e1', kitSemanaMax: 1 });
    expect(r).toMatchObject({ success: true, jobId: 'job-1' });
    expect(h.inseridos).toHaveLength(1);
    expect(h.inseridos[0].params.kitSemanaMax).toBe(1);
    expect(h.trigger).toHaveBeenCalledTimes(1);
  });

  it('sem limite (ou "todas"), o job não leva a chave e o Kit cobre o horizonte inteiro', async () => {
    await iniciarFluxoCompleto({ empresaId: 'e1' });
    await iniciarFluxoCompleto({ empresaId: 'e1', kitSemanaMax: null });
    expect(h.inseridos).toHaveLength(2);
    for (const row of h.inseridos) expect('kitSemanaMax' in row.params).toBe(false);
  });

  it('recusa limite fora da faixa ou quebrado, sem criar job nem disparar a task', async () => {
    for (const v of [0, 15, 1.5, -1]) {
      const r = await iniciarFluxoCompleto({ empresaId: 'e1', kitSemanaMax: v });
      expect(r).toMatchObject({ success: false, error: 'Entrada inválida' });
    }
    expect(h.inseridos).toHaveLength(0);
    expect(h.trigger).not.toHaveBeenCalled();
  });

  it('o painel devolve o limite do fluxo (para conferir o que foi pedido), e null quando não houve', async () => {
    h.jobLido = { id: 'job-1', status: 'running', error: null, progress: null, params: { dryRun: false, kitSemanaMax: 1 }, created_at: '2026-10-16T15:00:00Z', updated_at: null };
    const com = await statusFluxoCompleto({ empresaId: 'e1' });
    expect(com).toMatchObject({ success: true, fluxo: { kitSemanaMax: 1 } });
    h.jobLido = { ...h.jobLido, params: { dryRun: false } };
    const sem = await statusFluxoCompleto({ empresaId: 'e1' });
    expect(sem).toMatchObject({ success: true, fluxo: { kitSemanaMax: null } });
  });
});

describe('a tela manda o limite e o mostra', () => {
  const pagina = readFileSync(join(process.cwd(), 'app', 'admin', 'empresas', '[empresaId]', 'fluxo', 'page.tsx'), 'utf8');
  it('o disparo leva o kitSemanaMax escolhido, com "todas as semanas" como padrão', () => {
    expect(pagina).toMatch(/iniciarFluxoCompleto\(\{[^}]*kitSemanaMax[^}]*\}\)/);
    expect(pagina).toMatch(/useState<number \| null>\(null\)/);
    expect(pagina).toContain('<option value="">todas as semanas</option>');
    expect(pagina).toContain('<option value="1">só a semana 1</option>');
  });
  it('a confirmação e o painel do fluxo dizem o limite', () => {
    expect(pagina).toMatch(/Kit \$\{rotuloKitSemanas\(kitSemanaMax\)\}/);
    expect(pagina).toMatch(/fluxo\.kitSemanaMax \? ` · Kit \$\{rotuloKitSemanas\(fluxo\.kitSemanaMax\)\}`/);
  });
});
