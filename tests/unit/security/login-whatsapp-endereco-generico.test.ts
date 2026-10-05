/**
 * R-76 (revisão de 02/10/2026), segunda metade: o login por WhatsApp no endereço
 * genérico (`app.vertho.ai`, sem subdomínio de tenant).
 *
 * Até 04/10/2026 a rota respondia 400 `sem-organizacao` ali, porque descobrir a
 * organização pelo número pede ler `colaboradores` de todas as empresas. O dono
 * mandou resolver, e o desenho é o do login por e-mail (`check-email` +
 * `magic-link`), aplicado ao telefone:
 *
 *   0 organizações  -> `{ ok: true }` sem enviar, IGUAL ao host de tenant com
 *                      número desconhecido (anti-enumeração);
 *   1 organização  -> segue como se o host fosse o dela, e o link nasce no host
 *                      do tenant (o cookie de sessão é preso ao host exato);
 *   2 ou mais      -> devolve a lista `{ slug, nome }` para a tela perguntar; a
 *                      escolha volta como `empresaSlug` e só ESCOPA a busca.
 *
 * O banco aqui é um fake em memória que INTERPRETA os filtros da cadeia (`eq`,
 * `in`, `order`) e projeta só as colunas pedidas: tirar um filtro da rota muda o
 * resultado, que é o que as mutações do relatório exercitam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock, type Chamada } from '../../helpers/supabase-mock';

type Linha = Record<string, any>;

const TEL_DIGITOS = '22997612255';
const TEL = '5522997612255'; // E.164 sem o "+", como o cadastro guarda

const banco: { empresas: Linha[]; colaboradores: Linha[] } = { empresas: [], colaboradores: [] };
let slugDoHost: string | null = null;
let limite: Response | null = null;
const ordem: string[] = [];

function consultar(tabela: string, cols: string, cadeia: Chamada[]): Linha[] {
  let linhas: Linha[] = [...((banco as any)[tabela] || [])];
  for (const el of cadeia) {
    if (el.metodo === 'eq') linhas = linhas.filter((l) => l[el.args[0]] === el.args[1]);
    else if (el.metodo === 'in') linhas = linhas.filter((l) => (el.args[1] as any[]).includes(l[el.args[0]]));
    else if (el.metodo === 'order') {
      const coluna = el.args[0];
      const asc = el.args[1]?.ascending !== false;
      linhas.sort((a, b) => (a[coluna] > b[coluna] ? 1 : a[coluna] < b[coluna] ? -1 : 0) * (asc ? 1 : -1));
    } else if (!['select', 'limit', 'maybeSingle'].includes(el.metodo)) {
      // Filtro que este fake não modela: falhar alto em vez de devolver linhas que
      // um filtro de verdade teria cortado.
      throw new Error(`o fake do banco não modela .${el.metodo}() em ${tabela}`);
    }
  }
  const nomes = cols.split(',').map((s) => s.trim()).filter(Boolean);
  return linhas.map((l) => (nomes.length && !nomes.includes('*') ? Object.fromEntries(nomes.map((n) => [n, l[n]])) : { ...l }));
}

const sb = criarSupabaseMock({
  resolver: (tabela, cols, cadeia) => consultar(tabela, cols, cadeia)[0] ?? null,
  lista: (tabela, cols, cadeia) => consultar(tabela, cols, cadeia),
});
const client: any = sb.client;
const fromOriginal = client.from;
client.from = (tabela: string) => { ordem.push(`consulta:${tabela}`); return fromOriginal(tabela); };

const createUser = vi.fn(async (_a: any) => ({ data: { user: null }, error: null as any }));
const generateLink = vi.fn(async (_a: any) => ({
  data: { properties: { hashed_token: 'tok-abc12345' } } as any,
  error: null as any,
}));
client.auth = { admin: { createUser, generateLink } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => client }));
vi.mock('@/lib/tenant-resolver', () => ({ getTenantSlug: () => slugDoHost }));
const limitarPorDestino = vi.fn(async (_req: any, _canal: string, _valor: string) => {
  ordem.push('limite');
  return limite;
});
vi.mock('@/lib/rate-limit', () => ({ authLimiter: { check: async () => null }, limitarPorDestino: (...a: [any, string, string]) => limitarPorDestino(...a) }));

const enviados: any[] = [];
let resultadoDoEnvio: any = { anySent: true, email: 'skipped', whatsapp: 'sent' };
vi.mock('@/lib/notifications/access-link-service', () => ({
  sendAccessLink: async (p: any) => { ordem.push('envio'); enviados.push(p); return resultadoDoEnvio; },
  recipientFromLookup: () => ({ eligible: false, nome: '', telefone: null }),
}));

const rota = await import('@/app/api/auth/phone-magic-link/request/route');
const login = await import('@/lib/auth/login-respostas');
const { NextRequest } = await import('next/server');

const CAMINHO = '/api/auth/phone-magic-link/request';

function pedir(host: string, corpo: Record<string, unknown>) {
  return rota.POST(new NextRequest(`https://${host}${CAMINHO}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' },
    body: JSON.stringify(corpo),
  })) as Promise<Response>;
}
/** Pedido feito no endereço genérico, como a tela faz. */
function pedirNoGenerico(extra: Record<string, unknown> = {}, redirectoPara = '/dashboard') {
  slugDoHost = null;
  return pedir('app.vertho.ai', { telefone: TEL_DIGITOS, redirectTo: `https://app.vertho.ai${redirectoPara}`, locale: 'pt-BR', ...extra });
}
/** Pedido feito no endereço de uma organização. */
function pedirNoTenant(slug: string, extra: Record<string, unknown> = {}) {
  slugDoHost = slug;
  return pedir(`${slug}.vertho.ai`, { telefone: TEL_DIGITOS, redirectTo: `https://${slug}.vertho.ai/dashboard`, locale: 'pt-BR', ...extra });
}

