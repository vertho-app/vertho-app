import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auditoria 23/07 (Grupo A — restante): actions administrativas gatavam só
 * PERMISSÃO (`requireAdminSupabase(perm)`) com empresaId/ids vindos do CLIENTE.
 * Como `users.manage`, `content.manage`, `settings.company.manage` e
 * `settings.locale.manage` estão no role rh (locale até no colaborador), um RH
 * de um tenant escrevia/apagava/promovia em OUTRO tenant.
 *
 * Fix: `requireEmpresaSupabase(empresaId, perm)` quando o tenant é parâmetro;
 * `requirePermissionAction(perm)` + leitura do tenant da LINHA/COLABORADOR +
 * `assertTenantAccessAction` quando o tenant é derivado de registro.
 *
 * Estas ações jogam FORBIDDEN (throw), não retornam { success: false }.
 */

let sessao: any = null;
// Tenant do REGISTRO alvo (a vítima). Nos testes cross-tenant é 'emp-B';
// no teste positivo é 'emp-A' (mesmo tenant do RH da sessão).
let tenantDoRegistro = 'emp-B';

function makeClient() {
  const from = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, not: () => b, or: () => b,
      order: () => b, limit: () => b, neq: () => b, is: () => b,
      update: () => b, delete: () => b, insert: () => b, upsert: () => b,
      single: async () => ({ data: { id: 'x', nome: 'Empresa', slug: 'emp', empresa_id: tenantDoRegistro }, error: null }),
      maybeSingle: async () => ({ data: { id: 'x', empresa_id: tenantDoRegistro }, error: null }),
      then: undefined, // await no builder devolve o próprio objeto (error = undefined)
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
  requireAdminAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  requirePermissionAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  // Mesma lógica do helper real (pura): platform admin passa; senão exige match.
  assertTenantAccessAction: async (auth: any, empresaId: string | null | undefined) => {
    if (!empresaId) throw new Error('BAD_REQUEST: empresaId obrigatório');
    if (auth.isPlatformAdmin) return;
    if (auth.empresaId !== empresaId) throw new Error('FORBIDDEN: sem acesso a esta empresa');
  },
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/vercel-domain', () => ({ addVercelDomain: vi.fn(), removeVercelDomain: vi.fn() }));
vi.mock('@/i18n/routing', () => ({ isAppLocale: () => true, locales: ['pt-BR', 'en-US'] }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(), DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/ia3-cenarios', () => ({ travaRegeneracao: vi.fn() }));

import { salvarNotaAssessment, deletarNotaAssessment } from '@/actions/assessment-descritores';
import { _montarTrilhasLote_legacy } from '@/actions/fase4';
import { gerarCenariosBLote } from '@/actions/fase5/cenarios-b';
import { salvarCompetencia, excluirCompetencia, importarCompetenciasCSV, copiarBaseParaEmpresa } from '@/app/admin/competencias/actions';
import { excluirPPP } from '@/app/admin/ppp/actions';
import { salvarConfig, salvarLocaleEmpresa, atualizarProgramaModo, atualizarRole } from '@/app/admin/empresas/[empresaId]/configuracoes/actions';

const OUTRO_TENANT = 'emp-B';
const rhEmpA = { role: 'rh', empresaId: 'emp-A', email: 'rh@a.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
const FORBIDDEN = /FORBIDDEN|acesso restrito|sem acesso/i;

beforeEach(() => { sessao = rhEmpA; tenantDoRegistro = 'emp-B'; });

describe('RH cross-tenant é barrado (Grupo A)', () => {
  it('salvarNotaAssessment — não grava nota em outro tenant', async () => {
    await expect(
      salvarNotaAssessment({ empresaId: OUTRO_TENANT, colaboradorId: 'c1', competencia: 'X', descritor: 'D', nota: 3 }),
    ).rejects.toThrow(FORBIDDEN);
  });

  it('deletarNotaAssessment — tenant derivado do colaborador bloqueia', async () => {
    await expect(
      deletarNotaAssessment({ colaboradorId: 'c1', competencia: 'X', descritor: 'D' }),
    ).rejects.toThrow(FORBIDDEN);
  });

  it('_montarTrilhasLote_legacy — não apaga/recria trilhas de outro tenant', async () => {
    await expect(_montarTrilhasLote_legacy(OUTRO_TENANT)).rejects.toThrow(FORBIDDEN);
  });

  it('gerarCenariosBLote — não lê PPP nem escreve cenários de outro tenant', async () => {
    await expect(gerarCenariosBLote(OUTRO_TENANT)).rejects.toThrow(FORBIDDEN);
  });

  it('salvarCompetencia — não adultera conteúdo de outro tenant', async () => {
    await expect(salvarCompetencia(OUTRO_TENANT, { nome: 'X' })).rejects.toThrow(FORBIDDEN);
  });

  it('excluirCompetencia — tenant derivado da linha bloqueia', async () => {
    // esta action envelopa o throw no try/catch e devolve { success: false }
    const r: any = await excluirCompetencia('comp-1');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);
  });

  it('importarCompetenciasCSV — não importa em lote pra outro tenant', async () => {
    await expect(importarCompetenciasCSV(OUTRO_TENANT, [{ nome: 'X' }])).rejects.toThrow(FORBIDDEN);
  });

  it('copiarBaseParaEmpresa — não copia base pra outro tenant', async () => {
    await expect(copiarBaseParaEmpresa(OUTRO_TENANT, 'base-1')).rejects.toThrow(FORBIDDEN);
  });

  it('excluirPPP — tenant derivado da linha bloqueia', async () => {
    await expect(excluirPPP('ppp-1')).rejects.toThrow(FORBIDDEN);
  });

  it('salvarConfig — não sobrescreve sys_config de outro tenant', async () => {
    await expect(salvarConfig(OUTRO_TENANT, { chave: 'valor' })).rejects.toThrow(FORBIDDEN);
  });

  it('salvarLocaleEmpresa — colaborador (dono de settings.locale.manage) não muda locale de outro tenant', async () => {
    sessao = { role: 'colaborador', empresaId: 'emp-A', email: 'c@a.com', colaborador: { id: 'c-1' }, isPlatformAdmin: false };
    await expect(salvarLocaleEmpresa(OUTRO_TENANT, 'en-US')).rejects.toThrow(FORBIDDEN);
  });

  it('atualizarProgramaModo — não muda programa de colab de outro tenant', async () => {
    await expect(atualizarProgramaModo('c1', 'piloto', OUTRO_TENANT)).rejects.toThrow(FORBIDDEN);
  });

  it('atualizarRole — não promove/rebaixa colab de outro tenant (escalada)', async () => {
    await expect(atualizarRole('c1', 'rh', OUTRO_TENANT)).rejects.toThrow(FORBIDDEN);
  });
});

describe('gates legítimos seguem abertos', () => {
  it('RH passa no PRÓPRIO tenant (excluirPPP — erro, se houver, é de dado)', async () => {
    tenantDoRegistro = 'emp-A'; // a linha é do mesmo tenant do RH
    const r: any = await excluirPPP('ppp-1');
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
  });

  it('RH passa no PRÓPRIO tenant (salvarConfig)', async () => {
    const r: any = await salvarConfig('emp-A', { chave: 'valor' });
    expect(r.error).toBeUndefined();
  });

  it('platform admin PASSA do gate de tenant (salvarCompetencia)', async () => {
    sessao = { role: null, empresaId: null, email: 'admin@vertho.ai', colaborador: null, isPlatformAdmin: true };
    const r: any = await salvarCompetencia(OUTRO_TENANT, { nome: 'X' });
    expect(r.error).toBeUndefined();
  });

  it('colaborador sem role de RH é barrado MESMO no próprio tenant (salvarConfig)', async () => {
    sessao = { role: 'colaborador', empresaId: 'emp-A', email: 'c@a.com', colaborador: { id: 'c-1' }, isPlatformAdmin: false };
    await expect(salvarConfig('emp-A', { chave: 'valor' })).rejects.toThrow(FORBIDDEN);
  });
});
