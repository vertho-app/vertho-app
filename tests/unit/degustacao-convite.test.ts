import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Núcleo do lembrete do painel: o link da página de boas-vindas de um passaporte
 * vivo. Passaporte A vira B aqui, e só ele muda.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'eeeeeeeeeeeeeeeeeeee';

let sessao: any = null;
let isDemo = true;

const sb = criarSupabaseMock({
  resolver: (tabela) => {
    if (tabela === 'empresas') return { id: 'acme-demo-id', is_demo: isDemo };
    if (tabela === 'demo_prospect_sessions') return sessao;
    return null;
  },
});
sb.client.auth = { admin: {} };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => ({ id: `${slug}-id`, slug })),
}));

import { prepararConviteGuiado } from '@/lib/demo/degustacao-convite';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';

describe('lembrete com o convite B', () => {
  beforeEach(() => {
    sb.reset();
    isDemo = true;
    sessao = {
      prospect_name: 'Pedro Santos',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
      experience_version: 'A',
    };
  });

  it('passaporte A vivo vira B (escopado no tenant) e ganha o link da página', async () => {
    const r: any = await prepararConviteGuiado('acme-demo', SID);

    expect(r.ok).toBe(true);
    expect(r.convertido).toBe(true);
    const link = new URL(r.url);
    expect(link.hostname).toBe('acme-demo.vertho.ai');
    expect(link.pathname).toBe('/degustacao');
    expect(verificarPasseDegustacao(link.searchParams.get('passe'))).toMatchObject({ tenant: 'acme-demo', sid: SID });

    const updates = sb.escritas.filter((e) => e.op === 'update');
    expect(updates).toEqual([expect.objectContaining({ tabela: 'demo_prospect_sessions', payload: { experience_version: 'B' } })]);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ tabela: 'demo_prospect_sessions', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
  });

  it('passaporte que já é B não é reescrito', async () => {
    sessao = { ...sessao, experience_version: 'B' };
    const r: any = await prepararConviteGuiado('acme-demo', SID);
    expect(r).toMatchObject({ ok: true, convertido: false });
    expect(sb.escritas).toHaveLength(0);
  });

  it('recusa sessão vencida, fechada, inexistente, ambiente inválido e tenant que não é demo, sem escrever', async () => {
    sessao = { ...sessao, expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect((await prepararConviteGuiado('acme-demo', SID)).ok).toBe(false);
    sessao = { ...sessao, expires_at: new Date(Date.now() + 86_400_000).toISOString(), access_closed_at: '2026-09-16T00:00:00.000Z' };
    expect((await prepararConviteGuiado('acme-demo', SID)).ok).toBe(false);
    sessao = null;
    expect((await prepararConviteGuiado('acme-demo', SID)).ok).toBe(false);
    expect((await prepararConviteGuiado('macae', SID)).ok).toBe(false);
    expect((await prepararConviteGuiado('constructor', SID)).ok).toBe(false);
    expect((await prepararConviteGuiado('acme-demo', 'nao-e-sessao')).ok).toBe(false);
    isDemo = false;
    sessao = { prospect_name: 'X', expires_at: new Date(Date.now() + 86_400_000).toISOString(), access_closed_at: null };
    expect((await prepararConviteGuiado('acme-demo', SID)).ok).toBe(false);
    expect(sb.escritas).toHaveLength(0);
  });
});
