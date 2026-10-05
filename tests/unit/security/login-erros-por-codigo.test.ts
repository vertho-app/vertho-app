/**
 * R-67 (04/10/2026): as portas de login mandavam para a tela "Falha ao gerar
 * link: <mensagem do Supabase em inglês>", "Erro: <exceção>" e "Não foi possível
 * enviar o link de acesso (email: ..., whatsapp: ...)", e a tela mostrava o texto
 * cru, no idioma do fornecedor, qualquer que fosse o da pessoa.
 *
 * Agora toda falha traz um `codigo` estável, o detalhe fica só no log, e a tela
 * traduz pelo código. Aqui as rotas são as REAIS (só o banco e o envio são
 * simulados), e o limiter também.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

beforeAll(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

let slugDoHost: string | null = 'macae';
let colabExiste = true;
let abertoParaCadastro = true;
let emailJaCadastrado = false;
let falhaDoLink: { message: string } | null = null;
let envio: () => Promise<any> = async () => ({ anySent: true, email: 'sent', whatsapp: 'sent' });

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'colaboradores') {
      if (emailJaCadastrado) return { id: 'col-1' };
      return colabExiste
        ? { id: 'col-1', nome_completo: 'Geane Souza', telefone: '5522997612255', empresa_id: 'emp-1', email: 'geane@escola.rj.gov.br' }
        : null;
    }
    if (tabela === 'empresas') return { id: 'emp-1', nome: 'Macaé', slug: 'macae', sys_config: { allow_open_signup: abertoParaCadastro } };
    return null;
  },
});
const client: any = sb.client;
client.auth = {
  admin: {
    createUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'User already registered' } })),
    generateLink: vi.fn(async () => (falhaDoLink
      ? { data: null, error: falhaDoLink }
      : { data: { properties: { hashed_token: 'tok-abc12345', action_link: 'https://projeto.supabase.co/auth/v1/verify?token=x' } }, error: null })),
  },
};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => slugDoHost }));
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async () => envio(),
  recipientFromLookup: (colab: any, admin: any) => ({
    eligible: !!(colab || admin),
    nome: colab?.nome_completo || admin?.nome || '',
    telefone: colab?.telefone ?? null,
  }),
}));

const login = await import('@/lib/auth/login-respostas');
const magicLink = await import('@/app/api/auth/magic-link/route');
const telefoneLink = await import('@/app/api/auth/phone-magic-link/request/route');
const checkEmail = await import('@/app/api/auth/check-email/route');
const signup = await import('@/app/api/auth/signup/route');
const { NextRequest } = await import('next/server');

const HOST = 'macae.vertho.ai';
let ip = 0;
function pedir(rota: string, handler: (r: any) => Promise<Response>, corpo: unknown) {
  ip += 1;
  return handler(new NextRequest(`https://${HOST}${rota}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', host: HOST, 'x-forwarded-host': HOST, 'x-forwarded-proto': 'https',
      'x-forwarded-for': `10.1.${Math.floor(ip / 250)}.${ip % 250}`,
    },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  }) as any);
}
const pedirMagicLink = (corpo: unknown) => pedir('/api/auth/magic-link', magicLink.POST as any, corpo);
const pedirTelefone = (corpo: unknown) => pedir('/api/auth/phone-magic-link/request', telefoneLink.POST as any, corpo);
const pedirCheck = (corpo: unknown) => pedir('/api/auth/check-email', checkEmail.POST as any, corpo);
const pedirCadastro = (corpo: unknown) => pedir('/api/auth/signup', signup.POST as any, corpo);

const textoDoPedido = (corpo: any) => JSON.stringify(corpo);
let sequencia = 0;
/** Destinatário novo a cada uso: o teto por e-mail e por telefone (R-79) não pode disparar aqui. */
const cadastro = () => {
  sequencia += 1;
  return { email: `nova${sequencia}@escola.br`, nome_completo: 'Nova Pessoa', telefone: `229976${String(10000 + sequencia).slice(-5)}`, redirectTo: `https://${HOST}/dashboard` };
};

beforeEach(() => {
  sb.reset();
  slugDoHost = 'macae';
  colabExiste = true;
  abertoParaCadastro = true;
  emailJaCadastrado = false;
  falhaDoLink = null;
  envio = async () => ({ anySent: true, email: 'sent', whatsapp: 'sent' });
});

