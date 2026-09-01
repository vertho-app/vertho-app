import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveTenant } from '@/lib/tenant-resolver';
import { isDemoPersonaEmail, isInternalEmail } from '@/lib/internal-emails';
import {
  ACME_PROSPECT_AUTH_MARKER,
  ACME_PROSPECT_AUTH_PREFIX,
  ACME_PROSPECT_AUTH_SUFFIX,
  ACME_PROSPECT_SESSION_PATTERN,
  acmeProspectAuthEmail,
  type AcmeProspectPresentationRoleKey,
  type AcmeProspectProgress,
  type DemoGuestProgress,
} from '@/lib/demo/acme-prospect-config';

const ACME_DEMO_SLUG = 'acme-demo';

/**
 * Ponto ÚNICO de service-role deste módulo. Todas as funções aqui aceitam um
 * client injetado (é assim que os testes exercitam as falhas de query); quando
 * ninguém injeta, o cliente admin nasce aqui e só aqui — uma chamada para o
 * guard vigiar, em vez de seis espalhadas.
 */
function demoAdmin(client?: any) {
  return client || createSupabaseAdmin();
}

type ProspectAuthUser = {
  id?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type TrackedSessionRow = {
  session_id: string;
  colaborador_id: string | null;
  auth_email: string;
  prospect_name: string;
  prospect_company: string;
  cargo: string;
  created_at: string;
  expires_at: string;
  personal_accessed_at: string | null;
  disc_completed_at: string | null;
  colaborador_accessed_at: string | null;
  gestor_accessed_at: string | null;
  rh_accessed_at: string | null;
  access_closed_at: string | null;
};

export type AcmeProspectAuthContext = {
  sessionId: string | null;
  expiresAt: string | null;
  expired: boolean;
};

export type AcmeProspectCleanupResult = {
  expiredRemoved: number;
  activeCount: number;
  nextExpiry: string | null;
};

function asValidTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function sessionIdFromEmail(email: string): string | null {
  if (!email.startsWith(ACME_PROSPECT_AUTH_PREFIX) || !email.endsWith(ACME_PROSPECT_AUTH_SUFFIX)) {
    return null;
  }
  const value = email.slice(ACME_PROSPECT_AUTH_PREFIX.length, -ACME_PROSPECT_AUTH_SUFFIX.length);
  return ACME_PROSPECT_SESSION_PATTERN.test(value) ? value : null;
}

export function isAcmeProspectAuthUser(user: ProspectAuthUser): boolean {
  const email = String(user.email || '').trim().toLowerCase();
  return Boolean(sessionIdFromEmail(email))
    && user.user_metadata?.vertho_demo_access === ACME_PROSPECT_AUTH_MARKER;
}

export function readAcmeProspectAuthContext(
  user: ProspectAuthUser,
  now: Date = new Date(),
): AcmeProspectAuthContext | null {
  if (!isAcmeProspectAuthUser(user)) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const metadataSession = String(user.user_metadata?.vertho_demo_session_id || '').trim();
  const sessionId = ACME_PROSPECT_SESSION_PATTERN.test(metadataSession)
    ? metadataSession
    : sessionIdFromEmail(email);
  const expiresAt = typeof user.user_metadata?.expires_at === 'string'
    ? user.user_metadata.expires_at
    : null;
  const expiryTime = asValidTime(expiresAt);
  return {
    sessionId,
    expiresAt,
    expired: !sessionId || expiryTime === null || expiryTime <= now.getTime(),
  };
}

/**
 * Resolve o tenant de demonstração pelo slug. O `is_demo` não é decoração: ele
 * é a régua que impede este módulo de listar gente de um tenant de cliente
 * real caso um slug qualquer chegue até aqui.
 */
async function demoTenantId(client: any, slug: string) {
  const resolved = await resolveTenant(slug);
  if (!resolved?.id) throw new Error(`O tenant ${slug} não existe.`);
  const { data, error } = await client.from('empresas')
    .select('id,is_demo')
    .eq('id', resolved.id)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`carregar tenant ${slug}: ${error.message}`);
  if (!data?.id || data.is_demo !== true) {
    throw new Error(`O tenant ${slug} não existe ou não está marcado como demonstração.`);
  }
  return data.id as string;
}

async function acmeTenant(client: any) {
  return demoTenantId(client, ACME_DEMO_SLUG);
}

