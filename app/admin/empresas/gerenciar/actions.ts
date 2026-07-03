'use server';

import { z } from 'zod';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { protectedAction } from '@/lib/auth/protected-action';
import { updateColaboradorInTenant, deleteColaboradorInTenant, emailExistsInTenant, createColaboradorInTenant, listEmailsInTenant, createColaboradoresLoteInTenant } from '@/lib/repositories/colaboradores-repo';
import { upsertCargoInTenant, deleteCargoInTenant } from '@/lib/repositories/cargos-empresa-repo';
import { logAdminAction } from '@/lib/audit';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { validateWhatsAppBR } from '@/lib/phone';
import { proxyEmailFromPhone, isProxyEmail } from '@/lib/phone-otp';
import { getLocale } from 'next-intl/server';

const VALID_ROLES = ['colaborador', 'gestor', 'rh'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function normalizeText(value: any) {
  const text = value?.toString().trim();
  return text || null;
}

function normalizeEmail(value: any) {
  const email = normalizeText(value)?.toLowerCase();
  return email || null;
}

function isValidEmail(email: string | null) {
  return Boolean(email && email.length <= 254 && EMAIL_RE.test(email));
}

function normalizePhone(value: any) {
  let digits = value?.toString().replace(/\D/g, '') || '';
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits.startsWith('55') && digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

function hasValue(value: any) {
  return Boolean(value?.toString().trim());
}

function formatIssue(issue: any) {
  const valor = issue.valor ? ` "${issue.valor}"` : '';
  const nome = issue.nome ? ` (${issue.nome})` : '';
  return `linha ${issue.linha}${nome}: ${issue.campo}${valor} - ${issue.motivo}`;
}

function buildImportMessage(importados: number, duplicados: number, erros: any[], avisos: any[]) {
  const parts = [`${importados} colaboradores importados`];
  if (duplicados > 0) parts.push(`${duplicados} duplicata${duplicados === 1 ? '' : 's'} ignorada${duplicados === 1 ? '' : 's'}`);
  if (erros.length > 0) parts.push(`${erros.length} linha${erros.length === 1 ? '' : 's'} com erro bloqueada${erros.length === 1 ? '' : 's'}`);
  if (avisos.length > 0) parts.push(`${avisos.length} aviso${avisos.length === 1 ? '' : 's'} em telefone/e-mail de gestor`);

  const detalhes = [...erros, ...avisos].slice(0, 8).map(formatIssue);
  if (detalhes.length === 0) return parts.join(' · ');
  const extra = erros.length + avisos.length - detalhes.length;
  return `${parts.join(' · ')}\n${detalhes.join('\n')}${extra > 0 ? `\n... mais ${extra} ocorrência${extra === 1 ? '' : 's'}` : ''}`;
}

export async function loadEmpresas() {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  return data || [];
}

export async function loadResumoEmpresa(empresaId: any) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { count: colabs } = await excludeInternalEmails(sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId)); // exclui internos @vertho.ai
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
}

const ImportarLoteSchema = z.object({
  empresaId: z.string().uuid(),
  colabs: z.array(z.record(z.string(), z.any())).max(10000),
});