describe('o link por e-mail: falha com código e sem o detalhe do fornecedor', () => {
  it('e-mail ausente', async () => {
    const corpo = await (await pedirMagicLink({})).json();
    expect(corpo.codigo).toBe(login.CODIGO_EMAIL_INVALIDO);
  });

  it('🔴 o Supabase falha ao gerar o link: a mensagem dele NÃO chega à resposta', async () => {
    falhaDoLink = { message: 'Database error saving new user (SQLSTATE 23505)' };
    const corpo = await (await pedirMagicLink({ email: 'geane@escola.rj.gov.br', redirectTo: `https://${HOST}/dashboard` })).json();
    expect(corpo.codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
    expect(textoDoPedido(corpo)).not.toMatch(/Database|SQLSTATE|23505/);
  });

  it('🔴 nenhum canal entregou: o motivo de cada canal NÃO chega à resposta', async () => {
    envio = async () => ({ anySent: false, emailReason: 'ses: MessageRejected', whatsappReason: 'zapi: instance offline' });
    const corpo = await (await pedirMagicLink({ email: 'geane@escola.rj.gov.br', redirectTo: `https://${HOST}/dashboard` })).json();
    expect(corpo.codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
    expect(textoDoPedido(corpo)).not.toMatch(/MessageRejected|offline|zapi|ses:/i);
  });

  it('🔴 exceção inesperada: a mensagem dela NÃO chega à resposta', async () => {
    envio = async () => { throw new Error('connect ECONNREFUSED 10.0.0.7:5432 segredo-interno'); };
    const corpo = await (await pedirMagicLink({ email: 'geane@escola.rj.gov.br', redirectTo: `https://${HOST}/dashboard` })).json();
    expect(corpo.codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
    expect(textoDoPedido(corpo)).not.toMatch(/ECONNREFUSED|segredo-interno|10\.0\.0\.7/);
  });
});

describe('o link por WhatsApp', () => {
  it('telefone inválido', async () => {
    const r = await pedirTelefone({ telefone: '123', redirectTo: `https://${HOST}/dashboard` });
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe(login.CODIGO_TELEFONE_INVALIDO);
  });

  it('canal indisponível mantém o 503 e traz o código próprio', async () => {
    envio = async () => ({ anySent: false, whatsapp: 'failed', whatsappReason: 'Z-API não configurado' });
    const r = await pedirTelefone({ telefone: '22997612255', redirectTo: `https://${HOST}/dashboard` });
    expect(r.status).toBe(503);
    expect((await r.json()).codigo).toBe(login.CODIGO_CANAL_INDISPONIVEL);
  });

  it('falha de envio mantém o 502 e traz o código genérico', async () => {
    envio = async () => ({ anySent: false, whatsapp: 'failed', whatsappReason: 'timeout' });
    const r = await pedirTelefone({ telefone: '22997612255', redirectTo: `https://${HOST}/dashboard` });
    expect(r.status).toBe(502);
    expect((await r.json()).codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
  });

  it('falha do Supabase ao gerar o link', async () => {
    falhaDoLink = { message: 'rate limit exceeded' };
    const r = await pedirTelefone({ telefone: '22997612255', redirectTo: `https://${HOST}/dashboard` });
    expect(r.status).toBe(500);
    expect((await r.json()).codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
  });
});

describe('verificação do e-mail e cadastro', () => {
  it('check-email: e-mail ausente e e-mail sem forma de e-mail', async () => {
    expect((await (await pedirCheck({})).json()).codigo).toBe(login.CODIGO_EMAIL_INVALIDO);
    expect((await (await pedirCheck({ email: 'sem-arroba' })).json()).codigo).toBe(login.CODIGO_EMAIL_INVALIDO);
  });

  it('🔴 check-email: exceção inesperada vira código, sem a mensagem dela', async () => {
    const r = await pedirCheck('{ corpo quebrado, segredo-do-corpo');
    const corpo = await r.json();
    expect(r.status).toBe(500);
    expect(corpo.codigo).toBe(login.CODIGO_FALHA_AO_VERIFICAR);
    expect(textoDoPedido(corpo)).not.toMatch(/JSON|Unexpected|segredo-do-corpo/i);
  });

  it('cadastro: e-mail, nome e telefone inválidos', async () => {
    expect((await (await pedirCadastro({ ...cadastro(), email: 'x' })).json()).codigo).toBe(login.CODIGO_EMAIL_INVALIDO);
    expect((await (await pedirCadastro({ ...cadastro(), nome_completo: '' })).json()).codigo).toBe(login.CODIGO_NOME_OBRIGATORIO);
    expect((await (await pedirCadastro({ ...cadastro(), telefone: '12' })).json()).codigo).toBe(login.CODIGO_TELEFONE_INVALIDO);
  });

  it('cadastro: sem organização no endereço e empresa que não aceita auto-cadastro', async () => {
    slugDoHost = null;
    expect((await (await pedirCadastro(cadastro())).json()).codigo).toBe(login.CODIGO_CADASTRO_INDISPONIVEL);
    slugDoHost = 'macae';
    abertoParaCadastro = false;
    expect((await (await pedirCadastro(cadastro())).json()).codigo).toBe(login.CODIGO_CADASTRO_INDISPONIVEL);
  });

  it('cadastro: e-mail que já existe na organização', async () => {
    emailJaCadastrado = true;
    const r = await pedirCadastro(cadastro());
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe(login.CODIGO_EMAIL_JA_CADASTRADO);
  });

  it('🔴 cadastro: exceção inesperada NÃO vira "Erro: <mensagem>"', async () => {
    const r = await pedirCadastro('{ isto não é json, segredo-do-corpo');
    const corpo = await r.json();
    expect(r.status).toBe(500);
    expect(corpo.codigo).toBe(login.CODIGO_FALHA_NO_CADASTRO);
    expect(textoDoPedido(corpo)).not.toMatch(/JSON|Unexpected|segredo-do-corpo/i);
  });
});

describe('o teto por endereço (IP) também chega com código', () => {
  it('o 9º pedido do mesmo IP volta 429 com o código, que a tela traduz', async () => {
    const headers = { 'content-type': 'application/json', host: HOST, 'x-forwarded-for': '10.9.9.9' };
    let ultimo: Response | null = null;
    for (let i = 0; i < 9; i++) {
      ultimo = await (checkEmail.POST as any)(new NextRequest(`https://${HOST}/api/auth/check-email`, {
        method: 'POST', headers, body: JSON.stringify({ email: 'x' }),
      }));
    }
    expect(ultimo!.status).toBe(429);
    expect(login.chaveDoErroDoPedido(await ultimo!.json())).toBe('errors.tooManyRequests');
  });
});

describe('a tela traduz pelo código, nos 4 idiomas', () => {
  const CODIGOS = [
    login.CODIGO_LIMITE_DESTINO, login.CODIGO_EMAIL_INVALIDO, login.CODIGO_TELEFONE_INVALIDO,
    login.CODIGO_FALHA_NO_ENVIO, login.CODIGO_CANAL_INDISPONIVEL, login.CODIGO_FALHA_AO_VERIFICAR, login.CODIGO_LIMITE_DE_PEDIDOS,
    login.CODIGO_CADASTRO_INDISPONIVEL, login.CODIGO_EMAIL_JA_CADASTRADO, login.CODIGO_NOME_OBRIGATORIO, login.CODIGO_FALHA_NO_CADASTRO,
  ];

  it('cada código tem uma chave, e cada chave existe e tem texto nos 4 idiomas', () => {
    const chaves = CODIGOS.map((codigo) => login.chaveDoErroDoPedido({ codigo }));
    expect(chaves.every(Boolean)).toBe(true);
    expect(new Set(chaves).size).toBe(CODIGOS.length);
    expect([...login.CHAVES_DE_ERRO_DO_PEDIDO].sort()).toEqual([...(chaves as string[])].sort());
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const Login = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).Login;
      for (const chave of chaves as string[]) {
        const texto = chave.split('.').reduce((o: any, k) => o?.[k], Login);
        expect(typeof texto, `${locale}: Login.${chave}`).toBe('string');
        expect((texto as string).length).toBeGreaterThan(5);
      }
    }
  });

  it('código desconhecido ou sem código não vira chave (e "constructor" não passa)', () => {
    for (const r of [null, undefined, {}, { codigo: 'nao-existe' }, { codigo: 'constructor' }, { codigo: 'toString' }, { codigo: 42 }, 'texto']) {
      expect(login.chaveDoErroDoPedido(r)).toBeNull();
    }
  });

  it('a tela de login e o modal de cadastro nunca mostram o texto que veio da rota', () => {
    for (const arquivo of ['app/login/login-form.tsx', 'app/login/signup-modal.tsx']) {
      const fonte = readFileSync(arquivo, 'utf8');
      expect(fonte, arquivo).not.toMatch(/data\?\.error\s*\|\|\s*t\(/);
      expect(fonte, arquivo).not.toMatch(/check\?\.error\s*\|\|/);
      expect(fonte, arquivo).not.toMatch(/setErrorMsg\(\s*(data|check)\??\.error/);
    }
  });
});
