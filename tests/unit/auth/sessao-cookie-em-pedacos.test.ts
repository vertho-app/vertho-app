import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChunks, stringToBase64URL } from '@supabase/ssr';

/**
 * A sessão do cookie é lida INTEIRA ou em PEDAÇOS (18/10/2026).
 *
 * Sessão acima de ~3,2 KB vira `sb-<ref>-auth-token.0`, `.1`, … (o 2º fator dos admins passa do limite). A leitura só
 * casava o cookie inteiro, e o que o navegador pede sozinho, sem o Bearer (`<audio src>` do podcast, `<iframe src>` do
 * PDF, link em aba nova), voltava `{"error":"não autenticado"}`: o podcast da Marina na tela de temporadas, aberto pelo
 * dono, cujo cookie estava em 2 pedaços (3.217 + 182 caracteres).
 *
 * Os cookies são montados pelas funções do próprio @supabase/ssr (`createChunks`, `stringToBase64URL`), as mesmas que
 * gravam o cookie no navegador.
 */

const TOKEN = 'token-valido-do-dono';
const getUser = vi.fn(async (token: string) => (token === TOKEN
  ? { data: { user: { id: 'u-1', email: ' Dono@Vertho.ai ' } }, error: null }
  : { data: { user: null }, error: { message: 'invalid JWT' } }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ auth: { getUser: (t: string) => getUser(t) } }) }));
vi.mock('@/lib/authz', () => ({ getUserContext: vi.fn(), canViewColabJourney: vi.fn() }));

import { getAuthenticatedUser, valorDoCookieDeSessao } from '@/lib/auth/request-context';

const CHAVE = 'sb-xwuqrgrvakxtphbmudwj-auth-token';
/** Sessão como o @supabase/ssr grava: `base64-` + base64url do JSON. `extra` infla o objeto do usuário (fatores do 2º fator). */
const sessao = (extra = 0) => `base64-${stringToBase64URL(JSON.stringify({
  access_token: TOKEN, refresh_token: 'r-1', user: { id: 'u-1', factors: 'x'.repeat(extra) },
}))}`;
const header = (pares: Array<{ name: string; value: string }>) => pares.map((p) => `${p.name}=${p.value}`).join('; ');
const req = (cookie: string, extra: Record<string, string> = {}) => new Request('https://app.vertho.ai/api/conteudo/c-1/podcast', { headers: { cookie, ...extra } });

beforeEach(() => getUser.mockClear());

describe('cookie de sessão do Supabase', () => {
  it('inteiro: autentica', async () => {
    const pedacos = createChunks(CHAVE, sessao());
    expect(pedacos).toHaveLength(1);
    expect(await getAuthenticatedUser(req(header(pedacos)))).toEqual({ id: 'u-1', email: 'dono@vertho.ai' });
  });

  it('em PEDAÇOS (sessão grande do 2º fator): junta e autentica', async () => {
    const pedacos = createChunks(CHAVE, sessao(4000));
    expect(pedacos.map((p) => p.name)).toEqual([`${CHAVE}.0`, `${CHAVE}.1`]);
    expect(await getAuthenticatedUser(req(header(pedacos)))).toEqual({ id: 'u-1', email: 'dono@vertho.ai' });
    expect(getUser).toHaveBeenCalledWith(TOKEN);
  });

  it('pedaços fora de ordem e misturados com outros cookies: a junção segue o número', async () => {
    const [p0, p1] = createChunks(CHAVE, sessao(4000));
    const cookie = header([{ name: 'NEXT_LOCALE', value: 'pt-BR' }, p1, { name: `${CHAVE}-code-verifier`, value: 'cv' }, p0]);
    expect(await valorDoCookieDeSessao(cookie)).toBe(sessao(4000));
  });

  it('só o code-verifier do login (não é sessão): ninguém autenticado', async () => {
    expect(await valorDoCookieDeSessao(`${CHAVE}-code-verifier=abc`)).toBeNull();
    expect(await getAuthenticatedUser(req(`${CHAVE}-code-verifier=abc`))).toBeNull();
  });

  it('cookie quebrado: ninguém autenticado, sem lançar', async () => {
    expect(await getAuthenticatedUser(req(`${CHAVE}.0=base64-%%%; ${CHAVE}.1=lixo`))).toBeNull();
  });

  it('o Bearer continua na frente do cookie', async () => {
    const r = req(`${CHAVE}=outro`, { authorization: `Bearer ${TOKEN}` });
    expect(await getAuthenticatedUser(r)).toEqual({ id: 'u-1', email: 'dono@vertho.ai' });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