function colab(empresaId: string, over: Linha = {}): Linha {
  return {
    id: `col-${empresaId}`,
    empresa_id: empresaId,
    telefone: TEL,
    login_por_whatsapp: true,
    nome_completo: 'Geane Souza',
    email: `geane@${empresaId}.br`,
    ...over,
  };
}

// ── Captura de tudo que a rota escreve no log ────────────────────────────────
const logs: string[] = [];
const espioes: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  sb.reset();
  enviados.length = 0;
  ordem.length = 0;
  logs.length = 0;
  createUser.mockClear();
  generateLink.mockClear();
  limitarPorDestino.mockClear();
  limite = null;
  slugDoHost = null;
  resultadoDoEnvio = { anySent: true, email: 'skipped', whatsapp: 'sent' };
  createUser.mockImplementation(async () => ({ data: { user: null }, error: null }));
  generateLink.mockImplementation(async () => ({ data: { properties: { hashed_token: 'tok-abc12345' } }, error: null }));
  banco.empresas = [
    { id: 'emp-a', slug: 'escola-a', nome: 'Escola Alfa', is_demo: false },
    { id: 'emp-b', slug: 'escola-b', nome: 'Colégio Beta', is_demo: false },
    { id: 'emp-d', slug: 'acme-demo', nome: 'ACME Demo', is_demo: true },
  ];
  banco.colaboradores = [];
  for (const metodo of ['error', 'warn', 'log', 'info'] as const) {
    espioes.push(vi.spyOn(console, metodo).mockImplementation((...args: any[]) => { logs.push(args.map(String).join(' ')); }));
  }
});
afterEach(() => { while (espioes.length) espioes.pop()!.mockRestore(); });

async function leitura(r: Response) {
  return { status: r.status, tipo: r.headers.get('content-type'), corpo: await r.text() };
}

