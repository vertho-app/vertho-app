import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `batchPendenteDoJob` — a 2ª fonte da retomada, exercitada de VERDADE.
 *
 * 🔴 Por que este arquivo existe (achado de revisão, 24/08): as quatro suítes de
 * idempotência do C3 **mockam** `batchPendenteDoJob`. Elas provam que a task o
 * consulta e respeita a resposta — nada sobre o filtro que ele aplica. E era no
 * filtro que estava o furo.
 *
 * A ordem real de uma task de lote é:
 *   colher o batch → `encerrarBatch(CONCLUIDO)` → **só então** persistir item a item.
 *
 * Filtrando apenas `submetido`, a função ficava cega exatamente na janela que
 * ela existe para fechar: id não persistido em `params` + run morta depois de
 * fechar o rastro e antes de gravar os itens ⇒ a retomada não acha nada e
 * submete outro lote PAGO.
 */

const mocks = vi.hoisted(() => ({
  /** Linhas de `ia_batches`. */
  linhas: [] as any[],
  /** Filtros que a consulta aplicou — é o que se quer medir. */
  filtros: [] as Array<{ metodo: string; args: any[] }>,
  erro: null as any,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => {
    const b: any = {
      _tabela: '',
      select: (...a: any[]) => { mocks.filtros.push({ metodo: 'select', args: a }); return b; },
      eq: (...a: any[]) => { mocks.filtros.push({ metodo: 'eq', args: a }); return b; },
      in: (...a: any[]) => { mocks.filtros.push({ metodo: 'in', args: a }); return b; },
      order: (...a: any[]) => { mocks.filtros.push({ metodo: 'order', args: a }); return b; },
      limit: (...a: any[]) => { mocks.filtros.push({ metodo: 'limit', args: a }); return b; },
      maybeSingle: async () => {
        if (mocks.erro) return { data: null, error: mocks.erro };
        // Aplica os filtros de verdade sobre as linhas do mock.
        const igual: Record<string, any> = {};
        let statusAceitos: string[] | null = null;
        for (const f of mocks.filtros) {
          if (f.metodo === 'eq') igual[f.args[0]] = f.args[1];
          if (f.metodo === 'in' && f.args[0] === 'status') statusAceitos = f.args[1];
          if (f.metodo === 'eq' && f.args[0] === 'status') statusAceitos = [f.args[1]];
        }
        const desc = mocks.filtros.find((f) => f.metodo === 'order')?.args?.[1]?.ascending === false;
        let out = mocks.linhas.filter((l) =>
          Object.entries(igual).every(([k, v]) => k === 'status' || l[k] === v)
          && (!statusAceitos || statusAceitos.includes(l.status)));
        out = [...out].sort((x, y) => (desc ? (y.criado_em > x.criado_em ? 1 : -1) : (x.criado_em > y.criado_em ? 1 : -1)));
        return { data: out[0] ?? null, error: null };
      },
    };
    return { from: (t: string) => { b._tabela = t; return b; } };
  },
}));

async function recuperar(jobId: string, feature: string) {
  const mod = await import('@/lib/ai-batch');
  return mod.batchPendenteDoJob(jobId, feature);
}

beforeEach(() => {
  mocks.linhas = [];
  mocks.filtros = [];
  mocks.erro = null;
});

describe('batchPendenteDoJob · o filtro, não o mock dele', () => {
  it('acha o lote ainda em `submetido`', async () => {
    mocks.linhas = [{ batch_id: 'msgbatch_1', job_id: 'j1', feature: 'blueprint_gerar', status: 'submetido', criado_em: '2026-08-24T10:00:00Z' }];
    expect(await recuperar('j1', 'blueprint_gerar')).toBe('msgbatch_1');
  });

  /**
   * 🔴 O caso do achado. O rastro é fechado ANTES de os itens serem gravados —
   * se a run morre nesse meio, o lote está `concluido` e continua sendo o lote
   * que a retomada precisa. Recolhê-lo é grátis (a Anthropic guarda 29 dias).
   */
  it('🔴 acha o lote já CONCLUÍDO — é onde a janela real acontece', async () => {
    mocks.linhas = [{ batch_id: 'msgbatch_ok', job_id: 'j1', feature: 'blueprint_gerar', status: 'concluido', criado_em: '2026-08-24T10:00:00Z' }];

    expect(
      await recuperar('j1', 'blueprint_gerar'),
      'lote pago e colhido ficou invisível para a retomada — a próxima tentativa submete outro',
    ).toBe('msgbatch_ok');
  });

  it('ignora lote que terminou em ERRO (esse não tem o que colher)', async () => {
    mocks.linhas = [{ batch_id: 'msgbatch_err', job_id: 'j1', feature: 'blueprint_gerar', status: 'erro', criado_em: '2026-08-24T10:00:00Z' }];
    expect(await recuperar('j1', 'blueprint_gerar')).toBeNull();
  });

  /**
   * ⚠️ IA3 e IA4 submetem DUAS ondas no mesmo job. Colher as respostas do check
   * achando que são cenários é pior que criar um lote a mais.
   */
  it('🔴 separa as duas ondas do MESMO job pela feature', async () => {
    mocks.linhas = [
      { batch_id: 'msgbatch_gen', job_id: 'j1', feature: 'ia3_cenarios', status: 'submetido', criado_em: '2026-08-24T10:00:00Z' },
      { batch_id: 'msgbatch_chk', job_id: 'j1', feature: 'ia3_check', status: 'submetido', criado_em: '2026-08-24T11:00:00Z' },
    ];

    expect(await recuperar('j1', 'ia3_cenarios')).toBe('msgbatch_gen');
    mocks.filtros = [];
    expect(await recuperar('j1', 'ia3_check')).toBe('msgbatch_chk');
  });

  it('não vaza lote de OUTRO job', async () => {
    mocks.linhas = [{ batch_id: 'msgbatch_outro', job_id: 'j2', feature: 'blueprint_gerar', status: 'submetido', criado_em: '2026-08-24T10:00:00Z' }];
    expect(await recuperar('j1', 'blueprint_gerar')).toBeNull();
  });

  it('com dois candidatos, devolve o MAIS RECENTE', async () => {
    mocks.linhas = [
      { batch_id: 'msgbatch_velho', job_id: 'j1', feature: 'ia2_gabarito', status: 'concluido', criado_em: '2026-08-24T09:00:00Z' },
      { batch_id: 'msgbatch_novo', job_id: 'j1', feature: 'ia2_gabarito', status: 'submetido', criado_em: '2026-08-24T12:00:00Z' },
    ];
    expect(await recuperar('j1', 'ia2_gabarito')).toBe('msgbatch_novo');
  });

  /**
   * Nunca lança: derrubar a task por causa de uma TENTATIVA de recuperação seria
   * trocar um custo (um lote a mais) por um pior (o lote todo perdido).
   */
  it('falha de consulta degrada para null, sem derrubar a task', async () => {
    mocks.erro = { message: 'timeout no pool' };
    const original = console.warn;
    console.warn = () => {};
    try {
      await expect(recuperar('j1', 'blueprint_gerar')).resolves.toBeNull();
    } finally {
      console.warn = original;
    }
  });
});