const _importarColaboradoresLote = protectedAction('users.manage', ImportarLoteSchema, async (ctx, { empresaId, colabs }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();
  const emailsExistentes = new Set(await listEmailsInTenant(sb, empresaId));
  const emailsArquivo = new Set<string>();
  const erros: any[] = [];
  const avisos: any[] = [];
  let duplicados = 0;

  const novos = (colabs || []).reduce<Record<string, any>[]>((acc, c: any, index: number) => {
    const linha = index + 2;
    const nome = normalizeText(c.nome);
    let email = normalizeEmail(c.email);
    const wa = validateWhatsAppBR(c.telefone);
    let loginPorWhatsapp = false;
    let telefone: string | null;

    if (isValidEmail(email)) {
      telefone = normalizePhone(c.telefone);
      if (hasValue(c.telefone) && !telefone) {
        avisos.push({ linha, nome, campo: 'telefone/celular', valor: c.telefone, motivo: 'formato inválido; campo não salvo' });
      }
    } else if (wa.valid === true) {
      // Sem e-mail → login por WhatsApp (email-proxy interno determinístico).
      email = proxyEmailFromPhone(empresaId, wa.e164);
      telefone = wa.e164;
      loginPorWhatsapp = true;
    } else {
      erros.push({ linha, nome, campo: 'email', valor: c.email, motivo: 'sem e-mail válido e sem WhatsApp válido (DDD + 9 + 8 dígitos); linha não importada' });
      return acc;
    }

    // Dedup pelo e-mail efetivo (real ou proxy) — cobre telefone repetido.
    if (emailsExistentes.has(email!) || emailsArquivo.has(email!)) {
      duplicados += 1;
      return acc;
    }
    emailsArquivo.add(email!);

    const gestorEmail = normalizeEmail(c.gestor_email);
    if (hasValue(c.gestor_email) && !isValidEmail(gestorEmail)) {
      avisos.push({ linha, nome, campo: 'gestor_email', valor: c.gestor_email, motivo: 'e-mail inválido; campo não salvo' });
    }

    const gestorWhatsapp = normalizePhone(c.gestor_whatsapp);
    if (hasValue(c.gestor_whatsapp) && !gestorWhatsapp) {
      avisos.push({ linha, nome, campo: 'gestor_whatsapp', valor: c.gestor_whatsapp, motivo: 'formato inválido; campo não salvo' });
    }

    const role = normalizeText(c.role)?.toLowerCase();
    acc.push({
      nome_completo: nome,
      email,
      cargo: normalizeText(c.cargo),
      area_depto: normalizeText(c.area_depto),
      role: VALID_ROLES.includes(role || '') ? role : 'colaborador',
      telefone,
      gestor_nome: normalizeText(c.gestor_nome),
      gestor_email: isValidEmail(gestorEmail) ? gestorEmail : null,
      gestor_whatsapp: gestorWhatsapp,
      login_por_whatsapp: loginPorWhatsapp,
    });
    return acc;
  }, []);

  if (novos.length === 0) {
    return { message: buildImportMessage(0, duplicados, erros, avisos), importados: 0, duplicados, erros, avisos };
  }
  await createColaboradoresLoteInTenant(sb, empresaId, novos);
  return { message: buildImportMessage(novos.length, duplicados, erros, avisos), importados: novos.length, duplicados, erros, avisos };
});

export async function importarColaboradoresLote(input: z.infer<typeof ImportarLoteSchema>) {
  return _importarColaboradoresLote(input);
}