describe('host de tenant: continua igual (byte a byte)', () => {
  it('número cadastrado: envia pelo host do tenant e responde { ok: true }', async () => {
    banco.colaboradores = [colab('emp-a')];
    const r = await pedirNoTenant('escola-a');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser.mock.calls[0][0]).toEqual({ email: 'geane@emp-a.br', email_confirm: true });
    expect(generateLink.mock.calls[0][0]).toEqual({
      type: 'magiclink',
      email: 'geane@emp-a.br',
      options: { redirectTo: 'https://escola-a.vertho.ai/dashboard' },
    });
    expect(enviados).toEqual([{
      to: 'geane@emp-a.br',
      telefone: TEL,
      nome: 'Geane',
      empresaNome: 'Escola Alfa',
      empresaId: 'emp-a',
      locale: 'pt-BR',
      whatsappLink: 'https://escola-a.vertho.ai/auth/callback?token_hash=tok-abc12345&type=email&next=%2Fdashboard',
      tenantSlug: 'escola-a',
      channels: ['whatsapp'],
    }]);
  });

  it('o link nasce no host da PRÓPRIA requisição (preview, domínio próprio), não num host remontado', async () => {
    banco.colaboradores = [colab('emp-a')];
    slugDoHost = 'escola-a';
    await pedir('preview-abc123.vercel.app', { telefone: TEL_DIGITOS, redirectTo: 'https://preview-abc123.vercel.app/dashboard', locale: 'pt-BR' });
    expect(enviados[0].whatsappLink).toBe('https://preview-abc123.vercel.app/auth/callback?token_hash=tok-abc12345&type=email&next=%2Fdashboard');
  });

  it('o destino pedido vai no `next` como pedido, inclusive o do painel (a regra nova é só do endereço genérico)', async () => {
    banco.colaboradores = [colab('emp-a')];
    slugDoHost = 'escola-a';
    await pedir('escola-a.vertho.ai', { telefone: TEL_DIGITOS, redirectTo: 'https://escola-a.vertho.ai/admin/dashboard', locale: 'pt-BR' });
    expect(enviados[0].whatsappLink).toBe('https://escola-a.vertho.ai/auth/callback?token_hash=tok-abc12345&type=email&next=%2Fadmin%2Fdashboard');
  });

  it('número desconhecido: { ok: true } sem enviar, sem criar conta', async () => {
    const r = await pedirNoTenant('escola-a');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('o número só existe em OUTRA empresa: no host do tenant não se procura fora dele', async () => {
    banco.colaboradores = [colab('emp-b')];
    const r = await pedirNoTenant('escola-a');
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
  });

  it('o host manda: o `empresaSlug` do corpo é ignorado', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    const r = await pedirNoTenant('escola-a', { empresaSlug: 'escola-b' });
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].empresaId).toBe('emp-a');
    expect(enviados[0].whatsappLink).toMatch(/^https:\/\/escola-a\.vertho\.ai\//);
  });

  it('no host do tenant não há leitura de colaboradores sem filtro de empresa', async () => {
    banco.colaboradores = [colab('emp-a')];
    await pedirNoTenant('escola-a');
    const leituras = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'select');
    expect(leituras.length).toBeGreaterThan(0);
    const filtros = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'eq').map((c) => c.args[0]);
    expect(filtros).toContain('empresa_id');
    expect(sb.chamadas.some((c) => c.tabela === 'colaboradores' && c.metodo === 'in')).toBe(false);
  });

  it('o telefone inválido segue 400 com o código, antes do teto e de qualquer consulta', async () => {
    const r = await pedir('escola-a.vertho.ai', { telefone: '123', redirectTo: 'https://escola-a.vertho.ai/dashboard' });
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe(login.CODIGO_TELEFONE_INVALIDO);
    expect(limitarPorDestino).not.toHaveBeenCalled();
    expect(sb.chamadas).toHaveLength(0);
  });

  it('falha ao enviar mantém os status de antes: 502 e 503', async () => {
    banco.colaboradores = [colab('emp-a')];
    resultadoDoEnvio = { anySent: false, email: 'skipped', whatsapp: 'failed', whatsappReason: 'falha no envio' };
    const falhou = await pedirNoTenant('escola-a');
    expect(falhou.status).toBe(502);
    expect((await falhou.json()).codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);

    resultadoDoEnvio = { anySent: false, email: 'skipped', whatsapp: 'failed', whatsappReason: 'Z-API não configurado' };
    const indisponivel = await pedirNoTenant('escola-a');
    expect(indisponivel.status).toBe(503);
    expect((await indisponivel.json()).codigo).toBe(login.CODIGO_CANAL_INDISPONIVEL);
  });
});

