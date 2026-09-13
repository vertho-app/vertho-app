'use server';

import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { requirePermissionAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCompetencias(empresaId: string) {
  const sb = await requireAdminSupabase();
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

export async function loadCompetenciasBase(segmento: string | null) {
  const sb = await requireAdminSupabase();
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

export async function salvarCompetencia(empresaId: string, comp: any) {
  // Gate TENANT-SCOPED (auditoria 23/07): empresaId vem do client.
  const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'salvarCompetencia');
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

export async function excluirCompetencia(id: string) {
  // Gate TENANT-SCOPED (auditoria 23/07): o payload não traz empresaId — o
  // tenant é derivado da LINHA (lê, prova posse, apaga).
  const ctx = await requirePermissionAction('content.manage');
  const sb = createSupabaseAdmin();
  try {
    // Predicado de tenant explícito: mutação restrita ao tenant da linha lida
    const { data: compLinha } = await sb.from('competencias').select('empresa_id').eq('id', id).maybeSingle();
    if (!compLinha) return { success: false, error: 'Competência não encontrada' };
    await assertTenantAccessAction(ctx, compLinha.empresa_id);
    const { error } = await sb.from('competencias').delete().eq('id', id).eq('empresa_id', compLinha.empresa_id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Excluida' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function importarCompetenciasCSV(empresaId: string, comps: any[]) {
  // Gate TENANT-SCOPED (auditoria 23/07): empresaId vem do client.
  const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'importarCompetenciasCSV');
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

/** Colunas de DESCRITOR que a edição pode tocar — a rubrica N1–N4 e o que a cerca. Nada mais.
 *  (Não exportada: num arquivo 'use server' só funções async podem sair.) */
const COLUNAS_DESCRITOR = [
  'cod_desc', 'nome_curto', 'descritor_completo',
  'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia',
  'evidencias_esperadas', 'perguntas_alvo',
] as const;

/**
 * Edita a rubrica de UM descritor. Existe porque o importador só INSERE
 * (linha já existente é ignorada em silêncio) e `salvarCompetencia` não toca
 * n1..n4 — então corrigir um descritor depois da calibragem exigia apagar e
 * recarregar, ou ir ao banco. A calibragem com líderes de referência fecha o
 * laço aqui: exemplar abaixo do corte → reescreve N3/N4 → reavalia.
 *
 * Gate TENANT-SCOPED (`content.manage` na empresa da rota) e predicado de
 * tenant na MESMA cadeia do update: o `id` vem do browser.
 */
export async function salvarDescritor(empresaId: string, id: string, campos: Record<string, unknown>) {
  const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'salvarDescritor');
  try {
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return { success: false, error: 'Descritor inválido' };
    }
    const registro: Record<string, string | null> = {};
    for (const col of COLUNAS_DESCRITOR) {
      if (col in (campos || {})) {
        const v = String((campos as any)[col] ?? '').trim();
        registro[col] = v || null;
      }
    }
    if (!Object.keys(registro).length) return { success: false, error: 'Nada para salvar' };
    if (registro.n3_meta === null && 'n3_meta' in registro) {
      // N3 é a META do modelo e o corte da decisão; o importador aceita vazio, a edição avisa.
      return { success: false, error: 'N3 (meta) não pode ficar vazio: é o nível que decide.' };
    }
    const { data, error } = await sb.from('competencias')
      .update(registro)
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .select('id');
    if (error) return { success: false, error: error.message };
    if (!data?.length) return { success: false, error: 'Descritor não encontrado nesta empresa' };
    return { success: true, message: 'Descritor salvo' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function copiarBaseParaEmpresa(empresaId: string, baseId: string, cargo: string | null = null) {
  // Gate TENANT-SCOPED (auditoria 23/07): empresaId vem do client.
  const sb = await requireEmpresaSupabase(empresaId, 'content.manage', 'copiarBaseParaEmpresa');
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

export async function loadCargosEmpresa(empresaId: string) {
  const sb = await requireAdminSupabase();
  // Fonte única: cargos_empresa.nome (cargos formais cadastrados na empresa).
  // Strings legadas em colaboradores.cargo e competencias.cargo são ignoradas
  // — quem ainda usa esses campos como string livre é considerado dado a migrar.
  const { data } = await sb
    .from('cargos_empresa')
    .select('nome')
    .eq('empresa_id', empresaId)
    .order('nome');
  return (data || []).map((c: any) => c.nome).filter(Boolean);
}
