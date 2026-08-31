import { randomBytes } from 'node:crypto';
import { tenantUrl } from '@/lib/domain';
import { tenantDb } from '@/lib/tenant-db';
import { resolveTenant } from '@/lib/tenant-resolver';
import {
  getAcmeProspectRole,
  nextAcmeDemoResetAt,
  validateAcmeProspectExperienceInput,
  type AcmeProspectExperienceAccess,
  type AcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';

const ACME_DEMO_SLUG = 'acme-demo';
const ACME_PROSPECT_AUTH_PREFIX = 'convidado.acme.';
const ACME_PROSPECT_AUTH_SUFFIX = '@vertho.ai';
const ACME_PROSPECT_AUTH_MARKER = 'acme-prospect-experience-v1';
const ACME_MANAGER = {
  nome: 'Carla Menezes',
  email: 'carla.demo@vertho.ai',
} as const;

export type AcmeProspectExperienceResult =
  | { ok: true; access: AcmeProspectExperienceAccess }
  | { ok: false; error: string };

function buildGuestAuthEmail(sessionId: string): string {
  // Deliberadamente NÃO termina em `.demo@vertho.ai`: o filtro canônico trata
  // esta conta como interna e a exclui dos indicadores agregados. O login e os
  // fluxos individuais continuam funcionando normalmente.
  return `${ACME_PROSPECT_AUTH_PREFIX}${sessionId}${ACME_PROSPECT_AUTH_SUFFIX}`;
}

export function isAcmeProspectAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): boolean {
  const email = String(user.email || '').trim().toLowerCase();
  return email.startsWith(ACME_PROSPECT_AUTH_PREFIX)
    && email.endsWith(ACME_PROSPECT_AUTH_SUFFIX)
    && user.user_metadata?.vertho_demo_access === ACME_PROSPECT_AUTH_MARKER;
}

async function rollbackGuest(
  tdb: ReturnType<typeof tenantDb>,
  authEmail: string,
  authUserId: string | null,
) {
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
): Promise<AcmeProspectExperienceResult> {
  const parsed = validateAcmeProspectExperienceInput(input);
  if (parsed.ok === false) return { ok: false, error: parsed.error };

  let createdGuest: {
    tdb: ReturnType<typeof tenantDb>;
    authEmail: string;
    authUserId: string | null;
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

    const sessionId = randomBytes(10).toString('hex');
    const authEmail = buildGuestAuthEmail(sessionId);
    const expiresAt = nextAcmeDemoResetAt();

    const { error: colabError } = await tdb.from('colaboradores').insert({
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
    createdGuest = { tdb, authEmail, authUserId: null };

    const { data: authData, error: authError } = await tdb.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        name: parsed.value.nome,
        vertho_demo_access: ACME_PROSPECT_AUTH_MARKER,
        vertho_demo_tenant: ACME_DEMO_SLUG,
        expires_at: expiresAt,
      },
    });
    const authUserId = authData?.user?.id ?? null;
    createdGuest.authUserId = authUserId;
    if (authError || !authUserId) {
      throw new Error(`criar acesso temporário: ${authError?.message || 'usuário não retornado'}`);
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
        url: tenantUrl(
          ACME_DEMO_SLUG,
          `/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`,
        ),
      },
    };
  } catch (error: any) {
    if (createdGuest) {
      await rollbackGuest(createdGuest.tdb, createdGuest.authEmail, createdGuest.authUserId);
    }
    console.error('[acme-prospect] preparar experiência:', error?.message);
    return { ok: false, error: error?.message || 'erro desconhecido' };
  }
}

/**
 * Remove somente identidades Auth criadas por este fluxo. A exclusão do
 * colaborador acontece no reset tenant-scoped; esta limpeza evita acumular
 * usuários órfãos no Auth depois de muitas demonstrações.
 */
export async function removeAcmeProspectAuthUsers(client?: any): Promise<number> {
  let authAdmin = client?.auth?.admin;
  if (!authAdmin) {
    const resolved = await resolveTenant(ACME_DEMO_SLUG);
    if (!resolved?.id) return 0;
    authAdmin = tenantDb(resolved.id).auth.admin;
  }
  if (typeof authAdmin?.listUsers !== 'function' || typeof authAdmin?.deleteUser !== 'function') {
    return 0;
  }

  const matches: Array<{ id: string }> = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await authAdmin.listUsers({ page, perPage });
    if (error) throw new Error(`listar convidados Auth: ${error.message}`);
    const users = (data?.users || []) as Array<{
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown> | null;
    }>;
    matches.push(...users.filter(isAcmeProspectAuthUser));
    if (users.length < perPage) break;
  }

  for (const user of matches) {
    const { error } = await authAdmin.deleteUser(user.id);
    if (error) throw new Error(`remover convidado Auth ${user.id}: ${error.message}`);
  }
  return matches.length;
}