export async function loadColaboradores(empresaId: any) {
  await requireAdminAction();

  const sb = await requireAdminSupabase();
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, telefone, gestor_nome, gestor_email, gestor_whatsapp, mapeamento_em, login_por_whatsapp')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  // sem_email_real = e-mail é o proxy interno (login só por WhatsApp). A UI mostra
  // o badge por ISTO (não por login_por_whatsapp), pois um colab pode logar por
  // WhatsApp E ter e-mail real — aí o e-mail aparece normalmente.
  if (!e1) return (d1 || []).map((c: any) => ({ ...c, sem_email_real: isProxyEmail(c.email) }));
  const { data: d2 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return (d2 || []).map((c: any) => ({ ...c, telefone: null, gestor_nome: null, gestor_email: null, gestor_whatsapp: null, login_por_whatsapp: false, sem_email_real: isProxyEmail(c.email) }));
}

/** Export XLSX da base de colaboradores da empresa (base64). Client decodifica → Blob → download. */
export async function exportarColaboradoresXLSX(empresaId: any): Promise<
  { ok: true; base64: string; n: number } | { ok: false; error: string }
> {
  const ctx = await requireAdminAction('exports.run');
  if (!empresaId) return { ok: false, error: 'empresa obrigatória' };
  const locale = await getLocale();

  const sb = await requireAdminSupabase();
  const [{ data: emp }, colabs] = await Promise.all([
    sb.from('empresas').select('nome').eq('id', empresaId).single(),
    loadColaboradores(empresaId),
  ]);
  if (!colabs.length) return { ok: false, error: 'Nenhum colaborador para exportar' };

  const COLS = [
    { h: 'Nome', k: 'nome_completo', w: 28 },
    { h: 'Email', k: 'email', w: 30 },
    { h: 'Cargo', k: 'cargo', w: 22 },
    { h: 'Área / Depto', k: 'area_depto', w: 20 },
    { h: 'Role', k: 'role', w: 12 },
    { h: 'WhatsApp', k: 'telefone', w: 16 },
    { h: 'Gestor', k: 'gestor_nome', w: 24 },
    { h: 'Gestor (email)', k: 'gestor_email', w: 28 },
    { h: 'Gestor (WhatsApp)', k: 'gestor_whatsapp', w: 18 },
    { h: 'Mapeado em', k: 'mapeamento_em', w: 18 },
  ];

  const fmtData = (v: any) => {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  };

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Colaboradores');

  const titulo = `Colaboradores — ${emp?.nome || 'empresa'} — exportado em ${new Date().toLocaleDateString(locale)} (${colabs.length})`;
  ws.addRow([titulo]);
  ws.mergeCells(1, 1, 1, COLS.length);
  ws.getRow(1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

  const head = ws.addRow(COLS.map(c => c.h));
  head.font = { bold: true };
  head.eachCell((c: any) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2B54' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

  for (const colab of colabs as any[]) {
    ws.addRow(COLS.map(c => {
      if (c.k === 'mapeamento_em') return fmtData(colab[c.k]);
      if (c.k === 'email') return colab.login_por_whatsapp ? '(login por WhatsApp)' : (colab.email ?? '');
      return colab[c.k] ?? '';
    }));
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  ws.columns.forEach((col: any, i: number) => { col.width = COLS[i]?.w || 14; });

  const buf = await wb.xlsx.writeBuffer();
  await logAdminAction({
    adminEmail: ctx.email, acao: 'colaboradores.export', empresaId, empresaSlug: undefined,
    alvo: `${colabs.length} colaboradores`, detalhes: { empresa: emp?.nome, formato: 'xlsx', n: colabs.length },
  });
  return { ok: true, base64: Buffer.from(buf as any).toString('base64'), n: colabs.length };
}

const CriarColaboradorSchema = z.object({
  empresaId: z.string().uuid(),
  campos: z.object({
    nome_completo: z.string().nullish(),
    email: z.string().nullish(),
    telefone: z.string().nullish(),
    cargo: z.string().nullish(),
    area_depto: z.string().nullish(),
    gestor_nome: z.string().nullish(),
    gestor_email: z.string().nullish(),
    gestor_whatsapp: z.string().nullish(),
    role: z.string().nullish(),
  }),
});

const _criarColaborador = protectedAction('users.manage', CriarColaboradorSchema, async (ctx, { empresaId, campos }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)

  let email = normalizeEmail(campos?.email);
  const wa = validateWhatsAppBR(campos?.telefone);
  let loginPorWhatsapp = false;
  let telefone: string | null;

  if (isValidEmail(email)) {
    telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) throw new Error('telefone/celular inválido. Use DDD, ex.: 11999998888 ou 5511999998888');
    // Tem e-mail REAL + telefone → loga pelos DOIS (e-mail E WhatsApp). Sem
    // telefone, só e-mail. O auth.users é criado no 1º login (verify/magic-link).
    loginPorWhatsapp = !!telefone;
  } else if (wa.valid === true) {
    // Sem e-mail → login por WhatsApp (email-proxy interno determinístico).
    email = proxyEmailFromPhone(empresaId, wa.e164);
    telefone = wa.e164;
    loginPorWhatsapp = true;
  } else {
    throw new Error('informe um e-mail válido OU um WhatsApp válido (DDD + 9 + 8 dígitos)');
  }

  const gestorEmail = normalizeEmail(campos.gestor_email);
  if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) throw new Error('email do gestor inválido');
  const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
  if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) throw new Error('whatsapp do gestor inválido. Use DDD, ex.: 11999998888 ou 5511999998888');

  const sb = await requireAdminSupabase();
  if (await emailExistsInTenant(sb, empresaId, email)) {
    throw new Error(loginPorWhatsapp ? 'já existe colaborador com este WhatsApp nesta empresa' : 'já existe colaborador com este email nesta empresa');
  }

  const novo = await createColaboradorInTenant(sb, empresaId, {
    email,
    nome_completo: campos.nome_completo?.trim() || null,
    cargo: campos.cargo?.trim() || null,
    area_depto: campos.area_depto?.trim() || null,
    telefone,
    gestor_nome: campos.gestor_nome?.trim() || null,
    gestor_email: gestorEmail,
    gestor_whatsapp: gestorWhatsapp,
    role: VALID_ROLES.includes(campos.role as string) ? campos.role : 'colaborador',
    login_por_whatsapp: loginPorWhatsapp,
  });
  return { id: novo.id };
});

export async function criarColaborador(input: z.infer<typeof CriarColaboradorSchema>) {
  return _criarColaborador(input);
}

