import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * 03/10/2026 (decisão do dono, revisão de 02/10): `content.manage` saiu do papel
 * `rh`. Com ela, o RH alcançava pelo action id, DENTRO da própria empresa, cerca
 * de 80 exports de operação da Vertho: gerar conteúdo e kits com IA paga,
 * Cenários B, upload e exclusão de conteúdo, manuscrito, PPP, competências. Isso
 * contradizia a decisão de 24/08 ("a Vertho opera, o cliente consome").
 *
 * Os gates aqui são os REAIS (`requireEmpresaSupabase`, `requireLinhaSupabase`,
 * `protectedAction`, `can` com `BASE_ROLE_PERMISSIONS`). Só a sessão é simulada,
 * e `permission_overrides` volta vazio: o teste mede o CÓDIGO. Medido em
 * 03/10/2026: não há override dando `content.manage` ao papel rh nem a usuário.
 *
 * ⚠️ A action de temporadas (`prepararEntregasJornada`) já era barrada ANTES da
 * mudança, por outro cadeado: `protectedAction` exige platform admin. O caso
 * fica aqui porque a decisão é sobre o conjunto, mas a prova de que a CHAVE saiu
 * é a de `gerarConteudoIA`, `gerarKit` e dos gates genéricos, que só barram o RH
 * da própria empresa por causa dela.
 */
const estado = vi.hoisted(() => ({ ctx: null as any }));

const sb = criarSupabaseMock({ lista: () => [], resolver: () => null });

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: estado.ctx ? { email: estado.ctx.email } : null }, error: null }) },
  }),
}));
vi.mock('@/lib/authz', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getUserContext: async () => estado.ctx,
  isPlatformAdmin: async () => !!estado.ctx?.isPlatformAdmin,
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn(async () => {}) }));

// O que um gate aberto deixaria acontecer (spies), e o resto das dependências.
const efeitos = vi.hoisted(() => ({
  callAI: vi.fn(async () => '{}'),
  getModelForTask: vi.fn(async () => 'claude-sonnet-4-6'),
}));
vi.mock('@/actions/ai-client', () => ({ callAI: efeitos.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: efeitos.getModelForTask, DEFAULT_TASK_MODELS: {}, MODELOS_DISPONIVEIS: [] }));
vi.mock('@/lib/gemini-tts', () => ({ extractNarration: () => '', generatePodcastAudio: vi.fn() }));
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn() }, runs: { retrieve: vi.fn() } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/season-engine/kit/plano-coorte', () => ({ levantarPlanoKitsCoorte: vi.fn() }));
vi.mock('@/lib/season-engine/kit/brief', () => ({ resolverOuCriarBrief: vi.fn(), gerarKitDesafio: vi.fn() }));
vi.mock('@/lib/season-engine/perfil-publico', () => ({ resolverPerfilPublicoDaEmpresa: vi.fn(async () => null) }));

import { gerarConteudoIA } from '@/actions/conteudos';
import { gerarKit } from '@/actions/kits';
import { prepararEntregasJornada } from '@/actions/temporadas';
import { requireEmpresaSupabase, requireLinhaSupabase } from '@/lib/admin-supabase';

const EMPRESA_DO_RH = 'emp-A';
const rhDaEmpresa = {
  email: 'rh@empresa-a.test', role: 'rh', empresaId: EMPRESA_DO_RH, isPlatformAdmin: false,
  colaborador: { id: 'rh-1', empresa_id: EMPRESA_DO_RH },
};
const master = {
  email: 'master@vertho.ai', role: 'colaborador', empresaId: null, isPlatformAdmin: true,
  platformAdminRole: 'master', colaborador: null,
};
const SEM_PERMISSAO = /FORBIDDEN: permissão necessária content\.manage/;
const FORBIDDEN = /FORBIDDEN/;

/** Leituras que não são do próprio gate (overrides de permissão). */
const leiturasForaDoGate = () => sb.chamadas.filter((c) => c.tabela !== 'permission_overrides');

