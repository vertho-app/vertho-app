import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Casa do convidado B: o `/dashboard` dele volta para a página do roteiro.
 *
 * Quem não é passaporte não paga consulta; só a sessão B, viva e no prazo,
 * redireciona; falha de leitura cai na home genérica e fica registrada.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'dddddddddddddddddddd';
const EMAIL_B = `convidado.acme.${SID}@vertho.ai`;

let sessao: any = null;
const registrarDegradacao = vi.fn(async () => {});

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'demo_prospect_sessions' ? sessao : null),
});
sb.client.auth = { admin: {} };
sb.client.rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => ({ id: `${slug}-id`, slug })),
}));
vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: { DEGUSTACAO_CASA_INDISPONIVEL: 'degustacao-casa-indisponivel' },
  registrarDegradacao: (...args: any[]) => (registrarDegradacao as any)(...args),
}));

import { hrefDaCasaDoConvidado } from '@/lib/demo/degustacao-casa';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';

describe('casa do convidado da degustação B', () => {
  beforeEach(() => {
    sb.reset();
    registrarDegradacao.mockClear();
    sessao = {
      experience_version: 'B',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
    };
  });

  it('persona, RH, staff e cliente real não fazem consulta nenhuma', async () => {
    for (const email of ['bruna.demo@vertho.ai', 'helena.demo@vertho.ai', 'rodrigo@vertho.ai', 'ana@cliente.com.br', null]) {
      expect(await hrefDaCasaDoConvidado(email)).toBeNull();
    }
    expect(sb.chamadas).toHaveLength(0);
  });

  it('sessão B viva: página do roteiro, com o passe DESTE convidado', async () => {
    const href = await hrefDaCasaDoConvidado(EMAIL_B);
    expect(href).toMatch(/^\/degustacao\?passe=/);
    const passe = new URLSearchParams(href!.split('?')[1]).get('passe');
    expect(verificarPasseDegustacao(passe)).toMatchObject({ tenant: 'acme-demo', sid: SID });
    expect(sb.chamadas).toContainEqual(expect.objectContaining({ metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }));
  });

  it('versão A, sessão fechada ou vencida: home de sempre', async () => {
    sessao = { ...sessao, experience_version: 'A' };
    expect(await hrefDaCasaDoConvidado(EMAIL_B)).toBeNull();
    sessao = { ...sessao, experience_version: 'B', access_closed_at: '2026-09-16T00:00:00.000Z' };
    expect(await hrefDaCasaDoConvidado(EMAIL_B)).toBeNull();
    sessao = { ...sessao, access_closed_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect(await hrefDaCasaDoConvidado(EMAIL_B)).toBeNull();
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('falha de leitura cai na home genérica E fica registrada', async () => {
    sb.falharEm({ tabela: 'demo_prospect_sessions', op: 'select', mensagem: 'timeout no pool' });
    expect(await hrefDaCasaDoConvidado(EMAIL_B)).toBeNull();
    expect(registrarDegradacao).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'demo', tipo: 'degustacao-casa-indisponivel', chave: SID,
    }));
  });
});