const AtualizarColaboradorSchema = z.object({
  empresaId: z.string().uuid(),
  id: z.string().uuid(),
  // forma livre; a normalização/validação SEMÂNTICA (email/telefone) fica no corpo
  campos: z.object({
    nome_completo: z.string().nullish(),
    email: z.string().nullish(),
    cargo: z.string().nullish(),
    area_depto: z.string().nullish(),
    telefone: z.string().nullish(),
    gestor_nome: z.string().nullish(),
    gestor_email: z.string().nullish(),
    gestor_whatsapp: z.string().nullish(),
    role: z.string().nullish(),
  }),
});

const _atualizarColaborador = protectedAction('users.manage', AtualizarColaboradorSchema, async (ctx, { empresaId, id, campos }) => {
  // Defense-in-depth: valida que o admin pode operar NESTE tenant (no-op p/ platform
  // admin). O isolamento REAL agora vem do repo — empresa_id embutido no WHERE.
  await assertTenantAccessAction(ctx, empresaId);

  const update: any = {};
  if (campos.nome_completo !== undefined) update.nome_completo = campos.nome_completo?.trim() || null;
  if (campos.email !== undefined) {
    const email = normalizeEmail(campos.email);
    if (!isValidEmail(email)) throw new Error('email inválido');
    update.email = email;
    // E-mail REAL cadastrado num colab que entrou por WhatsApp: cria o auth.users
    // do e-mail (idempotente) p/ ele poder logar TAMBÉM por e-mail. login_por_whatsapp
    // NÃO é alterado — se já era true, continua logando por WhatsApp também (a rota
    // de verificação passa a usar este e-mail real como identidade).
    if (!isProxyEmail(email)) {
      try {
        const sbAuth = await requireAdminSupabase();
        const { error: ce } = await sbAuth.auth.admin.createUser({ email, email_confirm: true });
        if (ce && !/already|registered|exists/i.test(ce.message)) console.warn('[atualizarColaborador] createUser:', ce.message);
      } catch (e: any) { console.warn('[atualizarColaborador] createUser:', e?.message); }
    }
  }
  if (campos.cargo !== undefined) update.cargo = campos.cargo?.trim() || null;
  if (campos.area_depto !== undefined) update.area_depto = campos.area_depto?.trim() || null;
  if (campos.telefone !== undefined) {
    const telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) throw new Error('telefone/celular inválido. Use DDD, ex.: 11999998888 ou 5511999998888');
    update.telefone = telefone;
  }
  if (campos.gestor_nome !== undefined) update.gestor_nome = campos.gestor_nome?.trim() || null;
  if (campos.gestor_email !== undefined) {
    const gestorEmail = normalizeEmail(campos.gestor_email);
    if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) throw new Error('email do gestor inválido');
    update.gestor_email = gestorEmail;
  }
  if (campos.gestor_whatsapp !== undefined) {
    const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
    if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) throw new Error('whatsapp do gestor inválido. Use DDD, ex.: 11999998888 ou 5511999998888');
    update.gestor_whatsapp = gestorWhatsapp;
  }
  if (campos.role !== undefined && VALID_ROLES.includes(campos.role as string)) update.role = campos.role;

  const updated = await updateColaboradorInTenant(await requireAdminSupabase(), empresaId, id, update);
  if (!updated) throw new Error('colaborador não encontrado nesta empresa');
  return { id };
});

export async function atualizarColaborador(input: z.infer<typeof AtualizarColaboradorSchema>) {
  return _atualizarColaborador(input);
}

const ExcluirColaboradorSchema = z.object({ empresaId: z.string().uuid(), id: z.string().uuid() });

const _excluirColaborador = protectedAction('users.manage', ExcluirColaboradorSchema, async (ctx, { empresaId, id }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const removido = await deleteColaboradorInTenant(await requireAdminSupabase(), empresaId, id);
  if (!removido) throw new Error('colaborador não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'colaborador.excluir', empresaId,
    alvo: removido.nome_completo || id, detalhes: { colaboradorId: id },
  });
  return { id };
});

export async function excluirColaborador(input: z.infer<typeof ExcluirColaboradorSchema>) {
  return _excluirColaborador(input);
}

// ── Cargos ──────────────────────────────────────────────────────────────────

export async function loadCargos(empresaId: any) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('eh_vaga', false) // vagas vivem no Módulo de Seleção, não na lista de cargos operacionais
    .order('nome');
  if (error) return [];
  return data || [];
}

