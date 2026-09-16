import 'server-only';

import { tenantUrl } from '@/lib/domain';
import {
  ACME_PROSPECT_SESSION_PATTERN,
  getDemoProspectTenant,
} from '@/lib/demo/acme-prospect-config';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';

export type ConviteGuiado =
  | { ok: true; url: string; nome: string; convertido: boolean }
  | { ok: false; error: string };

/**
 * O link da página de boas-vindas (versão B) de um passaporte que já existe.
 *
 * Serve ao botão de lembrete do painel. Passaporte A vivo vira B aqui, e o
 * retorno diz isso (`convertido`), para a auditoria registrar: é assim que os
 * prospects que receberam o roteiro de quatro links podem ganhar o convite novo
 * sem um passaporte novo, e sem perder o que já fizeram.
 *
 * Núcleo sem gate, fora de `'use server'`: quem chama é a action do painel, que
 * aplica o gate de platform admin antes. O ambiente e a sessão são validados de
 * novo aqui, porque chegam do cliente.
 */
export async function prepararConviteGuiado(slug: string, sessionId: string): Promise<ConviteGuiado> {
  if (!getDemoProspectTenant(slug)) return { ok: false, error: 'Ambiente de demonstração inválido.' };
  if (typeof sessionId !== 'string' || !ACME_PROSPECT_SESSION_PATTERN.test(sessionId)) {
    return { ok: false, error: 'Roteiro inválido.' };
  }

  const tenant = await resolveTenant(slug);
  if (!tenant?.id || tenant.slug !== slug) return { ok: false, error: 'Ambiente de demonstração inválido.' };
  const tdb = tenantDb(tenant.id);

  const { data: empresa, error: erroEmpresa } = await tdb.raw.from('empresas')
    .select('id,is_demo')
    .eq('id', tenant.id)
    .maybeSingle();
  if (erroEmpresa) return { ok: false, error: `carregar ambiente: ${erroEmpresa.message}` };
  if ((empresa as any)?.is_demo !== true) return { ok: false, error: 'O ambiente não está marcado como demonstração.' };

  const { data, error } = await tdb.from('demo_prospect_sessions')
    .select('prospect_name,expires_at,access_closed_at,experience_version')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) return { ok: false, error: `carregar roteiro: ${error.message}` };
  const sessao = data as {
    prospect_name: string; expires_at: string; access_closed_at: string | null; experience_version?: string | null;
  } | null;
  if (!sessao) return { ok: false, error: 'Roteiro não encontrado neste ambiente.' };
  const expiraEm = Date.parse(sessao.expires_at);
  if (sessao.access_closed_at || !(expiraEm > Date.now())) {
    return { ok: false, error: 'Este acesso já venceu ou foi encerrado. Crie um roteiro novo.' };
  }

  let convertido = false;
  if (sessao.experience_version !== 'B') {
    const { error: erroConversao } = await tdb.from('demo_prospect_sessions')
      .update({ experience_version: 'B' })
      .eq('session_id', sessionId);
    if (erroConversao) return { ok: false, error: `converter roteiro para a versão B: ${erroConversao.message}` };
    convertido = true;
  }

  const passe = emitirPasseDegustacao(slug, sessionId, Math.floor(expiraEm / 1000));
  return {
    ok: true,
    url: tenantUrl(slug, `/degustacao?passe=${encodeURIComponent(passe)}`),
    nome: sessao.prospect_name,
    convertido,
  };
}
