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

export async function loadCobertura(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('cobertura_conteudo')
    .select('*').eq('empresa_id', empresaId).order('cargo').order('competencia');
  return data || [];
}
