import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarJobsEmMemoria, type JobsEmMemoria } from '../helpers/ia-jobs-em-memoria';

/**
 * SEM DISPAROS SIMULTÂNEOS (decisão 3 do dono, 04/10/2026): a geração do Cenário B
 * por célula não roda duas vezes ao mesmo tempo na mesma empresa, nem no botão do
 * admin (modo imediato), nem no lote em segundo plano (e entre os dois). O segundo
 * disparo recebe um aviso claro ("já está gerando"), não um erro calado, e NÃO paga IA.
 */

const h = vi.hoisted(() => ({
  jobs: null as any,
  trigger: vi.fn(),
  callAI: vi.fn(),
  listarFila: vi.fn(),
  porTabela: {} as Record<string, any>,
}));

/** O `tenantDb` do teste: `ia_jobs` é a tabela em memória; as demais devolvem listas fixas. */
function tdbDoTeste() {
  return {
    from(tabela: string) {
      if (tabela === 'ia_jobs') return h.jobs.tdb.from(tabela);
      const q: any = { op: 'select', cadeia: [] as string[], payload: null };
      const api: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (res: any, rej: any) => Promise.resolve({ data: lista(), error: null }).then(res, rej);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => Promise.resolve({ data: q.op === 'insert' ? { id: 'b-novo', ...q.payload } : (lista()[0] ?? null), error: null });
          }
          return (...args: any[]) => {
            if (prop === 'insert') { q.op = 'insert'; q.payload = args[0]; } else q.cadeia.push(`${prop}:${String(args[0])}`);
            return api;
          };
        },
      });
      const lista = () => {
        if (tabela === 'banco_cenarios') return q.cadeia.some((c: string) => c === 'eq:tipo_cenario') ? h.porTabela.cenariosB : h.porTabela.cenariosA;
        return h.porTabela[tabela] ?? [];
      };
      return api;
    },
  };
}

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdbDoTeste() }));
vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: vi.fn(async () => ({})),
  requireAdminSupabase: vi.fn(async () => ({})),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => h.callAI(...a) }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (s: string) => { try { return JSON.parse(s); } catch { return null; } } }));
