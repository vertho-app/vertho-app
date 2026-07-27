import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `fetchColabPorId` lia `colaboradores` com service-role e SEM filtro de tenant
 * (o próprio cabeçalho de relatorio-core.ts admitia: "fetchColabPorId não filtra
 * empresa → IDOR cross-tenant"). O gate do grupo C tirou o endpoint HTTP; aqui
 * fechamos o dado: o tenant é descoberto e depois COBRADO.
 *
 * O que este teste prova: com `empresaIdEsperado`, colab de outro tenant vira
 * null — e a leitura dos dados passa por `tenantDb`, não pelo client raw.
 */

// Registra por onde cada leitura de `colaboradores` passou.
const leiturasRaw: string[] = [];
const leiturasTenant: Array<{ empresaId: string; cols: string }> = [];

// Banco de mentira: dois colabs, tenants diferentes.
const COLABS: Record<string, any> = {
  'c-empA': { id: 'c-empA', empresa_id: 'emp-A', nome_completo: 'Alice', perfil_dominante: 'D' },
  'c-empB': { id: 'c-empB', empresa_id: 'emp-B', nome_completo: 'Bruno', perfil_dominante: 'I' },
};

function builder(onSelect: (cols: string) => void, resolve: (id: string) => any) {
  let filtroId = '';
  const b: any = {
    select: (c = '') => { onSelect(c); return b; },
    eq: (col: string, val: string) => { if (col === 'id') filtroId = val; return b; },
    maybeSingle: async () => ({ data: resolve(filtroId) || null, error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => builder(
      (cols) => leiturasRaw.push(`${table}:${cols}`),
      (id) => (COLABS[id] ? { empresa_id: COLABS[id].empresa_id } : null),
    ),
  }),
}));

// tenantDb real injeta `.eq('empresa_id', tenantId)`; aqui o mock APLICA o filtro,
// senão o teste não distinguiria escopado de não-escopado.
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: (empresaId: string) => ({
    from: (table: string) => builder(
      (cols) => leiturasTenant.push({ empresaId, cols: `${table}:${cols}` }),
      (id) => {
        const c = COLABS[id];
        return c && c.empresa_id === empresaId ? c : null;
      },
    ),
  }),
}));

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: vi.fn() }));

import { fetchColabPorId } from '@/lib/relatorio-comportamental/relatorio-core';

beforeEach(() => { leiturasRaw.length = 0; leiturasTenant.length = 0; });

describe('fetchColabPorId: tenant descoberto e cobrado', () => {
  it('sem empresaIdEsperado (platform admin) devolve o colab — cross-tenant é o mandato dele', async () => {
    const colab = await fetchColabPorId('c-empB');
    expect(colab?.nome_completo).toBe('Bruno');
  });

  it('empresaIdEsperado divergente → null (IDOR fechado)', async () => {
    const colab = await fetchColabPorId('c-empB', 'emp-A');
    expect(colab).toBeNull();
  });

  it('empresaIdEsperado igual → devolve normalmente', async () => {
    const colab = await fetchColabPorId('c-empA', 'emp-A');
    expect(colab?.nome_completo).toBe('Alice');
  });

  it('os DADOS saem por tenantDb do tenant do colab; o raw só descobre o tenant', async () => {
    await fetchColabPorId('c-empA');
    expect(leiturasRaw).toEqual(['colaboradores:empresa_id']); // bootstrap: só a coluna do tenant
    expect(leiturasTenant).toHaveLength(1);
    expect(leiturasTenant[0].empresaId).toBe('emp-A');
    expect(leiturasTenant[0].cols).not.toBe('colaboradores:empresa_id'); // as CIS_COLUMNS
  });

  it('colabId inexistente → null, sem tentar ler dado nenhum', async () => {
    expect(await fetchColabPorId('c-fantasma')).toBeNull();
    expect(leiturasTenant).toHaveLength(0);
  });

  it('colabId vazio → null sem tocar o banco', async () => {
    expect(await fetchColabPorId('')).toBeNull();
    expect(leiturasRaw).toHaveLength(0);
  });
});
