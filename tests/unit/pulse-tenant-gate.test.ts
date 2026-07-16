import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * As 3 actions de pulse recebem `empresaId` do CLIENTE. Elas já checavam papel
 * (rh/gestor/admin) e que o ciclo pertence ao empresaId pedido — mas isso
 * compara o pedido com o próprio pedido. Sem amarrar ao tenant da SESSÃO, um RH
 * do tenant A lia o clima organizacional do tenant B inteiro.
 */

let sessao: any = null;

function makeClient() {
  const from = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      // ciclo SEMPRE consistente com o empresaId pedido: é assim que o vazamento
      // passava despercebido — a checagem antiga aprovava.
      single: async () => ({ data: { id: 'ciclo-1', nome: 'C1', status: 'ativo', empresa_id: 'emp-B' }, error: null }),
      maybeSingle: async () => ({ data: { id: 'ciclo-1', empresa_id: 'emp-B' }, error: null }),
      then: undefined,
    };
    return b;
  };
  return { from };
}
const client = makeClient();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
}));

import { loadPulseDashboard } from '@/actions/pulse/dashboard';
import { loadPulseSignals } from '@/actions/pulse/signals';
import { obterTemasCiclo } from '@/actions/pulse/classify';

const OUTRO_TENANT = 'emp-B';

beforeEach(() => { sessao = null; });

describe('gate de tenant no pulse', () => {
  it('RH NÃO lê o pulse de outro tenant (dashboard)', async () => {
    sessao = { role: 'rh', empresaId: 'emp-A', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
    const r: any = await loadPulseDashboard(OUTRO_TENANT, 'ciclo-1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permissão/i);
  });

  it('RH NÃO lê os sinais de outro tenant', async () => {
    sessao = { role: 'rh', empresaId: 'emp-A', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
    const r: any = await loadPulseSignals(OUTRO_TENANT, 'ciclo-1');
    expect(r.ok).toBe(false);
  });

  it('RH NÃO lê os temas de outro tenant', async () => {
    sessao = { role: 'rh', empresaId: 'emp-A', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
    const r: any = await obterTemasCiclo(OUTRO_TENANT, 'ciclo-1');
    expect(r.ok).toBe(false);
  });

  it('gestor NÃO lê o pulse de outro tenant nem no recorte da própria área', async () => {
    sessao = { role: 'gestor', empresaId: 'emp-A', colaborador: { id: 'g-1', area_depto: 'Pedagógico' }, isPlatformAdmin: false };
    const r: any = await loadPulseDashboard(OUTRO_TENANT, 'ciclo-1', 'area', 'Pedagógico');
    expect(r.ok).toBe(false);
  });

  it('colaborador comum continua barrado pelo papel', async () => {
    sessao = { role: 'colaborador', empresaId: 'emp-A', colaborador: { id: 'c-1' }, isPlatformAdmin: false };
    const r: any = await loadPulseDashboard('emp-A', 'ciclo-1');
    expect(r.ok).toBe(false);
  });

  it('platform admin PASSA do gate de tenant (é global por definição)', async () => {
    sessao = { role: 'colaborador', empresaId: null, colaborador: null, isPlatformAdmin: true };
    const r: any = await loadPulseDashboard(OUTRO_TENANT, 'ciclo-1');
    // Passa do gate: o erro, se houver, é de DADO (sem agregados), não de permissão.
    expect(r.error).not.toMatch(/permissão/i);
  });
});
