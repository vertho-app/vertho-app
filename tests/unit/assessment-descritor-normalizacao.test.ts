import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-I6 — a escrita manual de assessment (grid admin) NÃO pode persistir o
 * descritor com prefixo de código ("COO03_D5 — X"): a UNIQUE
 * (colaborador,competencia,descritor) não pega a variante limpa "X" gravada
 * pelo blueprint e o mesmo descritor vira 2 linhas (a 2ª nota sobrescreve a
 * 1ª no to-descriptors; o legado select-descriptors gera 2 semanas iguais).
 * A normalização na ESCRITA usa o mesmo normalizador da IA4
 * (lib/descritores.ts::stripCodigoDescritor).
 */

const upsertMock = vi.fn();
const deleteEqMock = vi.fn();
const requireEmpresaSupabaseMock = vi.fn();
const requirePermissionMock = vi.fn();
const assertTenantMock = vi.fn();
const createSupabaseAdminMock = vi.fn();

vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(),
  requireEmpresaSupabase: (...a: any[]) => requireEmpresaSupabaseMock(...a),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requirePermissionAction: (...a: any[]) => requirePermissionMock(...a),
  assertTenantAccessAction: (...a: any[]) => assertTenantMock(...a),
}));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: (...a: any[]) => createSupabaseAdminMock(...a),
}));

import { salvarNotaAssessment, deletarNotaAssessment } from '@/actions/assessment-descritores';

const PARAMS = {
  empresaId: 'emp-1',
  colaboradorId: 'colab-1',
  competencia: 'Coordenação',
  descritor: 'COO03_D6 — Busca de apoio',
  nota: 2.5,
  cargo: 'Analista',
};

describe('salvarNotaAssessment — normalização na escrita (F-I6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({ error: null });
    requireEmpresaSupabaseMock.mockResolvedValue({
      from: (t: string) => {
        if (t !== 'descriptor_assessments') throw new Error(`tabela inesperada: ${t}`);
        return { upsert: upsertMock };
      },
    });
  });

  it('grava o descritor SEM o prefixo de código', async () => {
    const r = await salvarNotaAssessment(PARAMS);
    expect(r.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload.descritor).toBe('Busca de apoio');
    expect(opts.onConflict).toBe('colaborador_id,competencia,descritor');
  });

  it('remove também o sufixo parentético ("X (COO03_D6)")', async () => {
    await salvarNotaAssessment({ ...PARAMS, descritor: 'Busca de apoio (COO03_D6)' });
    expect(upsertMock.mock.calls[0][0].descritor).toBe('Busca de apoio');
  });

  it('descritor já limpo passa intacto (com acento/caixa originais)', async () => {
    await salvarNotaAssessment({ ...PARAMS, descritor: 'Consciência de limites' });
    expect(upsertMock.mock.calls[0][0].descritor).toBe('Consciência de limites');
  });
});

describe('deletarNotaAssessment — mesma normalização da escrita', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ email: 'a@b.com' });
    assertTenantMock.mockResolvedValue(undefined);
    deleteEqMock.mockResolvedValue({ error: null });
    createSupabaseAdminMock.mockReturnValue({
      from: (t: string) => {
        if (t === 'colaboradores') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { empresa_id: 'emp-1' } }) }) }) };
        }
        if (t === 'descriptor_assessments') {
          // .delete().eq(colab).eq(comp).eq(descritor) — o 3º eq resolve
          const chain: any = { eq: vi.fn().mockReturnValue(null) };
          chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(chain).mockReturnValueOnce({ then: undefined });
          return {
            delete: () => ({
              eq: () => ({ eq: () => ({ eq: deleteEqMock }) }),
            }),
          };
        }
        throw new Error(`tabela inesperada: ${t}`);
      },
    });
  });

  it('apaga pela forma LIMPA quando o rótulo vem com prefixo', async () => {
    const r = await deletarNotaAssessment({
      colaboradorId: 'colab-1',
      competencia: 'Coordenação',
      descritor: 'COO03_D6 — Busca de apoio',
    });
    expect(r.success).toBe(true);
    expect(deleteEqMock).toHaveBeenCalledWith('descritor', 'Busca de apoio');
  });
});