async function listProspectAuthUsers(authAdmin: any): Promise<Array<ProspectAuthUser & { id: string }>> {
  if (typeof authAdmin?.listUsers !== 'function') return [];
  const matches: Array<ProspectAuthUser & { id: string }> = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await authAdmin.listUsers({ page, perPage });
    if (error) throw new Error(`listar convidados Auth: ${error.message}`);
    const users = (data?.users || []) as Array<ProspectAuthUser & { id: string }>;
    matches.push(...users.filter(isAcmeProspectAuthUser));
    if (users.length < perPage) break;
  }
  return matches;
}

export async function recordAcmeProspectPersonalAccess(user: ProspectAuthUser): Promise<boolean> {
  const context = readAcmeProspectAuthContext(user);
  if (!context?.sessionId || context.expired) return false;
  const sb = demoAdmin();
  const now = new Date().toISOString();
  const { error } = await sb.from('demo_prospect_sessions')
    .update({ personal_accessed_at: now })
    .eq('session_id', context.sessionId)
    .gt('expires_at', now)
    .is('personal_accessed_at', null);
  if (error) throw new Error(`registrar acesso pessoal do prospect: ${error.message}`);
  return true;
}

export async function recordAcmeProspectPresentationAccess(
  sessionId: string,
  roleKey: AcmeProspectPresentationRoleKey,
): Promise<boolean> {
  if (!ACME_PROSPECT_SESSION_PATTERN.test(sessionId)) return false;
  const columnByRole = {
    usuario: 'colaborador_accessed_at',
    gestor: 'gestor_accessed_at',
    rh: 'rh_accessed_at',
  } as const;
  const column = columnByRole[roleKey];
  const sb = demoAdmin();
  const now = new Date().toISOString();
  const { error } = await sb.from('demo_prospect_sessions')
    .update({ [column]: now })
    .eq('session_id', sessionId)
    .gt('expires_at', now)
    .is(column, null);
  if (error) throw new Error(`registrar visão ${roleKey} do prospect: ${error.message}`);
  return true;
}

export async function recordAcmeProspectDiscCompletion(
  colaboradorId: string,
  completedAt: string,
): Promise<void> {
  if (!colaboradorId || asValidTime(completedAt) === null) return;
  const sb = demoAdmin();
  const { error } = await sb.from('demo_prospect_sessions')
    .update({ disc_completed_at: completedAt })
    .eq('colaborador_id', colaboradorId)
    .is('disc_completed_at', null);
  if (error) throw new Error(`registrar conclusão do DISC do prospect: ${error.message}`);
}

async function mappingTimesByCollaborator(client: any, empresaId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await client.from('colaboradores')
    .select('id,mapeamento_em')
    .eq('empresa_id', empresaId)
    .in('id', ids);
  if (error) throw new Error(`carregar DISC dos convidados: ${error.message}`);
  return new Map<string, string>((data || [])
    .filter((row: any) => row.mapeamento_em)
    .map((row: any) => [String(row.id), String(row.mapeamento_em)]));
}

export async function listAcmeProspectProgress(client?: any): Promise<AcmeProspectProgress[]> {
  const sb = demoAdmin(client);
  const empresaId = await acmeTenant(sb);
  const { data, error } = await sb.from('demo_prospect_sessions')
    .select('session_id,colaborador_id,auth_email,prospect_name,prospect_company,cargo,created_at,expires_at,personal_accessed_at,disc_completed_at,colaborador_accessed_at,gestor_accessed_at,rh_accessed_at,access_closed_at')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`listar experiências de prospect: ${error.message}`);
  const rows = (data || []) as TrackedSessionRow[];
  const missingDiscIds = [...new Set(rows
    .filter((row) => !row.disc_completed_at && row.colaborador_id)
    .map((row) => row.colaborador_id!))];
  const mappedAt = await mappingTimesByCollaborator(sb, empresaId, missingDiscIds);

  for (const row of rows) {
    const recovered = row.colaborador_id ? mappedAt.get(row.colaborador_id) : null;
    if (!row.disc_completed_at && recovered) {
      row.disc_completed_at = recovered;
      const sync = await sb.from('demo_prospect_sessions')
        .update({ disc_completed_at: recovered })
        .eq('session_id', row.session_id)
        .is('disc_completed_at', null);
      if (sync.error) console.warn('[acme-prospect] sincronizar DISC:', sync.error.message);
    }
  }

  return rows.map((row) => ({
    sessionId: row.session_id,
    nome: row.prospect_name,
    empresa: row.prospect_company,
    cargo: row.cargo,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    personalAccessedAt: row.personal_accessed_at,
    discCompletedAt: row.disc_completed_at,
    colaboradorAccessedAt: row.colaborador_accessed_at,
    gestorAccessedAt: row.gestor_accessed_at,
    rhAccessedAt: row.rh_accessed_at,
    accessClosedAt: row.access_closed_at,
  }));
}

type DemoGuestRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  cargo: string | null;
  created_at: string;
  mapeamento_em: string | null;
};

/**
 * Quem, dentro de um tenant de demonstração, é CONVIDADO e não cenário.
 *
 * O elenco fixo do seed (`*.demo@vertho.ai`) é conteúdo do ambiente, não gente
 * acompanhada. A conta de staff da Vertho também fica de fora. Já o e-mail
 * técnico do passaporte (`convidado.acme.<id>@vertho.ai`) é interno pela régua
 * canônica, mas é exatamente a pessoa que o painel acompanha: ele entra aqui
 * quando não veio pela tabela de sessões (passaporte cuja linha se perdeu),
 * para o convidado não sumir do acompanhamento sem ninguém notar.
 */
function isDemoGuestEmail(email: string | null | undefined, cobertos: Set<string>): boolean {
  const valor = String(email || '').trim().toLowerCase();
  if (!valor) return false;
  if (isDemoPersonaEmail(valor)) return false;
  if (cobertos.has(valor)) return false;
  if (valor.startsWith(ACME_PROSPECT_AUTH_PREFIX)) return true;
  return !isInternalEmail(valor);
}

/**
 * Primeiro sinal de entrada dos convidados sem passaporte. Vem do Supabase
 * Auth, que o PostgREST não expõe: a RPC da mig 237 lê `last_sign_in_at` por
 * e-mail, restrita a tenant `is_demo`. Falha aqui é FALHA da listagem, não
 * "ninguém acessou" — o silêncio viraria uma afirmação falsa na tela.
 */
async function signInTimesByEmail(client: any, emails: string[]) {
  const mapa = new Map<string, string | null>();
  if (emails.length === 0) return mapa;
  const { data, error } = await client.rpc('demo_guest_auth_activity', { p_emails: emails });
  if (error) throw new Error(`carregar acessos dos convidados: ${error.message}`);
  for (const row of (data || []) as Array<{ email: string; last_sign_in_at: string | null }>) {
    mapa.set(String(row.email).toLowerCase(), row.last_sign_in_at);
  }
  return mapa;
}

/**
 * Acompanhamento comercial de um tenant de demonstração: passaportes (só o
 * ACME os tem) mais todo convidado do tenant, na ordem em que entraram.
 */
