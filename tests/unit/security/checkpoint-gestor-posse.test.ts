import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F6 da auditoria de 09-10/08/2026.
 *
 * `salvarCheckpointGestor` tinha gate só de PAPEL: qualquer gestor/RH de
 * QUALQUER tenant passava. O `trilhaId` vinha do cliente, a trilha era buscada
 * por id sem `empresa_id`, e o payload carimbava `empresa_id: trilha.empresa_id`
 * — o tenant do registro vinha do próprio pedido. O DELETE apagava o checkpoint
 * do tenant alheio; o INSERT gravava lá uma avaliação ASSINADA com o `gestor_id`
 * de quem chamou.
 *
 * Três guards deixaram passar: `ownership-guard` não enxerga este idioma de gate,
 * `dashboard-isolation` só proíbe os nomes email/colaboradorId/empresaId, e
 * `tenant-mutation-guard` não cobre `checkpoints_gestor`. Daí este teste.
 */

let sessao: any = null;

const TRILHAS: Record<string, any> = {
  'tr-A': { id: 'tr-A', empresa_id: 'emp-A', colaborador_id: 'c1' },
  'tr-B': { id: 'tr-B', empresa_id: 'emp-B', colaborador_id: 'c3' },
};
const COLABS: Record<string, any> = {
  c1: { id: 'c1', empresa_id: 'emp-A', area_depto: 'Ensino', gestor_email: 'g@a.com' },
  c2: { id: 'c2', empresa_id: 'emp-A', area_depto: 'Financeiro', gestor_email: 'outro@a.com' },
  c3: { id: 'c3', empresa_id: 'emp-B', area_depto: 'Ensino', gestor_email: 'g@a.com' },
};

const { upsertMock, deleteMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(async (_payload: any, _opts?: any) => ({ error: null })),
  deleteMock: vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) })),
}));

function makeClient() {
  const from = (tabela: string) => {
    const filtros: Record<string, any> = {};
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => { filtros[col] = val; return b; },
      in: () => b, not: () => b, or: () => b, order: () => b, limit: () => b,
      neq: () => b, is: () => b, ilike: () => b, update: () => b, insert: () => b,
      upsert: (payload: any, opts: any) => upsertMock(payload, opts),
      delete: deleteMock,
      maybeSingle: async () => {
        const fonte = tabela === 'trilhas' ? TRILHAS : tabela === 'colaboradores' ? COLABS : {};
        const row = (fonte as any)[filtros.id];
        if (!row) return { data: null, error: null };
        if (filtros.empresa_id && row.empresa_id !== filtros.empresa_id) return { data: null, error: null };
        return { data: row, error: null };
      },
      single: async () => ({ data: null, error: null }),
    };
    return b;
  };
  return { from };
}

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => makeClient() }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => sessao?.email || null,
}));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, getUserContext: async () => sessao };
});

import { salvarCheckpointGestor } from '@/app/dashboard/gestor/equipe-evolucao/actions';

const gestorA = { email: 'g@a.com', role: 'gestor', isPlatformAdmin: false, colaborador: { id: 'g1', email: 'g@a.com', empresa_id: 'emp-A', area_depto: 'Ensino' } };
const gestorAOutraArea = { email: 'g2@a.com', role: 'gestor', isPlatformAdmin: false, colaborador: { id: 'g2', email: 'g2@a.com', empresa_id: 'emp-A', area_depto: 'Financeiro' } };
const gestorSemArea = { email: 'g@a.com', role: 'gestor', isPlatformAdmin: false, colaborador: { id: 'g3', email: 'g@a.com', empresa_id: 'emp-A', area_depto: null } };
const rhB = { email: 'rh@b.com', role: 'rh', isPlatformAdmin: false, colaborador: { id: 'rh-b', empresa_id: 'emp-B', area_depto: null } };
const admin = { email: 'adm@vertho.ai', role: 'admin', isPlatformAdmin: true, colaborador: { id: 'adm', empresa_id: null, area_depto: null } };

const ok = { semana: 5, avaliacao: 'evoluindo', observacao: null };

beforeEach(() => { sessao = null; upsertMock.mockClear(); deleteMock.mockClear(); });

describe('salvarCheckpointGestor — posse antes de escrever', () => {
  it('gestor do tenant A NÃO grava na trilha do tenant B (o achado)', async () => {
    sessao = gestorA;
    const r: any = await salvarCheckpointGestor({ trilhaId: 'tr-B', ...ok });
    expect(r.error).toMatch(/não encontrada/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('RH do tenant B também não alcança a trilha do tenant A', async () => {
    sessao = rhB;
    const r: any = await salvarCheckpointGestor({ trilhaId: 'tr-A', ...ok });
    expect(r.error).toMatch(/não encontrada/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('trilha inexistente e trilha de outro tenant dão a MESMA resposta', async () => {
    sessao = gestorA;
    const inexistente: any = await salvarCheckpointGestor({ trilhaId: 'tr-ZZZ', ...ok });
    const deOutro: any = await salvarCheckpointGestor({ trilhaId: 'tr-B', ...ok });
    // distinguir as duas transformaria o endpoint num verificador de uuid alheio
    expect(inexistente.error).toBe(deOutro.error);
  });

  it('gestor grava na trilha do PRÓPRIO liderado (régua `gestor_email`)', async () => {
    sessao = gestorA;
    const r: any = await salvarCheckpointGestor({ trilhaId: 'tr-A', ...ok });
    expect(r.ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertMock.mock.calls[0] as any[];
    expect(payload.empresa_id).toBe('emp-A');
    expect(payload.gestor_id).toBe('g1');
    expect(opts).toEqual({ onConflict: 'trilha_id,semana' });
  });

  it('outro gestor do mesmo tenant é barrado (régua igual à da listagem)', async () => {
    sessao = gestorAOutraArea;
    const r: any = await salvarCheckpointGestor({ trilhaId: 'tr-A', ...ok });
    expect(r.error).toMatch(/fora do seu escopo/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('`area_depto` deixou de importar: gestor sem área grava no liderado dele', async () => {
    // 155 dos 161 gestores de Macaé têm area_depto nulo, e a régua antiga
    // (area_depto com fail-OPEN na listagem) dava a eles a tela do tenant
    // inteiro. Com `gestor_email` o campo vazio simplesmente não entra na conta.
    sessao = gestorSemArea;
    const dentro: any = await salvarCheckpointGestor({ trilhaId: 'tr-A', ...ok });
    expect(dentro.ok).toBe(true);
    upsertMock.mockClear();
    const fora: any = await salvarCheckpointGestor({ trilhaId: 'tr-B', ...ok });
    expect(fora.error).toMatch(/não encontrada/i);   // o tenant continua fechado
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('platform admin alcança qualquer tenant', async () => {
    sessao = admin;
    const r: any = await salvarCheckpointGestor({ trilhaId: 'tr-B', ...ok });
    expect(r.ok).toBe(true);
    expect((upsertMock.mock.calls[0] as any[])[0].empresa_id).toBe('emp-B');
  });

  it('não usa mais delete+insert (o par não era atômico)', async () => {
    sessao = gestorA;
    await salvarCheckpointGestor({ trilhaId: 'tr-A', ...ok });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('semana e avaliação continuam validadas antes de qualquer query', async () => {
    sessao = gestorA;
    expect((await salvarCheckpointGestor({ trilhaId: 'tr-A', semana: 7, avaliacao: 'evoluindo' } as any)).error).toMatch(/semana/i);
    expect((await salvarCheckpointGestor({ trilhaId: 'tr-A', semana: 5, avaliacao: 'inventada' } as any)).error).toMatch(/avalia/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
