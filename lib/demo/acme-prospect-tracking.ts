import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveTenant } from '@/lib/tenant-resolver';
import { isEmailDeConvidadoDemo } from '@/lib/demo/convidado-demo';
import {
  ACME_PROSPECT_AUTH_MARKER,
  ACME_PROSPECT_AUTH_PREFIX,
  ACME_PROSPECT_AUTH_SUFFIX,
  ACME_PROSPECT_SESSION_PATTERN,
  demoProspectAuthPrefix,
  getDemoProspectTenant,
  lerEmailDePassaporte,
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
  /** Mig 256. Ausente no mock antigo e em linha anterior à migration: vale A. */
  experience_version?: string | null;
  invite_opened_at?: string | null;
};

export type AcmeProspectAuthContext = {
  sessionId: string | null;
  expiresAt: string | null;
  expired: boolean;
};

export type AcmeProspectCleanupResult = {
  expiredRemoved: number;
  /** Convidados removidos de vez por estarem fora da janela de retenção. */
  retidosRemovidos: number;
  activeCount: number;
  nextExpiry: string | null;
};

/**
 * Por quantos dias o trabalho de um convidado VENCIDO continua no ambiente.
 *
 * O acesso dura `DEGUSTACAO_DIAS_DE_VALIDADE`; isto é o que vem depois. Serve
 * para o vendedor recuperar o que a pessoa fez (com um passaporte novo) sem
 * transformar o tenant de demonstração num arquivo permanente.
 */
export const DEGUSTACAO_RETENCAO_DIAS = 30;

function asValidTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function sessionIdFromEmail(email: string, prefix: string = ACME_PROSPECT_AUTH_PREFIX): string | null {
  if (!email.startsWith(prefix) || !email.endsWith(ACME_PROSPECT_AUTH_SUFFIX)) {
    return null;
  }
  const value = email.slice(prefix.length, -ACME_PROSPECT_AUTH_SUFFIX.length);
  return ACME_PROSPECT_SESSION_PATTERN.test(value) ? value : null;
}

/**
 * Convidado de passaporte DESTE ambiente. O marcador de metadata é comum a
 * todos os tenants demo; quem identifica a casa é o prefixo do e-mail.
 */
export function isDemoProspectAuthUser(user: ProspectAuthUser, prefix: string): boolean {
  const email = String(user.email || '').trim().toLowerCase();
  return Boolean(sessionIdFromEmail(email, prefix))
    && user.user_metadata?.vertho_demo_access === ACME_PROSPECT_AUTH_MARKER;
}

/**
 * Prefixo do ambiente DESTA conta, lido do próprio e-mail. Conta que não tem
 * forma de passaporte volta `null`, e quem pergunta trata como "não é convidado".
 */
function prefixoDoPassaporte(user: ProspectAuthUser): string | null {
  const passaporte = lerEmailDePassaporte(user.email);
  return passaporte ? demoProspectAuthPrefix(passaporte.slug) : null;
}

/**
 * Convidado de passaporte de QUALQUER ambiente de degustação (o nome ficou do
 * tempo em que só o ACME tinha degustação; a régua é a do ambiente da conta).
 */
export function isAcmeProspectAuthUser(user: ProspectAuthUser): boolean {
  const prefixo = prefixoDoPassaporte(user);
  return prefixo !== null && isDemoProspectAuthUser(user, prefixo);
}

