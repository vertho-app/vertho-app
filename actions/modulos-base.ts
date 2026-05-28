'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { callAI } from '@/actions/ai-client';
import { getModelForTask } from '@/lib/ai-tasks';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Nivel = 'N1' | 'N2' | 'N3' | 'N4';
type Status = 'rascunho' | 'revisao' | 'publicado' | 'obsoleto';
type Locale = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';

const COLS = `
  id, grupo_id, locale, competencia_base_id, nivel_entrada, nivel_destino,
  titulo, finalidade, contexto_pedagogico, tags, preferido, status, versao,
  substitui_modulo_id, conteudo_central, conteudo_aplicavel, guarda_corpos,
  adaptacao_por_formato, created_by, created_at, updated_at,
  reviewed_by, reviewed_at, published_by, published_at
`;

const NIVEIS: Nivel[] = ['N1', 'N2', 'N3', 'N4'];

function nivelGreater(a: Nivel, b: Nivel) {
  return NIVEIS.indexOf(a) > NIVEIS.indexOf(b);
}

// ── Resolver competência canônica (para IA-as-autor / import) ─────────────────
async function carregarCompetenciaBase(id: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('competencias_base')
    .select('id, segmento, cod_comp, nome, pilar, descricao, cod_desc, descritor_completo, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia, cargo, evidencias_esperadas, perguntas_alvo')
    .eq('id', id)
    .maybeSingle();
  return data;
}

// ── Parsing tolerante do JSON do corpo ────────────────────────────────────────
function extractCorpo(raw: string | null | undefined): any | null {
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  if (!text) return null;
  const candidatos = [text];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) candidatos.push(obj[0]);
  for (const c of candidatos) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object'
        && parsed.conteudo_central && parsed.conteudo_aplicavel
        && parsed.guarda_corpos && parsed.adaptacao_por_formato) {
        return parsed;
      }
    } catch { /* tenta próximo */ }
  }
  return null;
}

