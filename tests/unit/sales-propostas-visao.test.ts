/**
 * Regressão do FORBIDDEN que a mig 254 revelou em produção (14/09/2026).
 *
 * `requireRepresentativeOrAdminAction` dá PRECEDÊNCIA ao RC: quem tem linha ativa
 * em `sales_representatives` é classificado como `kind: 'representative'` mesmo
 * sendo platform admin. Com isso, `getProposal` recusava toda proposta cujo
 * `representante_id` não fosse o RC dele — e desde que a mig 254 permitiu
 * proposta SEM RC (`representante_id NULL`), um admin+RC não abria NENHUMA
 * proposta do deal desk: `null !== idDoRcDele` caía no ramo anti-IDOR.
 *
 * O que estes testes travam:
 *   · platform admin abre proposta sem RC e proposta de outro RC (visão de canal);
 *   · RC PURO continua trancado nas próprias — a correção não pode virar IDOR;
 *   · `listProposals(undefined, 'canal')` é verificada por IDENTIDADE: RC puro
 *     pedindo o canal leva FORBIDDEN, não a lista;
 *   · sem o argumento, o portal do RC segue escopado mesmo para admin+RC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';

const RC_RODRIGO = 'c2105dc1-7d4f-4a57-a74b-ac189db07cd7';
const RC_OUTRO = '25463ec9-45c6-4ee2-b864-5bc57ff75e4b';

let sb: SupabaseMock = criarSupabaseMock();

/** Quem é o chamador: RC puro, admin+RC, ou admin puro. */
let chamador: 'rc' | 'admin-rc' | 'admin';

const gate = vi.fn(async () => {
  if (chamador === 'admin') return { kind: 'admin' as const, email: 'juliane@vertho.ai' };
  if (chamador === 'admin-rc') {
    return {
      kind: 'representative' as const,
      email: 'rodrigo@vertho.ai',
      rep: { id: RC_RODRIGO, status: 'active' },
    };
  }
  return {
    kind: 'representative' as const,
    email: 'demo-rc-rafael@vertho.ai',
    rep: { id: RC_OUTRO, status: 'active' },
  };
});

const ehAdminPlataforma = vi.fn(async (email: string) => email !== 'demo-rc-rafael@vertho.ai');

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeOrAdminAction: () => gate(),
  requireRepresentativeAction: vi.fn(),
  requireCommercialAdminAction: vi.fn(),
  assertRepresentativeOwnership: vi.fn(),
}));
vi.mock('@/lib/authz', () => ({ isPlatformAdmin: (e: string) => ehAdminPlataforma(e) }));

import { getProposal, listProposals } from '@/actions/sales/proposals';

/** Proposta do deal desk: sem RC. */
const SEM_RC = {
  id: 'prop-deal-desk', proposal_number: 'PROP-2026-0008', representante_id: null, status: 'draft',
};
const DO_RODRIGO = { id: 'prop-rodrigo', proposal_number: 'PROP-2026-0003', representante_id: RC_RODRIGO, status: 'draft' };

function mock() {
  return criarSupabaseMock({
    resolver: () => SEM_RC,
    lista: (tabela) => (tabela === 'sales_proposals' ? [SEM_RC, DO_RODRIGO] : []),
  });
}

beforeEach(() => {
  sb = mock();
  chamador = 'admin-rc';
  gate.mockClear();
});

describe('getProposal — admin que também é RC', () => {
  it('abre proposta SEM RC (o caso que deu FORBIDDEN em produção)', async () => {
    const r: any = await getProposal('prop-deal-desk');
    expect(r.success).toBe(true);
    expect(r.data.proposal_number).toBe('PROP-2026-0008');
  });

  it('abre proposta de OUTRO RC — a visão dele é a do canal', async () => {
    sb = criarSupabaseMock({ resolver: () => ({ ...DO_RODRIGO, representante_id: RC_OUTRO }) });
    const r: any = await getProposal('prop-x');
    expect(r.success).toBe(true);
  });

  it('vê os comentários internos, que antes exigiam kind === admin', async () => {
    sb = criarSupabaseMock({
      resolver: () => SEM_RC,
      lista: (tabela) => (tabela === 'sales_admin_comments' ? [{ id: 'c1', comment: 'interno' }] : []),
    });
    const r: any = await getProposal('prop-deal-desk');
    expect(r.comments).toHaveLength(1);
  });
});

describe('getProposal — anti-IDOR preservado', () => {
  it('RC PURO não abre proposta sem RC', async () => {
    chamador = 'rc';
    const r: any = await getProposal('prop-deal-desk');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/FORBIDDEN/);
  });

  it('RC PURO não abre proposta de outro RC', async () => {
    chamador = 'rc';
    sb = criarSupabaseMock({ resolver: () => DO_RODRIGO });
    const r: any = await getProposal('prop-rodrigo');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/FORBIDDEN/);
  });

  it('RC abre a própria', async () => {
    chamador = 'rc';
    sb = criarSupabaseMock({ resolver: () => ({ ...DO_RODRIGO, representante_id: RC_OUTRO }) });
    const r: any = await getProposal('prop-rodrigo');
    expect(r.success).toBe(true);
  });
});

describe('listProposals — a visão é verificada por identidade', () => {
  it("admin+RC pedindo 'canal' vê tudo, sem filtro de RC", async () => {
    const r: any = await listProposals(undefined, 'canal');
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(sb.usou('sales_proposals', 'eq', 'representante_id')).toBe(false);
  });

  it("RC PURO pedindo 'canal' leva FORBIDDEN, não a lista", async () => {
    chamador = 'rc';
    const r: any = await listProposals(undefined, 'canal');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/FORBIDDEN/);
    expect(sb.chamadas.filter((c) => c.tabela === 'sales_proposals')).toHaveLength(0);
  });

  it('sem o argumento, admin+RC segue escopado ao próprio RC (portal dele)', async () => {
    const r: any = await listProposals();
    expect(r.success).toBe(true);
    expect(sb.usou('sales_proposals', 'eq', 'representante_id')).toBe(true);
  });

  it('admin puro sem argumento vê o canal (comportamento de antes)', async () => {
    chamador = 'admin';
    const r: any = await listProposals();
    expect(r.success).toBe(true);
    expect(sb.usou('sales_proposals', 'eq', 'representante_id')).toBe(false);
  });

  it("no canal, o filtro por representante continua funcionando", async () => {
    await listProposals({ representanteId: RC_RODRIGO }, 'canal');
    expect(sb.usou('sales_proposals', 'eq', 'representante_id')).toBe(true);
  });
});
