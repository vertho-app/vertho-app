import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * POST de `/auth/degustacao`: o botão pessoal da página de boas-vindas (versão B).
 *
 * É aqui que a sessão do convidado nasce na versão B. Cada recusa abaixo é
 * provada SEM chamada ao Auth e SEM escrita, porque recusar mudando só a
 * mensagem seria um gate de enfeite.
 */

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

const SID = 'aaaaaaaaaaaaaaaaaaaa';
const AUTH_EMAIL = `convidado.acme.${SID}@vertho.ai`;
const HOST = 'acme-demo.vertho.ai';

let sessao: any = null;
let usuarioLogado: string | null = null;
let limitado = false;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'demo_prospect_sessions' ? sessao : null),
});
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: 'hash-do-servidor' } },
  error: null,
}));
sb.client.auth = { admin: { generateLink } };
sb.client.rpc = vi.fn(async (name: string) => ({ data: name === 'demo_auth_lock_acquire' ? true : null, error: null }));

const verifyOtp = vi.fn(async () => ({ error: null }));
const getUser = vi.fn(async () => ({
  data: { user: usuarioLogado ? { email: usuarioLogado } : null },
  error: null,
}));
const limiterCheck = vi.fn(async () => (limitado ? new Response('{}', { status: 429 }) : null));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => (
    ['acme-demo', 'gruposinal'].includes(slug) ? { id: `${slug}-id`, slug } : null
  )),
}));
vi.mock('@/lib/auth/supabase-server', () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp, getUser } }),
}));
vi.mock('@/lib/rate-limit', () => ({
  authLimiter: { check: (...args: any[]) => (limiterCheck as any)(...args) },
}));
vi.mock('@/lib/demo/acme-prospect-tracking', () => ({ recordAcmeProspectPersonalAccess: vi.fn() }));

import { POST } from '@/app/auth/degustacao/route';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';

const passeValido = () => emitirPasseDegustacao('acme-demo', SID, Math.floor(Date.now() / 1000) + 86_400);

function post(
  { host = HOST, origin, referer, passe, destino = 'mapeamento' }:
  { host?: string; origin?: string | null; referer?: string; passe?: string; destino?: string },
) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (origin !== null) headers.origin = origin ?? `https://${host}`;
  if (referer) headers.referer = referer;
  const corpo = new URLSearchParams();
  if (passe !== undefined) corpo.set('passe', passe);
  corpo.set('destino', destino);
  return new NextRequest(`https://${host}/auth/degustacao`, { method: 'POST', headers, body: corpo.toString() });
}

const destino = (res: Response) => new URL(res.headers.get('location')!);

function semEfeito() {
  expect(generateLink).not.toHaveBeenCalled();
  expect(verifyOtp).not.toHaveBeenCalled();
  expect(sb.escritas).toHaveLength(0);
}

