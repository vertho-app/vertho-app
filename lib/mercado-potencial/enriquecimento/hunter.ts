/**
 * Cliente do Hunter (hunter.io): e-mail direto de quem decide. Dado pessoal vai para um operador fora do
 * Brasil, então: só nome e domínio saem, NENHUM log com nome ou e-mail (os logs da Vercel ficam guardados),
 * e a chave é lida em TEMPO DE EXECUÇÃO (const de topo de módulo congela o valor antes de a env existir).
 *
 * Plano Free medido em 16/10/2026: 50 créditos/mês, `limit + offset <= 10` no Domain Search, 1 crédito por
 * busca com resultado (e por e-mail achado no Finder; "não achou" não cobra), 0,5 por verificação.
 */

export type ErroHunter = 'sem_creditos' | 'indisponivel';

export interface PessoaHunter {
  email: string;
  nome: string | null;
  cargo: string | null;
  score: number | null;
  status: string | null;
}

export interface ClienteHunter {
  /** Créditos que restam no plano, ou null se não deu para saber (não bloqueia: o erro vem na chamada). */
  creditos(): Promise<number | null>;
  emailFinder(dominio: string, nome: string): Promise<{ email: string | null; score: number | null; status: string | null; erro?: ErroHunter }>;
  /** Só pessoas (`type=personal`) de nível sênior ou executivo: quem não decide nem vem na resposta. */
  domainSearch(dominio: string): Promise<{ pessoas: PessoaHunter[]; erro?: ErroHunter }>;
  verificar(email: string): Promise<{ status: string | null; erro?: ErroHunter }>;
}

/** Sem chave no ambiente devolve null: quem chama trata como "Hunter indisponível". */
export function criarClienteHunter(opcoes: { chave?: string; fetchImpl?: typeof fetch } = {}): ClienteHunter | null {
  const chave = (opcoes.chave ?? process.env.HUNTER_API ?? '').trim();
  if (!chave) return null;
  const f = opcoes.fetchImpl ?? fetch;

  async function chamar(caminho: string, params: Record<string, string>): Promise<{ status: number; body: any }> {
    const u = new URL(`https://api.hunter.io/v2/${caminho}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    try {
      const r = await f(u, { headers: { 'X-API-KEY': chave }, signal: AbortSignal.timeout(20_000) });
      return { status: r.status, body: await r.json().catch(() => null) };
    } catch {
      return { status: 0, body: null };
    }
  }

  /** 402 e 429 = acabou o crédito ou o limite; 400 e 404 = a consulta não casou ninguém (não é falha). */
  const erroDe = (status: number): ErroHunter | undefined => {
    if (status === 200 || status === 400 || status === 404) return undefined;
    return status === 402 || status === 429 ? 'sem_creditos' : 'indisponivel';
  };
  const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

  return {
    async creditos() {
      const r = await chamar('account', {});
      return r.status === 200 ? num(r.body?.data?.requests?.credits?.remaining) : null;
    },
    async emailFinder(dominio, nome) {
      const r = await chamar('email-finder', { domain: dominio, full_name: nome });
      const erro = erroDe(r.status);
      const d = r.status === 200 ? r.body?.data : null;
      return { email: d?.email ? String(d.email).toLowerCase() : null, score: num(d?.score), status: d?.verification?.status ?? null, ...(erro ? { erro } : {}) };
    },
    async domainSearch(dominio) {
      const r = await chamar('domain-search', { domain: dominio, type: 'personal', seniority: 'senior,executive', limit: '10' });
      const erro = erroDe(r.status);
      const emails: any[] = r.status === 200 && Array.isArray(r.body?.data?.emails) ? r.body.data.emails : [];
      const pessoas = emails.filter((e) => e?.value).map((e) => ({
        email: String(e.value).toLowerCase(),
        nome: [e.first_name, e.last_name].filter(Boolean).join(' ') || null,
        cargo: e.position ? String(e.position) : null,
        score: num(e.confidence),
        status: e.verification?.status ?? null,
      }));
      return { pessoas, ...(erro ? { erro } : {}) };
    },
    async verificar(email) {
      const r = await chamar('email-verifier', { email });
      const erro = erroDe(r.status);
      return { status: r.status === 200 ? (r.body?.data?.status ?? null) : null, ...(erro ? { erro } : {}) };
    },
  };
}
