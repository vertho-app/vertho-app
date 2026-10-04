import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-140 (04/10/2026): marcar o conteúdo como consumido não checava o `{ error }` da
 * gravação. A action devolvia `ok: true` com a marcação perdida; a tela liberava o
 * Tira-Dúvidas e a primeira pergunta tomava um 403. Agora a falha volta como erro, e
 * a tela diz o estado real.
 */

const h = vi.hoisted(() => ({ sb: null as any, linha: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => ({ from: (t: string) => h.sb.client.from(t), raw: h.sb.client }) }));
vi.mock('@/lib/authz', () => ({
  getDashboardView: () => 'colaborador',
  findColabByEmail: async () => ({ id: 'c1' }),
  canViewColabJourney: () => true,
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ colaborador: { id: 'c1' }, empresaId: 'e1' }),
  requireAdminAction: async () => ({}),
  getAuthenticatedEmailFromAction: async () => 'maria@escola.br',
  assertTenantAccessAction: async () => null,
}));

import { marcarConteudoConsumido } from '@/actions/temporadas';

const TRILHA = { empresa_id: 'e1', colaborador_id: 'c1', temporada_plano: [{ semana: 1, tipo: 'conteudo' }] };

beforeEach(() => {
  h.linha = null;
  h.sb = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'trilhas' ? TRILHA : tabela === 'temporada_semana_progresso' ? h.linha : null),
  });
});

describe('marcarConteudoConsumido: a gravação é checada', () => {
  it('🔴 linha existente que não atualizou: erro, nunca `ok`', async () => {
    h.linha = { id: 'p1', status: 'pendente', iniciado_em: null, conteudo_consumido: false };
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout no pool' });
    const r: any = await marcarConteudoConsumido('t1', 1);
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain('timeout no pool');
  });

  it('🔴 semana sem linha que não inseriu: erro, nunca `ok`', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'insert', mensagem: 'violação de constraint' });
    const r: any = await marcarConteudoConsumido('t1', 1);
    expect(r.ok).toBeUndefined();
    expect(r.error).toContain('violação de constraint');
  });

  it('gravou: `ok`, com o consumo marcado e o status pela régua', async () => {
    h.linha = { id: 'p1', status: 'concluido', iniciado_em: '2026-09-01T00:00:00Z', conteudo_consumido: false };
    const r: any = await marcarConteudoConsumido('t1', 1);
    expect(r).toEqual({ ok: true });
    const escrita = h.sb.escritas.find((e: any) => e.tabela === 'temporada_semana_progresso' && e.op === 'update');
    expect(escrita.payload.conteudo_consumido).toBeTruthy();
    // Abrir o conteúdo de uma semana concluída não a reabre.
    expect(escrita.payload.status).toBe('concluido');
  });

  it('a falha de leitura do progresso continua falhando alto (já era assim)', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await marcarConteudoConsumido('t1', 1);
    expect(r.error).toContain('timeout no pool');
  });
});