describe('endereço genérico: 0 correspondências', () => {
  it('número desconhecido: { ok: true } sem enviar e sem criar conta', async () => {
    const r = await pedirNoGenerico();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('o número está com `login_por_whatsapp` desligado: também é 0', async () => {
    banco.colaboradores = [colab('emp-a', { login_por_whatsapp: false })];
    const r = await pedirNoGenerico();
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
  });

  it('🔴 o número só existe em tenant de DEMONSTRAÇÃO: é 0, nada sai', async () => {
    banco.colaboradores = [colab('emp-d')];
    const r = await pedirNoGenerico();
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe('endereço genérico: 1 correspondência', () => {
  it('🔴 segue o fluxo normal e o link nasce no HOST DO TENANT, não em app.vertho.ai', async () => {
    banco.colaboradores = [colab('emp-b')];
    const r = await pedirNoGenerico();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toEqual({
      to: 'geane@emp-b.br',
      telefone: TEL,
      nome: 'Geane',
      empresaNome: 'Colégio Beta',
      empresaId: 'emp-b',
      locale: 'pt-BR',
      whatsappLink: 'https://escola-b.vertho.ai/auth/callback?token_hash=tok-abc12345&type=email&next=%2Fdashboard',
      tenantSlug: 'escola-b',
      channels: ['whatsapp'],
    });
    expect(enviados[0].whatsappLink).not.toContain('app.vertho.ai');
  });

  it('sem e-mail no cadastro, a identidade é o proxy da EMPRESA descoberta', async () => {
    banco.colaboradores = [colab('emp-b', { email: null })];
    await pedirNoGenerico();
    expect(enviados[0].to).toBe(`wa.empb.${TEL}@nao-email.vertho.ai`);
    expect(createUser.mock.calls[0][0].email).toBe(`wa.empb.${TEL}@nao-email.vertho.ai`);
  });

  it('o destino do painel da plataforma não atravessa para o host do tenant', async () => {
    banco.colaboradores = [colab('emp-b')];
    await pedirNoGenerico({}, '/admin/dashboard');
    expect(enviados[0].whatsappLink).toBe('https://escola-b.vertho.ai/auth/callback?token_hash=tok-abc12345&type=email&next=%2Fdashboard');
  });

  it('um destino comum da pessoa é preservado no link', async () => {
    banco.colaboradores = [colab('emp-b')];
    await pedirNoGenerico({}, '/dashboard/trilha?semana=3');
    expect(enviados[0].whatsappLink).toBe(
      'https://escola-b.vertho.ai/auth/callback?token_hash=tok-abc12345&type=email&next=' + encodeURIComponent('/dashboard/trilha?semana=3'),
    );
  });

  it('dois cadastros, um deles em demonstração: sobra UMA organização e a lista não aparece', async () => {
    banco.colaboradores = [colab('emp-b'), colab('emp-d')];
    const r = await pedirNoGenerico();
    const corpo = await r.json();
    expect(corpo).toEqual({ ok: true });
    expect(corpo.orgs).toBeUndefined();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].empresaId).toBe('emp-b');
  });
});

describe('🔴 anti-enumeração: 0 e 1 correspondência são indistinguíveis', () => {
  it('no endereço genérico, mesmo status, mesmo tipo e mesmo corpo, byte a byte', async () => {
    const zero = await leitura(await pedirNoGenerico());
    expect(enviados).toHaveLength(0);

    banco.colaboradores = [colab('emp-b')];
    const uma = await leitura(await pedirNoGenerico());
    expect(enviados).toHaveLength(1);

    expect(uma).toEqual(zero);
    expect(zero.status).toBe(200);
    expect(zero.corpo).toBe('{"ok":true}');
  });

  it('e é a mesma resposta do host de tenant com número desconhecido', async () => {
    const hostDesconhecido = await leitura(await pedirNoTenant('escola-a'));
    const genericoDesconhecido = await leitura(await pedirNoGenerico());
    banco.colaboradores = [colab('emp-b')];
    const genericoConhecido = await leitura(await pedirNoGenerico());
    expect(genericoDesconhecido).toEqual(hostDesconhecido);
    expect(genericoConhecido).toEqual(hostDesconhecido);
  });

  it('número só em demonstração, número com a flag desligada e número que não existe respondem igual', async () => {
    const naoExiste = await leitura(await pedirNoGenerico());
    banco.colaboradores = [colab('emp-d')];
    const soDemo = await leitura(await pedirNoGenerico());
    banco.colaboradores = [colab('emp-a', { login_por_whatsapp: false })];
    const semFlag = await leitura(await pedirNoGenerico());
    expect(soDemo).toEqual(naoExiste);
    expect(semFlag).toEqual(naoExiste);
  });
});

describe('endereço genérico: 2 ou mais correspondências', () => {
  it('🔴 devolve a lista { slug, nome } com o código novo, em ordem de nome, e NÃO envia nada', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    const r = await pedirNoGenerico();
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toEqual({
      codigo: login.CODIGO_ESCOLHER_ORGANIZACAO,
      orgs: [
        { slug: 'escola-b', nome: 'Colégio Beta' },
        { slug: 'escola-a', nome: 'Escola Alfa' },
      ],
    });
    expect(login.CODIGO_ESCOLHER_ORGANIZACAO).toBe('escolher-organizacao');
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('a lista não carrega nada além de slug e nome: sem ids, e-mail, telefone ou nome da pessoa', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    const texto = await (await pedirNoGenerico()).text();
    for (const proibido of ['emp-a', 'emp-b', 'geane', 'Geane', 'Souza', TEL, TEL_DIGITOS, 'col-', 'is_demo', 'acme']) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it('o tenant de demonstração não entra na lista', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b'), colab('emp-d')];
    const corpo = await (await pedirNoGenerico()).json();
    expect(corpo.orgs.map((o: any) => o.slug)).toEqual(['escola-b', 'escola-a']);
  });

  it('a mesma pessoa duas vezes na MESMA empresa conta uma organização só', async () => {
    banco.colaboradores = [colab('emp-b'), colab('emp-b', { id: 'col-b-2' })];
    const corpo = await (await pedirNoGenerico()).json();
    expect(corpo).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
  });
});

describe('endereço genérico: a escolha da pessoa só ESCOPA a busca', () => {
  beforeEach(() => { banco.colaboradores = [colab('emp-a'), colab('emp-b')]; });

  it('🔴 escolha válida: envia só naquela empresa, com o link no host dela', async () => {
    const r = await pedirNoGenerico({ empresaSlug: 'escola-a' });
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].empresaId).toBe('emp-a');
    expect(enviados[0].to).toBe('geane@emp-a.br');
    expect(enviados[0].whatsappLink).toMatch(/^https:\/\/escola-a\.vertho\.ai\/auth\/callback\?token_hash=/);
    expect(enviados[0].tenantSlug).toBe('escola-a');
  });

  it('a escolha é normalizada como a do e-mail (caixa e espaços)', async () => {
    await pedirNoGenerico({ empresaSlug: '  Escola-B ' });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].empresaId).toBe('emp-b');
  });

  it('🔴 o número NÃO está na empresa escolhida: resposta genérica, sem enviar (nem para a outra)', async () => {
    banco.colaboradores = [colab('emp-a')];
    const r = await leitura(await pedirNoGenerico({ empresaSlug: 'escola-b' }));
    expect(r).toEqual({ status: 200, tipo: r.tipo, corpo: '{"ok":true}' });
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('🔴 a empresa escolhida é de demonstração: resposta genérica, sem enviar', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-d')];
    const r = await pedirNoGenerico({ empresaSlug: 'acme-demo' });
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('empresa que não existe: resposta genérica, sem enviar', async () => {
    const r = await pedirNoGenerico({ empresaSlug: 'nao-existe' });
    expect(await r.json()).toEqual({ ok: true });
    expect(enviados).toHaveLength(0);
  });

  it('🔴 escolha malformada nunca chega ao banco: é descartada e a lista volta', async () => {
    for (const ruim of ['../../x', 'escola b', 'ESCOLA_B!', '-escola', 'a'.repeat(64), '%', "x' or 1=1 --", 42, null, ['escola-a'], { slug: 'escola-a' }]) {
      sb.reset();
      const corpo = await (await pedirNoGenerico({ empresaSlug: ruim })).json();
      expect(corpo.codigo, JSON.stringify(ruim)).toBe(login.CODIGO_ESCOLHER_ORGANIZACAO);
      const consultasPorSlug = sb.chamadas.filter((c) => c.tabela === 'empresas' && c.metodo === 'eq' && c.args[0] === 'slug');
      expect(consultasPorSlug, JSON.stringify(ruim)).toHaveLength(0);
    }
    expect(enviados).toHaveLength(0);
  });
});

describe('o teto por telefone vem ANTES de qualquer consulta', () => {
  beforeEach(() => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    limite = new Response(JSON.stringify({ error: 'x', codigo: login.CODIGO_LIMITE_DESTINO }), { status: 429, headers: { 'content-type': 'application/json' } });
  });

  it('🔴 endereço genérico: 429 sem tocar o banco, sem criar conta, sem enviar', async () => {
    const r = await pedirNoGenerico();
    expect(r.status).toBe(429);
    expect((await r.json()).codigo).toBe(login.CODIGO_LIMITE_DESTINO);
    expect(sb.chamadas).toHaveLength(0);
    expect(ordem.filter((o) => o.startsWith('consulta:'))).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
    expect(enviados).toHaveLength(0);
  });

  it('também com a escolha da organização no corpo', async () => {
    const r = await pedirNoGenerico({ empresaSlug: 'escola-a' });
    expect(r.status).toBe(429);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('host de tenant: o mesmo, como antes', async () => {
    const r = await pedirNoTenant('escola-a');
    expect(r.status).toBe(429);
    expect(sb.chamadas).toHaveLength(0);
  });

  it('o teto é pedido para o telefone em E.164, e a primeira consulta vem depois dele', async () => {
    limite = null;
    await pedirNoGenerico();
    expect(limitarPorDestino).toHaveBeenCalledTimes(1);
    expect(limitarPorDestino.mock.calls[0][1]).toBe('telefone');
    expect(limitarPorDestino.mock.calls[0][2]).toBe(TEL);
    expect(ordem[0]).toBe('limite');
    expect(ordem.indexOf('limite')).toBeLessThan(ordem.findIndex((o) => o.startsWith('consulta:')));
  });
});

describe('o que a rota lê do banco', () => {
  it('🔴 a ÚNICA leitura sem empresa é a do telefone exato, só a coluna empresa_id', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    await pedirNoGenerico();
    const colaboradores = sb.chamadas.filter((c) => c.tabela === 'colaboradores');
    expect(colaboradores.map((c) => c.metodo)).toEqual(['select', 'eq', 'eq']);
    expect(colaboradores[0].args[0]).toBe('empresa_id');
    expect(colaboradores[1].args).toEqual(['telefone', TEL]);
    expect(colaboradores[2].args).toEqual(['login_por_whatsapp', true]);
  });

  it('nenhum coringa: sem ilike, like, or, neq ou range em colaboradores nem em empresas', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    await pedirNoGenerico();
    banco.colaboradores = [colab('emp-b')];
    await pedirNoGenerico();
    await pedirNoGenerico({ empresaSlug: 'escola-b' });
    const usados = new Set(sb.chamadas.filter((c) => ['colaboradores', 'empresas'].includes(c.tabela)).map((c) => c.metodo));
    for (const proibido of ['ilike', 'like', 'or', 'neq', 'range', 'filter', 'contains']) expect(usados.has(proibido), proibido).toBe(false);
  });

  it('com a escolha na mão, a rota nem faz a leitura do telefone sem empresa', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    await pedirNoGenerico({ empresaSlug: 'escola-b' });
    const semEmpresa = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'eq' && c.args[0] === 'telefone');
    const comEmpresa = sb.chamadas.filter((c) => c.tabela === 'colaboradores' && c.metodo === 'eq' && c.args[0] === 'empresa_id');
    expect(comEmpresa.length).toBe(semEmpresa.length);
  });
});

describe('falhas', () => {
  it('🔴 erro de banco na descoberta: 500 com código, nada enviado (não vira "não encontrado")', async () => {
    banco.colaboradores = [colab('emp-b')];
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r = await pedirNoGenerico();
    expect(r.status).toBe(500);
    expect((await r.json()).codigo).toBe(login.CODIGO_FALHA_NO_ENVIO);
    expect(enviados).toHaveLength(0);
  });

  it('erro ao ler as empresas da descoberta: 500, nada enviado', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const r = await pedirNoGenerico();
    expect(r.status).toBe(500);
    expect(enviados).toHaveLength(0);
  });

  it('erro ao ler a empresa escolhida: 500, nada enviado', async () => {
    banco.colaboradores = [colab('emp-a')];
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout no pool' });
    const r = await pedirNoGenerico({ empresaSlug: 'escola-a' });
    expect(r.status).toBe(500);
    expect(enviados).toHaveLength(0);
  });

  it('o envio que falha no endereço genérico mantém os status 502 e 503', async () => {
    banco.colaboradores = [colab('emp-b')];
    resultadoDoEnvio = { anySent: false, email: 'skipped', whatsapp: 'failed', whatsappReason: 'falha no envio' };
    expect((await pedirNoGenerico()).status).toBe(502);
    resultadoDoEnvio = { anySent: false, email: 'skipped', whatsapp: 'failed', whatsappReason: 'Z-API não configurado' };
    expect((await pedirNoGenerico()).status).toBe(503);
  });
});

