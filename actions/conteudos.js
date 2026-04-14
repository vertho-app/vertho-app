'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { promptVideoScript } from '@/lib/season-engine/prompts/video-script';
import { promptPodcastScript } from '@/lib/season-engine/prompts/podcast-script';
import { promptTextContent } from '@/lib/season-engine/prompts/text-content';
import { promptCaseStudy } from '@/lib/season-engine/prompts/case-study';

/**
 * Gera conteúdo (roteiro ou texto) via IA e salva em micro_conteudos.
 *
 * @param {Object} params
 * @param {string} params.formato - video | audio | texto | case
 * @param {string} params.competencia
 * @param {string} params.descritor
 * @param {number} params.nivelMin
 * @param {number} params.nivelMax
 * @param {string} params.cargo
 * @param {string} params.contexto - educacional | corporativo | generico
 * @param {string} [params.empresaId] - se NULL, conteúdo global
 * @param {Object} [params.aiConfig]
 */
export async function gerarConteudoIA({
  formato, competencia, descritor, nivelMin = 1.0, nivelMax = 2.0,
  cargo = 'todos', contexto = 'generico', duracaoSegundos = null,
  empresaId = null, aiConfig = {},
}) {
  try {
    if (!formato || !competencia || !descritor) {
      return { success: false, error: 'formato, competencia e descritor obrigatórios' };
    }

    const args = { competencia, descritor, nivelMin, nivelMax, cargo, contexto, duracaoSegundos };
    const builders = {
      video: promptVideoScript,
      audio: promptPodcastScript,
      texto: promptTextContent,
      case: promptCaseStudy,
    };
    const build = builders[formato];
    if (!build) return { success: false, error: `formato ${formato} não suportado` };

    const { system, user } = build(args);
    const conteudoGerado = (await callAI(system, user, aiConfig, 4096)).trim();

    const titulo = extrairTitulo(conteudoGerado, descritor, formato);
    const duracaoEstimada = duracaoSegundos
      ? Math.round(duracaoSegundos / 60 * 10) / 10
      : (formato === 'video' || formato === 'audio'
         ? Math.min(5, Math.max(3, Math.round(conteudoGerado.split(/\s+/).length / 150)))
         : null);

    const sb = createSupabaseAdmin();

    // Para texto/case: renderiza PDF + uploa pro Storage e linka no url
    let pdfUrl = null, pdfPath = null;
    if (formato === 'texto' || formato === 'case') {
      try {
        const { renderMarkdownPDF } = await import('@/lib/markdown-to-pdf');
        const buffer = await renderMarkdownPDF({
          titulo,
          conteudoMd: conteudoGerado,
          meta: `${competencia} › ${descritor} · gerado por IA`,
        });
        const path = `texto/${competencia.replace(/[^a-zA-Z0-9]/g, '_')}/${Date.now()}.pdf`;
        const { error: upErr } = await sb.storage.from('conteudos').upload(path, Buffer.from(buffer), {
          contentType: 'application/pdf', upsert: false,
        });
        if (!upErr) {
          const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
          pdfUrl = publicUrl;
          pdfPath = path;
        }
      } catch (e) {
        console.warn('[gerarConteudoIA] PDF render falhou:', e.message);
      }
    }

    const { data: novo, error } = await sb.from('micro_conteudos').insert({
      empresa_id: empresaId,
      titulo,
      descricao: `Gerado por IA · ${competencia} › ${descritor}`,
      formato,
      duracao_min: duracaoEstimada,
      url: pdfUrl, // texto/case ganham URL pro PDF
      storage_path: pdfPath,
      conteudo_inline: conteudoGerado,
      competencia,
      descritor,
      nivel_min: nivelMin,
      nivel_max: nivelMax,
      tipo_conteudo: 'core',
      contexto,
      cargo,
      origem: 'ia_gerado',
      versao: 1,
      ativo: formato === 'texto' || formato === 'case',
    }).select('id, titulo').maybeSingle();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      message: `${formato} gerado: "${novo.titulo}"${pdfUrl ? ' (PDF criado)' : ''}`,
      conteudoId: novo.id,
      titulo: novo.titulo,
      roteiro: conteudoGerado,
      pdfUrl,
      precisaGravar: formato === 'video' || formato === 'audio',
    };
  } catch (err) {
    console.error('[gerarConteudoIA]', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}

/**
 * Upload manual de conteúdo (áudio/pdf via Storage; texto/case inline no banco).
 * FormData fields: file (audio/pdf), formato, titulo, competencia, descritor,
 *   nivel_min, nivel_max, contexto, cargo, setor, empresa_id, conteudo_inline (texto/case).
 */
export async function uploadConteudo(formData) {
  try {
    const sb = createSupabaseAdmin();
    const formato = formData.get('formato');
    const titulo = formData.get('titulo');
    const competencia = formData.get('competencia');
    const descritor = formData.get('descritor') || null;
    if (!formato || !titulo || !competencia) return { success: false, error: 'formato, titulo e competencia obrigatórios' };

    let url = null, storage_path = null, conteudo_inline = null, duracao_min = null;

    if (formato === 'texto' || formato === 'case') {
      conteudo_inline = formData.get('conteudo_inline') || '';
      if (!conteudo_inline.trim()) return { success: false, error: 'Conteúdo obrigatório' };
    } else {
      const file = formData.get('file');
      if (!file || typeof file === 'string') return { success: false, error: 'Arquivo obrigatório' };
      const ext = (file.name || '').split('.').pop() || 'bin';
      const path = `${formato}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await sb.storage.from('conteudos').upload(path, buffer, {
        contentType: file.type || undefined, upsert: false,
      });
      if (upErr) return { success: false, error: `Upload falhou: ${upErr.message}` };
      const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
      url = publicUrl;
      storage_path = path;
    }

    const { data, error } = await sb.from('micro_conteudos').insert({
      empresa_id: formData.get('empresa_id') || null,
      titulo, descricao: formData.get('descricao') || null,
      formato, duracao_min, url, storage_path, conteudo_inline,
      competencia, descritor,
      nivel_min: parseFloat(formData.get('nivel_min') || '1.0'),
      nivel_max: parseFloat(formData.get('nivel_max') || '2.0'),
      tipo_conteudo: formData.get('tipo_conteudo') || 'core',
      contexto: formData.get('contexto') || 'generico',
      cargo: formData.get('cargo') || 'todos',
      setor: formData.get('setor') || 'todos',
      origem: 'pre_produzido', ativo: true,
    }).select('id, titulo').maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, conteudoId: data.id, message: `"${data.titulo}" adicionado` };
  } catch (err) {
    console.error('[VERTHO] uploadConteudo:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Geração em lote: cria conteúdos para múltiplos descritores de uma competência.
 *
 * @param {Object} params
 * @param {string} formato - video|audio|texto|case
 * @param {string} competencia
 * @param {string|null} descritor - se null, gera pra todos os descritores da competência
 * @param {number} nivelMin
 * @param {number} nivelMax
 * @param {string} cargo
 * @param {string} contexto
 * @param {number|null} duracaoSegundos - só pra video/audio
 * @param {string|null} empresaId - se null, conteúdo global
 * @param {Object} aiConfig
 */
export async function gerarConteudoLote({
  formato, competencia, descritor = null, nivelMin = 1.0, nivelMax = 2.0,
  cargo = 'todos', contexto = 'generico', duracaoSegundos = null,
  empresaId = null, aiConfig = {},
}) {
  try {
    if (!formato || !competencia) {
      return { success: false, error: 'formato e competencia obrigatórios' };
    }

    // Resolve lista de descritores
    let descritores = [];
    if (descritor) {
      descritores = [descritor];
    } else {
      const sb = createSupabaseAdmin();
      // Tenta competencias da empresa, fallback competencias_base
      const { data: emp } = await sb.from('competencias')
        .select('nome_curto').eq('nome', competencia).not('nome_curto', 'is', null);
      let lista = [...new Set((emp || []).map(c => c.nome_curto))];
      if (lista.length === 0) {
        const { data: base } = await sb.from('competencias_base')
          .select('nome_curto').eq('nome', competencia).not('nome_curto', 'is', null);
        lista = [...new Set((base || []).map(c => c.nome_curto))];
      }
      descritores = lista;
    }

    if (descritores.length === 0) {
      return { success: false, error: `Sem descritores cadastrados para "${competencia}"` };
    }

    let ok = 0, erros = 0;
    const resultados = [];
    for (const desc of descritores) {
      const r = await gerarConteudoIA({
        formato, competencia, descritor: desc, nivelMin, nivelMax,
        cargo, contexto, duracaoSegundos, empresaId, aiConfig,
      });
      if (r.success) {
        ok++;
        resultados.push({ descritor: desc, conteudoId: r.conteudoId, titulo: r.titulo });
      } else {
        erros++;
        resultados.push({ descritor: desc, error: r.error });
      }
    }

    return {
      success: true,
      message: `${ok} gerado${ok !== 1 ? 's' : ''}${erros ? ` · ${erros} erros` : ''} (${formato} para "${competencia}")`,
      ok, erros, resultados,
    };
  } catch (err) {
    console.error('[VERTHO] gerarConteudoLote:', err);
    return { success: false, error: err?.message };
  }
}

/**
 * Lista competências disponíveis (com descritores cadastrados) e cargos distintos
 * — usado para popular dropdowns no modal de geração.
 */
export async function loadOpcoesGerar() {
  try {
    const sb = createSupabaseAdmin();
    const { data: comps } = await sb.from('competencias')
      .select('nome, nome_curto, cargo')
      .not('nome_curto', 'is', null);
    const { data: baseComps } = await sb.from('competencias_base')
      .select('nome, nome_curto')
      .not('nome_curto', 'is', null);

    // Agrupa: competencia -> Set(descritores)
    const mapa = {};
    [...(comps || []), ...(baseComps || [])].forEach(c => {
      if (!c.nome) return;
      if (!mapa[c.nome]) mapa[c.nome] = new Set();
      if (c.nome_curto) mapa[c.nome].add(c.nome_curto);
    });

    const competencias = Object.keys(mapa).sort().map(nome => ({
      nome,
      descritores: [...mapa[nome]].sort(),
    }));

    const cargos = [...new Set((comps || []).map(c => c.cargo).filter(Boolean))].sort();

    return { competencias, cargos };
  } catch (err) {
    return { competencias: [], cargos: [], error: err?.message };
  }
}

function extrairTitulo(texto, fallback, formato) {
  // Texto/case: primeira linha # Título
  const match = texto.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim().substring(0, 200);
  // Vídeo/podcast: primeira frase significativa (até 80 chars)
  const primeiraLinha = texto.split('\n').find(l => l.trim().length > 10);
  if (primeiraLinha) {
    const frase = primeiraLinha.trim().split(/[.!?]/)[0].substring(0, 80);
    return frase.length > 10 ? `${formato === 'video' ? '🎥' : '🎧'} ${frase}` : fallback;
  }
  return fallback;
}

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
