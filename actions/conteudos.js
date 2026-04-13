'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';

/**
 * Importa todos os vídeos da library do Bunny pra micro_conteudos.
 * Idempotente: pula vídeos já importados (matched por bunny_video_id).
 * Cria entries com tags vazias — admin completa depois (manual ou via IA).
 */
export async function importarVideosBunny() {
  try {
    const lib = process.env.BUNNY_LIBRARY_ID;
    const key = process.env.BUNNY_STREAM_API_KEY;
    if (!lib || !key) return { error: 'BUNNY_LIBRARY_ID/BUNNY_STREAM_API_KEY ausentes' };

    const res = await fetch(
      `https://video.bunnycdn.com/library/${lib}/videos?page=1&itemsPerPage=200&orderBy=date`,
      { headers: { AccessKey: key, Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return { error: `Bunny API ${res.status}` };
    const data = await res.json();
    const items = (data?.items || []).filter(v => v?.guid);

    const sb = createSupabaseAdmin();
    const { data: existentes } = await sb.from('micro_conteudos')
      .select('bunny_video_id').not('bunny_video_id', 'is', null);
    const jaImportados = new Set((existentes || []).map(e => e.bunny_video_id));

    const novos = items.filter(v => !jaImportados.has(v.guid));
    if (novos.length === 0) {
      return { ok: true, importados: 0, total: items.length, message: 'Nenhum vídeo novo' };
    }

    const linhas = novos.map(v => ({
      titulo: cleanTitle(v.title) || 'Sem título',
      descricao: v.description || null,
      formato: 'video',
      duracao_min: v.length ? Math.round(v.length / 60 * 10) / 10 : null,
      url: `https://iframe.mediadelivery.net/embed/${lib}/${v.guid}`,
      bunny_video_id: v.guid,
      competencia: 'Não classificado',
      descritor: null,
      nivel_min: 1.0,
      nivel_max: 4.0,
      tipo_conteudo: 'core',
      contexto: 'generico',
      cargo: 'todos',
      setor: 'todos',
      origem: 'pre_produzido',
      ativo: true,
    }));

    const { error } = await sb.from('micro_conteudos').insert(linhas);
    if (error) return { error: error.message };

    return { ok: true, importados: novos.length, total: items.length };
  } catch (err) {
    console.error('[importarVideosBunny]', err);
    return { error: err?.message || 'Erro' };
  }
}

function cleanTitle(raw) {
  if (!raw) return null;
  let t = String(raw).replace(/\.(mp4|mov|webm|m4v|mkv)$/i, '').replace(/_/g, ' ').trim();
  if (/^[\d\sx]+(?:hd|fps)?[\d\s]*$/i.test(t)) return null;
  return t;
}

/**
 * Lista micro_conteudos com filtros e paginação.
 */
export async function listarConteudos({ formato, competencia, semClassificacao, limit = 100 } = {}) {
  try {
    const sb = createSupabaseAdmin();
    let q = sb.from('micro_conteudos').select('*').order('created_at', { ascending: false }).limit(limit);
    if (formato) q = q.eq('formato', formato);
    if (competencia) q = q.eq('competencia', competencia);
    if (semClassificacao) q = q.eq('competencia', 'Não classificado');
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { items: data || [] };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Edição manual de tags de um conteúdo.
 */
export async function atualizarConteudo(id, patch) {
  try {
    if (!id) return { error: 'id obrigatório' };
    const sb = createSupabaseAdmin();
    const allowed = ['titulo','descricao','competencia','descritor','nivel_min','nivel_max',
                     'tipo_conteudo','contexto','cargo','setor','apresentador','ativo','duracao_min'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    const { error } = await sb.from('micro_conteudos').update(clean).eq('id', id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

export async function deletarConteudo(id) {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb.from('micro_conteudos').delete().eq('id', id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro' };
  }
}

/**
 * IA sugere tags para um conteúdo baseado em título + descrição.
 * Usa lista de competências do banco como vocabulário controlado.
 */
export async function sugerirTagsIA(conteudoId, aiConfig) {
  try {
    const sb = createSupabaseAdmin();
    const { data: c } = await sb.from('micro_conteudos').select('*').eq('id', conteudoId).maybeSingle();
    if (!c) return { error: 'Conteúdo não encontrado' };

    const { data: comps } = await sb.from('competencias_base')
      .select('nome, nome_curto').limit(500);
    const competenciasUnicas = [...new Set((comps || []).map(c => c.nome).filter(Boolean))];
    const descritoresPorComp = {};
    (comps || []).forEach(co => {
      if (!co.nome) return;
      if (!descritoresPorComp[co.nome]) descritoresPorComp[co.nome] = new Set();
      if (co.nome_curto) descritoresPorComp[co.nome].add(co.nome_curto);
    });

    const system = `Você é um especialista em desenvolvimento de competências. Analise o conteúdo abaixo e sugira tags para classificá-lo no banco de micro-conteúdos. Responda APENAS com JSON válido, sem markdown.`;

    const user = `TÍTULO: ${c.titulo}
DESCRIÇÃO: ${c.descricao || '(sem descrição)'}
FORMATO: ${c.formato}
DURAÇÃO: ${c.duracao_min || '?'} min

COMPETÊNCIAS DISPONÍVEIS (escolha 1):
${competenciasUnicas.slice(0, 50).join(', ')}

Retorne JSON no formato:
{
  "competencia": "<uma das competências acima ou 'Não classificado'>",
  "descritor": "<descritor específico ou null>",
  "nivel_min": 1.0,
  "nivel_max": 4.0,
  "contexto": "educacional|corporativo|generico",
  "cargo": "todos|<cargo específico>",
  "setor": "educacao_publica|saude|agro|todos",
  "tipo_conteudo": "core|complementar",
  "confianca": 0.0-1.0,
  "raciocinio": "<1 frase explicando a escolha>"
}`;

    const resposta = await callAI(system, user, aiConfig || {}, 1000);
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: 'IA não retornou JSON válido' };

    const tags = JSON.parse(jsonMatch[0]);
    return { ok: true, sugestao: tags };
  } catch (err) {
    console.error('[sugerirTagsIA]', err);
    return { error: err?.message || 'Erro' };
  }
}

/**
 * Aplica tags sugeridas a um conteúdo (após admin revisar/aprovar).
 */
export async function aplicarTagsIA(conteudoId, tags) {
  return atualizarConteudo(conteudoId, {
    competencia: tags.competencia,
    descritor: tags.descritor,
    nivel_min: tags.nivel_min,
    nivel_max: tags.nivel_max,
    contexto: tags.contexto,
    cargo: tags.cargo,
    setor: tags.setor,
    tipo_conteudo: tags.tipo_conteudo,
  });
}
