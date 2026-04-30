'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export async function loadEmpresas() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  return data || [];
}

export async function loadResumoEmpresa(empresaId: any) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { count: colabs } = await sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
}

export async function importarColaboradoresLote(empresaId: any, colabs: any) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data: existentes } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  const emailsExistentes = new Set((existentes || []).map((c: any) => c.email.toLowerCase()));

  const VALID_ROLES = ['colaborador', 'gestor', 'rh'];

  const novos = colabs
    .filter((c: any) => c.email && !emailsExistentes.has(c.email.toLowerCase()))
    .map((c: any) => ({
      empresa_id: empresaId,
      nome_completo: c.nome?.trim() || null,
      email: c.email.trim().toLowerCase(),
      cargo: c.cargo?.trim() || null,
      area_depto: c.area_depto?.trim() || null,
      role: VALID_ROLES.includes(c.role?.trim()?.toLowerCase()) ? c.role.trim().toLowerCase() : 'colaborador',
      telefone: c.telefone?.toString().trim() || null,
      gestor_nome: c.gestor_nome?.trim() || null,
      gestor_email: c.gestor_email?.trim()?.toLowerCase() || null,
      gestor_whatsapp: c.gestor_whatsapp?.toString().trim() || null,
    }));

  if (novos.length === 0) return { success: true, message: '0 novos (todos já existiam)' };

  const { error } = await sb.from('colaboradores').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} colaboradores importados` };
}

export async function loadColaboradores(empresaId: any) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, telefone, gestor_nome, gestor_email, gestor_whatsapp, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) return d1 || [];
  const { data: d2 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return (d2 || []).map((c: any) => ({ ...c, telefone: null, gestor_nome: null, gestor_email: null, gestor_whatsapp: null }));
}

export async function criarColaborador(empresaId: any, campos: any) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresa obrigatória' };
  if (!campos?.email?.trim()) return { success: false, error: 'email obrigatório' };

  const sb = createSupabaseAdmin();
  const VALID_ROLES = ['colaborador', 'gestor', 'rh'];
  const email = campos.email.trim().toLowerCase();

  const { data: existente } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', empresaId).eq('email', email).maybeSingle();
  if (existente) return { success: false, error: 'já existe colaborador com este email nesta empresa' };

  const payload = {
    empresa_id: empresaId,
    email,
    nome_completo: campos.nome_completo?.trim() || null,
    cargo: campos.cargo?.trim() || null,
    area_depto: campos.area_depto?.trim() || null,
    telefone: campos.telefone?.trim() || null,
    gestor_nome: campos.gestor_nome?.trim() || null,
    gestor_email: campos.gestor_email?.trim().toLowerCase() || null,
    gestor_whatsapp: campos.gestor_whatsapp?.trim() || null,
    role: VALID_ROLES.includes(campos.role) ? campos.role : 'colaborador',
  };

  const { data, error } = await sb.from('colaboradores').insert(payload).select('id').single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function atualizarColaborador(id: any, campos: any) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return { success: false, error: 'colab não encontrado' };

  const VALID_ROLES = ['colaborador', 'gestor', 'rh'];
  const update: any = {};
  if (campos.nome_completo !== undefined) update.nome_completo = campos.nome_completo?.trim() || null;
  if (campos.email !== undefined) update.email = campos.email?.trim().toLowerCase() || null;
  if (campos.cargo !== undefined) update.cargo = campos.cargo?.trim() || null;
  if (campos.area_depto !== undefined) update.area_depto = campos.area_depto?.trim() || null;
  if (campos.telefone !== undefined) update.telefone = campos.telefone?.trim() || null;
  if (campos.gestor_nome !== undefined) update.gestor_nome = campos.gestor_nome?.trim() || null;
  if (campos.gestor_email !== undefined) update.gestor_email = campos.gestor_email?.trim().toLowerCase() || null;
  if (campos.gestor_whatsapp !== undefined) update.gestor_whatsapp = campos.gestor_whatsapp?.trim() || null;
  if (campos.role !== undefined && VALID_ROLES.includes(campos.role)) update.role = campos.role;

  const { error } = await sb.from('colaboradores').update(update).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function excluirColaborador(id: any) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  const { data: existente } = await sb.from('colaboradores').select('empresa_id').eq('id', id).maybeSingle();
  if (!existente) return { success: false, error: 'colab não encontrado' };

  const { error } = await sb.from('colaboradores').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Cargos ──────────────────────────────────────────────────────────────────

export async function loadCargos(empresaId: any) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) return [];
  return data || [];
}

export async function salvarCargo(empresaId: any, cargo: any) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
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
  return { success: true, data: result.data };
}

export async function excluirCargo(id: any) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();

  const { data: existe } = await sb.from('cargos_empresa').select('empresa_id').eq('id', id).maybeSingle();
  if (!existe) return { success: false, error: 'cargo não encontrado' };

  const { error } = await sb.from('cargos_empresa').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function sincronizarCargosDeColaboradores(empresaId: any) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
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
  await requireAdminAction();
  if (!empresaId || !cargos?.length) return { success: false, error: 'Dados incompletos' };

  const sb = createSupabaseAdmin();
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
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', vinculados: 0, naoEncontrados: [], ambiguos: [] };
  const sb = createSupabaseAdmin();

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
