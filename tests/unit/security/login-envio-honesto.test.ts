/**
 * R-76 (revisão de 02/10/2026): a tela mostrava "Link enviado!" sem envio em
 * três casos.
 *
 *   1. Login por WhatsApp no endereço genérico: a rota respondia `{ ok: true }`
 *      sem organização e sem enviar nada.
 *   2. Telefone sem `login_por_whatsapp`: a resposta é a mesma do envio de
 *      propósito (anti-enumeração), mas a frase afirmava o envio.
 *   3. Auto-cadastro: `generateLink` não cria usuário, o e-mail é novo por
 *      definição, então o link falhava sempre; a rota devolvia sucesso com
 *      aviso e a tela ignorava o aviso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

let slugDoHost: string | null = 'macae';
let colabDoTelefone: any = null;

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'empresas') return { id: 'emp-1', nome: 'Macaé', slug: 'macae', sys_config: { allow_open_signup: true } };
    if (tabela === 'colaboradores') return colabDoTelefone;
    return null;
  },
});
const client: any = sb.client;
const ordem: string[] = [];
let contaExiste = false;
const createUser = vi.fn(async (_a: any) => {
  ordem.push('createUser');
  if (!contaExiste) contaExiste = true;
  return { data: { user: null }, error: null };
});
const generateLink = vi.fn(async (_a: any) => {
  ordem.push('generateLink');
  // O GoTrue de verdade: `magiclink` para e-mail sem conta falha.
  if (!contaExiste) return { data: null, error: { message: 'User not found' } };
  return { data: { properties: { hashed_token: 'tok-abc12345', action_link: 'https://p.supabase.co/v?x=1' } }, error: null };
});
client.auth = { admin: { createUser, generateLink } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => slugDoHost }));
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null }, limitarPorDestino: async () => null }));

const enviados: any[] = [];
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { enviados.push(p); return { anySent: true, email: 'sent', whatsapp: 'sent' }; },
  recipientFromLookup: () => ({ eligible: false, nome: '', telefone: null }),
}));

const telefoneLink = await import('@/app/api/auth/phone-magic-link/request/route');
const cadastro = await import('@/app/api/auth/signup/route');
const { NextRequest } = await import('next/server');
const {
  chaveDoErroDoPedido, confirmacaoDoEnvio, cadastroSemLink,
} = await import('@/lib/auth/login-respostas');

function req(host: string, caminho: string, corpo: unknown) {
  return new NextRequest(`https://${host}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
    body: JSON.stringify(corpo),
  }) as any;
}

beforeEach(() => {
  sb.reset();
  enviados.length = 0;
  ordem.length = 0;
  createUser.mockClear();
  generateLink.mockClear();
  slugDoHost = 'macae';
  colabDoTelefone = null;
  contaExiste = false;
});

// Até 04/10/2026 o endereço genérico respondia 400 `sem-organizacao` aqui. Agora a
// organização sai do número (a lista, a escolha, o link no host do tenant e a
// anti-enumeração estão em `login-whatsapp-endereco-generico.test.ts`).
describe('R-76 · 1. WhatsApp no endereço genérico', () => {
  it('🔴 número sem cadastro: a mesma resposta do host de tenant, e nada é enviado', async () => {
    slugDoHost = 'macae';
    const noTenant = await telefoneLink.POST(req('macae.vertho.ai', '/api/auth/phone-magic-link/request', { telefone: '22997612255' }));
    slugDoHost = null;
    const noGenerico = await telefoneLink.POST(req('app.vertho.ai', '/api/auth/phone-magic-link/request', { telefone: '22997612255' }));
    expect(noGenerico.status).toBe(200);
    expect(await noGenerico.json()).toEqual(await noTenant.json());
    expect(enviados).toHaveLength(0);
  });

  it('o código que dizia "não sei a sua organização" deixou de existir', () => {
    expect(chaveDoErroDoPedido({ codigo: 'sem-organizacao' })).toBeNull();
  });
});

describe('R-76 · 2. telefone sem cadastro para WhatsApp', () => {
  it('a rota segue anti-enumeração: mesma resposta para número cadastrado e não cadastrado', async () => {
    const semCadastro = await (await telefoneLink.POST(req('macae.vertho.ai', '/api/auth/phone-magic-link/request', { telefone: '22997612255' }))).json();
    expect(enviados).toHaveLength(0);
    colabDoTelefone = { id: 'col-1', nome_completo: 'Geane Souza', email: 'geane@escola.rj.gov.br' };
    const comCadastro = await (await telefoneLink.POST(req('macae.vertho.ai', '/api/auth/phone-magic-link/request', { telefone: '22997612255' }))).json();
    expect(enviados).toHaveLength(1);
    expect(comCadastro).toEqual(semCadastro);
  });

  it('🔴 por isso a tela fala no condicional depois de pedir pelo WhatsApp, sempre', () => {
    expect(confirmacaoDoEnvio('whatsapp', false)).toBe('se-cadastrado-whatsapp');
    expect(confirmacaoDoEnvio('whatsapp', true)).toBe('se-cadastrado-whatsapp');
  });

  it('pelo e-mail, "Link enviado!" só quando a tela sabe que o cadastro existe', () => {
    expect(confirmacaoDoEnvio('email', true)).toBe('enviado');
    expect(confirmacaoDoEnvio('email', false)).toBe('se-cadastrado-email');
  });

  it('as frases do condicional existem nos 4 idiomas e não afirmam envio', () => {
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).Login;
      for (const chave of ['linkRequestedTitle', 'linkRequestedEmail', 'linkRequestedWhatsapp', 'linkRequestedHint']) {
        expect(typeof m[chave], `${locale}.${chave}`).toBe('string');
      }
      expect(typeof m.signup.createdWithoutLink).toBe('string');
    }
    const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).Login;
    expect(pt.linkRequestedWhatsapp).toMatch(/^Se este número/);
    expect(pt.linkRequestedEmail).toMatch(/^Se este e-mail/);
  });
});

describe('R-76 · 3. auto-cadastro', () => {
  const corpo = { email: 'nova@escola.br', nome_completo: 'Nova Pessoa', telefone: '22997612255', redirectTo: 'https://macae.vertho.ai/dashboard' };

  it('🔴 cria a conta no Auth ANTES de gerar o link, e o link sai', async () => {
    const r = await cadastro.POST(req('macae.vertho.ai', '/api/auth/signup', corpo));
    const dados = await r.json();
    expect(ordem).toEqual(['createUser', 'generateLink']);
    expect(createUser.mock.calls[0][0]).toEqual({ email: 'nova@escola.br', email_confirm: true });
    expect(enviados).toHaveLength(1);
    expect(dados).toMatchObject({ success: true });
    expect(cadastroSemLink(dados)).toBe(false);
  });

  it('se o link falhar mesmo assim, a resposta traz o aviso e a tela NÃO diz "Link enviado!"', async () => {
    generateLink.mockImplementationOnce(async () => ({ data: null, error: { message: 'falhou' } }) as any);
    const dados = await (await cadastro.POST(req('macae.vertho.ai', '/api/auth/signup', corpo))).json();
    expect(enviados).toHaveLength(0);
    expect(cadastroSemLink(dados)).toBe(true);
  });
});
