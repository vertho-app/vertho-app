// `/api/auth/magic-link` — em QUAL host a sessão nasce.
//
// 🔴 O INVARIANTE DESTE ARQUIVO: **o link leva de volta ao lugar que a pessoa
// pediu.** O cadastro diz onde é a casa dela; o `next` diz para onde ela ia.
//
// Por que ele existe (medido em 19/08/2026, incidente do Samuel): o painel da
// plataforma (`/admin`) vive no endereço genérico, que não é tenant, e quem
// entra ali é decidido pelo E-MAIL (`platform_admins`). Mas o host do callback
// era escolhido só pelo CADASTRO — "tem colaborador ⇒ subdomínio dele" —, e os
// três platform admins têm cadastro de colaborador. Sequência do dia: 08:58 a
// sessão morre (`refresh_token_not_found`), 08:59 ele pede o link, 08:59:24 ele
// entra — no subdomínio do tenant —, 09:00 o `/admin/dashboard` ainda responde
// 307. Nenhum pedido de link conseguia devolvê-lo ao painel, e o sintoma que
// chega é "não consigo mais entrar como admin".
//
// ⚠️ O par deste invariante é a regra de 18/08, que continua valendo e está
// testada aqui junto: colaborador comum PRECISA nascer no subdomínio do tenant,
// senão a sessão fica num host sem tenant e o `findColabByEmail` é fail-closed.
// Consertar um lado quebrando o outro seria trocar de incidente.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/** O e-mail está em `platform_admins`? Cada teste decide. */
let ehAdmin = false;
/** O e-mail tem cadastro de colaborador (e em qual empresa)? */
let temColab = true;

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'colaboradores') {
      return temColab ? { nome_completo: 'Samuel', telefone: '+5511999999999', empresa_id: 'emp-1' } : null;
    }
    if (tabela === 'empresas') return { id: 'emp-1', nome: 'Ibipeba', slug: 'ibipeba' };
    if (tabela === 'platform_admins') return ehAdmin ? { email: 'samuel@vertho.ai', nome: 'Samuel' } : null;
    return null;
  },
});

// `generateLink` é da Admin API, fora do alcance do mock encadeável.
const client = sb.client;
client.auth = {
  admin: {
    generateLink: vi.fn(async () => ({
      data: { properties: { hashed_token: 'tok-abc123', action_link: 'https://projeto.supabase.co/auth/v1/verify?token=x' } },
      error: null,
    })),
  },
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null } }));

/** Captura o que a rota mandou enviar — é aí que mora a resposta. */
const enviado: any[] = [];
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { enviado.push(p); return { anySent: true, email: 'sent', whatsapp: 'sent' }; },
  recipientFromLookup: (colab: any, admin: any) => ({
    eligible: !!(colab || admin),
    nome: colab?.nome_completo || admin?.nome || '',
    telefone: colab?.telefone ?? null,
  }),
}));

const { POST } = await import('@/app/api/auth/magic-link/route');
const { NextRequest } = await import('next/server');

const HOST_GENERICO = 'app.vertho.ai';

function pedir(next: string, host = HOST_GENERICO) {
  return POST(new NextRequest(`https://${host}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ email: 'samuel@vertho.ai', redirectTo: `https://${host}${next}` }),
  }) as any);
}

/** O host onde a sessão vai nascer — é o que o callback do link diz. */
function hostDoCallback(): string {
  return new URL(enviado.at(-1).emailLink).host;
}

beforeEach(() => {
  sb.reset();
  enviado.length = 0;
  ehAdmin = false;
  temColab = true;
});

describe('🔴 platform admin pedindo o painel', () => {
  it('a sessão nasce no host de onde ele pediu — não no tenant do cadastro', async () => {
    ehAdmin = true;
    await pedir('/admin/dashboard');
    expect(hostDoCallback()).toBe(HOST_GENERICO);
    expect(new URL(enviado.at(-1).emailLink).searchParams.get('next')).toBe('/admin/dashboard');
  });

  it('vale para o `/admin-v2` também', async () => {
    ehAdmin = true;
    await pedir('/admin-v2/inbox');
    expect(hostDoCallback()).toBe(HOST_GENERICO);
  });

  it('🔑 é consultado em `platform_admins` MESMO tendo colaborador', async () => {
    // O bug morava aqui: a consulta só acontecia quando não havia colaborador, e
    // é a mesma pessoa que precisa das duas coisas.
    ehAdmin = true;
    temColab = true;
    await pedir('/admin/dashboard');
    expect(sb.usou('platform_admins', 'eq', 'email')).toBe(true);
    expect(hostDoCallback()).toBe(HOST_GENERICO);
  });

  it('⚠️ o WhatsApp é PULADO — o template não endereça o painel', async () => {
    // O botão do template carrega `<slug>~<token_hash>` e o `/entrar` sempre
    // despacha para o subdomínio do slug. Mandar assim mesmo daria dois destinos
    // para o mesmo pedido — e o segundo queimaria o token do primeiro.
    ehAdmin = true;
    await pedir('/admin/dashboard');
    expect(enviado.at(-1).whatsappLink).toBeNull();
    expect(enviado.at(-1).tenantSlug).toBeNull();
  });
});

describe('o par que não pode quebrar: colaborador vai para o tenant', () => {
  it('quem NÃO é admin da plataforma nasce no subdomínio do cadastro', async () => {
    ehAdmin = false;
    await pedir('/dashboard');
    expect(hostDoCallback()).toBe('ibipeba.vertho.ai');
  });

  it('🔴 `next=/admin` de quem não é admin NÃO muda o host', async () => {
    // `redirectTo` vem do cliente. Se ele sozinho decidisse o host, qualquer um
    // pediria uma sessão no endereço genérico — onde o `findColabByEmail` é
    // fail-closed e nada do app dele funciona. O gate do painel recusaria a
    // pessoa de todo modo; o que sobraria é uma sessão inútil.
    ehAdmin = false;
    await pedir('/admin/dashboard');
    expect(hostDoCallback()).toBe('ibipeba.vertho.ai');
  });

  it('admin indo para o app do colaborador continua indo ao tenant', async () => {
    ehAdmin = true;
    await pedir('/dashboard');
    expect(hostDoCallback()).toBe('ibipeba.vertho.ai');
    // E aí o WhatsApp volta a valer.
    expect(enviado.at(-1).whatsappLink).not.toBeNull();
    expect(enviado.at(-1).tenantSlug).toBe('ibipeba');
  });
});
