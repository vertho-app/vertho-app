'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { validateWhatsAppBR } from '@/lib/phone';
import { proxyEmailFromPhone } from '@/lib/phone-otp';
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
  const { count: colabs } = await sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
}

export async function importarColaboradoresLote(empresaId: any, colabs: any) {
  await requireAdminAction('users.manage');

  const sb = await requireAdminSupabase();
  const { data: existentes } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  const emailsExistentes = new Set((existentes || []).map((c: any) => c.email?.toLowerCase()).filter(Boolean));
  const emailsArquivo = new Set<string>();
  const erros: any[] = [];
  const avisos: any[] = [];
  let duplicados = 0;

  const novos = (colabs || []).reduce((acc: any[], c: any, index: number) => {
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
      empresa_id: empresaId,
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
    return { success: true, message: buildImportMessage(0, duplicados, erros, avisos), erros, avisos };
  }

  const { error } = await sb.from('colaboradores').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: buildImportMessage(novos.length, duplicados, erros, avisos), erros, avisos };
}

export async function loadColaboradores(empresaId: any) {
  await requireAdminAction();

  const sb = await requireAdminSupabase();
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, telefone, gestor_nome, gestor_email, gestor_whatsapp, mapeamento_em, login_por_whatsapp')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) return d1 || [];
  const { data: d2 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return (d2 || []).map((c: any) => ({ ...c, telefone: null, gestor_nome: null, gestor_email: null, gestor_whatsapp: null, login_por_whatsapp: false }));
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

export async function criarColaborador(empresaId: any, campos: any) {
  await requireAdminAction('users.manage');
  if (!empresaId) return { success: false, error: 'empresa obrigatória' };
  const sb = await requireAdminSupabase();
  let email = normalizeEmail(campos?.email);
  const wa = validateWhatsAppBR(campos?.telefone);
  let loginPorWhatsapp = false;
  let telefone: string | null;

  if (isValidEmail(email)) {
    telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) return { success: false, error: 'telefone/celular inválido. Use DDD, ex.: 11999998888 ou 5511999998888' };
  } else if (wa.valid === true) {
    // Sem e-mail → login por WhatsApp (email-proxy interno determinístico).
    email = proxyEmailFromPhone(empresaId, wa.e164);
    telefone = wa.e164;
    loginPorWhatsapp = true;
  } else {
    return { success: false, error: 'informe um e-mail válido OU um WhatsApp válido (DDD + 9 + 8 dígitos)' };
  }

  const gestorEmail = normalizeEmail(campos.gestor_email);
  if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) return { success: false, error: 'email do gestor inválido' };
  const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
  if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) return { success: false, error: 'whatsapp do gestor inválido. Use DDD, ex.: 11999998888 ou 5511999998888' };

  const { data: existente } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', empresaId).eq('email', email).maybeSingle();
  if (existente) return { success: false, error: loginPorWhatsapp ? 'já existe colaborador com este WhatsApp nesta empresa' : 'já existe colaborador com este email nesta empresa' };

  const payload = {
    empresa_id: empresaId,
    email,
    nome_completo: campos.nome_completo?.trim() || null,
    cargo: campos.cargo?.trim() || null,
    area_depto: campos.area_depto?.trim() || null,
    telefone,
    gestor_nome: campos.gestor_nome?.trim() || null,
    gestor_email: gestorEmail,
    gestor_whatsapp: gestorWhatsapp,
    role: VALID_ROLES.includes(campos.role) ? campos.role : 'colaborador',
    login_por_whatsapp: loginPorWhatsapp,
  };

  const { data, error } = await sb.from('colaboradores').insert(payload).select('id').single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function atualizarColaborador(id: any, campos: any) {
  await requireAdminAction('users.manage');
  const sb = await requireAdminSupabase();

  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return { success: false, error: 'colab não encontrado' };

  const update: any = {};
  if (campos.nome_completo !== undefined) update.nome_completo = campos.nome_completo?.trim() || null;
  if (campos.email !== undefined) {
    const email = normalizeEmail(campos.email);
    if (!isValidEmail(email)) return { success: false, error: 'email inválido' };
    update.email = email;
  }
  if (campos.cargo !== undefined) update.cargo = campos.cargo?.trim() || null;
  if (campos.area_depto !== undefined) update.area_depto = campos.area_depto?.trim() || null;
  if (campos.telefone !== undefined) {
    const telefone = normalizePhone(campos.telefone);
    if (hasValue(campos.telefone) && !telefone) return { success: false, error: 'telefone/celular inválido. Use DDD, ex.: 11999998888 ou 5511999998888' };
    update.telefone = telefone;
  }
  if (campos.gestor_nome !== undefined) update.gestor_nome = campos.gestor_nome?.trim() || null;
  if (campos.gestor_email !== undefined) {
    const gestorEmail = normalizeEmail(campos.gestor_email);
    if (hasValue(campos.gestor_email) && !isValidEmail(gestorEmail)) return { success: false, error: 'email do gestor inválido' };
    update.gestor_email = gestorEmail;
  }
  if (campos.gestor_whatsapp !== undefined) {
    const gestorWhatsapp = normalizePhone(campos.gestor_whatsapp);
    if (hasValue(campos.gestor_whatsapp) && !gestorWhatsapp) return { success: false, error: 'whatsapp do gestor inválido. Use DDD, ex.: 11999998888 ou 5511999998888' };
    update.gestor_whatsapp = gestorWhatsapp;
  }
  if (campos.role !== undefined && VALID_ROLES.includes(campos.role)) update.role = campos.role;

  const { error } = await sb.from('colaboradores').update(update).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function excluirColaborador(id: any) {
  const ctx = await requireAdminAction('users.manage');
  const sb = await requireAdminSupabase();

  const { data: existente } = await sb.from('colaboradores').select('empresa_id, nome_completo').eq('id', id).maybeSingle();
  if (!existente) return { success: false, error: 'colab não encontrado' };

  const { error } = await sb.from('colaboradores').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: ctx.email, acao: 'colaborador.excluir', empresaId: existente.empresa_id,
    alvo: existente.nome_completo || id, detalhes: { colaboradorId: id },
  });
  return { success: true };
}