describe('o log não imprime o telefone inteiro', () => {
  const inteiro = (texto: string) => texto.includes(TEL) || texto.includes(TEL_DIGITOS);

  it('motivo do envio, erro do createUser e erro do generateLink chegam mascarados', async () => {
    banco.colaboradores = [colab('emp-b', { email: null })];

    resultadoDoEnvio = { anySent: false, email: 'skipped', whatsapp: 'failed', whatsappReason: `Meta rejeitou o número ${TEL}` };
    await pedirNoGenerico();

    createUser.mockImplementationOnce(async () => ({ data: { user: null }, error: { message: `invalid email wa.empb.${TEL}@nao-email.vertho.ai` } }));
    await pedirNoGenerico();

    generateLink.mockImplementationOnce(async () => ({ data: null, error: { message: `User ${TEL} not found` } }));
    await pedirNoGenerico();

    expect(logs.length).toBeGreaterThanOrEqual(3);
    for (const linha of logs) expect(inteiro(linha), linha).toBe(false);
    // O sufixo continua no log: serve para o operador reconhecer o caso.
    expect(logs.some((l) => l.includes('2255'))).toBe(true);
  });

  it('nenhuma linha de log do fluxo feliz, da lista ou da falha de banco traz o número', async () => {
    banco.colaboradores = [colab('emp-a'), colab('emp-b')];
    await pedirNoGenerico();
    await pedirNoGenerico({ empresaSlug: 'escola-a' });
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: `falha lendo ${TEL}` });
    await pedirNoGenerico();
    for (const linha of logs) expect(inteiro(linha), linha).toBe(false);
  });
});

