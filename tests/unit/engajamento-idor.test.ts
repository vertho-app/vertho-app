import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `registrarEventoTrilha` é `'use server'` → endpoint HTTP, e o `trilhaId` vem
 * do CLIENTE. O gate de sessão sozinho não basta: sem comparar a trilha com o
 * colaborador logado, qualquer autenticado injeta telemetria na trilha alheia,
 * já atribuída ao dono dela — lixo indistinguível do dado real.
 */

// ── Mock do Supabase encadeável: registra o que foi inserido ────────────────
const inserts: any[] = [];
let trilhaRow: any = null;

function makeClient() {
  const from = (table: string) => {
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: async () => ({ data: table === 'trilhas' ? trilhaRow : null, error: null }),
      insert: async (payload: any) => { inserts.push({ table, payload }); return { error: null }; },
    };
    return b;
  };
  return { from };
}
const client = makeClient();

let sessao: any = null;

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED: usuário não autenticado');
    return sessao;
  },
  requireAdminAction: async () => ({}),
}));

import { registrarEventoTrilha } from '@/actions/engajamento';

const TRILHA_DO_DONO = { empresa_id: 'emp-A', colaborador_id: 'colab-dono' };

beforeEach(() => {
  inserts.length = 0;
  trilhaRow = TRILHA_DO_DONO;
  sessao = { colaborador: { id: 'colab-dono' }, email: 'dono@x.com', isPlatformAdmin: false };
});

describe('registrarEventoTrilha', () => {
  it('registra o evento do DONO da trilha', async () => {
    const r = await registrarEventoTrilha({ trilhaId: 't1', semana: 3, pilula: 1, tipo: 'abertura' });
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({
      empresa_id: 'emp-A', colaborador_id: 'colab-dono', trilha_id: 't1', semana: 3, pilula: 1,
    });
  });

  it('NÃO registra evento na trilha de outro colaborador do mesmo tenant', async () => {
    sessao = { colaborador: { id: 'colab-intruso' }, email: 'intruso@x.com', isPlatformAdmin: false };
    const r = await registrarEventoTrilha({ trilhaId: 't1', semana: 3, tipo: 'abertura' });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('NÃO registra evento na trilha de OUTRO TENANT', async () => {
    sessao = { colaborador: { id: 'colab-de-outro-tenant' }, email: 'b@y.com', isPlatformAdmin: false };
    const r = await registrarEventoTrilha({ trilhaId: 't1', semana: 1, tipo: 'formato', formato: 'video' });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('NÃO registra quando a sessão não resolve colaborador (e-mail multi-tenant no apex)', async () => {
    sessao = { colaborador: null, email: 'samuel@vertho.ai', isPlatformAdmin: true };
    const r = await registrarEventoTrilha({ trilhaId: 't1', semana: 1 });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('não lança pro client quando não há sessão (best-effort)', async () => {
    sessao = null;
    const r = await registrarEventoTrilha({ trilhaId: 't1', semana: 1 });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('ignora trilha inexistente', async () => {
    trilhaRow = null;
    const r = await registrarEventoTrilha({ trilhaId: 'nao-existe', semana: 1 });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});
