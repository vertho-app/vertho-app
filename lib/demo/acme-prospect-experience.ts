import { randomBytes, randomUUID } from 'node:crypto';
import { tenantUrl } from '@/lib/domain';
import { montarParametroAcesso } from '@/lib/auth/magic-link-whatsapp';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import {
  getAcmeProspectRole,
  acmeProspectExpiresAt,
  ACME_PROSPECT_AUTH_MARKER,
  acmeProspectAuthEmail,
  ACME_PROSPECT_SESSION_PATTERN,
  validateAcmeProspectExperienceInput,
  type AcmeProspectExperienceAccess,
  type AcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';
export { isAcmeProspectAuthUser } from '@/lib/demo/acme-prospect-tracking';

const ACME_DEMO_SLUG = 'acme-demo';
const ACME_MANAGER = {
  nome: 'Carla Menezes',
  email: 'carla.demo@vertho.ai',
} as const;

export type AcmeProspectExperienceResult =
  | { ok: true; access: AcmeProspectExperienceAccess }
  | { ok: false; error: string };

export type AcmeProspectLifecycle = {
  sessionId: string;
  expiresAt: string;
};

export function createAcmeProspectLifecycle(now: Date = new Date()): AcmeProspectLifecycle {
  return {
    sessionId: randomBytes(10).toString('hex'),
    expiresAt: acmeProspectExpiresAt(now),
  };
}

async function rollbackGuest(
  tdb: ReturnType<typeof tenantDb>,
  authEmail: string,
  authUserId: string | null,
  sessionId: string,
) {
  try {
    const tracking = await tdb.from('demo_prospect_sessions').delete().eq('session_id', sessionId);
    if (tracking.error) console.warn('[acme-prospect] rollback acompanhamento:', tracking.error.message);
  } catch (error: any) {
    console.warn('[acme-prospect] rollback acompanhamento:', error?.message);
  }

  try {
    const colab = await tdb.from('colaboradores').delete().eq('email', authEmail);
    if (colab.error) console.warn('[acme-prospect] rollback colaborador:', colab.error.message);
  } catch (error: any) {
    console.warn('[acme-prospect] rollback colaborador:', error?.message);
  }

  if (authUserId) {
    try {
      const auth = await tdb.auth.admin.deleteUser(authUserId);
      if (auth.error) console.warn('[acme-prospect] rollback auth:', auth.error.message);
    } catch (error: any) {
      console.warn('[acme-prospect] rollback auth:', error?.message);
    }
  }
}

/**
 * Núcleo headless da experiência individual no ACME Demo.
 *
 * O tenant não é parâmetro: esta função só pode operar no `acme-demo`. O e-mail
 * técnico é interno e aleatório; o WhatsApp real, quando informado, permanece
 * no browser do vendedor e só é usado para abrir o compartilhamento manual.
 */
export async function prepareAcmeProspectExperience(
  input: AcmeProspectExperienceInput,
  lifecycle: AcmeProspectLifecycle = createAcmeProspectLifecycle(),
  createdByEmail: string = 'system:unknown',
): Promise<AcmeProspectExperienceResult> {
  const parsed = validateAcmeProspectExperienceInput(input);
  if (parsed.ok === false) return { ok: false, error: parsed.error };

  let createdGuest: {
    tdb: ReturnType<typeof tenantDb>;
    authEmail: string;
    authUserId: string | null;
    sessionId: string;
  } | null = null;

  try {
    const resolved = await resolveTenant(ACME_DEMO_SLUG);
    if (!resolved?.id) throw new Error('O ACME Demo não existe.');

    const tdb = tenantDb(resolved.id);
    const { data: empresa, error: empresaError } = await tdb.raw.from('empresas')
      .select('id,is_demo')
      .eq('id', resolved.id)
      .eq('slug', ACME_DEMO_SLUG)
      .maybeSingle();
    if (empresaError) throw new Error(`carregar ACME Demo: ${empresaError.message}`);
    if (!empresa?.id || empresa.is_demo !== true) {
      throw new Error('O ACME Demo não existe ou não está marcado como demonstração.');
    }

    const role = getAcmeProspectRole(parsed.value.roleKey);
    if (!role) throw new Error('Papel demonstrativo inválido.');
    if (!ACME_PROSPECT_SESSION_PATTERN.test(lifecycle.sessionId)) {
      throw new Error('Identificador da experiência inválido.');
    }
    const expiryTime = Date.parse(lifecycle.expiresAt);
    if (!Number.isFinite(expiryTime) || expiryTime <= Date.now()) {
      throw new Error('Validade da experiência inválida.');
    }

    const sessionId = lifecycle.sessionId;
    const authEmail = acmeProspectAuthEmail(sessionId);
    const expiresAt = lifecycle.expiresAt;
    const colaboradorId = randomUUID();

    const { error: colabError } = await tdb.from('colaboradores').insert({
      id: colaboradorId,
      nome_completo: parsed.value.nome,
      email: authEmail,
      cargo: role.cargo,
      role: 'colaborador',
      area_depto: role.area,
      gestor_nome: ACME_MANAGER.nome,
      gestor_email: ACME_MANAGER.email,
      gestor_whatsapp: null,
      telefone: null,
      whatsapp: null,
      locale: 'pt-BR',
    });
    if (colabError) throw new Error(`criar convidado no ACME Demo: ${colabError.message}`);
    createdGuest = { tdb, authEmail, authUserId: null, sessionId };

    const { data: authData, error: authError } = await tdb.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        name: parsed.value.nome,
        vertho_demo_access: ACME_PROSPECT_AUTH_MARKER,
        vertho_demo_tenant: ACME_DEMO_SLUG,
        vertho_demo_session_id: sessionId,
        expires_at: expiresAt,
      },
    });
    const authUserId = authData?.user?.id ?? null;
    createdGuest.authUserId = authUserId;
    if (authError || !authUserId) {
      throw new Error(`criar acesso temporário: ${authError?.message || 'usuário não retornado'}`);
    }

    const { error: trackingError } = await tdb.from('demo_prospect_sessions').insert({
      session_id: sessionId,
      colaborador_id: colaboradorId,
      auth_email: authEmail,
      prospect_name: parsed.value.nome,
      prospect_company: parsed.value.empresa,
      role_key: role.key,
      cargo: role.label,
      created_by_email: createdByEmail,
      expires_at: expiresAt,
    });
    if (trackingError) {
      throw new Error(`criar acompanhamento do prospect: ${trackingError.message}`);
    }

    const nextPath = '/dashboard';
    const redirectTo = tenantUrl(ACME_DEMO_SLUG, nextPath);
    const { data: link, error: linkError } = await tdb.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo },
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      throw new Error(`gerar link do convidado: ${linkError?.message || 'token ausente'}`);
    }

    createdGuest = null;
    return {
      ok: true,
      access: {
        sessionId,
        nome: parsed.value.nome,
        empresa: parsed.value.empresa,
        cargo: role.label,
        expiresAt,
        // 🔴 NUNCA aponte o link do convidado direto para `/auth/callback`.
        //
        // O callback chama `verifyOtp`, que CONSOME o token de uso único — e o
        // link do passaporte trafega por WhatsApp, onde o robô de preview da
        // Meta busca a URL para montar o cartão. `Medido 01/09/2026:` os dois
        // passaportes criados na tarde tiveram login carimbado 12s e 13s depois
        // da criação, e o clique de verdade, um minuto depois, bateu em
        // "Email link is invalid or has expired" no callback.
        //
        // `/entrar` é a rota de despacho criada em 15/08 para exatamente isso:
        // ela responde HTML e só vai ao callback quando o JS executa, então o
        // robô fica do lado de fora e o token chega inteiro em quem clicou.
        url: tenantUrl(
          ACME_DEMO_SLUG,
          `/entrar?t=${encodeURIComponent(montarParametroAcesso(ACME_DEMO_SLUG, tokenHash))}`,
        ),
      },
    };
  } catch (error: any) {
    if (createdGuest) {
      await rollbackGuest(
        createdGuest.tdb,
        createdGuest.authEmail,
        createdGuest.authUserId,
        createdGuest.sessionId,
      );
    }
    console.error('[acme-prospect] preparar experiência:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}
