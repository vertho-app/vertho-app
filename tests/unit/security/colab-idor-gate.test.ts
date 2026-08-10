import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Auditoria 23/07 (grupo C — IDOR cross-colaborador): actions resolviam o colab
 * por email/colabId vindos do CLIENTE. Qualquer autenticado (e às vezes nem
 * isso) lia dado de qualquer pessoa. Fix: identidade da SESSÃO
 * (ctx.email / getAuthenticatedEmailFromAction) ou gate de posse
 * canViewColabJourney (self, gestor da área, RH/tutor do tenant, platform admin).
 */

let sessao: any = null;

const FIXTURES: Record<string, any> = {
  'a@x.com': { id: 'c1', empresa_id: 'emp-A', area_depto: 'Ped', gestor_email: 'chefe.ped@x.com', nome_completo: 'Ana', cargo: 'Prof', foto_url: 'f', avatar_preset: 'p' },
  'b@x.com': { id: 'c2', empresa_id: 'emp-A', area_depto: 'Comercial', gestor_email: 'g@x.com', nome_completo: 'Beto', cargo: 'Vendedor' },
  'c@y.com': { id: 'c3', empresa_id: 'emp-B', area_depto: 'Ped', gestor_email: 'g@x.com', nome_completo: 'Caio', cargo: 'Prof' },
};

const findColabByEmailMock = vi.fn(async (email: string, _cols?: string) => FIXTURES[String(email).trim().toLowerCase()] || null);

function makeClient() {
  const from = () => {
    const b: any = {
      select: () => b, eq: () => b, in: () => b, not: () => b, or: () => b,
      order: () => b, limit: () => b, neq: () => b, is: () => b,
      update: () => b, insert: () => b,
      single: async () => ({ data: { id: 't1' }, error: null }),
      maybeSingle: async () => ({ data: { id: 't1' }, error: null }),
      then: undefined,
    };
    return b;
  };
  return { from };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => {
    if (!sessao) throw new Error('UNAUTHORIZED');
    return sessao;
  },
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    findColabByEmail: (email: string, cols?: string) => findColabByEmailMock(email, cols),
    getUserContext: async () => sessao,
  };
});

import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { loadTrilhaAtual } from '@/app/dashboard/praticar/praticar-actions';
import { loadUltimosVideosColab } from '@/actions/video-analytics';
import { loadAvatarData } from '@/app/dashboard/dashboard-actions';

const colabA = { email: 'a@x.com', role: 'colaborador', empresaId: 'emp-A', colaborador: { id: 'c1', area_depto: 'Ped' }, isPlatformAdmin: false };
// Gestor do Beto (`b@x.com`) — a régua é `gestor_email`, não a área (F4, 10/08).
const gestorComercial = { email: 'g@x.com', role: 'gestor', empresaId: 'emp-A', colaborador: { id: 'g1', email: 'g@x.com', area_depto: 'Comercial' }, isPlatformAdmin: false };
const rhA = { email: 'rh@x.com', role: 'rh', empresaId: 'emp-A', colaborador: { id: 'rh1' }, isPlatformAdmin: false };

beforeEach(() => { sessao = null; findColabByEmailMock.mockClear(); });

describe('loadTemporadaConcluida — posse via canViewColabJourney', () => {
  it('self passa do gate (erro, se houver, é de dado)', async () => {
    sessao = colabA;
    const r: any = await loadTemporadaConcluida('a@x.com');
    expect(r.error).not.toMatch(/permissão/i);
  });

  it('colaborador NÃO vê a temporada de outro colab do mesmo tenant', async () => {
    sessao = colabA;
    const r: any = await loadTemporadaConcluida('b@x.com');
    expect(r.error).toMatch(/permissão/i);
  });

  it('gestor vê o PRÓPRIO liderado', async () => {
    sessao = gestorComercial;
    const r: any = await loadTemporadaConcluida('b@x.com');
    expect(r.error).not.toMatch(/permissão/i);
  });

  it('gestor NÃO vê quem não é liderado dele (mesmo tenant)', async () => {
    sessao = { ...gestorComercial, colaborador: { id: 'g1', email: 'outro.gestor@x.com' } };
    const r: any = await loadTemporadaConcluida('b@x.com'); // gestor_email = g@x.com
    expect(r.error).toMatch(/permissão/i);
  });

  it('RH NÃO vê colab de outro tenant', async () => {
    sessao = rhA;
    const r: any = await loadTemporadaConcluida('c@y.com'); // emp-B
    expect(r.error).toMatch(/permissão/i);
  });
});

describe('loadTrilhaAtual — identidade vem da sessão', () => {
  it('sem sessão → Não autenticado (antes nem auth tinha)', async () => {
    const r: any = await loadTrilhaAtual('b@x.com');
    expect(r.error).toMatch(/autenticado/i);
  });

  it('ignora o email do client e usa o da SESSÃO', async () => {
    sessao = colabA;
    const r: any = await loadTrilhaAtual('b@x.com');
    expect(findColabByEmailMock).toHaveBeenCalledWith('a@x.com', expect.anything());
    expect(r.colaborador?.id).toBe('c1');
  });
});

describe('loadUltimosVideosColab — identidade vem da sessão', () => {
  it('ignora o email do client e usa o da SESSÃO', async () => {
    sessao = colabA;
    await loadUltimosVideosColab('b@x.com', 3);
    expect(findColabByEmailMock).toHaveBeenCalledWith('a@x.com', 'id');
  });
});

describe('loadAvatarData — hint de outra pessoa exige posse', () => {
  it('sem sessão → null', async () => {
    expect(await loadAvatarData('b@x.com')).toBeNull();
  });

  it('self → dados', async () => {
    sessao = colabA;
    const r: any = await loadAvatarData('a@x.com');
    expect(r?.nome_completo).toBe('Ana');
  });

  it('colaborador NÃO consulta avatar de outro colab', async () => {
    sessao = colabA;
    expect(await loadAvatarData('b@x.com')).toBeNull();
  });

  it('RH do tenant consulta (posse)', async () => {
    sessao = rhA;
    const r: any = await loadAvatarData('b@x.com');
    expect(r?.nome_completo).toBe('Beto');
  });
});
