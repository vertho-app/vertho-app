import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteHunter } from '@/lib/mercado-potencial/enriquecimento/hunter';

/**
 * Contrato do cliente do Hunter. O fornecedor NÃO é chamado (fetch injetado): o que se prova é o NOSSO código,
 * ou seja, quais parâmetros saem (só nome e domínio), onde a chave vai (cabeçalho, nunca URL) e como cada
 * status vira "acabou o crédito" ou "indisponível". Se a API do Hunter mudar, isto passa feliz: quem avisa é o
 * `creditos()` no plano e o `hunter_status` gravado.
 */

interface Chamada { url: URL; headers: Record<string, string> }
function falso(respostas: Array<{ status?: number; body?: any } | 'lanca'>) {
  const chamadas: Chamada[] = [];
  let i = 0;
  const fetchImpl = (async (u: URL, init: any) => {
    chamadas.push({ url: u, headers: init?.headers ?? {} });
    const r = respostas[Math.min(i++, respostas.length - 1)];
    if (r === 'lanca') throw new Error('rede');
    return { status: r.status ?? 200, json: async () => r.body ?? null } as any;
  }) as unknown as typeof fetch;
  return { fetchImpl, chamadas };
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('criarClienteHunter: chave', () => {
  it('sem chave no ambiente devolve null (quem chama trata como "Hunter indisponível")', () => {
    vi.stubEnv('HUNTER_API', '');
    expect(criarClienteHunter()).toBeNull();
    expect(criarClienteHunter({ chave: '   ' })).toBeNull();
  });

  it('a chave é lida em tempo de execução, na criação (não numa const de topo de módulo)', () => {
    vi.stubEnv('HUNTER_API', '');
    expect(criarClienteHunter()).toBeNull();
    vi.stubEnv('HUNTER_API', 'chave-de-teste');
    expect(criarClienteHunter()).not.toBeNull();
  });

  it('a chave vai no cabeçalho X-API-KEY e NUNCA na URL (a URL cai em log)', async () => {
    const { fetchImpl, chamadas } = falso([{ body: { data: { requests: { credits: { remaining: 4 } } } } }]);
    const h = criarClienteHunter({ chave: 'segredo-123', fetchImpl })!;
    await h.creditos();
    expect(chamadas[0].headers['X-API-KEY']).toBe('segredo-123');
    expect(chamadas[0].url.toString()).not.toContain('segredo-123');
    expect(chamadas[0].url.searchParams.has('api_key')).toBe(false);
  });
});

describe('criarClienteHunter: parâmetros que saem', () => {
  it('Domain Search pede só pessoas (type=personal) de nível sênior ou executivo, com limit 10 (teto do plano Free)', async () => {
    const { fetchImpl, chamadas } = falso([{ body: { data: { emails: [] } } }]);
    await criarClienteHunter({ chave: 'k', fetchImpl })!.domainSearch('colegioexemplo.com.br');
    const p = chamadas[0].url.searchParams;
    expect(chamadas[0].url.pathname).toBe('/v2/domain-search');
    expect(p.get('domain')).toBe('colegioexemplo.com.br');
    expect(p.get('type')).toBe('personal');
    expect(p.get('seniority')).toBe('senior,executive');
    expect(p.get('limit')).toBe('10');
    expect(p.has('offset')).toBe(false);
  });

  it('Email Finder manda só domínio e nome completo', async () => {
    const { fetchImpl, chamadas } = falso([{ body: { data: { email: 'Maria.Lima@ColegioExemplo.com.br', score: 91, verification: { status: 'valid' } } } }]);
    const r = await criarClienteHunter({ chave: 'k', fetchImpl })!.emailFinder('colegioexemplo.com.br', 'Maria Lima');
    expect([...chamadas[0].url.searchParams.keys()].sort()).toEqual(['domain', 'full_name']);
    expect(r).toEqual({ email: 'maria.lima@colegioexemplo.com.br', score: 91, status: 'valid' });
  });

  it('Domain Search devolve pessoas com e-mail em minúsculas, nome montado e cargo; descarta item sem e-mail', async () => {
    const { fetchImpl } = falso([{ body: { data: { emails: [
      { value: 'Diretor@Escola.com.br', first_name: 'Jorge', last_name: 'Alves', position: 'Diretor Geral', confidence: 88, verification: { status: 'accept_all' } },
      { first_name: 'Sem', last_name: 'Email', position: 'Diretor' },
    ] } } }]);
    const r = await criarClienteHunter({ chave: 'k', fetchImpl })!.domainSearch('escola.com.br');
    expect(r.pessoas).toEqual([{ email: 'diretor@escola.com.br', nome: 'Jorge Alves', cargo: 'Diretor Geral', score: 88, status: 'accept_all' }]);
  });

  it('Verifier manda só o e-mail e devolve o status', async () => {
    const { fetchImpl, chamadas } = falso([{ body: { data: { status: 'valid' } } }]);
    const r = await criarClienteHunter({ chave: 'k', fetchImpl })!.verificar('a@b.com');
    expect(chamadas[0].url.pathname).toBe('/v2/email-verifier');
    expect([...chamadas[0].url.searchParams.keys()]).toEqual(['email']);
    expect(r).toEqual({ status: 'valid' });
  });
});

describe('criarClienteHunter: erros', () => {
  it('402 e 429 = acabou o crédito ou o limite', async () => {
    for (const status of [402, 429]) {
      const { fetchImpl } = falso([{ status }]);
      const h = criarClienteHunter({ chave: 'k', fetchImpl })!;
      expect((await h.emailFinder('a.com', 'Fulano Silva')).erro, `finder ${status}`).toBe('sem_creditos');
      expect((await h.domainSearch('a.com')).erro, `domain ${status}`).toBe('sem_creditos');
      expect((await h.verificar('a@a.com')).erro, `verifier ${status}`).toBe('sem_creditos');
    }
  });

  it('401, 5xx e rede caída = indisponível (não é "sem resultado")', async () => {
    for (const r of [{ status: 401 }, { status: 500 }, { status: 503 }, 'lanca' as const]) {
      const { fetchImpl } = falso([r]);
      const h = criarClienteHunter({ chave: 'k', fetchImpl })!;
      expect((await h.emailFinder('a.com', 'Fulano Silva')).erro, JSON.stringify(r)).toBe('indisponivel');
    }
  });

  it('400 e 404 = a consulta não casou ninguém: sem erro e sem e-mail', async () => {
    for (const status of [400, 404]) {
      const { fetchImpl } = falso([{ status, body: { errors: [{ id: 'x' }] } }]);
      const h = criarClienteHunter({ chave: 'k', fetchImpl })!;
      expect(await h.emailFinder('a.com', 'Fulano Silva')).toEqual({ email: null, score: null, status: null });
      expect(await h.domainSearch('a.com')).toEqual({ pessoas: [] });
    }
  });

  it('o saldo de créditos vem de /account; resposta estranha vira null (não bloqueia, a chamada acusa)', async () => {
    const ok = falso([{ body: { data: { requests: { credits: { remaining: 4.5 } } } } }]);
    expect(await criarClienteHunter({ chave: 'k', fetchImpl: ok.fetchImpl })!.creditos()).toBe(4.5);
    expect(ok.chamadas[0].url.pathname).toBe('/v2/account');
    const estranha = falso([{ body: { data: {} } }]);
    expect(await criarClienteHunter({ chave: 'k', fetchImpl: estranha.fetchImpl })!.creditos()).toBeNull();
    const erro = falso([{ status: 500 }]);
    expect(await criarClienteHunter({ chave: 'k', fetchImpl: erro.fetchImpl })!.creditos()).toBeNull();
  });

  it('não escreve nada no console (nome e e-mail iriam para o log da Vercel)', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { fetchImpl } = falso([{ body: { data: { email: 'maria@escola.com.br' } } }, { status: 500 }, 'lanca']);
    const h = criarClienteHunter({ chave: 'k', fetchImpl })!;
    await h.emailFinder('escola.com.br', 'Maria Lima');
    await h.emailFinder('escola.com.br', 'Maria Lima');
    await h.emailFinder('escola.com.br', 'Maria Lima');
    for (const e of espioes) expect(e).not.toHaveBeenCalled();
    espioes.forEach((e) => e.mockRestore());
  });
});
