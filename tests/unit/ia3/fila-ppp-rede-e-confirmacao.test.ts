import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../../helpers/tabelas-em-memoria';

/**
 * Fila da IA3 e o que a cerca (revisão de 02/10/2026, lote 8):
 *  · R-69: os PPPs-alvo só contavam quem já tinha feito o DISC, e o cenário de rede
 *    só nascia se ninguém do cargo estivesse mapeado. Quem chegava depois, de outra
 *    escola, recebia o cenário de OUTRA escola. Agora: PPP de todos do cargo, rede
 *    sempre (e o escolhedor não cai mais em `aptos[0]`, testado em cenario-elegivel).
 *  · R-82: nome do Top 5 sem casamento EXATO era pulado em silêncio; liberar os
 *    cenários não conferia se existiam; o lote regenerava tudo sem confirmação.
 */

let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;

function montar(over: Partial<Tabelas> = {}) {
  tabelas = {
    cargos_empresa: [{ empresa_id: 'emp', nome: 'Professor', top5_workshop: ['comunicação', 'Didática', 'Inexistente'] }],
    top10_cargos: [],
    competencias: [
      { id: 'c-1', empresa_id: 'emp', nome: 'Comunicação', cod_comp: 'C1', cargo: 'Professor', cod_desc: null },
      { id: 'c-2', empresa_id: 'emp', nome: 'Didática', cod_comp: 'C2', cargo: 'Professor', cod_desc: null },
    ],
    escolas: [{ id: 'esc-a', empresa_id: 'emp', ppp_escola_id: 'ppp-a' }, { id: 'esc-b', empresa_id: 'emp', ppp_escola_id: 'ppp-b' }],
    ppp_escolas: [{ id: 'ppp-a', empresa_id: 'emp', escola: 'Escola A' }, { id: 'ppp-b', empresa_id: 'emp', escola: 'Escola B' }],
    // Ninguém fez o DISC: antes disso a fila tinha só a rede; e com alguém mapeado, só o PPP dele.
    colaboradores: [
      { id: 'p1', empresa_id: 'emp', cargo: 'Professor', escola_id: 'esc-a', perfil_dominante: 'DI' },
      { id: 'p2', empresa_id: 'emp', cargo: 'Professor', escola_id: 'esc-b', perfil_dominante: null },
    ],
    banco_cenarios: [],
    ia_jobs: [],
    ...over,
  };
  sb = bancoEmMemoria(tabelas);
}

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sb.client),
  requireEmpresaSupabase: vi.fn(async () => sb.client),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn(async () => ({ id: 'run-1' })) }, runs: { retrieve: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/actions/fase3', () => ({ listarPendentesIA4: vi.fn() }));
vi.mock('@/actions/relatorios', () => ({ gerarRelatoriosIndividuaisLote: vi.fn() }));

import { listarFilaIA3 } from '@/actions/fase1';
import { enqueueIA3Batch } from '@/actions/ia-pipeline-batch';
import { top5SemCenarioDeRede } from '@/lib/assessment/top5-sem-cenario';

const cen = (id: string, comp: string, extra: Record<string, any> = {}) => ({
  id, empresa_id: 'emp', cargo: 'Professor', competencia_id: comp, ppp_escola_id: null, tipo_cenario: null, nota_check: 90, ...extra,
});

beforeEach(() => montar());

describe('listarFilaIA3', () => {
  it('R-69: rede SEMPRE, e o PPP da escola de TODAS as pessoas do cargo (fez DISC ou não)', async () => {
    const r: any = await listarFilaIA3('emp');
    expect(r.success).toBe(true);
    const ppps = (comp: string) => r.data.filter((f: any) => f.competencia_id === comp).map((f: any) => f.ppp_escola_id).sort();
    expect(ppps('c-1')).toEqual(['ppp-a', 'ppp-b', null].sort());
    expect(ppps('c-2')).toEqual(['ppp-a', 'ppp-b', null].sort());
  });

  it('cargo sem ninguém: a rede continua na fila', async () => {
    montar({ colaboradores: [] });
    const r: any = await listarFilaIA3('emp');
    expect(r.data.map((f: any) => f.ppp_escola_id)).toEqual([null, null]);
  });

  it('R-82: nome do Top 5 casa a competência sem caixa (a régua do resolvedor), e o que não casa vem em semCompetencia', async () => {
    const r: any = await listarFilaIA3('emp');
    expect(r.data.some((f: any) => f.competencia_id === 'c-1')).toBe(true);
    expect(r.semCompetencia).toEqual(['Professor › Inexistente']);
  });

  it('cenário já gerado (rede e PPP) sai como jaGerado', async () => {
    montar({ banco_cenarios: [cen('x', 'c-1'), cen('y', 'c-1', { ppp_escola_id: 'ppp-a' })] });
    const r: any = await listarFilaIA3('emp');
    const c1 = r.data.filter((f: any) => f.competencia_id === 'c-1');
    expect(c1.filter((f: any) => f.jaGerado).map((f: any) => f.ppp_escola_id).sort()).toEqual(['ppp-a', null].sort());
  });

  it('falha ao ler os cenários existentes não vira "nada gerado" (que regeneraria tudo, pago)', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'pool' });
    const r: any = await listarFilaIA3('emp');
    expect(r.success).toBe(false);
  });
});

