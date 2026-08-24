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
// Auditoria 22/08 (A2/A3): permite exercitar a dimensão PERMISSÃO, não só a de tenant.
let temPermissao = true;

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
vi.mock('@/lib/permissions', () => ({ can: async () => temPermissao }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/vercel-domain', () => ({ addVercelDomain: vi.fn(), removeVercelDomain: vi.fn() }));
vi.mock('@/i18n/routing', () => ({ isAppLocale: () => true, locales: ['pt-BR', 'en-US'] }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(), DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/ia3-cenarios', () => ({ travaRegeneracao: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() }, runs: { retrieve: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: {} }));

import { salvarNotaAssessment, deletarNotaAssessment } from '@/actions/assessment-descritores';
import { _montarTrilhasLote_legacy } from '@/actions/fase4';
import { gerarCenariosBLote } from '@/actions/fase5/cenarios-b';
import { salvarCompetencia, excluirCompetencia, importarCompetenciasCSV, copiarBaseParaEmpresa } from '@/app/admin/competencias/actions';
import { excluirPPP } from '@/app/admin/ppp/actions';
import { salvarConfig, salvarLocaleEmpresa, atualizarProgramaModo, atualizarRole } from '@/app/admin/empresas/[empresaId]/configuracoes/actions';
// Auditoria 22/08 — A2 (sys_config), A3 (upload de perfil externo)
import { toggleVotacao, togglePerfilComportamental, toggleMapeamentoCenarios } from '@/actions/votacao';
import { setEmpresaFonteExterna, uploadPerfilPdf } from '@/actions/perfil-externo';
import { logAdminAction } from '@/lib/audit';
// H0 — um dos 15 call-sites que passam permissão que `rh` NÃO tem.
import { enqueueIA2Batch } from '@/actions/ia-pipeline-batch';

const OUTRO_TENANT = 'emp-B';
const rhEmpA = { role: 'rh', empresaId: 'emp-A', email: 'rh@a.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
const FORBIDDEN = /FORBIDDEN|acesso restrito|sem acesso/i;

beforeEach(() => {
  sessao = rhEmpA; tenantDoRegistro = 'emp-B'; temPermissao = true;
  vi.mocked(logAdminAction).mockClear();
});

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

  // ── Auditoria 22/08 — A2: 4 escritas em empresas.sys_config ────────────────
  // Estavam com `requireAdminSupabase('settings.company.manage')`, que confere
  // permissão e NÃO tenant. `settings.company.manage` está no role rh.

  it('A2 toggleVotacao — não abre/fecha a votação de outro tenant', async () => {
    await expect(toggleVotacao(OUTRO_TENANT, true)).rejects.toThrow(FORBIDDEN);
  });

  it('A2 togglePerfilComportamental — não bloqueia o perfil de outro tenant', async () => {
    await expect(togglePerfilComportamental(OUTRO_TENANT, false)).rejects.toThrow(FORBIDDEN);
  });

  it('A2 toggleMapeamentoCenarios — não libera/trava cenários de outro tenant', async () => {
    await expect(toggleMapeamentoCenarios(OUTRO_TENANT, true)).rejects.toThrow(FORBIDDEN);
  });

  it('A2 setEmpresaFonteExterna — não carimba opq32 num tenant que faz DISC nativo', async () => {
    await expect(setEmpresaFonteExterna(OUTRO_TENANT, 'opq32')).rejects.toThrow(FORBIDDEN);
  });

  // ── Auditoria 22/08 — A3: upload de perfil externo ─────────────────────────

  it('A3 uploadPerfilPdf — não grava PDF nem zera o perfil de colab de outro tenant', async () => {
    const fd = new FormData();
    fd.set('colab_id', 'c1');
    fd.set('fonte', 'opq32');
    await expect(uploadPerfilPdf(OUTRO_TENANT, fd)).rejects.toThrow(FORBIDDEN);
  });
});

/**
 * Auditoria 22/08 — a dimensão que o gate ANTERIOR conferia e que a troca ingênua
 * para `requireEmpresaSupabase` teria PERDIDO: para o papel `rh` aquele helper ignora
 * o parâmetro `permission` (só o ramo platform_admin chama `can`). Por isso os 5 sites
 * usavam `requireEmpresaSupabaseStrict`. Em 23/08 (H0) esse helper foi DOBRADO no
 * `requireEmpresaSupabase`, que passou a conferir a permissão para todo papel — o
 * `Strict` deixou de existir. Estes casos passam a cobrir os 28 call-sites, não 5.
 */
describe('permissão continua valendo para o RH, no PRÓPRIO tenant (A2/A3)', () => {
  it('toggleVotacao — RH da empresa certa SEM settings.company.manage é barrado', async () => {
    temPermissao = false;
    await expect(toggleVotacao('emp-A', true)).rejects.toThrow(FORBIDDEN);
  });

  it('setEmpresaFonteExterna — RH da empresa certa SEM a permissão é barrado', async () => {
    temPermissao = false;
    await expect(setEmpresaFonteExterna('emp-A', 'opq32')).rejects.toThrow(FORBIDDEN);
  });

  it('uploadPerfilPdf — RH da empresa certa SEM content.manage é barrado', async () => {
    temPermissao = false;
    const fd = new FormData();
    fd.set('colab_id', 'c1');
    await expect(uploadPerfilPdf('emp-A', fd)).rejects.toThrow(FORBIDDEN);
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

  it('A2 toggleVotacao — RH passa no PRÓPRIO tenant, com permissão', async () => {
    const r: any = await toggleVotacao('emp-A', true);
    expect(r.success).toBe(true);
  });

  it('colaborador sem role de RH é barrado MESMO no próprio tenant (salvarConfig)', async () => {
    sessao = { role: 'colaborador', empresaId: 'emp-A', email: 'c@a.com', colaborador: { id: 'c-1' }, isPlatformAdmin: false };
    await expect(salvarConfig('emp-A', { chave: 'valor' })).rejects.toThrow(FORBIDDEN);
  });
});

/**
 * A vigília do fechamento de gate (Sprint 0) só vale se ELA PRÓPRIA puder falhar.
 * Aqui provamos que o evento sai, e que os dois motivos são distinguíveis — é essa
 * distinção que decide se a notícia é "o fix funcionando" ou "quebrei um fluxo".
 */
describe('vigília: o gate negado registra em admin_audit_log', () => {
  it('cross-tenant → motivo `tenant`, mesmo_tenant=false (é o fix funcionando)', async () => {
    await expect(toggleVotacao(OUTRO_TENANT, true)).rejects.toThrow(FORBIDDEN);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    const arg: any = vi.mocked(logAdminAction).mock.calls[0][0];
    expect(arg.acao).toBe('gate.forbidden');
    expect(arg.alvo).toBe('toggleVotacao');
    expect(arg.resultado).toBe('erro');
    expect(arg.detalhes.motivo).toBe('tenant');
    expect(arg.detalhes.mesmo_tenant).toBe(false);
    // A coluna `empresa_id` tem FK: recebe o tenant de QUEM CHAMOU (real). O id PEDIDO,
    // que pode ser forjado, vai em `detalhes` — senão a FK derruba o insert e a vigília
    // fica cega justamente na sondagem cross-tenant.
    expect(arg.empresaId).toBe('emp-A');
    expect(arg.detalhes.empresa_id_pedido).toBe(OUTRO_TENANT);
  });

  it('sem permissão no PRÓPRIO tenant → motivo `permissao`, mesmo_tenant=true (candidato a fluxo quebrado)', async () => {
    temPermissao = false;
    await expect(toggleVotacao('emp-A', true)).rejects.toThrow(FORBIDDEN);
    const arg: any = vi.mocked(logAdminAction).mock.calls[0][0];
    expect(arg.detalhes.motivo).toBe('permissao');
    expect(arg.detalhes.mesmo_tenant).toBe(true);
    expect(arg.detalhes.permissao).toBe('settings.company.manage');
  });

  it('caminho legítimo NÃO gera evento (senão a vigília vira ruído)', async () => {
    const r: any = await toggleVotacao('emp-A', true);
    expect(r.success).toBe(true);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

/**
 * H0 (Sprint 1) — a garantia NOVA, que não existia antes de 23/08.
 *
 * `requireEmpresaSupabase` conferia a permissão só no ramo platform_admin; para `rh`
 * bastava ser da empresa certa. Dos 28 call-sites, **15 passam permissão que `rh` não
 * tem** (`admin.access` ×8, `ai.audit.regenerate` ×7) — e até aqui um RH da empresa
 * certa atravessava todos eles chamando o action id direto.
 *
 * `enqueueIA2Batch` é um desses 15: exige `ai.audit.regenerate`, que NÃO está em
 * `BASE_ROLE_PERMISSIONS.rh`. Aqui `temPermissao = false` representa esse fato.
 */
describe('H0: permissão de plataforma barra o RH mesmo na PRÓPRIA empresa', () => {
  it('enqueueIA2Batch — RH da empresa certa, sem ai.audit.regenerate, é barrado', async () => {
    temPermissao = false;
    const r: any = await enqueueIA2Batch('emp-A');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(FORBIDDEN);

    const arg: any = vi.mocked(logAdminAction).mock.calls[0][0];
    expect(arg.alvo).toBe('enqueueIA2Batch');
    expect(arg.detalhes.motivo).toBe('permissao');
    expect(arg.detalhes.permissao).toBe('ai.audit.regenerate');
    // mesmo tenant: não é cross-tenant, é escalada de PERMISSÃO — a dimensão que o H0 fechou
    expect(arg.detalhes.mesmo_tenant).toBe(true);
  });

  it('platform admin com a permissão continua passando (não quebramos a plataforma)', async () => {
    sessao = { role: null, empresaId: null, email: 'admin@vertho.ai', colaborador: null, isPlatformAdmin: true };
    const r: any = await enqueueIA2Batch('emp-A');
    expect(r.error).not.toMatch(FORBIDDEN);
  });
});