// ── Validação mínima do corpo (não substitui revisão humana) ──────────────────
function validarCorpo(corpo: any): string[] {
  const erros: string[] = [];
  if (!corpo?.conteudo_central?.ideia_principal) erros.push('conteudo_central.ideia_principal ausente');
  if (!corpo?.conteudo_central?.explicacao_expandida) erros.push('conteudo_central.explicacao_expandida ausente');
  if (!Array.isArray(corpo?.conteudo_central?.principios) || corpo.conteudo_central.principios.length < 3) {
    erros.push('conteudo_central.principios precisa de pelo menos 3 itens');
  }
  if (!corpo?.conteudo_central?.sintese_executiva) erros.push('conteudo_central.sintese_executiva ausente');
  if (!Array.isArray(corpo?.conteudo_aplicavel?.situacoes_tipicas) || corpo.conteudo_aplicavel.situacoes_tipicas.length < 3) {
    erros.push('conteudo_aplicavel.situacoes_tipicas precisa de pelo menos 3 itens');
  }
  if (!corpo?.guarda_corpos?.preservar || !corpo?.guarda_corpos?.evitar) {
    erros.push('guarda_corpos.preservar e .evitar são obrigatórios');
  }
  return erros;
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD / listagem
// ════════════════════════════════════════════════════════════════════════════

export async function listarModulos(filtros: {
  status?: Status; locale?: Locale; competencia_base_id?: string;
  contexto_pedagogico?: string; busca?: string;
} = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('modulos_base_conteudo').select(COLS).order('updated_at', { ascending: false });
  if (filtros.status) q = q.eq('status', filtros.status);
  if (filtros.locale) q = q.eq('locale', filtros.locale);
  if (filtros.competencia_base_id) q = q.eq('competencia_base_id', filtros.competencia_base_id);
  if (filtros.contexto_pedagogico) q = q.eq('contexto_pedagogico', filtros.contexto_pedagogico);
  if (filtros.busca) q = q.ilike('titulo', `%${filtros.busca}%`);
  const { data, error } = await q.limit(200);
  if (error) return { error: error.message };
  return { modulos: data || [] };
}

export async function obterModulo(id: string) {
  await requireAdminAction();
  if (!id) return { error: 'id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Módulo não encontrado' };
  return { modulo: data };
}

export async function obterGrupo(grupo_id: string) {
  await requireAdminAction();
  if (!grupo_id) return { error: 'grupo_id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('modulos_base_conteudo')
    .select('id, locale, status, versao, updated_at, published_at')
    .eq('grupo_id', grupo_id)
    .order('locale');
  if (error) return { error: error.message };
  return { variantes: data || [] };
}

export async function listarCompetenciasBase() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('competencias_base')
    .select('id, segmento, cod_comp, nome, pilar, descritor_completo')
    .order('segmento').order('pilar').order('nome');
  if (error) return { error: error.message };
  return { competencias: data || [] };
}

// ════════════════════════════════════════════════════════════════════════════
// Salvar (INSERT ou UPDATE)
// ════════════════════════════════════════════════════════════════════════════

export async function salvarModulo(payload: any) {
  const ctx = await requireAdminAction();
  if (!payload?.competencia_base_id) return { error: 'competencia_base_id obrigatório' };
  if (!payload?.nivel_entrada || !payload?.nivel_destino) return { error: 'níveis obrigatórios' };
  if (!nivelGreater(payload.nivel_destino, payload.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }
  if (!payload?.titulo || !payload?.finalidade) return { error: 'titulo e finalidade obrigatórios' };

  const sb = createSupabaseAdmin();
  const base = {
    competencia_base_id: payload.competencia_base_id,
    locale: payload.locale || 'pt-BR',
    nivel_entrada: payload.nivel_entrada,
    nivel_destino: payload.nivel_destino,
    titulo: payload.titulo,
    finalidade: payload.finalidade,
    contexto_pedagogico: payload.contexto_pedagogico || null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    conteudo_central: payload.conteudo_central || {},
    conteudo_aplicavel: payload.conteudo_aplicavel || {},
    guarda_corpos: payload.guarda_corpos || {},
    adaptacao_por_formato: payload.adaptacao_por_formato || {},
  };

  if (payload.id) {
    // UPDATE — só pode editar quando status = rascunho ou revisão.
    const { data: atual } = await sb.from('modulos_base_conteudo').select('status').eq('id', payload.id).maybeSingle();
    if (!atual) return { error: 'Módulo não encontrado' };
    if (atual.status !== 'rascunho' && atual.status !== 'revisao') {
      return { error: `Não é possível editar um módulo ${atual.status}` };
    }
    const { error } = await sb.from('modulos_base_conteudo').update(base).eq('id', payload.id);
    if (error) return { error: error.message };
    return { id: payload.id };
  }

  // INSERT
  const insertRow: any = {
    ...base,
    grupo_id: payload.grupo_id || undefined, // default gen_random_uuid() do banco
    created_by: ctx.email,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// ════════════════════════════════════════════════════════════════════════════
// Workflow de status
// ════════════════════════════════════════════════════════════════════════════

export async function submeterRevisao(id: string) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo').select('status, conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'rascunho') return { error: `Status atual é ${data.status} — só é possível submeter rascunho` };

  const erros = validarCorpo(data);
  if (erros.length) return { error: 'Validação falhou', detalhes: erros };

  const { error } = await sb.from('modulos_base_conteudo').update({ status: 'revisao' }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function aprovarPublicar(id: string) {
  const ctx = await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo').select('status, created_by').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'revisao') return { error: `Status atual é ${data.status} — só é possível publicar em revisão` };

  // BLOQUEIO: criador ≠ aprovador (revisão cruzada forçada).
  if (data.created_by === ctx.email) {
    return { error: 'Quem criou o módulo não pode aprová-lo. Outro admin Vertho precisa revisar.' };
  }

  const { error } = await sb.from('modulos_base_conteudo')
    .update({ status: 'publicado', published_by: ctx.email, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function marcarObsoleto(id: string, substitui_por?: string) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const update: any = { status: 'obsoleto' };
  if (substitui_por) update.substitui_modulo_id = substitui_por;
  const { error } = await sb.from('modulos_base_conteudo').update(update).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setPreferido(id: string, preferido: boolean) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  // Se setando true, primeiro zera os demais do mesmo grupo (índice partial garante consistência)
  if (preferido) {
    const { data: m } = await sb.from('modulos_base_conteudo').select('grupo_id').eq('id', id).maybeSingle();
    if (m?.grupo_id) {
      await sb.from('modulos_base_conteudo').update({ preferido: false }).eq('grupo_id', m.grupo_id);
    }
  }
  const { error } = await sb.from('modulos_base_conteudo').update({ preferido }).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// i18n — criar tradução
// ════════════════════════════════════════════════════════════════════════════

export async function criarTraducao(modulo_origem_id: string, novo_locale: Locale) {
  const ctx = await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data: origem } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', modulo_origem_id).maybeSingle();
  if (!origem) return { error: 'Módulo de origem não encontrado' };

  // Não pode haver duas variantes do mesmo grupo+locale.
  const { count } = await sb.from('modulos_base_conteudo')
    .select('id', { count: 'exact', head: true })
    .eq('grupo_id', origem.grupo_id)
    .eq('locale', novo_locale);
  if ((count || 0) > 0) return { error: `Já existe uma variante ${novo_locale} neste grupo` };

  const insertRow = {
    grupo_id: origem.grupo_id,
    locale: novo_locale,
    competencia_base_id: origem.competencia_base_id,
    nivel_entrada: origem.nivel_entrada,
    nivel_destino: origem.nivel_destino,
    titulo: origem.titulo,
    finalidade: origem.finalidade,
    contexto_pedagogico: origem.contexto_pedagogico,
    tags: origem.tags,
    conteudo_central: origem.conteudo_central,    // copia conteúdo da origem como ponto de partida
    conteudo_aplicavel: origem.conteudo_aplicavel,
    guarda_corpos: origem.guarda_corpos,
    adaptacao_por_formato: origem.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id').single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// ════════════════════════════════════════════════════════════════════════════
// IA-as-autor — rascunhar do zero
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_AUTOR = `Você é um designer instrucional sênior da Vertho. Sua tarefa é preencher um Módulo-Base de Conteúdo seguindo o template oficial.

REGRAS INTRANSPONÍVEIS:
- O módulo é matéria-prima pedagógica para a IA gerar conteúdos depois (texto, podcast, vídeo). NÃO é roteiro final, NÃO é régua de maturidade, NÃO é aula pro colaborador.
- Não use nomes próprios reais. Não invente leis, normas ou estatísticas. Não faça diagnóstico psicológico. Não trate DISC como determinismo.
- Exemplos devem ser UNIVERSAIS (sem cargo específico, salvo se for explicitamente um módulo de contexto específico).
- Linguagem clara, aplicada, profissional. Sem jargão excessivo.

FORMATO DE SAÍDA: APENAS JSON válido com a estrutura especificada. Sem markdown, sem comentários, sem texto antes ou depois.`;

function montarUserPrompt(comp: any, nivel_entrada: Nivel, nivel_destino: Nivel, contexto?: string, referencia?: any, docxTexto?: string) {
  const nivelTextos: Record<string, string> = {
    N1: comp.n1_gap || '',
    N2: comp.n2_desenvolvimento || '',
    N3: comp.n3_meta || '',
    N4: comp.n4_referencia || '',
  };

  const blocoReferencia = referencia
    ? `\n\n## MÓDULO DE REFERÊNCIA (use como base — adapte para o novo locale):\n${JSON.stringify({
        conteudo_central: referencia.conteudo_central,
        conteudo_aplicavel: referencia.conteudo_aplicavel,
        guarda_corpos: referencia.guarda_corpos,
        adaptacao_por_formato: referencia.adaptacao_por_formato,
      }, null, 2)}`
    : '';

  const blocoDocx = docxTexto
    ? `\n\n## TEXTO EXTRAÍDO DO DOCX (estruture-o no JSON do módulo — adapte o que estiver fora do padrão):\n${docxTexto.slice(0, 12000)}`
    : '';

  return `## COMPETÊNCIA CANÔNICA
- Nome: ${comp.nome}
- Pilar: ${comp.pilar || '—'}
- Segmento: ${comp.segmento}
- Descritor: ${comp.descritor_completo || comp.descricao || '—'}

## TRANSIÇÃO DE NÍVEL DESTE MÓDULO
- Entrada (${nivel_entrada}): ${nivelTextos[nivel_entrada]}
- Destino (${nivel_destino}): ${nivelTextos[nivel_destino]}

## CONTEXTO PEDAGÓGICO
${contexto || 'transversal — não específico de um contexto'}

## EVIDÊNCIAS ESPERADAS (referência)
${comp.evidencias_esperadas || '—'}
${blocoReferencia}
${blocoDocx}

## ESTRUTURA EXIGIDA DA SAÍDA (JSON):
{
  "conteudo_central": {
    "ideia_principal": "string markdown 3-5 linhas (300-500 chars)",
    "explicacao_expandida": "string markdown 400-1200 palavras",
    "principios": [
      { "nome": "≤60 chars", "explicacao": "1-2 frases", "implicacao_pratica": "1 frase aplicada" }
    ],
    "sintese_executiva": "string markdown 5-8 linhas"
  },
  "conteudo_aplicavel": {
    "situacoes_tipicas": [
      { "contexto": "...", "desafio": "...", "risco_comum": "...", "boa_abordagem": "..." }
    ],
    "exemplos_universais": {
      "simples": "...", "intermediario": "...", "complexo": "...",
      "aplicacao_inadequada": "...", "aplicacao_adequada": "..."
    },
    "erros_comuns": [
      { "erro": "...", "por_que_acontece": "...", "impacto": "...", "como_corrigir": "..." }
    ],
    "repertorio_linguagem": {
      "frases_uteis": ["..."], "perguntas_poderosas": ["..."],
      "abertura": ["..."], "conducao_situacao_dificil": ["..."],
      "fechamento_com_compromisso": ["..."], "frases_a_evitar": ["..."]
    },
    "boas_praticas": [
      { "o_que_fazer": "...", "por_que": "...", "como_aplicar": "...", "evidencia_boa_aplicacao": "..." }
    ]
  },
  "guarda_corpos": {
    "preservar": ["..."], "evitar": ["..."],
    "pode_adaptar_livremente": ["cargo","contexto institucional","formato","tom","exemplos concretos"],
    "nao_pode_adaptar": ["conceito central","profundidade pedagógica","princípios","limites éticos"],
    "cuidados_eticos": ["..."], "cuidados_linguagem": ["..."]
  },
  "adaptacao_por_formato": {
    "texto": "orientação específica para texto de apoio",
    "podcast_roteiro": "orientação específica para roteiro de podcast",
    "video_roteiro": "orientação específica para roteiro de vídeo"
  }
}

Mínimo: 5 princípios, 4 situações típicas, 4 erros comuns, 4 boas práticas. Responda APENAS com o JSON.`;
}

async function chamarIAComRetry(systemPrompt: string, userPrompt: string, model: string) {
  let corpo: any = null;
  for (let tentativa = 1; tentativa <= 2 && !corpo; tentativa++) {
    try {
      const raw = await callAI(systemPrompt, userPrompt, { model }, 6000);
      corpo = extractCorpo(raw);
      if (!corpo) console.warn(`[modulo_base_autor] tentativa ${tentativa}: JSON inválido`);
    } catch (e: any) {
      console.warn(`[modulo_base_autor] tentativa ${tentativa} falhou:`, e?.message);
    }
  }
  return corpo;
}

export async function rascunharModuloBase(opts: {
  competencia_base_id: string;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  locale: Locale;
  contexto_pedagogico?: string;
  modulo_referencia_id?: string;
}) {
  const ctx = await requireAdminAction();
  if (!opts.competencia_base_id) return { error: 'competencia_base_id obrigatório' };
  if (!nivelGreater(opts.nivel_destino, opts.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }

  const comp = await carregarCompetenciaBase(opts.competencia_base_id);
  if (!comp) return { error: 'Competência base não encontrada' };

  let referencia: any = null;
  if (opts.modulo_referencia_id) {
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', opts.modulo_referencia_id).maybeSingle();
    referencia = data;
  }

  const userPrompt = montarUserPrompt(comp, opts.nivel_entrada, opts.nivel_destino, opts.contexto_pedagogico, referencia);
  const model = await getModelForTask(null as any, 'modulo_base_autor');

  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA não conseguiu gerar um módulo válido. Tente novamente.' };

  const erros = validarCorpo(corpo);
  if (erros.length) {
    console.warn('[rascunharModuloBase] validação parcial:', erros);
    // Persiste mesmo com avisos — o autor revisa.
  }

  const sb = createSupabaseAdmin();
  const insertRow = {
    grupo_id: referencia?.grupo_id || undefined,
    locale: opts.locale,
    competencia_base_id: opts.competencia_base_id,
    nivel_entrada: opts.nivel_entrada,
    nivel_destino: opts.nivel_destino,
    titulo: corpo?.titulo || `[Rascunho IA] ${comp.nome} ${opts.nivel_entrada}→${opts.nivel_destino}`.slice(0, 120),
    finalidade: (corpo?.finalidade || `Matéria-prima pedagógica para apoiar a transição ${opts.nivel_entrada}→${opts.nivel_destino} em "${comp.nome}".`).slice(0, 400),
    contexto_pedagogico: opts.contexto_pedagogico || null,
    tags: [],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, avisos: erros };
}

// ════════════════════════════════════════════════════════════════════════════
// Import de .docx → IA estrutura
// ════════════════════════════════════════════════════════════════════════════

export async function importarModuloDocx(opts: {
  arquivoBase64: string;
  competencia_base_id: string;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  locale: Locale;
  contexto_pedagogico?: string;
}) {
  const ctx = await requireAdminAction();
  if (!opts.arquivoBase64) return { error: 'arquivoBase64 obrigatório' };
  if (!opts.competencia_base_id) return { error: 'competencia_base_id obrigatório' };
  if (!nivelGreater(opts.nivel_destino, opts.nivel_entrada)) {
    return { error: 'nivel_destino deve ser maior que nivel_entrada' };
  }

  // Extrai texto via mammoth (dynamic import — lib pesada)
  let texto: string;
  try {
    const mammoth: any = await import('mammoth');
    const buffer = Buffer.from(opts.arquivoBase64, 'base64');
    const out = await mammoth.extractRawText({ buffer });
    texto = String(out?.value || '').trim();
    if (!texto) return { error: 'Não foi possível extrair texto do .docx' };
  } catch (e: any) {
    console.error('[importarModuloDocx] mammoth:', e?.message);
    return { error: 'Falha ao processar o .docx' };
  }

  const comp = await carregarCompetenciaBase(opts.competencia_base_id);
  if (!comp) return { error: 'Competência base não encontrada' };

  const userPrompt = montarUserPrompt(comp, opts.nivel_entrada, opts.nivel_destino, opts.contexto_pedagogico, null, texto);
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA não conseguiu estruturar o conteúdo do .docx. Verifique o arquivo ou edite manualmente.' };

  const erros = validarCorpo(corpo);

  const sb = createSupabaseAdmin();
  const insertRow = {
    locale: opts.locale,
    competencia_base_id: opts.competencia_base_id,
    nivel_entrada: opts.nivel_entrada,
    nivel_destino: opts.nivel_destino,
    titulo: `[Importado docx] ${comp.nome} ${opts.nivel_entrada}→${opts.nivel_destino}`.slice(0, 120),
    finalidade: `Matéria-prima pedagógica importada de docx para a transição ${opts.nivel_entrada}→${opts.nivel_destino} em "${comp.nome}".`.slice(0, 400),
    contexto_pedagogico: opts.contexto_pedagogico || null,
    tags: ['importado-docx'],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: ctx.email,
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, avisos: erros, textoExtraidoChars: texto.length };
}
