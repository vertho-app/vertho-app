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

vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => makeClient(),
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => makeClient() }));

import {
  togglePerfilComportamental,
  toggleMapeamentoCenarios,
  toggleVotacao,
} from '@/actions/votacao';

const EMP = 'emp-1';

beforeEach(() => { configGravada = null; });

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
