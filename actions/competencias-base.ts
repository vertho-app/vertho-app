'use server';

import { requireAdminSupabase, requirePlataformaSupabase } from '@/lib/admin-supabase';

/**
 * ⚠️ `competencias_base` é o CATÁLOGO GLOBAL — as linhas não têm `empresa_id` e
 * servem TODOS os tenants. Gatar escrita aqui por `content.manage` (permissão do
 * papel `rh`) deixava o RH de qualquer cliente alterar/apagar competência que
 * todo mundo usa. Decisão de produto de 24/08: escrita no catálogo global é
 * `requirePlataformaSupabase` — platform_admin, mais a permissão granular.
 * Leitura segue em `admin.access`, que o papel `rh` não tem.
 */

// ── Load competências base (globais, por segmento) ──────────────────────────

export async function loadCompetenciasBase(segmento: string | null) {
  const sb = await requireAdminSupabase();
  try {
    let query = sb.from('competencias_base').select('*').order('nome');
    if (segmento) {
      query = query.eq('segmento', segmento);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Salvar competência base ─────────────────────────────────────────────────

export async function salvarCompetenciaBase(comp: any) {
  const sb = await requirePlataformaSupabase('content.manage');
  try {
    const registro = {
      nome: comp.nome,
      descricao: comp.descricao,
      segmento: comp.segmento || null,
      categoria: comp.categoria || null,
      peso_padrao: comp.peso_padrao || 3,
    };

    let result;
    if (comp.id) {
      result = await sb.from('competencias_base')
        .update(registro)
        .eq('id', comp.id)
        .select()
        .single();
    } else {
      result = await sb.from('competencias_base')
        .insert(registro)
        .select()
        .single();
    }

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: result.data, message: comp.id ? 'Competência base atualizada' : 'Competência base criada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Excluir competência base ────────────────────────────────────────────────

export async function excluirCompetenciaBase(id: string) {
  const sb = await requirePlataformaSupabase('content.manage');
  try {
    const { error } = await sb.from('competencias_base').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Competência base excluída' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