describe('enqueueIA3Batch: regenerar tudo só com pedido explícito (R-82)', () => {
  // O insert do lote termina em `.single()`: a prova é a escrita registrada.
  const lotes = () => sb.escritas.filter((e) => e.tabela === 'ia_jobs' && e.op === 'insert').map((e) => e.payload);
  function tudoGerado() {
    montar({
      banco_cenarios: ['c-1', 'c-2'].flatMap((c) => [cen(`${c}-r`, c), cen(`${c}-a`, c, { ppp_escola_id: 'ppp-a' }), cen(`${c}-b`, c, { ppp_escola_id: 'ppp-b' })]),
    });
  }

  it('nada pendente e sem pedido: NÃO cria lote, e devolve quantos já existem', async () => {
    tudoGerado();
    const r: any = await enqueueIA3Batch('emp', {});
    expect(r).toMatchObject({ success: true, jobId: null, nadaPendente: true, jaGerados: 6 });
    expect(r.semCompetencia).toEqual(['Professor › Inexistente']);
    expect(lotes()).toHaveLength(0);
  });

  it('com regenerarTudo: cria o lote com todos', async () => {
    tudoGerado();
    const r: any = await enqueueIA3Batch('emp', {}, { regenerarTudo: true });
    expect(r.success).toBe(true);
    expect(lotes()).toHaveLength(1);
    expect(lotes()[0].params.items).toHaveLength(6);
  });

  it('com pendentes: enfileira só os pendentes, sem precisar do pedido', async () => {
    montar({ banco_cenarios: [cen('c-1-r', 'c-1')] });
    const r: any = await enqueueIA3Batch('emp', {});
    expect(r.success).toBe(true);
    expect(lotes()[0].params.items).toHaveLength(5);
  });
});

describe('top5SemCenarioDeRede: o aviso ao liberar (R-82)', () => {
  it('lista o que do Top 5 não tem cenário de REDE apto; PPP sozinho não cobre o cargo', async () => {
    montar({ banco_cenarios: [cen('r1', 'c-1'), cen('a2', 'c-2', { ppp_escola_id: 'ppp-a' })] });
    const r: any = await top5SemCenarioDeRede(sb.client, {});
    expect(r.faltam).toEqual([
      { cargo: 'Professor', competencia: 'Didática' },
      { cargo: 'Professor', competencia: 'Inexistente' },
    ]);
  });

  it('abaixo da nota mínima da empresa conta como sem cenário', async () => {
    montar({ banco_cenarios: [cen('r1', 'c-1', { nota_check: 70 }), cen('r2', 'c-2')] });
    const r: any = await top5SemCenarioDeRede(sb.client, { cenario_nota_minima: 80 });
    expect(r.faltam.map((x: any) => x.competencia)).toEqual(['comunicação', 'Inexistente']);
  });

  it('falha de leitura volta como erro, nunca como "não falta nada"', async () => {
    sb.falharEm({ tabela: 'banco_cenarios', op: 'select', mensagem: 'pool' });
    expect(await top5SemCenarioDeRede(sb.client, {})).toMatchObject({ error: 'pool' });
  });
});