export function readDemoProspectAuthContext(
  user: ProspectAuthUser,
  prefix: string,
  now: Date = new Date(),
): AcmeProspectAuthContext | null {
  if (!isDemoProspectAuthUser(user, prefix)) return null;
  const email = String(user.email || '').trim().toLowerCase();
  const metadataSession = String(user.user_metadata?.vertho_demo_session_id || '').trim();
  const sessionId = ACME_PROSPECT_SESSION_PATTERN.test(metadataSession)
    ? metadataSession
    : sessionIdFromEmail(email, prefix);
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
 * Contexto do convidado de passaporte, no ambiente da própria conta.
 *
 * 🔴 Lia só o prefixo do ACME. `Medido 16/09/2026:` os 3 passaportes do Grupo
 * Sinal abriram sessão e ficaram com `personal_accessed_at` nulo, porque para
 * esta função eles não eram convidados. O callback e `/auth/degustacao` herdam a
 * correção sem trocar de import.
 */
export function readAcmeProspectAuthContext(
  user: ProspectAuthUser,
  now: Date = new Date(),
): AcmeProspectAuthContext | null {
  const prefixo = prefixoDoPassaporte(user);
  return prefixo ? readDemoProspectAuthContext(user, prefixo, now) : null;
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

async function listProspectAuthUsers(
  authAdmin: any,
  prefix: string = ACME_PROSPECT_AUTH_PREFIX,
): Promise<Array<ProspectAuthUser & { id: string }>> {
  if (typeof authAdmin?.listUsers !== 'function') return [];
  const matches: Array<ProspectAuthUser & { id: string }> = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await authAdmin.listUsers({ page, perPage });
    if (error) throw new Error(`listar convidados Auth: ${error.message}`);
    const users = (data?.users || []) as Array<ProspectAuthUser & { id: string }>;
    matches.push(...users.filter((user) => isDemoProspectAuthUser(user, prefix)));
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

/** Passaportes do ACME Demo, o ambiente onde a degustação nasceu. */
export async function listAcmeProspectProgress(client?: any): Promise<AcmeProspectProgress[]> {
  return listDemoProspectProgress(ACME_DEMO_SLUG, client);
}

/**
 * Passaportes de um ambiente de degustação, do mais novo ao mais antigo.
 *
 * Era fixa no ACME: o painel do Grupo Sinal não mostrava os passaportes criados
 * lá (medido em 16/09/2026, 3 passaportes invisíveis).
 */
export async function listDemoProspectProgress(slug: string, client?: any): Promise<AcmeProspectProgress[]> {
  const sb = demoAdmin(client);
  const empresaId = await demoTenantId(sb, slug);
  const { data, error } = await sb.from('demo_prospect_sessions')
    .select('session_id,colaborador_id,auth_email,prospect_name,prospect_company,cargo,created_at,expires_at,personal_accessed_at,disc_completed_at,colaborador_accessed_at,gestor_accessed_at,rh_accessed_at,access_closed_at,experience_version,invite_opened_at')
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

  const situacaoRespondidaEm = await firstAnswerTimesByCollaborator(
    sb,
    empresaId,
    [...new Set(rows.map((row) => row.colaborador_id).filter((id): id is string => Boolean(id)))],
  );

  return rows.map((row) => ({
    sessionId: row.session_id,
    authEmail: row.auth_email,
    nome: row.prospect_name,
    empresa: row.prospect_company,
    cargo: row.cargo,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    versao: row.experience_version === 'B' ? 'B' as const : 'A' as const,
    conviteAbertoEm: row.invite_opened_at ?? null,
    personalAccessedAt: row.personal_accessed_at,
    discCompletedAt: row.disc_completed_at,
    colaboradorAccessedAt: row.colaborador_accessed_at,
    gestorAccessedAt: row.gestor_accessed_at,
    rhAccessedAt: row.rh_accessed_at,
    situacaoRespondidaEm: row.colaborador_id ? situacaoRespondidaEm.get(row.colaborador_id) ?? null : null,
    accessClosedAt: row.access_closed_at,
  }));
}

/**
 * Quando cada convidado respondeu a situação do cargo (a PRIMEIRA resposta).
 *
 * Existe porque "não fez o cenário" era uma das perguntas do dono sobre a
 * degustação, e o acompanhamento não tinha como responder: o marco não era
 * gravado em lugar nenhum da tabela de passaportes. A resposta mora em
 * `respostas`, então é lida de lá, escopada no tenant.
 */
async function firstAnswerTimesByCollaborator(client: any, empresaId: string, ids: string[]) {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data, error } = await client.from('respostas')
    .select('colaborador_id,created_at')
    .eq('empresa_id', empresaId)
    .in('colaborador_id', ids);
  if (error) throw new Error(`carregar respostas dos convidados: ${error.message}`);
  for (const row of (data || []) as Array<{ colaborador_id: string; created_at: string }>) {
    const atual = mapa.get(String(row.colaborador_id));
    if (!atual || Date.parse(row.created_at) < Date.parse(atual)) {
      mapa.set(String(row.colaborador_id), String(row.created_at));
    }
  }
  return mapa;
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
 * Convidado que ainda não veio pela tabela de sessões. A régua de quem É
 * convidado mora em `lib/demo/convidado-demo` (mesma que o assessment usa para
 * decidir a degustação); aqui só se acrescenta o que é próprio desta lista:
 * quem já entrou como passaporte não entra de novo como cadastro.
 *
 * ⚠️ `cobertos` sai do `auth_email` de CADA linha de passaporte, não de um
 * e-mail remontado com o prefixo do ACME: com o convidado de outro ambiente
 * reconhecido, a remontagem faria o passaporte do Grupo Sinal aparecer duas
 * vezes. E o passaporte que perdeu a linha de acompanhamento continua visível,
 * como cadastro, de propósito.
 */
function isDemoGuestEmail(email: string | null | undefined, cobertos: Set<string>): boolean {
  const valor = String(email || '').trim().toLowerCase();
  if (!valor || cobertos.has(valor)) return false;
  return isEmailDeConvidadoDemo(valor);
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
 * Acompanhamento comercial de um tenant de demonstração: os passaportes do
 * ambiente (em qualquer ambiente que ofereça degustação) mais todo convidado do
 * tenant, na ordem em que entraram.
 */
export async function listDemoGuestProgress(
  slug: string,
  client?: any,
): Promise<DemoGuestProgress[]> {
  const sb = demoAdmin(client);
  const empresaId = await demoTenantId(sb, slug);

  const passaportes = getDemoProspectTenant(slug) ? await listDemoProspectProgress(slug, sb) : [];
  const cobertos = new Set(passaportes.map((p) => p.authEmail.trim().toLowerCase()));

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
    versao: row.versao,
    conviteAbertoEm: row.conviteAbertoEm,
    personalAccessedAt: row.personalAccessedAt,
    discCompletedAt: row.discCompletedAt,
    colaboradorAccessedAt: row.colaboradorAccessedAt,
    gestorAccessedAt: row.gestorAccessedAt,
    rhAccessedAt: row.rhAccessedAt,
    situacaoRespondidaEm: row.situacaoRespondidaEm,
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
      versao: null,
      conviteAbertoEm: null,
      personalAccessedAt: acessos.get(email) ?? null,
      discCompletedAt: row.mapeamento_em,
      colaboradorAccessedAt: null,
      gestorAccessedAt: null,
      rhAccessedAt: null,
      situacaoRespondidaEm: null,
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
export async function cleanupExpiredDemoProspects(
  slug: string,
  now: Date = new Date(),
  client?: any,
): Promise<AcmeProspectCleanupResult> {
  const sb = demoAdmin(client);
  const empresaId = await demoTenantId(sb, slug);
  const authPrefix = demoProspectAuthPrefix(slug);
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
  const authUsers = await listProspectAuthUsers(sb.auth?.admin, authPrefix);
  const authByEmail = new Map(authUsers.map((user) => [String(user.email || '').toLowerCase(), user]));
  const trackedEmails = new Set(rows.map((row) => row.auth_email.toLowerCase()));
  let expiredRemoved = 0;

  // VENCER É PERDER O ACESSO, NÃO O TRABALHO (03/09/2026).
  //
  // Antes, o vencimento apagava o colaborador junto com a conta — e com ele o
  // DISC, as respostas e a análise. Quem voltasse um dia depois do prazo não
  // encontrava "expirado": encontrava o nada, e a única saída era refazer.
  // Agora o passaporte vencido revoga a ENTRADA (a conta do Auth some, a sessão
  // morre no próximo refresh) e deixa o que a pessoa produziu de pé, para ser
  // recuperado com um passaporte novo — ou removido pela faxina de
  // `DEGUSTACAO_RETENCAO_DIAS`, bem depois.
  for (const row of expiredRows) {
    await syncDiscBeforeClose(sb, empresaId, row);
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

  // FAXINA DE RETENÇÃO: o que venceu há muito tempo sai de vez. Sem ela,
  // "não apagar" viraria "acumular para sempre", e o ambiente de demonstração
  // encheria de gente que ninguém mais vai olhar.
  const limiteRetencao = new Date(now.getTime() - DEGUSTACAO_RETENCAO_DIAS * 24 * 60 * 60 * 1_000);
  const { data: paraRemover, error: erroRetencao } = await sb.from('demo_prospect_sessions')
    .select('session_id,auth_email')
    .eq('empresa_id', empresaId)
    .not('access_closed_at', 'is', null)
    .lt('access_closed_at', limiteRetencao.toISOString())
    .limit(500);
  if (erroRetencao) throw new Error(`listar convidados fora da retenção: ${erroRetencao.message}`);
  let retidosRemovidos = 0;
  for (const row of (paraRemover || []) as Array<{ session_id: string; auth_email: string }>) {
    await deleteGuestCollaborator(sb, empresaId, row.auth_email);
    retidosRemovidos++;
  }

  const activeLegacyExpiries: number[] = [];
  for (const user of authUsers) {
    const email = String(user.email || '').toLowerCase();
    if (trackedEmails.has(email)) continue;
    const context = readDemoProspectAuthContext(user, authPrefix, now);
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
    retidosRemovidos,
    activeCount: activeRows.length + activeLegacyExpiries.length,
    nextExpiry: activeExpiries.length > 0
      ? new Date(Math.min(...activeExpiries)).toISOString()
      : null,
  };
}

/** Preflight/faxina do ACME Demo, o ambiente onde a degustação nasceu. */
export async function cleanupExpiredAcmeProspects(
  now: Date = new Date(),
  client?: any,
): Promise<AcmeProspectCleanupResult> {
  return cleanupExpiredDemoProspects(ACME_DEMO_SLUG, now, client);
}
