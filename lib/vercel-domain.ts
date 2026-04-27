/**
 * Helpers pra registrar/remover subdomínios de tenant no projeto Vercel.
 *
 * Quando uma empresa é criada (ou tem o slug alterado), seu subdomínio
 * `{slug}.vertho.ai` precisa estar registrado no Vercel pra que:
 *   - O routing chegue no projeto
 *   - O Vercel emita certificado SSL automaticamente
 *
 * O DNS já é resolvido pelo CNAME wildcard `*.vertho.ai` no provedor — esse
 * helper só completa a parte do Vercel.
 *
 * Configuração via env (Vercel/local):
 *   - VERCEL_TOKEN       (Personal Access Token: vercel.com/account/tokens)
 *   - VERCEL_PROJECT_ID  (encontrável em Settings → General do projeto)
 *   - VERCEL_TEAM_ID     (opcional — só se projeto está em time)
 *
 * Sem `VERCEL_TOKEN` configurado, todas as funções viram no-op silencioso
 * (retornam { ok: false, skipped: true }) — útil em dev local.
 *
 * Falhas são best-effort: NÃO devem reverter a criação da empresa. O
 * admin pode adicionar manualmente em vercel.com/.../domains se algo der
 * errado. Tudo é logado no console.
 */

import { ROOT_DOMAIN } from './domain';

type VercelDomainResult =
  | { ok: true; alreadyExists?: boolean }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; error: string; status?: number };

function vercelEnv(): { token: string; projectId: string; teamQuery: string } | null {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  const teamId = process.env.VERCEL_TEAM_ID;
  const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  return { token, projectId, teamQuery };
}

export function tenantDomain(slug: string): string {
  return `${slug}.${ROOT_DOMAIN}`;
}

export async function addVercelDomain(slug: string): Promise<VercelDomainResult> {
  const env = vercelEnv();
  if (!env) {
    console.warn('[vercel-domain] VERCEL_TOKEN/PROJECT_ID ausente — pulando addVercelDomain');
    return { ok: false, skipped: true, reason: 'env não configurada' };
  }
  const domain = tenantDomain(slug);
  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${env.projectId}/domains${env.teamQuery}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: domain }),
      },
    );
    if (res.ok) {
      console.log(`[vercel-domain] adicionado: ${domain}`);
      return { ok: true };
    }
    const body: any = await res.json().catch(() => ({}));
    // 409: já existe — trata como sucesso
    if (res.status === 409 || body?.error?.code === 'domain_already_in_use_by_different_project' || body?.error?.code === 'domain_taken') {
      console.log(`[vercel-domain] já existia: ${domain}`);
      return { ok: true, alreadyExists: true };
    }
    const error = body?.error?.message || `HTTP ${res.status}`;
    console.error(`[vercel-domain] falhou ${domain}:`, error);
    return { ok: false, error, status: res.status };
  } catch (err: any) {
    console.error(`[vercel-domain] exceção ${domain}:`, err.message);
    return { ok: false, error: err.message };
  }
}

export async function removeVercelDomain(slug: string): Promise<VercelDomainResult> {
  const env = vercelEnv();
  if (!env) return { ok: false, skipped: true, reason: 'env não configurada' };
  const domain = tenantDomain(slug);
  try {
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${env.projectId}/domains/${encodeURIComponent(domain)}${env.teamQuery}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env.token}` },
      },
    );
    if (res.ok || res.status === 404) {
      console.log(`[vercel-domain] removido: ${domain}`);
      return { ok: true };
    }
    const body: any = await res.json().catch(() => ({}));
    const error = body?.error?.message || `HTTP ${res.status}`;
    console.error(`[vercel-domain] falhou remoção ${domain}:`, error);
    return { ok: false, error, status: res.status };
  } catch (err: any) {
    console.error(`[vercel-domain] exceção remoção ${domain}:`, err.message);
    return { ok: false, error: err.message };
  }
}