describe('POST /auth/degustacao (botão pessoal da versão B)', () => {
  beforeEach(() => {
    sb.reset();
    vi.clearAllMocks();
    usuarioLogado = null;
    limitado = false;
    sessao = {
      auth_email: AUTH_EMAIL,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      access_closed_at: null,
      personal_accessed_at: null,
      invite_opened_at: null,
    };
  });

  it('🔴 origem estranha volta para a página, sem refletir o passe e sem efeito', async () => {
    for (const origin of ['https://evil.example', 'https://gestor-demo.vertho.ai', 'null']) {
      const res = await POST(post({ origin, passe: passeValido() }));
      expect(res.status).toBe(303);
      expect(destino(res).pathname).toBe('/degustacao');
      expect(destino(res).searchParams.get('aviso')).toBe('origem');
      expect(destino(res).searchParams.get('passe')).toBeNull();
    }
    semEfeito();
  });

  it('sem Origin e sem Referer recusa; Referer malformado recusa sem estourar', async () => {
    expect(destino(await POST(post({ origin: null, passe: passeValido() }))).searchParams.get('aviso')).toBe('origem');
    const malformado = await POST(post({ origin: null, referer: '::não é url::', passe: passeValido() }));
    expect(malformado.status).toBe(303);
    expect(destino(malformado).searchParams.get('aviso')).toBe('origem');
    semEfeito();
  });

  it('passe inválido não consulta limite, banco nem Auth', async () => {
    const res = await POST(post({ passe: 'forjado.assinatura' }));
    expect(destino(res).searchParams.get('aviso')).toBe('expirado');
    expect(destino(res).searchParams.get('passe')).toBeNull();
    expect(limiterCheck).not.toHaveBeenCalled();
    expect(sb.chamadas).toHaveLength(0);
    semEfeito();
  });

  it('passe de um ambiente, postado no host de outro, é recusado', async () => {
    const res = await POST(post({ host: 'gruposinal.vertho.ai', passe: passeValido() }));
    expect(destino(res).searchParams.get('aviso')).toBe('invalido');
    semEfeito();
  });

  it('limite estourado volta com aviso amigável (303, nunca JSON)', async () => {
    limitado = true;
    const res = await POST(post({ passe: passeValido() }));
    expect(res.status).toBe(303);
    expect(destino(res).searchParams.get('aviso')).toBe('aguarde');
    expect(limiterCheck).toHaveBeenCalledWith(expect.anything(), `degustacao:${SID}`);
    semEfeito();
  });

  it('🔴 destino fora da allowlist é recusado, inclusive o laço para /dashboard', async () => {
    for (const d of ['constructor', '/dashboard', 'dashboard', 'https://evil.example']) {
      const res = await POST(post({ passe: passeValido(), destino: d }));
      expect(destino(res).searchParams.get('aviso')).toBe('destino');
    }
    semEfeito();
  });

  it('sessão fechada no banco fecha a porta', async () => {
    sessao = { ...sessao, access_closed_at: new Date().toISOString() };
    const res = await POST(post({ passe: passeValido() }));
    expect(destino(res).searchParams.get('aviso')).toBe('expirado');
    semEfeito();
  });

  it('caminho feliz: cria a sessão, carimba os dois marcos só se nulos, e vai ao destino sem cache', async () => {
    const res = await POST(post({ passe: passeValido(), destino: 'mapeamento' }));

    expect(res.status).toBe(303);
    expect(destino(res).pathname).toBe('/dashboard/perfil-comportamental/mapeamento');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ email: AUTH_EMAIL }));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-do-servidor', type: 'email' });

    const updates = sb.escritas.filter((e) => e.tabela === 'demo_prospect_sessions' && e.op === 'update');
    expect(updates.map((u) => Object.keys(u.payload)[0]).sort()).toEqual(['invite_opened_at', 'personal_accessed_at']);
    expect(sb.usou('demo_prospect_sessions', 'is', 'personal_accessed_at')).toBe(true);
    expect(sb.usou('demo_prospect_sessions', 'is', 'invite_opened_at')).toBe(true);
    expect(sb.chamadas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'],
    }));
  });

  it('quem já está logado como este convidado não gera outro magic link', async () => {
    usuarioLogado = AUTH_EMAIL.toUpperCase();
    const res = await POST(post({ passe: passeValido(), destino: 'perfil' }));
    expect(destino(res).pathname).toBe('/dashboard/perfil-comportamental');
    expect(generateLink).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('logado como OUTRA pessoa no mesmo host: a sessão troca para o convidado', async () => {
    usuarioLogado = 'rodrigo@vertho.ai';
    await POST(post({ passe: passeValido() }));
    expect(generateLink).toHaveBeenCalledTimes(1);
  });

  it('marcos já carimbados não são reescritos', async () => {
    sessao = { ...sessao, personal_accessed_at: '2026-09-16T12:00:00.000Z', invite_opened_at: '2026-09-16T11:59:00.000Z' };
    await POST(post({ passe: passeValido() }));
    expect(sb.escritas.filter((e) => e.op === 'update')).toHaveLength(0);
  });

  it('falha ao carimbar não impede a pessoa de seguir', async () => {
    sb.falharEm({ tabela: 'demo_prospect_sessions', op: 'update', mensagem: 'timeout no pool' });
    const res = await POST(post({ passe: passeValido(), destino: 'assessment' }));
    expect(destino(res).pathname).toBe('/dashboard/assessment');
  });
});
