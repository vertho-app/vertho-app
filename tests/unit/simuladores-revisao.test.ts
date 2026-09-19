import { describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

/**
 * Núcleo da revisão humana (18/09/2026, mig 264): vendas e liderança gravam o
 * parecer de quem acompanha pelo `tenantDb`, com o motivo mascarado como no
 * atendimento, e o reenvio do mesmo pedido não duplica nem troca o conteúdo.
 */
let sb: SupabaseMock;
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
import { tenantDb } from '@/lib/tenant-db';
import { listarRevisoes, registrarRevisao, revisaoComandoSchema } from '@/lib/simuladores/revisao';

const EMP = '10000000-0000-4000-8000-000000000001';
const REQ = '30000000-0000-4000-8000-000000000001';
const ALVO = '20000000-0000-4000-8000-000000000001';
const VENDAS = { tabela: 'sim_vendas_revisoes', alvo: 'sessao_id' } as const;
const LIDERANCA = { tabela: 'sim_lideranca_revisoes', alvo: 'jornada_id' } as const;
const revisor = { key: 'colab:gestor', nome: 'Gil' };
const cmd = () => ({
  requestId: REQ,
  alvoId: ALVO,
  parecer: 'discordo' as const,
  motivo: 'Analisar ficou baixo, mas ela perguntou o impacto do prazo. Contato dela: ana.souza@cliente.test',
  dimensoes: ['A'],
});

describe('registrarRevisao', () => {
  it('grava pelo tenant, no alvo certo de cada simulador, com o motivo mascarado', async () => {
    for (const destino of [VENDAS, LIDERANCA]) {
      sb = criarSupabaseMock({});
      expect(await registrarRevisao(tenantDb(EMP), destino, cmd(), revisor)).toEqual({ ok: true });
      const w = sb.escritas.find((e) => e.tabela === destino.tabela && e.op === 'insert')!;
      expect(w.payload).toMatchObject({
        id: REQ, empresa_id: EMP, [destino.alvo]: ALVO, revisor_key: 'colab:gestor', revisor_nome: 'Gil',
        parecer: 'discordo', dimensoes: ['A'],
      });
      expect(w.payload.motivo).toContain('perguntou o impacto do prazo');
      expect(w.payload.motivo).not.toContain('ana.souza@cliente.test');
    }
  });

  it('reenvio idêntico do mesmo pedido é aceito sem nova linha', async () => {
    sb = criarSupabaseMock({});
    const primeiro = await registrarRevisao(tenantDb(EMP), VENDAS, cmd(), revisor);
    const gravado = sb.escritas[0].payload;
    sb = criarSupabaseMock({ resolver: (t) => (t === 'sim_vendas_revisoes' ? gravado : null) });
    sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'insert', mensagem: 'duplicate key', code: '23505' });
    expect(primeiro).toEqual({ ok: true });
    expect(await registrarRevisao(tenantDb(EMP), VENDAS, cmd(), revisor)).toEqual({ ok: true });
  });

  it('o mesmo pedido com outro conteúdo ou de outra pessoa é conflito', async () => {
    sb = criarSupabaseMock({});
    await registrarRevisao(tenantDb(EMP), VENDAS, cmd(), revisor);
    const gravado = sb.escritas[0].payload;
    for (const [mudanca, quem] of [
      [{ parecer: 'concordo' as const }, revisor],
      [{ dimensoes: ['A', 'C'] as string[] }, revisor],
      [{}, { key: 'colab:outra', nome: 'Rute' }],
    ] as const) {
      sb = criarSupabaseMock({ resolver: (t) => (t === 'sim_vendas_revisoes' ? gravado : null) });
      sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'insert', mensagem: 'duplicate key', code: '23505' });
      expect(await registrarRevisao(tenantDb(EMP), VENDAS, { ...cmd(), ...mudanca } as ReturnType<typeof cmd>, quem)).toMatchObject({ ok: false, status: 409 });
    }
  });

  it('falha de gravação ou de releitura nunca vira sucesso', async () => {
    sb = criarSupabaseMock({});
    sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'insert', mensagem: 'timeout' });
    expect(await registrarRevisao(tenantDb(EMP), VENDAS, cmd(), revisor)).toMatchObject({ ok: false, status: 503 });
    sb = criarSupabaseMock({});
    sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'insert', mensagem: 'duplicate key', code: '23505' });
    sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'select', mensagem: 'timeout' });
    expect(await registrarRevisao(tenantDb(EMP), VENDAS, cmd(), revisor)).toMatchObject({ ok: false, status: 503 });
  });

  it('motivo que some depois do mascaramento não chega ao banco', async () => {
    sb = criarSupabaseMock({});
    expect(await registrarRevisao(tenantDb(EMP), VENDAS, { ...cmd(), motivo: '   ' }, revisor)).toMatchObject({ ok: false, status: 400 });
    expect(sb.escritas).toHaveLength(0);
  });
});

describe('listarRevisoes', () => {
  it('lê do tenant, pelo alvo, das mais recentes para as antigas', async () => {
    const linhas = [{ id: 'r2', parecer: 'concordo' }, { id: 'r1', parecer: 'discordo' }];
    sb = criarSupabaseMock({ lista: (t) => (t === 'sim_lideranca_revisoes' ? linhas : []) });
    expect(await listarRevisoes(tenantDb(EMP), LIDERANCA, ALVO)).toEqual(linhas);
    expect(sb.usou('sim_lideranca_revisoes', 'eq', 'empresa_id')).toBe(true);
    expect(sb.chamadas).toContainEqual({ tabela: 'sim_lideranca_revisoes', metodo: 'eq', args: ['jornada_id', ALVO] });
    expect(sb.chamadas).toContainEqual({ tabela: 'sim_lideranca_revisoes', metodo: 'order', args: ['created_at', { ascending: false }] });
  });

  it('leitura que falha devolve null, nunca "sem revisão"', async () => {
    sb = criarSupabaseMock({});
    sb.falharEm({ tabela: 'sim_vendas_revisoes', op: 'select', mensagem: 'timeout' });
    expect(await listarRevisoes(tenantDb(EMP), VENDAS, ALVO)).toBeNull();
  });
});

describe('comando da revisão', () => {
  const valido = { acao: 'revisar', requestId: REQ, alvoId: ALVO, parecer: 'parcialmente', motivo: 'ok', dimensoes: ['PL'] };
  it('aceita o formato da tela e recusa o resto antes do banco', () => {
    expect(revisaoComandoSchema.parse(valido)).toMatchObject({ parecer: 'parcialmente' });
    for (const invalido of [
      { ...valido, parecer: 'talvez' },
      { ...valido, motivo: '' },
      { ...valido, motivo: 'x'.repeat(4001) },
      { ...valido, alvoId: 'nao-uuid' },
      { ...valido, extra: true },
      { ...valido, dimensoes: Array.from({ length: 41 }, (_, i) => `D${i}`) },
    ])
      expect(revisaoComandoSchema.safeParse(invalido).success).toBe(false);
  });
});
