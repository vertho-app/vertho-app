'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/authz';

async function guardAdmin(email: string | null | undefined) {
  if (!email || !(await isPlatformAdmin(email))) throw new Error('FORBIDDEN');
}

export async function loadEmpresas(callerEmail: string) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCompetencias(callerEmail: string, empresaId: string) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('cargo')
      .order('nome');

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loadCompetenciasBase(callerEmail: string, segmento: string | null) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  try {
    let query = sb.from('competencias_base').select('*').order('nome');
    if (segmento) query = query.eq('segmento', segmento);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function salvarCompetencia(callerEmail: string, empresaId: string, comp: any) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  try {
    const registro = {
      empresa_id: empresaId,
      nome: comp.nome,
      descricao: comp.descricao || null,
      cargo: comp.cargo || null,
      cod_comp: comp.cod_comp || comp.nome.substring(0, 10).toUpperCase(),
      pilar: comp.pilar || null,
    };

    let result;
    if (comp.id) {
      result = await sb.from('competencias')
        .update(registro)
        .eq('id', comp.id)
        .eq('empresa_id', empresaId)
        .select().single();
    } else {
      result = await sb.from('competencias')
        .insert(registro)
        .select().single();
    }

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: result.data, message: comp.id ? 'Atualizada' : 'Criada' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function excluirCompetencia(callerEmail: string, id: string) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('competencias').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Excluida' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function importarCompetenciasCSV(callerEmail: string, empresaId: string, comps: any[]) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  const { data: existentes } = await sb.from('competencias')
    .select('cod_comp, cod_desc, nome_curto, nome, cargo').eq('empresa_id', empresaId);
  // Dedup por cod_comp+cod_desc (ou cod_comp+nome_curto se cod_desc vazio)
  const keyOf = (c: any) => {
    const comp = (c.cod_comp || c.nome || '').trim();
    const desc = (c.cod_desc || c.nome_curto || '').trim();
    return `${comp}||${desc}`.toLowerCase();
  };
  const existSet = new Set((existentes || []).map(keyOf));

  // Dedup interno do lote também (evita linhas repetidas no mesmo arquivo)
  const vistasLote = new Set<string>();
  const novos = comps
    .filter(c => {
      if (!c.nome?.trim()) return false;
      const k = keyOf(c);
      if (existSet.has(k) || vistasLote.has(k)) return false;
      vistasLote.add(k);
      return true;
    })
    .map(c => ({
      empresa_id: empresaId,
      nome: c.nome.trim(),
      cod_comp: c.cod_comp?.trim() || c.nome.trim().substring(0, 10).toUpperCase(),
      pilar: c.pilar?.trim() || null,
      cargo: c.cargo?.trim() || null,
      descricao: c.descricao?.trim() || null,
      cod_desc: c.cod_desc?.trim() || null,
      nome_curto: c.nome_curto?.trim() || null,
      descritor_completo: c.descritor_completo?.trim() || null,
      n1_gap: c.n1_gap?.trim() || null,
      n2_desenvolvimento: c.n2_desenvolvimento?.trim() || null,
      n3_meta: c.n3_meta?.trim() || null,
      n4_referencia: c.n4_referencia?.trim() || null,
      evidencias_esperadas: c.evidencias_esperadas?.trim() || null,
      perguntas_alvo: c.perguntas_alvo?.trim() || null,
    }));

  if (novos.length === 0) return { success: true, message: '0 novas (todas já existiam)' };
  const { error } = await sb.from('competencias').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} competências importadas` };
}

export async function copiarBaseParaEmpresa(callerEmail: string, empresaId: string, baseId: string, cargo: string | null = null) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  try {
    const { data: base, error: errBase } = await sb.from('competencias_base')
      .select('*').eq('id', baseId).single();

    if (errBase) return { success: false, error: errBase.message };

    const { error } = await sb.from('competencias').insert({
      empresa_id: empresaId,
      nome: base.nome,
      descricao: base.descricao,
      pilar: base.pilar || null,
      cod_comp: base.cod_comp || base.nome.substring(0, 10).toUpperCase(),
      cargo: cargo || base.cargo || null,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, message: `"${base.nome}" copiada${cargo ? ` para ${cargo}` : ''}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loadCargosEmpresa(callerEmail: string, empresaId: string) {
  await guardAdmin(callerEmail);
  const sb = createSupabaseAdmin();
  const [colabs, comps] = await Promise.all([
    sb.from('colaboradores').select('cargo').eq('empresa_id', empresaId).not('cargo', 'is', null),
    sb.from('competencias').select('cargo').eq('empresa_id', empresaId).not('cargo', 'is', null),
  ]);
  const todos = [
    ...(colabs.data || []).map((c: any) => c.cargo),
    ...(comps.data || []).map((c: any) => c.cargo),
  ].filter(Boolean);
  return [...new Set(todos)].sort();
}
