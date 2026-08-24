import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Os toggles do painel de votação NÃO podem cascatear em tenant com fonte
 * externa de perfil (OPQ32/Hogan): lá o perfil nativo fica bloqueado para
 * sempre, então arrastar os cenários junto torna o mapeamento INALCANÇÁVEL —
 * o admin só conseguia liberar os dois ou bloquear os dois (Boehringer, 06/08).
 *
 * O gate em si é coberto por access-gates.test.ts; aqui trava a GRAVAÇÃO.
 */

let configAtual: any = {};
let configGravada: any = null;
// RH do PRÓPRIO tenant, com permissão — o caminho legítimo. O gate real roda sobre isto.
let sessao: any = null;

function makeClient() {
  const from = () => {
    const b: any = {
      select: () => b,
      eq: () => b,
      update: (patch: any) => { configGravada = patch.sys_config; return b; },
      maybeSingle: async () => ({ data: { sys_config: configAtual }, error: null }),
      then: (resolve: any) => resolve({ error: null }),
    };
    return b;
  };
  return { from };
}

/**
 * ⚠️ Auditoria 22/08 (A2): este arquivo mockava `@/lib/admin-supabase` INTEIRO — ou seja,
 * apagava o gate de autorização e exercitava só a cascata. Os 6 casos ficavam verdes com
 * a escrita cross-tenant aberta, e verde aqui não dizia nada sobre quem podia gravar.
 *
 * Agora mockamos os LEAFS (sessão e banco) e deixamos o gate REAL rodar:
 * `requireEmpresaSupabase` (que desde o H0 confere permissão E tenant). A cascata continua
 * sendo o objeto do teste; a diferença é que ela roda atrás do gate de verdade.
 * O cross-tenant e a permissão têm casos próprios em
 * `tests/unit/security/admin-actions-tenant-gate.test.ts`.
 */
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => makeClient() }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => sessao,
  requirePermissionAction: async () => sessao,
  requireAdminAction: async () => sessao,
  assertTenantAccessAction: async () => {},
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/permissions', () => ({ can: async () => true }));

import {
  togglePerfilComportamental,
  toggleMapeamentoCenarios,
  toggleVotacao,
} from '@/actions/votacao';

const EMP = 'emp-1';

beforeEach(() => {
  configGravada = null;
  sessao = { role: 'rh', empresaId: EMP, email: 'rh@emp.com', colaborador: { id: 'rh-1' }, isPlatformAdmin: false };
});

describe('tenant COM fonte externa (opq32)', () => {
  beforeEach(() => {
    configAtual = {
      perfil_externo_fonte: 'opq32',
      perfil_comportamental_liberado: false,
      mapeamento_cenarios_liberado: false,
    };
  });

  it('liberar cenários NÃO força o perfil a liberado', async () => {
    await toggleMapeamentoCenarios(EMP, true);
    expect(configGravada.mapeamento_cenarios_liberado).toBe(true);
    expect(configGravada.perfil_comportamental_liberado).toBe(false);
  });

  it('bloquear o perfil NÃO derruba os cenários', async () => {
    configAtual.mapeamento_cenarios_liberado = true;
    await togglePerfilComportamental(EMP, false);
    expect(configGravada.perfil_comportamental_liberado).toBe(false);
    expect(configGravada.mapeamento_cenarios_liberado).toBe(true);
  });

  it('FECHAR a votação não apaga a liberação de cenários recém-feita', async () => {
    configAtual.mapeamento_cenarios_liberado = true;
    await toggleVotacao(EMP, false);
    expect(configGravada.mapeamento_cenarios_liberado).toBe(true);
  });

  it('ABRIR a votação reinicia os cenários (rodada nova)', async () => {
    configAtual.mapeamento_cenarios_liberado = true;
    await toggleVotacao(EMP, true);
    expect(configGravada.mapeamento_cenarios_liberado).toBe(false);
  });
});

describe('tenant SEM fonte externa — cascata original preservada', () => {
  beforeEach(() => {
    configAtual = {
      perfil_comportamental_liberado: false,
      mapeamento_cenarios_liberado: false,
    };
  });

  it('liberar cenários arrasta o perfil (pré-requisito real aqui)', async () => {
    await toggleMapeamentoCenarios(EMP, true);
    expect(configGravada.perfil_comportamental_liberado).toBe(true);
  });

  it('bloquear o perfil derruba os cenários', async () => {
    configAtual.mapeamento_cenarios_liberado = true;
    await togglePerfilComportamental(EMP, false);
    expect(configGravada.mapeamento_cenarios_liberado).toBe(false);
  });
});
