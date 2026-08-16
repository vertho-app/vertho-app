// `/entrar` — o despacho do magic link do WhatsApp.
//
// 🔴 O INVARIANTE DESTE ARQUIVO: **um GET sem `ir=1` NUNCA aponta para o
// `/auth/callback`.**
//
// Por que ele é o que importa (medido em 15/08/2026): o `/auth/callback` chama
// `verifyOtp`, que CONSOME o token de uso único. Enquanto o `/entrar`
// redirecionava sozinho, abrir o link dentro do WhatsApp gastava o token ali,
// criava a sessão num cookie jar isolado — e, quando a pessoa pedia "abrir no
// navegador", o WhatsApp transferia a **URL atual**, já `<tenant>/dashboard`,
// sem token nenhum. No Safari: tela de login, com o link queimado.
//
// Note o que isso implica e o que o teste protege: detectar o navegador embutido
// NÃO resolveria. Redirecionar automaticamente destrói a única URL que valia a
// pena transferir. O consumo precisa esperar um toque explícito.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/** O tenant do `t` existe no banco? Vira `false` no teste de slug inexistente. */
let empresaExiste = true;
const sb = criarSupabaseMock({
  resolver: (tabela: string) => (tabela === 'empresas' && empresaExiste ? { slug: 'ibipeba' } : null),
});
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));

const { GET } = await import('@/app/entrar/route');
const { NextRequest } = await import('next/server');

const T = 'ibipeba~abcdef0123456789';
const UA_WA_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36';
const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function chamar(qs: string, ua = UA_IPHONE_SAFARI) {
  return GET(new NextRequest(`https://app.vertho.ai/entrar${qs}`, { headers: { 'user-agent': ua } }) as any);
}

beforeEach(() => {
  sb.reset();
  empresaExiste = true;
});

describe('🔴 o token não é consumido sem toque explícito', () => {
  it('GET normal manda para a confirmação, não para o callback', async () => {
    const r = await chamar(`?t=${encodeURIComponent(T)}`);
    const loc = r.headers.get('location')!;
    expect(r.status).toBe(302);
    expect(loc).toContain('/entrar/abrir');
    expect(loc).not.toContain('auth/callback');
  });

  it('a confirmação recebe o `t` INTEIRO — senão não há o que redimir depois', async () => {
    const loc = (await chamar(`?t=${encodeURIComponent(T)}`)).headers.get('location')!;
    expect(new URL(loc).searchParams.get('t')).toBe(T);
  });

  it('🔴 nenhum User-Agent leva ao callback sem `ir=1` — a heurística ERRA', async () => {
    // Um iPhone real passou batido pela detecção em 15/08. Se a proteção
    // dependesse dela, o token teria sido gasto do mesmo jeito.
    const uas = [
      UA_IPHONE_SAFARI,
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '',
    ];
    for (const ua of uas) {
      const loc = (await chamar(`?t=${encodeURIComponent(T)}`, ua)).headers.get('location')!;
      expect(loc, ua || '(sem UA)').not.toContain('auth/callback');
    }
  });

  it('WhatsApp no Android sai para o Chrome — e o intent também não consome', async () => {
    const loc = (await chamar(`?t=${encodeURIComponent(T)}`, UA_WA_ANDROID)).headers.get('location')!;
    expect(loc.startsWith('intent://')).toBe(true);
    expect(loc).not.toContain('auth/callback');
    expect(loc).not.toContain('ir%3D1');
    expect(loc).not.toContain('ir=1');
  });
});

describe('com `ir=1` — o único caminho que consome', () => {
  it('vai para o callback no subdomínio do tenant', async () => {
    const loc = (await chamar(`?t=${encodeURIComponent(T)}&ir=1`)).headers.get('location')!;
    const u = new URL(loc);
    expect(u.host).toBe('ibipeba.vertho.ai');
    expect(u.pathname).toBe('/auth/callback');
    expect(u.searchParams.get('token_hash')).toBe('abcdef0123456789');
    // Sem `type`, o callback cai em "Nenhum token fornecido" e o link parece quebrado.
    expect(u.searchParams.get('type')).toBe('email');
  });

  it('🔴 slug inexistente não vira subdomínio — nem com `ir=1`', async () => {
    // A regex garante só a FORMA. Sem a consulta ao banco, qualquer string
    // bem-formada viraria um host de destino no canal de login.
    empresaExiste = false;
    const loc = (await chamar(`?t=${encodeURIComponent('naoexiste~abcdef0123456789')}&ir=1`)).headers.get('location')!;
    expect(loc).toContain('/login?error=link-invalido');
  });

  it('🔴 falha de banco não vira "link inválido" — a causa real ficaria invisível', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const loc = (await chamar(`?t=${encodeURIComponent(T)}&ir=1`)).headers.get('location')!;
    expect(loc).toContain('/login?error=indisponivel');
  });
});