describe('a resposta que a tela lê', () => {
  it('só aceita lista com 2 ou mais organizações bem formadas', () => {
    const duas = [{ slug: 'a', nome: 'A' }, { slug: 'b', nome: 'B' }];
    expect(login.organizacoesParaEscolher({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO, orgs: duas })).toEqual(duas);
    // Uma só não é escolha, e uma lista de 1 revelaria onde a pessoa trabalha à toa.
    expect(login.organizacoesParaEscolher({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO, orgs: [duas[0]] })).toBeNull();
    expect(login.organizacoesParaEscolher({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO, orgs: [] })).toBeNull();
    // Sem o código, uma lista solta não conta.
    expect(login.organizacoesParaEscolher({ orgs: duas })).toBeNull();
    expect(login.organizacoesParaEscolher({ ok: true })).toBeNull();
    for (const ruim of [null, undefined, 'texto', 42, []]) expect(login.organizacoesParaEscolher(ruim)).toBeNull();
    // Item malformado derruba a lista inteira: a tela não monta botão com lixo.
    expect(login.organizacoesParaEscolher({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO, orgs: [duas[0], { slug: 7, nome: 'B' }] })).toBeNull();
    expect(login.organizacoesParaEscolher({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO, orgs: [duas[0], { slug: 'b' }] })).toBeNull();
  });

  it('o código da lista não é erro: não tem chave de tradução', () => {
    expect(login.chaveDoErroDoPedido({ codigo: login.CODIGO_ESCOLHER_ORGANIZACAO })).toBeNull();
  });

  it('o código `sem-organizacao` e a frase que o acompanhava saíram dos 4 idiomas e do código', () => {
    expect((login as any).CODIGO_SEM_ORGANIZACAO).toBeUndefined();
    expect(login.chaveDoErroDoPedido({ codigo: 'sem-organizacao' })).toBeNull();
    for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).Login;
      expect(m.errors.whatsappNeedsOrganization, locale).toBeUndefined();
      expect(typeof m.useAnotherNumber, `${locale}.useAnotherNumber`).toBe('string');
      expect(m.useAnotherNumber).not.toBe(m.useAnotherEmail);
    }
  });

  it('a tela usa a lista no caminho do WhatsApp e reenvia com `empresaSlug`', () => {
    const fonte = readFileSync('app/login/login-form.tsx', 'utf8');
    expect(fonte).toContain('organizacoesParaEscolher');
    expect(fonte).toMatch(/phone-magic-link\/request[\s\S]{0,400}empresaSlug/);
    expect(fonte).not.toContain('CODIGO_SEM_ORGANIZACAO');
    expect(fonte).not.toContain('whatsappNeedsOrganization');
  });
});