vi.mock('@/lib/ia3-cenarios', () => ({
  montarContextoIA3: async () => ({ ctx: { empresa: { nome: 'E' }, comp: { nome: 'Comp A' }, descritores: [], valores: [], contextoPPP: '', cargoDetalhe: null, gabCIS: null } }),
  travaRegeneracao: () => true,
}));
vi.mock('@/lib/cenarios-b-prompt', () => ({
  buildCenarioBPrompts: () => ({ system: 's', user: 'u' }),
  buildCheckCenarioBUser: () => 'u',
  SYSTEM_CHECK_CENARIO_B: 's',
}));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: (...a: any[]) => h.trigger(...a) }, runs: { retrieve: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/actions/fase1', () => ({ listarCargosParaIA2: vi.fn(), listarFilaIA3: vi.fn() }));
vi.mock('@/actions/fase3', () => ({ listarPendentesIA4: vi.fn() }));
vi.mock('@/actions/relatorios', () => ({ gerarRelatoriosIndividuaisLote: vi.fn() }));
vi.mock('@/lib/check-ia4-core', () => ({ listarPendentesCheckCore: vi.fn() }));
vi.mock('@/lib/blueprint/core', () => ({ resolverFilaBlueprint100: vi.fn(), separarPorBlueprintExistente: vi.fn() }));
vi.mock('@/lib/cenarios-b-lote', async (orig) => ({ ...(await orig<any>()), listarFilaCenariosB: (...a: any[]) => h.listarFila(...a) }));

import { gerarCenariosBLote } from '@/actions/fase5/cenarios-b';
import { enqueueCenariosBBatch } from '@/actions/ia-pipeline-batch';
import { AVISO_JA_GERANDO_CENARIOS_B } from '@/lib/cenarios-b-lote';

const GERACAO = JSON.stringify({ titulo: 'Caso novo', descricao: 'Um caso bem diferente do primeiro', p1: 'a', p2: 'b', p3: 'c', p4: 'd' });
const AI_LOTE = { model: 'claude-sonnet-4-6', checkModel: 'gpt-5.6-terra' };

/** Uma célula (Comp A, Professor) sem B: o lote tem UMA geração a fazer. */
function umaCelulaSemB() {
  h.porTabela = {
    cenariosA: [{ id: 'a1', titulo: 'Caso A', descricao: 'Planejamento financeiro anual do setor', cargo: 'Professor', competencia_id: 'c1', ppp_escola_id: null, alternativas: {}, created_at: '2026-09-01T00:00:00Z' }],
    cenariosB: [],
    competencias: [{ id: 'c1', nome: 'Comp A', descricao: '', cod_comp: 'C1', cargo: 'Professor' }],
  };
}

/** Segura a 1ª chamada de geração até `liberar()`: é o tempo em que o 2º disparo chega. */
function segurarGeracao() {
  let liberar!: () => void;
  const porta = new Promise<void>((res) => { liberar = res; });
  h.callAI.mockImplementation(async () => { await porta; return GERACAO; });
  return liberar;
}
const geracoes = () => h.callAI.mock.calls.filter((c) => c[4]?.taskKey === 'cenarios_b');

beforeEach(() => {
  // o relógio da tabela parte do real: o código sob teste mede a lease com o `Date.now()` dele
  h.jobs = criarJobsEmMemoria('emp', Date.now());
  for (const f of [h.trigger, h.callAI, h.listarFila]) f.mockReset();
  h.trigger.mockResolvedValue({ id: 'run-1' });
  umaCelulaSemB();
});

describe('geração imediata (o botão "Cenários B + Check" no modo agora)', () => {
  it('dois cliques ao mesmo tempo: UMA geração paga, e o segundo recebe "já está gerando" (aviso, não erro calado)', async () => {
    const liberar = segurarGeracao();
    const p1 = gerarCenariosBLote('emp', {});
    const p2 = gerarCenariosBLote('emp', {});
    // o segundo volta SEM esperar a IA do primeiro
    const segundo = await Promise.race([p2, p1.then(() => 'primeiro-terminou-antes')]);
    expect(segundo).toMatchObject({ success: false, jaGerando: true, error: AVISO_JA_GERANDO_CENARIOS_B });
    liberar();
    const primeiro: any = await p1;
    expect(primeiro.success).toBe(true);
    expect(geracoes()).toHaveLength(1);
    // a reserva fechou: uma linha só, concluída
    expect(h.jobs.rows).toHaveLength(1);
    expect(h.jobs.rows[0]).toMatchObject({ fase: 'cenarios-b', status: 'done', params: { modo: 'imediato' } });
  });

  it('cinco cliques ao mesmo tempo: uma geração só e quatro avisos', async () => {
    const liberar = segurarGeracao();
    const todos = Array.from({ length: 5 }, () => gerarCenariosBLote('emp', {}));
    await vi.waitFor(() => expect(h.callAI).toHaveBeenCalledTimes(1));
    liberar();
    const rs: any[] = await Promise.all(todos);
    expect(rs.filter((r) => r.success)).toHaveLength(1);
    expect(rs.filter((r) => r.jaGerando === true)).toHaveLength(4);
    expect(geracoes()).toHaveLength(1);
  });

  it('depois que a geração termina, a fase está livre: o clique seguinte gera de novo', async () => {
    h.callAI.mockResolvedValue(GERACAO);
    expect((await gerarCenariosBLote('emp', {}) as any).success).toBe(true);
    expect((await gerarCenariosBLote('emp', {}) as any).success).toBe(true);
    expect(geracoes()).toHaveLength(2);
  });

  it('a geração FALHA (o provedor cai): a reserva fecha como erro, com o motivo, e não prende a fase', async () => {
    h.callAI.mockRejectedValueOnce(new Error('provedor fora do ar'));
    const r: any = await gerarCenariosBLote('emp', {});
    expect(r).toMatchObject({ success: false, error: 'provedor fora do ar' });
    expect(h.jobs.rows[0]).toMatchObject({ status: 'error', error: 'provedor fora do ar' });
    h.callAI.mockResolvedValue(GERACAO);
    expect(((await gerarCenariosBLote('emp', {})) as any).success).toBe(true);
  });

  it('erro de negócio antes de gerar (sem cenário A): reserva fechada como erro, e a fase fica livre', async () => {
    h.porTabela.cenariosA = [];
    const r: any = await gerarCenariosBLote('emp', {});
    expect(r).toMatchObject({ success: false });
    expect(h.jobs.rows[0]).toMatchObject({ status: 'error' });
    expect(h.jobs.rows[0].error).toContain('Nenhum cenário A');
    umaCelulaSemB();
    h.callAI.mockResolvedValue(GERACAO);
    expect(((await gerarCenariosBLote('emp', {})) as any).success).toBe(true);
  });

  it('um lote em segundo plano em andamento barra a geração imediata (e ela não lê nem paga nada)', async () => {
    const lote = (h.jobs as JobsEmMemoria).semear({ fase: 'cenarios-b', status: 'running', params: { modo: 'lote' } });
    h.callAI.mockResolvedValue(GERACAO);
    const r: any = await gerarCenariosBLote('emp', {});
    expect(r).toMatchObject({ success: false, jaGerando: true });
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.jobs.rows.map((x: any) => x.id)).toEqual([lote.id]);
  });

  it('erro ao reservar (banco fora): o erro sobe como erro, sem gerar', async () => {
    h.jobs.falharEm('insert', 'pool esgotado');
    const r: any = await gerarCenariosBLote('emp', {});
    expect(r).toEqual({ success: false, error: 'pool esgotado' });
    expect(h.callAI).not.toHaveBeenCalled();
  });
});

