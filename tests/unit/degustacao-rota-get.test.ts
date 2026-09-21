import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Caracterização do GET de `/auth/degustacao` (o link da versão A).
 *
 * Escrito ANTES de a rota ganhar o POST da versão B e passar a dividir a checagem
 * de acesso com a página de boas-vindas: o GET não tinha nenhum teste de rota, e
 * mexer nele sem uma rede transformaria "a versão A continua igual" em promessa.
 * Cada caso fixa um ramo que existe hoje, inclusive o que o robô de preview do
 * WhatsApp percorre (o GET válido cria a sessão e carimba o acesso).
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'aaaaaaaaaaaaaaaaaaaa';
const AUTH_EMAIL = `convidado.acme.${SID}@vertho.ai`;

let sessao: any = null;
let autenticado = false;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'demo_prospect_sessions' ? sessao : null),
});
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: 'hash-do-servidor' } },
  error: null,
}));
sb.client.auth = { admin: { generateLink } };
sb.client.rpc = vi.fn(async (name: string) => ({ data: name === 'demo_auth_lock_acquire' ? true : null, error: null }));

const verifyOtp = vi.fn(async () => { autenticado = true; return { error: null }; });
const getUser = vi.fn(async () => ({ data: { user: autenticado ? { email: AUTH_EMAIL } : null }, error: null }));
const recordAccess = vi.fn(async () => true);

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => (
    ['acme-demo', 'gruposinal'].includes(slug) ? { id: `${slug}-id`, slug } : null
  )),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, getUser } }),
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  recordAcmeProspectPersonalAccess: recordAccess,
}));

import { GET } from '@/app/auth/degustacao/route';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';

const daquiAUmDia = () => Math.floor(Date.now() / 1000) + 86_400;

function pedido(host: string, passe: string | null) {
  const url = new URL(`https://${host}/auth/degustacao`);
  if (passe !== null) url.searchParams.set('passe', passe);
  return new NextRequest(url);
}

function destino(res: Response) {
  return new URL(res.headers.get('location')!);
}

describe('GET /auth/degustacao (versão A, caracterização)', () => {
  beforeEach(() => {
    sb.reset();
    autenticado = false;
    vi.clearAllMocks();
    sessao = {
      auth_email: AUTH_EMAIL,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
    };
  });

  it('passe inválido vai para o login como convite expirado, sem tocar no banco', async () => {
    const res = await GET(pedido('acme-demo.vertho.ai', 'nao-e-um-passe'));
    expect(destino(res).pathname).toBe('/login');
    expect(destino(res).searchParams.get('error')).toBe('convite-expirado');
    expect(sb.chamadas).toHaveLength(0);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('passe de um ambiente não abre sessão no host de outro', async () => {
    const passe = emitirPasseDegustacao('acme-demo', SID, daquiAUmDia());
    const res = await GET(pedido('gruposinal.vertho.ai', passe));
    expect(destino(res).searchParams.get('error')).toBe('convite-invalido');
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('erro de banco vira "indisponível", não "convite inválido"', async () => {
    sb.falharEm({ tabela: 'demo_prospect_sessions', op: 'select', mensagem: 'timeout no pool' });
    const passe = emitirPasseDegustacao('acme-demo', SID, daquiAUmDia());
    const res = await GET(pedido('acme-demo.vertho.ai', passe));
    expect(destino(res).searchParams.get('error')).toBe('indisponivel');
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('sessão fechada ou vencida no BANCO fecha a porta, mesmo com passe válido', async () => {
    const passe = emitirPasseDegustacao('acme-demo', SID, daquiAUmDia());

    sessao = { ...sessao, access_closed_at: new Date().toISOString() };
    expect(destino(await GET(pedido('acme-demo.vertho.ai', passe))).searchParams.get('error')).toBe('convite-expirado');

    sessao = { ...sessao, access_closed_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() };
    expect(destino(await GET(pedido('acme-demo.vertho.ai', passe))).searchParams.get('error')).toBe('convite-expirado');

    expect(generateLink).not.toHaveBeenCalled();
  });

  it('caminho feliz: lê a sessão no tenant do host, cria a sessão, carimba e vai ao dashboard', async () => {
    const passe = emitirPasseDegustacao('acme-demo', SID, daquiAUmDia());
    const res = await GET(pedido('acme-demo.vertho.ai', passe));

    expect(sb.usou('demo_prospect_sessions', 'eq', 'session_id')).toBe(true);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'],
    }));
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'magiclink', email: AUTH_EMAIL }));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-do-servidor', type: 'email' });
    expect(recordAccess).toHaveBeenCalledTimes(1);
    expect(destino(res).pathname).toBe('/dashboard');
  });
});