beforeEach(() => {
  sb.reset();
  efeitos.callAI.mockClear();
  efeitos.getModelForTask.mockClear();
});

describe('RH da própria empresa sem content.manage', () => {
  it('🔴 gerarConteudoIA: o RH é barrado pela permissão, sem IA e sem escrita', async () => {
    estado.ctx = rhDaEmpresa;
    const r: any = await gerarConteudoIA({
      formato: 'texto', competencia: 'Comunicação', descritor: 'Escuta ativa', empresaId: EMPRESA_DO_RH,
    } as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(SEM_PERMISSAO);
    expect(efeitos.callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toEqual([]);
    expect(leiturasForaDoGate()).toEqual([]);
  });

  it('🔴 gerarKit: o RH é barrado pela permissão, sem IA e sem escrita', async () => {
    estado.ctx = rhDaEmpresa;
    const r: any = await gerarKit({
      competencia: 'Comunicação', descritor: 'Escuta ativa', disc: 'D', empresaId: EMPRESA_DO_RH,
    } as any);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(SEM_PERMISSAO);
    expect(efeitos.callAI).not.toHaveBeenCalled();
    expect(sb.escritas).toEqual([]);
  });

  it('🔴 prepararEntregasJornada (temporadas): o RH é barrado na própria empresa', async () => {
    estado.ctx = rhDaEmpresa;
    const r: any = await prepararEntregasJornada({ empresaId: EMPRESA_DO_RH });
    expect(r.success).toBe(false);
    expect(r.code).toBe('FORBIDDEN');
    expect(leiturasForaDoGate()).toEqual([]);
  });

  it('🔴 os gates genéricos por onde passam os ~80 exports barram o RH da PRÓPRIA empresa', async () => {
    estado.ctx = rhDaEmpresa;
    await expect(requireEmpresaSupabase(EMPRESA_DO_RH, 'content.manage', 'teste')).rejects.toThrow(SEM_PERMISSAO);
    await expect(requireLinhaSupabase('micro_conteudos', 'c-1', 'content.manage', 'teste')).rejects.toThrow(SEM_PERMISSAO);
    // Permissão antes do banco: nem a linha foi lida.
    expect(leiturasForaDoGate()).toEqual([]);
  });

  it('a chave nova não reabre nada disso: simulador.casos.manage passa só o gate dela', async () => {
    estado.ctx = rhDaEmpresa;
    await expect(requireEmpresaSupabase(EMPRESA_DO_RH, 'simulador.casos.manage', 'teste')).resolves.toBeTruthy();
    await expect(requireEmpresaSupabase(EMPRESA_DO_RH, 'content.manage', 'teste')).rejects.toThrow(FORBIDDEN);
  });
});

describe('platform admin segue passando (controle positivo)', () => {
  it('gerarConteudoIA e gerarKit passam do gate e param na validação do argumento', async () => {
    estado.ctx = master;
    const c: any = await gerarConteudoIA({ empresaId: EMPRESA_DO_RH } as any);
    expect(c.success).toBe(false);
    expect(c.error).toMatch(/obrigat/);
    expect(c.error).not.toMatch(FORBIDDEN);
    const k: any = await gerarKit({ empresaId: EMPRESA_DO_RH } as any);
    expect(k.success).toBe(false);
    expect(k.error).toMatch(/obrigat/);
    expect(k.error).not.toMatch(FORBIDDEN);
  });

  it('prepararEntregasJornada passa do gate (para em "sem colaboradores", não em FORBIDDEN)', async () => {
    estado.ctx = master;
    const r: any = await prepararEntregasJornada({ empresaId: EMPRESA_DO_RH });
    expect(r.code).not.toBe('FORBIDDEN');
    expect(r.error).toMatch(/Sem colaboradores/);
  });

  it('os gates genéricos aceitam a plataforma', async () => {
    estado.ctx = master;
    await expect(requireEmpresaSupabase(EMPRESA_DO_RH, 'content.manage', 'teste')).resolves.toBeTruthy();
  });
});