// ── Cargos ──────────────────────────────────────────────────────────────────

export async function loadCargos(empresaId: any) {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) return [];
  return data || [];
}

export async function salvarCargo(empresaId: any, cargo: any) {
  const ctx = await requireAdminAction('companies.manage');

  const sb = await requireAdminSupabase();
  const registro = {
    empresa_id: empresaId,
    nome: cargo.nome?.trim(),
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

  if (!registro.nome) return { success: false, error: 'Nome do cargo é obrigatório' };

  let result;
  if (cargo.id) {
    const { data: existe } = await sb.from('cargos_empresa').select('empresa_id').eq('id', cargo.id).maybeSingle();
    if (!existe) return { success: false, error: 'cargo não encontrado' };
    result = await sb.from('cargos_empresa').update(registro).eq('id', cargo.id).select().single();
  } else {
    result = await sb.from('cargos_empresa').insert(registro).select().single();
  }
  if (result.error) return { success: false, error: result.error.message };
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.salvar', empresaId,
    alvo: registro.nome,
    detalhes: { modo: cargo.id ? 'editar' : 'criar', cargoId: result.data?.id ?? cargo.id, eh_lideranca: registro.eh_lideranca },
  });
  return { success: true, data: result.data };
}

export async function excluirCargo(id: any) {
  const ctx = await requireAdminAction('companies.manage');
  const sb = await requireAdminSupabase();

  const { data: existe } = await sb.from('cargos_empresa').select('empresa_id, nome').eq('id', id).maybeSingle();
  if (!existe) return { success: false, error: 'cargo não encontrado' };

  const { error } = await sb.from('cargos_empresa').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: ctx.email, acao: 'cargo.excluir', empresaId: (existe as any).empresa_id,
    alvo: (existe as any).nome || id, detalhes: { cargoId: id },
  });
  return { success: true };
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
      .eq('id', u.id);
  }

  return {
    success: true,
    vinculados: updates.length,
    naoEncontrados,
    ambiguos,
  };
}