describe('lote em segundo plano (enqueueCenariosBBatch + task do Trigger)', () => {
  beforeEach(() => {
    h.listarFila.mockImplementation(async () => { await Promise.resolve(); return [{ cenarioAId: 'a1', competenciaId: 'c1', cargo: 'Professor' }]; });
  });

  it('dois disparos ao mesmo tempo: UM job, UM dispatch da task, e o segundo recebe o aviso', async () => {
    const [a, b]: any[] = await Promise.all([enqueueCenariosBBatch('emp', AI_LOTE), enqueueCenariosBBatch('emp', AI_LOTE)]);
    const ok = [a, b].find((r) => r.success);
    const aviso = [a, b].find((r) => !r.success);
    expect(ok).toMatchObject({ success: true, total: 1 });
    expect(aviso).toMatchObject({ success: false, jaGerando: true, error: AVISO_JA_GERANDO_CENARIOS_B });
    expect(h.trigger).toHaveBeenCalledTimes(1);
    expect(h.listarFila).toHaveBeenCalledTimes(1); // quem perdeu nem montou a fila
    expect(h.jobs.rows).toHaveLength(1);
    expect(h.jobs.rows[0]).toMatchObject({
      id: ok.jobId, fase: 'cenarios-b', status: 'queued',
      params: { modo: 'lote', aiConfig: AI_LOTE, items: [{ cenarioAId: 'a1' }] }, progress: { done: 0, total: 2, current: 'na fila' },
    });
  });

  it('o dispatch leva a idempotencyKey do job (um disparo repetido da mesma chamada não abre 2ª execução)', async () => {
    const r: any = await enqueueCenariosBBatch('emp', AI_LOTE);
    expect(h.trigger).toHaveBeenCalledWith('gerar-cenarios-b-batch', { jobId: r.jobId, empresaId: 'emp' }, expect.objectContaining({ idempotencyKey: `cenarios-b:emp:${r.jobId}` }));
  });

  it('cinco disparos ao mesmo tempo: um job e um dispatch', async () => {
    const rs: any[] = await Promise.all(Array.from({ length: 5 }, () => enqueueCenariosBBatch('emp', AI_LOTE)));
    expect(rs.filter((r) => r.success)).toHaveLength(1);
    expect(rs.filter((r) => r.jaGerando === true)).toHaveLength(4);
    expect(h.trigger).toHaveBeenCalledTimes(1);
    expect(h.jobs.rows).toHaveLength(1);
  });

  it('a geração imediata em andamento barra o lote (as duas dividem a mesma reserva)', async () => {
    const liberar = segurarGeracao();
    const imediata = gerarCenariosBLote('emp', {});
    await vi.waitFor(() => expect(h.callAI).toHaveBeenCalledTimes(1));
    const lote: any = await enqueueCenariosBBatch('emp', AI_LOTE);
    expect(lote).toMatchObject({ success: false, jaGerando: true });
    expect(h.trigger).not.toHaveBeenCalled();
    liberar();
    await imediata;
  });

  it('não há nada na fila: a reserva fecha como concluída, sem dispatch, e a fase fica livre', async () => {
    h.listarFila.mockResolvedValue([]);
    const r: any = await enqueueCenariosBBatch('emp', AI_LOTE);
    expect(r).toMatchObject({ success: true, jobId: null, total: 0 });
    expect(h.trigger).not.toHaveBeenCalled();
    expect(h.jobs.rows.map((x: any) => x.status)).toEqual(['done']);
    h.listarFila.mockResolvedValue([{ cenarioAId: 'a1', competenciaId: 'c1', cargo: 'Professor' }]);
    expect(((await enqueueCenariosBBatch('emp', AI_LOTE)) as any).success).toBe(true);
  });

  it('o dispatch falha: a reserva fecha como erro (com o motivo) e o erro sobe, sem prender a fase', async () => {
    h.trigger.mockRejectedValueOnce(new Error('trigger fora do ar'));
    const r: any = await enqueueCenariosBBatch('emp', AI_LOTE);
    expect(r).toMatchObject({ success: false, error: 'trigger fora do ar' });
    expect(h.jobs.rows[0]).toMatchObject({ status: 'error', error: 'dispatch: trigger fora do ar' });
    h.trigger.mockResolvedValue({ id: 'run-2' });
    expect(((await enqueueCenariosBBatch('emp', AI_LOTE)) as any).success).toBe(true);
  });

  it('a fila não monta (leitura falhou): a reserva fecha como erro e o erro sobe', async () => {
    h.listarFila.mockRejectedValueOnce(new Error('Cenários: timeout'));
    const r: any = await enqueueCenariosBBatch('emp', AI_LOTE);
    expect(r).toMatchObject({ success: false, error: 'Cenários: timeout' });
    expect(h.jobs.rows[0]).toMatchObject({ status: 'error' });
    expect(h.trigger).not.toHaveBeenCalled();
  });

  it('modelos fora da regra do lote (geração Claude, validação GPT): recusa ANTES de reservar', async () => {
    const r: any = await enqueueCenariosBBatch('emp', { model: 'gpt-5.6-terra', checkModel: 'gpt-5.6-terra' });
    expect(r).toMatchObject({ success: false, error: 'Lote requer geração Claude e validação GPT' });
    expect(h.jobs.contagem.insert).toBe(0);
  });
});