export async function listDemoGuestProgress(
  slug: string,
  client?: any,
): Promise<DemoGuestProgress[]> {
  const sb = demoAdmin(client);
  const empresaId = await demoTenantId(sb, slug);

  const passaportes = slug === ACME_DEMO_SLUG ? await listAcmeProspectProgress(sb) : [];
  const cobertos = new Set(passaportes.map((p) => acmeProspectAuthEmail(p.sessionId).toLowerCase()));

  const { data, error } = await sb.from('colaboradores')
    .select('id,nome_completo,email,cargo,created_at,mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`listar convidados do tenant ${slug}: ${error.message}`);

  const convidados = ((data || []) as DemoGuestRow[])
    .filter((row) => isDemoGuestEmail(row.email, cobertos));
  const acessos = await signInTimesByEmail(sb, convidados.map((row) => String(row.email).toLowerCase()));

  const doPassaporte: DemoGuestProgress[] = passaportes.map((row) => ({
    id: row.sessionId,
    origem: 'passaporte',
    nome: row.nome,
    contexto: row.empresa,
    cargo: row.cargo,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    personalAccessedAt: row.personalAccessedAt,
    discCompletedAt: row.discCompletedAt,
    colaboradorAccessedAt: row.colaboradorAccessedAt,
    gestorAccessedAt: row.gestorAccessedAt,
    rhAccessedAt: row.rhAccessedAt,
    accessClosedAt: row.accessClosedAt,
  }));

  const doCadastro: DemoGuestProgress[] = convidados.map((row) => {
    const email = String(row.email).toLowerCase();
    return {
      id: row.id,
      origem: 'cadastro',
      nome: row.nome_completo || email,
      contexto: email,
      cargo: row.cargo || 'Sem cargo',
      createdAt: row.created_at,
      expiresAt: null,
      personalAccessedAt: acessos.get(email) ?? null,
      discCompletedAt: row.mapeamento_em,
      colaboradorAccessedAt: null,
      gestorAccessedAt: null,
      rhAccessedAt: null,
      accessClosedAt: null,
    };
  });

  return [...doPassaporte, ...doCadastro]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function syncDiscBeforeClose(client: any, empresaId: string, row: TrackedSessionRow) {
  if (row.disc_completed_at) return;
  let query = client.from('colaboradores')
    .select('id,mapeamento_em')
    .eq('empresa_id', empresaId);
  query = row.colaborador_id ? query.eq('id', row.colaborador_id) : query.eq('email', row.auth_email);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`carregar DISC antes da expiração: ${error.message}`);
  if (!data?.mapeamento_em) return;
  const sync = await client.from('demo_prospect_sessions')
    .update({ disc_completed_at: data.mapeamento_em })
    .eq('session_id', row.session_id)
    .is('disc_completed_at', null);
  if (sync.error) throw new Error(`preservar conclusão do DISC: ${sync.error.message}`);
}

async function deleteGuestCollaborator(client: any, empresaId: string, authEmail: string) {
  const { error } = await client.from('colaboradores')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('email', authEmail);
  if (error) throw new Error(`remover colaborador convidado: ${error.message}`);
}

/**
 * Fecha somente acessos vencidos. O retorno também funciona como preflight do
 * reset: enquanto houver qualquer sessão ativa, o tenant não pode ser recomposto.
 */
export async function cleanupExpiredAcmeProspects(
  now: Date = new Date(),
  client?: any,
): Promise<AcmeProspectCleanupResult> {
  const sb = demoAdmin(client);
  const empresaId = await acmeTenant(sb);
  const { data, error } = await sb.from('demo_prospect_sessions')
    .select('session_id,colaborador_id,auth_email,prospect_name,prospect_company,cargo,created_at,expires_at,personal_accessed_at,disc_completed_at,colaborador_accessed_at,gestor_accessed_at,rh_accessed_at,access_closed_at')
    .eq('empresa_id', empresaId)
    .is('access_closed_at', null)
    .limit(5_000);
  if (error) throw new Error(`carregar convidados ativos: ${error.message}`);

  const rows = (data || []) as TrackedSessionRow[];
  const nowTime = now.getTime();
  const activeRows = rows.filter((row) => {
    const expiry = asValidTime(row.expires_at);
    return expiry !== null && expiry > nowTime;
  });
  const expiredRows = rows.filter((row) => !activeRows.includes(row));
  const authUsers = await listProspectAuthUsers(sb.auth?.admin);
  const authByEmail = new Map(authUsers.map((user) => [String(user.email || '').toLowerCase(), user]));
  const trackedEmails = new Set(rows.map((row) => row.auth_email.toLowerCase()));
  let expiredRemoved = 0;

  for (const row of expiredRows) {
    await syncDiscBeforeClose(sb, empresaId, row);
    await deleteGuestCollaborator(sb, empresaId, row.auth_email);
    const authUser = authByEmail.get(row.auth_email.toLowerCase());
    if (authUser?.id) {
      const removed = await sb.auth.admin.deleteUser(authUser.id);
      if (removed.error) throw new Error(`remover convidado Auth ${authUser.id}: ${removed.error.message}`);
    }
    const closed = await sb.from('demo_prospect_sessions')
      .update({ access_closed_at: now.toISOString() })
      .eq('session_id', row.session_id)
      .is('access_closed_at', null);
    if (closed.error) throw new Error(`fechar experiência expirada: ${closed.error.message}`);
    expiredRemoved++;
  }

  const activeLegacyExpiries: number[] = [];
  for (const user of authUsers) {
    const email = String(user.email || '').toLowerCase();
    if (trackedEmails.has(email)) continue;
    const context = readAcmeProspectAuthContext(user, now);
    const expiry = asValidTime(context?.expiresAt);
    if (context && !context.expired && expiry !== null) {
      activeLegacyExpiries.push(expiry);
      continue;
    }
    await deleteGuestCollaborator(sb, empresaId, email);
    const removed = await sb.auth.admin.deleteUser(user.id);
    if (removed.error) throw new Error(`remover convidado Auth legado ${user.id}: ${removed.error.message}`);
    expiredRemoved++;
  }

  const activeExpiries = [
    ...activeRows.map((row) => asValidTime(row.expires_at)).filter((value): value is number => value !== null),
    ...activeLegacyExpiries,
  ];
  return {
    expiredRemoved,
    activeCount: activeRows.length + activeLegacyExpiries.length,
    nextExpiry: activeExpiries.length > 0
      ? new Date(Math.min(...activeExpiries)).toISOString()
      : null,
  };
}
