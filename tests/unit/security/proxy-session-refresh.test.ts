import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O refresh da sessão do Supabase tem que acontecer NO PROXY — é o único ponto
 * da request onde o cookie é gravável.
 *
 * Sem ele, o refresh acontecia dentro de um Server Component (`getUser()` no
 * gate do /admin), onde o `cookies()` é READ-ONLY: o token rotacionado era
 * perdido no catch, o browser ficava com o refresh token velho (já consumido)
 * e a sessão morria no meio da navegação → servidor vê anônimo e manda pro
 * /login, cliente ainda tem sessão em memória e manda de volta (pisca-pisca).
 */

const setAllCapturado = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: any) => ({
    auth: {
      getSession: async () => {
        // Simula a rotação: o auth-js devolve o par novo pelo setAll.
        opts.cookies.setAll([
          { name: 'sb-projeto-auth-token', value: 'TOKEN_NOVO', options: { path: '/' } },
        ]);
        setAllCapturado();
        return { data: { session: {} }, error: null };
      },
    },
  }),
}));

const { proxy } = await import('@/proxy');

/** Request de mentira com o mesmo contrato do NextRequest: `cookies.set` reescreve o header. */
function fakeRequest(host: string, headers: Record<string, string> = {}, path = '/admin/dashboard') {
  const url = new URL(`https://${host}${path}`);
  const h = new Headers({ host, ...headers });
  const cookies = {
    getAll: () =>
      (h.get('cookie') || '')
        .split(';')
        .map((par) => par.trim())
        .filter(Boolean)
        .map((par) => {
          const i = par.indexOf('=');
          return { name: par.slice(0, i), value: par.slice(i + 1) };
        }),
    set: (name: string, value: string) => {
      const outros = cookies.getAll().filter((c: any) => c.name !== name);
      h.set('cookie', [...outros.map((c: any) => `${c.name}=${c.value}`), `${name}=${value}`].join('; '));
    },
  };
  return {
    headers: h,
    cookies,
    nextUrl: Object.assign(url, { clone: () => new URL(url.href) }),
  } as any;
}

function headerRepassado(res: Response, nome: string) {
  return res.headers.get(`x-middleware-request-${nome}`);
}

describe('proxy — refresh da sessão', () => {
  beforeEach(() => {
    setAllCapturado.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://projeto.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('devolve o token rotacionado ao browser (Set-Cookie)', async () => {
    const res = await proxy(fakeRequest('ibipeba.vertho.ai', { cookie: 'sb-projeto-auth-token=VELHO' }));
    expect(setAllCapturado).toHaveBeenCalled();
    expect(res.headers.get('set-cookie') || '').toContain('sb-projeto-auth-token=TOKEN_NOVO');
  });

  it('o render DESTA request já enxerga o token novo', async () => {
    const res = await proxy(fakeRequest('ibipeba.vertho.ai', { cookie: 'sb-projeto-auth-token=VELHO' }));
    const cookie = headerRepassado(res, 'cookie') || '';
    expect(cookie).toContain('sb-projeto-auth-token=TOKEN_NOVO');
    expect(cookie).not.toContain('VELHO');
  });

  it('vale também no apex, onde o cookie de tenant é descartado', async () => {
    const res = await proxy(
      fakeRequest('app.vertho.ai', { cookie: 'sb-projeto-auth-token=VELHO; vertho-tenant-slug=macae' }),
    );
    expect(res.headers.get('set-cookie') || '').toContain('sb-projeto-auth-token=TOKEN_NOVO');
    expect(headerRepassado(res, 'cookie') || '').not.toContain('vertho-tenant-slug');
  });

  it('não gasta refresh em request anônima', async () => {
    await proxy(fakeRequest('ibipeba.vertho.ai', { cookie: 'vertho-locale=pt-BR' }));
    expect(setAllCapturado).not.toHaveBeenCalled();
  });

  it('não gasta refresh em chamada com Bearer (cron/serviço)', async () => {
    await proxy(
      fakeRequest('ibipeba.vertho.ai', {
        cookie: 'sb-projeto-auth-token=VELHO',
        authorization: 'Bearer segredo',
      }),
    );
    expect(setAllCapturado).not.toHaveBeenCalled();
  });

  it('não gasta refresh em webhook/cron', async () => {
    await proxy(
      fakeRequest('ibipeba.vertho.ai', { cookie: 'sb-projeto-auth-token=VELHO' }, '/api/cron/diario'),
    );
    expect(setAllCapturado).not.toHaveBeenCalled();
  });
});
