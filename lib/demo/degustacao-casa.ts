import 'server-only';

import { lerEmailDePassaporte } from '@/lib/demo/acme-prospect-config';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';

/**
 * Para onde vai o `/dashboard` do convidado da degustação B: a página de
 * boas-vindas, pelo link curto dele (`/c/<código>`).
 *
 * Na versão A o convidado caía na home genérica de colaborador da ACME, com o
 * único botão do DISC escondido atrás da barra de navegação no celular (medido
 * em 16/09/2026). Na B, a casa dele é a página do roteiro, e o botão Início do
 * app leva de volta a ela.
 *
 * Três regras:
 *   - só conta com FORMA de passaporte faz consulta: persona, RH, gestor e
 *     cliente real não pagam nada por isto;
 *   - só a sessão B, viva e no prazo, redireciona. A continua como era;
 *   - falha de leitura cai na home genérica, e fica registrada: fallback
 *     silencioso seria a pessoa sem roteiro e ninguém sabendo por quê.
 *
 * O código é o MESMO do convite (ambiente + sessão, assinados), então a casa e o
 * convite apontam para o mesmo endereço.
 */
export async function hrefDaCasaDoConvidado(email: string | null | undefined): Promise<string | null> {
  const passaporte = lerEmailDePassaporte(email);
  if (!passaporte) return null;

  let empresaId: string | null = null;
  try {
    const tenant = await resolveTenant(passaporte.slug);
    if (!tenant?.id || tenant.slug !== passaporte.slug) return null;
    empresaId = tenant.id;

    const tdb = tenantDb(tenant.id);
    const { data, error } = await tdb.from('demo_prospect_sessions')
      .select('experience_version,expires_at,access_closed_at')
      .eq('session_id', passaporte.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const sessao = data as { experience_version?: string; expires_at: string; access_closed_at: string | null } | null;
    if (!sessao || sessao.experience_version !== 'B' || sessao.access_closed_at) return null;
    const expiraEm = Date.parse(sessao.expires_at);
    if (!(expiraEm > Date.now())) return null;

    return `/c/${emitirCodigoCurto(passaporte.slug, passaporte.sessionId)}`;
  } catch (error: any) {
    console.warn('[degustacao-casa] casa do convidado indisponível:', error?.message);
    await registrarDegradacao({
      fluxo: 'demo',
      tipo: DEGRADACAO.DEGUSTACAO_CASA_INDISPONIVEL,
      chave: passaporte.sessionId,
      empresaId,
      severidade: 'aviso',
      detalhe: { erro: String(error?.message || error) },
    });
    return null;
  }
}
