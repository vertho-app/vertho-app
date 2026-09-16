import 'server-only';

import { csrfCheck } from '@/lib/csrf';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { tenantDb, type TenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import type { DemoProspectTenantSlug } from '@/lib/demo/acme-prospect-config';

/**
 * A decisão de acesso da degustação, num lugar só.
 *
 * Quatro portas usam o passe: o GET de `/auth/degustacao` (versão A), o POST do
 * botão pessoal e o registro de abertura (versão B) e a página de boas-vindas.
 * Cada uma repetindo as checagens seria como uma delas passa a aceitar o que as
 * outras recusam. As três checagens, nesta ordem:
 *
 *   1. assinatura e prazo do passe (contexto de assinatura próprio, ver
 *      `lib/demo/degustacao-passe`);
 *   2. o ambiente do passe é o do HOSTNAME CRU. Não vale o `x-tenant-slug` do
 *      proxy: ele converte os hosts da sala de apresentação (`gestor-sinal`)
 *      de volta para o tenant, e a página aceitaria o passe num host de sala
 *      enquanto a rota o recusaria;
 *   3. a sessão existe, não foi fechada e ainda está no prazo NO BANCO. O passe
 *      diz o que foi emitido; o banco diz o que ainda vale.
 *
 * Os códigos de recusa são os que o GET da versão A sempre devolveu ao login:
 * passe inválido ou vencido e sessão fechada saem como `expirado`, host de outro
 * ambiente como `invalido`, falha nossa como `indisponivel`.
 */
export type AcessoDaDegustacao =
  | { status: 'expirado' }
  | { status: 'invalido' }
  | { status: 'indisponivel'; motivo: string }
  | {
      status: 'ok';
      slug: DemoProspectTenantSlug;
      empresaId: string;
      sessionId: string;
      /** Segundos Unix de validade que o passe carrega. */
      expSegundos: number;
      sessao: Record<string, any>;
      tdb: TenantDb;
    };

/** Colunas mínimas para decidir o acesso; quem chama acrescenta as suas. */
const COLUNAS_DO_ACESSO = ['expires_at', 'access_closed_at'];

export async function abrirAcessoDaDegustacao(
  passeCru: string | null | undefined,
  hostname: string,
  colunas: readonly string[],
): Promise<AcessoDaDegustacao> {
  const passe = verificarPasseDegustacao(passeCru);
  if (!passe) return { status: 'expirado' };

  const hostSlug = String(hostname || '').trim().toLowerCase().split(':')[0].split('.')[0];
  if (hostSlug !== passe.tenant) return { status: 'invalido' };

  const tenant = await resolveTenant(hostSlug);
  if (!tenant?.id || tenant.slug !== passe.tenant) return { status: 'invalido' };

  // `tenantDb` e não o client admin cru: a leitura nasce escopada no ambiente
  // que o hostname e o passe concordam ser o certo.
  const tdb = tenantDb(tenant.id);
  const selecao = [...new Set([...COLUNAS_DO_ACESSO, ...colunas])].join(',');
  const { data: sessao, error } = await tdb.from('demo_prospect_sessions')
    .select(selecao)
    .eq('session_id', passe.sid)
    .maybeSingle();
  // supabase-js RETORNA o erro: sem este check, uma falha de banco viraria
  // "sessão não encontrada" e o convidado veria "convite inválido" por causa de
  // um problema nosso.
  if (error) return { status: 'indisponivel', motivo: error.message };
  const linha = sessao as Record<string, any> | null;
  if (!linha || linha.access_closed_at) return { status: 'expirado' };
  if (!(Date.parse(linha.expires_at) > Date.now())) return { status: 'expirado' };

  return {
    status: 'ok',
    slug: passe.tenant as DemoProspectTenantSlug,
    empresaId: tenant.id,
    sessionId: passe.sid,
    expSegundos: passe.exp,
    sessao: linha,
    tdb,
  };
}

/** Host de quem fez a requisição, sem porta. */
export function hostnameDaRequisicao(req: { headers: Headers; nextUrl?: { hostname: string } }): string {
  return (req.nextUrl?.hostname || req.headers.get('host') || '').split(':')[0].toLowerCase();
}

/**
 * A requisição de escrita veio de uma página DESTE host?
 *
 * `csrfCheck` aceita qualquer `*.vertho.ai`, e isso não basta aqui: um host de
 * sala de apresentação (outra origem, outra sessão) não pode disparar login no
 * host do convidado. Sem `Origin` vale o `Referer`; sem os dois, recusa.
 * Referer malformado é recusa, nunca exceção.
 */
export function mesmaOrigemDoHost(req: { headers: Headers }, hostname: string): boolean {
  const alvo = String(hostname || '').toLowerCase();
  const origem = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const candidato = origem && origem !== 'null' ? origem : referer;
  if (!candidato || !alvo) return false;
  try {
    return new URL(candidato).hostname.toLowerCase() === alvo;
  } catch {
    return false;
  }
}

/**
 * A escrita veio de fora e deve ser recusada? `csrfCheck` + mesmo host.
 *
 * ⚠️ `csrfCheck` monta `new URL(referer)` sem proteção e LANÇA com Referer
 * malformado (`tests/unit/degustacao-rota-post.test.ts` achou isso): sem o
 * `try`, um cabeçalho estranho virava erro 500 em vez de recusa.
 */
export function escritaDeOutraOrigem(req: Request, hostname: string): boolean {
  try {
    if (csrfCheck(req)) return true;
  } catch {
    return true;
  }
  return !mesmaOrigemDoHost(req, hostname);
}
