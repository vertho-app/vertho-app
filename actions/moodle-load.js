'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadMoodleCatalogo(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('moodle_catalogo')
    .select('*').eq('empresa_id', empresaId).order('curso_nome');
  return data || [];
}

export async function loadCatalogoEnriquecido(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('catalogo_enriquecido')
    .select('*').eq('empresa_id', empresaId).order('cargo').order('competencia');

  // Buscar nomes dos cursos
  const { data: cursos } = await sb.from('moodle_catalogo')
    .select('course_id, curso_nome, curso_url').eq('empresa_id', empresaId);
  const cursoMap = {};
  (cursos || []).forEach(c => { cursoMap[c.course_id] = c; });

  return (data || []).map(d => ({
    ...d,
    curso_nome: cursoMap[d.course_id]?.curso_nome || `Curso ${d.course_id}`,
    curso_url: cursoMap[d.course_id]?.curso_url || '',
  }));
}

export async function salvarCatalogoItem(id, campos) {
  const sb = createSupabaseAdmin();
  const update = {};
  if (campos.competencia !== undefined) update.competencia = campos.competencia || null;
  if (campos.nivel_ideal !== undefined) update.nivel_ideal = campos.nivel_ideal || null;
  if (campos.descritor_1 !== undefined) update.descritor_1 = campos.descritor_1 || null;
  if (campos.descritor_2 !== undefined) update.descritor_2 = campos.descritor_2 || null;
  if (campos.descritor_3 !== undefined) update.descritor_3 = campos.descritor_3 || null;
  const { error } = await sb.from('catalogo_enriquecido').update(update).eq('id', id).select('id');
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function loadCobertura(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('cobertura_conteudo')
    .select('*').eq('empresa_id', empresaId).order('cargo').order('competencia');
  return data || [];
}