// PILOTO Fase 2 — primeira action sobre `protectedAction`: a factory força
// auth (companies.manage) + validação Zod + retorno padronizado {success,...};
// o corpo só cuida da regra de negócio (e do tenant, via assertTenantAccessAction).
// O wrapper `export async function` mantém a compat com 'use server'.
const SalvarCargoSchema = z.object({
  empresaId: z.string().uuid(),
  cargo: z.object({
    id: z.string().uuid().optional(),
    nome: z.string().trim().min(1, 'Nome do cargo é obrigatório'),
    area_depto: z.string().nullish(),
    descricao: z.string().nullish(),
    principais_entregas: z.string().nullish(),
    contexto_cultural: z.string().nullish(),
    stakeholders: z.string().nullish(),
    decisoes_recorrentes: z.string().nullish(),
    tensoes_comuns: z.string().nullish(),
    eh_lideranca: z.boolean().optional(),
  }),
});
type SalvarCargoInput = z.infer<typeof SalvarCargoSchema>;

const _salvarCargo = protectedAction('companies.manage', SalvarCargoSchema, async (ctx, { empresaId, cargo }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const sb = await requireAdminSupabase();
  const registro = {
    ...(cargo.id ? { id: cargo.id } : {}),
    nome: cargo.nome.trim(),
    area_depto: cargo.area_depto?.trim() || null,
    descricao: cargo.descricao?.trim() || null,
    principais_entregas: cargo.principais_entregas?.trim() || null,
    contexto_cultural: cargo.contexto_cultural?.trim() || null,
    stakeholders: cargo.stakeholders?.trim() || null,
    decisoes_recorrentes: cargo.decisoes_recorrentes?.trim() || null,
    tensoes_comuns: cargo.tensoes_comuns?.trim() || null,
    eh_lideranca: cargo.eh_lideranca !== false,
    updated_at: new Date().toISOString(),
  };
  const saved = await upsertCargoInTenant(sb, empresaId, registro);
  if (!saved) throw new Error('cargo não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.salvar', empresaId,
    alvo: registro.nome,
    detalhes: { modo: cargo.id ? 'editar' : 'criar', cargoId: saved.id ?? cargo.id, eh_lideranca: registro.eh_lideranca },
  });
  return saved;
});

export async function salvarCargo(input: SalvarCargoInput) {
  return _salvarCargo(input);
}

const ExcluirCargoSchema = z.object({ empresaId: z.string().uuid(), id: z.string().uuid() });

const _excluirCargo = protectedAction('companies.manage', ExcluirCargoSchema, async (ctx, { empresaId, id }) => {
  await assertTenantAccessAction(ctx, empresaId); // defense-in-depth (no-op p/ platform admin)
  const sb = await requireAdminSupabase();
  const removido = await deleteCargoInTenant(sb, empresaId, id);
  if (!removido) throw new Error('cargo não encontrado nesta empresa');
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.excluir', empresaId,
    alvo: removido.nome || id, detalhes: { cargoId: id },
  });
  return { id };
});

export async function excluirCargo(input: z.infer<typeof ExcluirCargoSchema>) {
  return _excluirCargo(input);
}

export async function sincronizarCargosDeColaboradores(empresaId: any) {
  await requireAdminAction('companies.manage');

  const sb = await requireAdminSupabase();
  const { data: colabs } = await sb.from('colaboradores')
    .select('cargo, area_depto')
    .eq('empresa_id', empresaId)
    .not('cargo', 'is', null);

  const cargosMap: Record<string, string | null> = {};
  (colabs || []).forEach((c: any) => {
    if (c.cargo && !cargosMap[c.cargo]) {
      cargosMap[c.cargo] = c.area_depto || null;
    }
  });

  const { data: existentes } = await sb.from('cargos_empresa')
    .select('nome').eq('empresa_id', empresaId);
  const existSet = new Set((existentes || []).map((c: any) => c.nome.toLowerCase()));

  const novos = Object.entries(cargosMap)
    .filter(([nome]) => !existSet.has(nome.toLowerCase()))
    .map(([nome, area]) => ({
      empresa_id: empresaId,
      nome,
      area_depto: area,
    }));

  if (novos.length === 0) return { success: true, message: 'Todos os cargos já estavam cadastrados' };

  const { error } = await sb.from('cargos_empresa').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} cargos sincronizados dos colaboradores` };
}

export async function importarCargosLote(empresaId: any, cargos: any[]) {
  await requireAdminAction('companies.manage');
  if (!empresaId || !cargos?.length) return { success: false, error: 'Dados incompletos' };

  const sb = await requireAdminSupabase();
  const { data: existentes } = await sb.from('cargos_empresa')
    .select('nome').eq('empresa_id', empresaId);
  const existSet = new Set((existentes || []).map((c: any) => c.nome.toLowerCase().trim()));

  const novos = cargos
    .filter(c => c.nome?.trim() && !existSet.has(c.nome.trim().toLowerCase()))
    .map(c => ({
      empresa_id: empresaId,
      nome: c.nome.trim(),
      area_depto: c.area_depto?.trim() || null,
      descricao: c.descricao?.trim() || null,
      principais_entregas: c.principais_entregas?.trim() || null,
      stakeholders: c.stakeholders?.trim() || null,
      decisoes_recorrentes: c.decisoes_recorrentes?.trim() || null,
      tensoes_comuns: c.tensoes_comuns?.trim() || null,
      contexto_cultural: c.contexto_cultural?.trim() || null,
      eh_lideranca: c.eh_lideranca === 'sim' || c.eh_lideranca === true,
    }));

  if (novos.length === 0) return { success: true, message: 'Todos os cargos já estavam cadastrados (duplicatas ignoradas)' };

  const { error } = await sb.from('cargos_empresa').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} cargos importados (${cargos.length - novos.length} duplicatas ignoradas)` };
}

/**
 * Para colaboradores com gestor_nome preenchido mas gestor_email vazio,
 * tenta achar um colaborador da mesma empresa cujo nome bate com gestor_nome
 * (ilike, case-insensitive). Quando acha, copia o email pra gestor_email.
 *
 * Resolve casos de importação onde só veio o nome do gestor, não o email.
 *
 * Retorna relatório com vinculados / não-encontrados / ambíguos (mais de 1 match).
 */
export async function derivarGestorEmailPorNome(empresaId: string): Promise<{
  success: boolean;
  error?: string;
  vinculados: number;
  naoEncontrados: { colab: string; gestor_nome: string }[];
  ambiguos: { colab: string; gestor_nome: string; matches: number }[];
}> {
  await requireAdminAction('users.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', vinculados: 0, naoEncontrados: [], ambiguos: [] };
  const sb = await requireAdminSupabase();

  // 1. Pega todos os colabs com gestor_nome mas sem gestor_email
  const { data: pendentes } = await sb.from('colaboradores')
    .select('id, nome_completo, gestor_nome')
    .eq('empresa_id', empresaId)
    .not('gestor_nome', 'is', null)
    .is('gestor_email', null);

  if (!pendentes?.length) {
    return { success: true, vinculados: 0, naoEncontrados: [], ambiguos: [] };
  }

  // 2. Pega todos os colabs da empresa (potenciais gestores)
  const { data: todos } = await sb.from('colaboradores')
    .select('id, nome_completo, email')
    .eq('empresa_id', empresaId);
  const candidatos = (todos || []).filter((c: any) => c.email);

  // Função de match: normaliza espaços, remove acentos, ilike
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

  const naoEncontrados: { colab: string; gestor_nome: string }[] = [];
  const ambiguos: { colab: string; gestor_nome: string; matches: number }[] = [];
  const updates: { id: string; gestor_email: string }[] = [];

  for (const p of pendentes as any[]) {
    const alvo = normalizar(p.gestor_nome);
    const matches = candidatos.filter((c: any) => {
      const nome = normalizar(c.nome_completo || '');
      // Match exato ou contém
      return nome === alvo || nome.includes(alvo) || alvo.includes(nome);
    });
    if (matches.length === 0) {
      naoEncontrados.push({ colab: p.nome_completo, gestor_nome: p.gestor_nome });
    } else if (matches.length > 1) {
      // Tenta match exato como desempate
      const exato = matches.filter((c: any) => normalizar(c.nome_completo) === alvo);
      if (exato.length === 1) {
        updates.push({ id: p.id, gestor_email: exato[0].email.toLowerCase() });
      } else {
        ambiguos.push({ colab: p.nome_completo, gestor_nome: p.gestor_nome, matches: matches.length });
      }
    } else {
      updates.push({ id: p.id, gestor_email: matches[0].email.toLowerCase() });
    }
  }

  // 3. Aplica updates em lote (1 update por colab)
  for (const u of updates) {
    await sb.from('colaboradores')
      .update({ gestor_email: u.gestor_email })
      .eq('id', u.id)
      .eq('empresa_id', empresaId);
  }

  return {
    success: true,
    vinculados: updates.length,
    naoEncontrados,
    ambiguos,
  };
}
