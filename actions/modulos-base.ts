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
  titulo, descritor, finalidade, contexto_pedagogico, tags, preferido, status, versao,
  substitui_modulo_id, conteudo_central, conteudo_aplicavel, guarda_corpos,
  adaptacao_por_formato, created_by, created_at, updated_at,
  reviewed_by, reviewed_at, published_by, published_at,
  auditoria_ia, auditado_em, auditado_por_modelo, auditado_em_versao
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
// Aceita JSON parcial (mesmo que falte 1 dos 4 blocos — o ausente vira {} e
// a revisão humana / IA-auditora pega depois). Antes, qualquer ausência
// rejeitava a resposta inteira, derrubando o import quando o output era
// grande demais e a IA truncava no fim.
function extractCorpo(raw: string | null | undefined): any | null {
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  if (!text) return null;
  const candidatos = [text];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) candidatos.push(obj[0]);
  for (const c of candidatos) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object') {
        // Pelo menos UM bloco precisa estar presente pra valer a pena salvar.
        const temAlgo = parsed.conteudo_central || parsed.conteudo_aplicavel
          || parsed.guarda_corpos || parsed.adaptacao_por_formato;
        if (!temAlgo) continue;
        return {
          conteudo_central: parsed.conteudo_central || {},
          conteudo_aplicavel: parsed.conteudo_aplicavel || {},
          guarda_corpos: parsed.guarda_corpos || {},
          adaptacao_por_formato: parsed.adaptacao_por_formato || {},
        };
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
  const ctx = await requireAdminAction('content.manage');
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
    descritor: payload.descritor || null,
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
  await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo').select('status, conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'rascunho' && data.status !== 'revisao') {
    return { error: `Status atual é ${data.status} — só é possível submeter rascunho ou re-submeter em revisão` };
  }

  const erros = validarCorpo(data);
  if (erros.length) return { error: 'Validação estrutural falhou', detalhes: erros };

  const { error: errStatus } = await sb.from('modulos_base_conteudo').update({ status: 'revisao' }).eq('id', id);
  if (errStatus) return { error: errStatus.message };

  // Padrão Dual-IA: ao submeter, dispara automaticamente a IA-auditora.
  // O veredito gate a publicação (em vez de revisão humana cruzada).
  const auditResult = await auditarModuloBase(id);
  if ('error' in auditResult && auditResult.error) {
    // Auditoria falhou — módulo continua em revisão, mas sem veredito.
    // Humano pode tentar "Reauditar" manualmente depois.
    return { ok: true, aviso_auditoria: auditResult.error };
  }
  return { ok: true, auditoria: (auditResult as any).auditoria };
}

export async function aprovarPublicar(id: string) {
  const ctx = await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo')
    .select('status, versao, auditoria_ia, auditado_em_versao')
    .eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status !== 'revisao') return { error: `Status atual é ${data.status} — só é possível publicar em revisão` };

  // Dual-IA: a publicação exige aprovação da IA-auditora pra ESTA versão.
  if (!data.auditoria_ia) {
    return { error: 'Auditoria da IA pendente. Submeta pra revisão (dispara a auditoria) ou clique em "Reauditar".' };
  }
  if (data.auditado_em_versao !== data.versao) {
    return { error: 'Módulo foi editado após a última auditoria. Reauditar antes de publicar.' };
  }
  const veredito = (data.auditoria_ia as any)?.veredito;
  if (veredito === 'reprovado') {
    return { error: 'IA-auditora reprovou. Corrija os problemas listados e submeta novamente pra reauditar.' };
  }
  if (veredito !== 'aprovado' && veredito !== 'aprovado_com_ressalvas') {
    return { error: 'Veredito da auditoria inválido — reauditar.' };
  }

  const { error } = await sb.from('modulos_base_conteudo')
    .update({ status: 'publicado', published_by: ctx.email, published_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function marcarObsoleto(id: string, substitui_por?: string) {
  await requireAdminAction('content.manage');
  const sb = createSupabaseAdmin();
  const update: any = { status: 'obsoleto' };
  if (substitui_por) update.substitui_modulo_id = substitui_por;
  const { error } = await sb.from('modulos_base_conteudo').update(update).eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function excluirModulo(id: string) {
  await requireAdminAction('content.manage');
  if (!id) return { error: 'id obrigatório' };
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('modulos_base_conteudo').select('status, titulo').eq('id', id).maybeSingle();
  if (!data) return { error: 'Módulo não encontrado' };
  if (data.status === 'publicado') {
    return { error: 'Marque como obsoleto primeiro antes de excluir um módulo publicado (proteção contra apagar conteúdo em uso pelo engine).' };
  }
  // FK substitui_modulo_id já tem ON DELETE SET NULL — não trava se outro
  // módulo apontar pra este (a cadeia de versão fica órfã, mas íntegra).
  const { error } = await sb.from('modulos_base_conteudo').delete().eq('id', id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function setPreferido(id: string, preferido: boolean) {
  await requireAdminAction('content.manage');
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
  const ctx = await requireAdminAction('content.manage');
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
    ? `\n\n## TEXTO EXTRAÍDO DO DOCX (estruture-o no JSON do módulo — adapte o que estiver fora do padrão):\n${docxTexto.slice(0, 60000)}`
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

async function chamarIAComRetry(systemPrompt: string, userPrompt: string, model: string, maxTokens = 64000) {
  let corpo: any = null;
  for (let tentativa = 1; tentativa <= 2 && !corpo; tentativa++) {
    try {
      const raw = await callAI(systemPrompt, userPrompt, { model }, maxTokens);
      corpo = extractCorpo(raw);
      if (!corpo) {
        const txt = String(raw || '');
        console.warn(
          `[modulo_base_autor] tentativa ${tentativa}: JSON inválido. ` +
          `raw=${txt.length}chars · início="${txt.slice(0, 200).replace(/\n/g, ' ')}" · ` +
          `fim="${txt.slice(-200).replace(/\n/g, ' ')}"`,
        );
      }
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
  const ctx = await requireAdminAction('ai.audit.regenerate');
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
// Detectar metadados do cabeçalho do .docx (sem persistir nada)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Faz uma chamada curta à IA pra extrair Competência/Descritor/Nível/Locale/
 * Título/Finalidade do CABEÇALHO do template oficial Vertho dentro do .docx,
 * e tenta fazer match contra `competencias_base` pelo nome. Retorna sugestões
 * pra o frontend pré-preencher o modal antes do import definitivo.
 *
 * NÃO persiste nada. Usuário revisa e corrige antes de chamar `importarModuloDocx`.
 */
export async function detectarMetadadosDocx(opts: { arquivoBase64: string }) {
  await requireAdminAction('ai.audit.regenerate');
  if (!opts?.arquivoBase64) return { error: 'arquivoBase64 obrigatório' };

  let texto: string;
  try {
    const mammoth: any = await import('mammoth');
    const buffer = Buffer.from(opts.arquivoBase64, 'base64');
    const out = await mammoth.extractRawText({ buffer });
    texto = String(out?.value || '').trim();
    if (!texto) return { error: 'Não foi possível extrair texto do .docx' };
  } catch (e: any) {
    console.error('[detectarMetadadosDocx] mammoth:', e?.message);
    return { error: 'Falha ao processar o .docx' };
  }

  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias_base')
    .select('id, nome, segmento')
    .order('nome');

  const system = `Você analisa o cabeçalho de um template oficial Vertho de Módulo-Base de Conteúdo e extrai metadados.

Retorne APENAS JSON válido com a estrutura:
{
  "competencia_nome_detectado": "string ou null (nome exato que aparece no docx)",
  "competencia_match": { "id": "uuid ou null", "nome": "...", "confianca": 0.0 a 1.0 },
  "nivel_entrada": "N1|N2|N3|null",
  "nivel_destino": "N2|N3|N4|null",
  "locale": "pt-BR|pt-PT|es-ES|en-US|null",
  "titulo": "string ou null",
  "finalidade": "string ou null",
  "contexto_pedagogico": "string ou null"
}

REGRAS:
- "competencia_match.id" = id da lista oficial que bate semanticamente. Confiança <0.5 → use null.
- Se o docx só diz "Nível 1" (sem destino), assuma N1→N2; "Nível 2" → N2→N3; "Nível 3" → N3→N4.
- Locale: detecte pela língua do conteúdo; null se ambíguo.
- Não invente. Use null quando o campo não estiver claro.`;

  const compsListagem = (comps || []).slice(0, 200).map((c: any) => `- ${c.id} :: ${c.nome} (${c.segmento})`).join('\n');
  const user = `LISTA OFICIAL DE COMPETÊNCIAS (catálogo Vertho — escolha 1 ou null):
${compsListagem}

CABEÇALHO DO DOCX (primeiros 4000 chars):
${texto.slice(0, 4000)}`;

  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const raw = await callAI(system, user, { model }, 800).catch((e: any) => { console.warn('[detectarMetadados] callAI:', e?.message); return ''; });
  if (!raw) return { error: 'Detecção falhou (sem resposta da IA)' };

  let det: any = null;
  const cleaned = String(raw).replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const candidatos = [cleaned];
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) candidatos.push(m[0]);
  for (const c of candidatos) {
    try { const p = JSON.parse(c); if (p && typeof p === 'object') { det = p; break; } } catch { /* tenta próximo */ }
  }
  if (!det) return { error: 'Resposta inválida da IA' };

  return {
    ok: true,
    texto_chars: texto.length,
    sugestoes: {
      competencia_nome_detectado: det.competencia_nome_detectado || null,
      competencia_base_id: det.competencia_match?.id || null,
      competencia_nome_match: det.competencia_match?.nome || null,
      confianca: typeof det.competencia_match?.confianca === 'number' ? det.competencia_match.confianca : 0,
      nivel_entrada: det.nivel_entrada || null,
      nivel_destino: det.nivel_destino || null,
      locale: det.locale || null,
      titulo: det.titulo || null,
      finalidade: det.finalidade || null,
      contexto_pedagogico: det.contexto_pedagogico || null,
    },
  };
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
  const ctx = await requireAdminAction('content.manage');
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

// ════════════════════════════════════════════════════════════════════════════
// Extração de vídeo → Módulo-Base (matéria-prima). O texto-base extraído de um
// vídeo (YouTube/Vimeo/TED/LMS) entra no lugar do texto do .docx: a IA detecta
// a competência canônica + transição de nível e estrutura os 4 blocos. Resultado
// é sempre rascunho (passa pelo workflow Dual-IA). Alcance = global (empresa_id
// null) ou exclusivo de uma empresa.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Detecta competência canônica (competencias_base) + transição de nível + locale
 * a partir do texto-base + título do vídeo. Mesma ideia de detectarMetadadosDocx,
 * mas a fonte é o conteúdo livre extraído (não há cabeçalho de template).
 */
async function detectarMetadadosDeTexto(textoBase: string, tituloVideo: string, localeHint?: string) {
  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias_base').select('id, nome, segmento, descricao').order('nome');
  const compsListagem = (comps || []).slice(0, 200).map((c: any) => `- ${c.id} :: ${c.nome} (${c.segmento})${c.descricao ? ' — ' + c.descricao : ''}`).join('\n');

  const system = `Você classifica um conteúdo pedagógico (extraído de um vídeo) contra o catálogo canônico de competências Vertho.

Retorne APENAS JSON válido:
{
  "competencia_match": { "id": "uuid da lista ou null", "confianca": 0.0 a 1.0 },
  "descritor": "sub-tema ESPECÍFICO que o conteúdo desenvolve dentro da competência (5-10 palavras), ou null",
  "nivel_entrada": "N1|N2|N3",
  "nivel_destino": "N2|N3|N4",
  "contexto_pedagogico": "string curta ou null",
  "titulo": "título interno do módulo (não é o título do vídeo) ou null",
  "finalidade": "1-2 frases: o que este módulo precisa permitir que a IA ensine"
}

REGRAS:
- "competencia_match.id" = a competência da lista que melhor representa o conteúdo. Confiança <0.4 → use null.
- "descritor" = o foco específico do conteúdo dentro da competência (ex.: "Aversão à perda e vieses na decisão sob risco"). NÃO é o nome da competência; é mais granular.
- Escolha a transição de nível mais provável que o conteúdo serve (default N1→N2 se incerto).
- Não invente. Use null quando não estiver claro.`;
  const user = `CATÁLOGO DE COMPETÊNCIAS (escolha 1 ou null):
${compsListagem}

TÍTULO DO VÍDEO: ${tituloVideo || '—'}

TEXTO-BASE EXTRAÍDO (primeiros 5000 chars):
${String(textoBase).slice(0, 5000)}`;

  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const raw = await callAI(system, user, { model }, 800).catch(() => '');
  let det: any = null;
  const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  for (const c of [cleaned, cleaned.match(/\{[\s\S]*\}/)?.[0] || '']) {
    if (!c) continue;
    try { const p = JSON.parse(c); if (p && typeof p === 'object') { det = p; break; } } catch { /* tenta próximo */ }
  }
  const niveisOk = (e: string, d: string) => NIVEIS.includes(e as Nivel) && NIVEIS.includes(d as Nivel) && nivelGreater(d as Nivel, e as Nivel);
  let nivel_entrada: Nivel = 'N1', nivel_destino: Nivel = 'N2';
  if (det && niveisOk(det.nivel_entrada, det.nivel_destino)) { nivel_entrada = det.nivel_entrada; nivel_destino = det.nivel_destino; }
  return {
    competencia_base_id: det?.competencia_match?.id || null,
    confianca: typeof det?.competencia_match?.confianca === 'number' ? det.competencia_match.confianca : 0,
    nivel_entrada, nivel_destino,
    contexto_pedagogico: det?.contexto_pedagogico || null,
    locale: (localeHint || 'pt-BR') as Locale,
    titulo: det?.titulo || null,
    descritor: det?.descritor || null,
    finalidade: det?.finalidade || null,
  };
}

interface MetaModulo {
  competencia_base_id: string;
  nivel_entrada: Nivel;
  nivel_destino: Nivel;
  contexto_pedagogico?: string | null;
  locale: Locale;
  titulo?: string | null;
  descritor?: string | null;
  finalidade?: string | null;
}

/**
 * Estrutura um texto-base nos 4 blocos (IA-autora) e insere o módulo rascunho.
 * Núcleo compartilhado: a competência canônica + transição já vêm resolvidas
 * (pela detecção de texto único OU pelo segmentador de transcrição longa).
 */
async function estruturarEInserirModulo(
  meta: MetaModulo,
  textoBase: string,
  opts: { empresaId?: string | null; urlOrigem?: string; createdBy?: string },
): Promise<{ id?: string; grupo_id?: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel; avisos?: string[]; error?: string }> {
  const comp = await carregarCompetenciaBase(meta.competencia_base_id);
  if (!comp) return { error: 'Competência base não encontrada' };

  // Estrutura os 4 blocos tratando o texto-base como matéria-prima (igual ao docx).
  const userPrompt = montarUserPrompt(comp, meta.nivel_entrada, meta.nivel_destino, meta.contexto_pedagogico || undefined, null, textoBase);
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA não conseguiu estruturar o conteúdo do vídeo. Tente novamente ou edite manualmente.' };

  const erros = validarCorpo(corpo);
  const sb = createSupabaseAdmin();
  const insertRow: any = {
    empresa_id: opts.empresaId || null,
    locale: meta.locale,
    competencia_base_id: meta.competencia_base_id,
    nivel_entrada: meta.nivel_entrada,
    nivel_destino: meta.nivel_destino,
    titulo: (meta.titulo || `[Vídeo] ${comp.nome} ${meta.nivel_entrada}→${meta.nivel_destino}`).slice(0, 120),
    descritor: meta.descritor ? String(meta.descritor).slice(0, 200) : null,
    finalidade: (meta.finalidade || `Matéria-prima pedagógica extraída de vídeo para a transição ${meta.nivel_entrada}→${meta.nivel_destino} em "${comp.nome}".`).slice(0, 400),
    contexto_pedagogico: meta.contexto_pedagogico || null,
    tags: opts.urlOrigem ? ['extraido-video', opts.urlOrigem.slice(0, 80)] : ['extraido-video'],
    conteudo_central: corpo.conteudo_central,
    conteudo_aplicavel: corpo.conteudo_aplicavel,
    guarda_corpos: corpo.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato,
    created_by: opts.createdBy || 'extracao-video',
    status: 'rascunho' as Status,
  };
  const { data, error } = await sb.from('modulos_base_conteudo').insert(insertRow).select('id, grupo_id').single();
  if (error) return { error: error.message };
  return { id: data.id, grupo_id: data.grupo_id, competencia: comp.nome, nivel_entrada: meta.nivel_entrada, nivel_destino: meta.nivel_destino, avisos: erros };
}

/**
 * Cria UM Módulo-Base rascunho a partir do texto-base extraído de um vídeo curto
 * (fluxo síncrono YouTube). Detecta competência+níveis e estrutura. `empresaId`
 * null = módulo global/canônico; preenchido = exclusivo.
 */
export async function criarModuloBaseDeTextoExtraido(opts: {
  textoBase: string;
  tituloVideo?: string;
  urlOrigem?: string;
  locale?: string;
  empresaId?: string | null;
  createdBy?: string;
}): Promise<{ id?: string; grupo_id?: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel; avisos?: string[]; error?: string }> {
  if (!opts?.textoBase?.trim()) return { error: 'texto-base vazio' };
  const meta = await detectarMetadadosDeTexto(opts.textoBase, opts.tituloVideo || '', opts.locale);
  if (!meta.competencia_base_id) {
    return { error: 'Não foi possível mapear o vídeo a uma competência canônica com confiança. Mapeie manualmente.' };
  }
  return estruturarEInserirModulo(meta as MetaModulo, opts.textoBase, opts);
}

type SegSecao = Omit<MetaModulo, 'locale'> & { texto_base: string };
interface SegCtx {
  compsListagem: string;
  idSet: Set<string>;
  nomeParaId: Map<string, string>;
  model: string;
}

const SEG_SYSTEM = `Você é designer instrucional da Vertho. Recebe um TRECHO de transcrição/material (aula/palestra/apostila) e o divide em SEÇÕES TEMÁTICAS coerentes. Cada seção vira matéria-prima de UM módulo-base, mapeado a UMA competência canônica do catálogo Vertho.

REGRAS:
- Identifique de 1 a 8 seções (use o número que o conteúdo pedir; um trecho monotemático pode ter 1).
- Para CADA seção, escolha SEMPRE a competência do catálogo SEMANTICAMENTE mais próxima — nunca deixe sem competência. Copie o "competencia_base_id" EXATO da lista (e repita o nome em "competencia_nome" para conferência).
- "descritor": o sub-tema ESPECÍFICO da seção dentro da competência (5-10 palavras; mais granular que o nome da competência).
- Transição de nível: default N1→N2 se incerto.
- "texto_base": destile FIELMENTE o conteúdo da seção (400-900 palavras, markdown), sem inventar.

Responda APENAS JSON válido (sem markdown), no formato:
{"secoes":[{"competencia_base_id":"<id do catálogo>","competencia_nome":"<nome>","descritor":"<sub-tema específico>","nivel_entrada":"N1","nivel_destino":"N2","contexto_pedagogico":null,"titulo":"...","finalidade":"...","texto_base":"..."}]}`;

const niveisValidos = (e: string, d: string) =>
  NIVEIS.includes(e as Nivel) && NIVEIS.includes(d as Nivel) && nivelGreater(d as Nivel, e as Nivel);

/** Segmenta UMA janela de texto (≤ ~110k chars) numa chamada (com retry). */
async function segmentarJanela(texto: string, tituloVideo: string, ctx: SegCtx): Promise<{ secoes: SegSecao[]; diag: string }> {
  const user = `CATÁLOGO DE COMPETÊNCIAS (escolha sempre 1 por seção — id EXATO):
${ctx.compsListagem}

TÍTULO: ${tituloVideo || '—'}

TRECHO:
${texto}`;

  let ultimoDiag = 'sem resposta';
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const raw = await callAI(SEG_SYSTEM, user, { model: ctx.model }, 32000).catch((e: any) => { ultimoDiag = 'callAI: ' + (e?.message || e); return ''; });
    const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    // Parse tolerante: objeto {secoes:[...]}, bare array [...], ou maior bloco {…}/[…].
    let brutas: any[] = [];
    for (const c of [cleaned, cleaned.match(/\[[\s\S]*\]/)?.[0] || '', cleaned.match(/\{[\s\S]*\}/)?.[0] || '']) {
      if (!c) continue;
      try {
        const p = JSON.parse(c);
        const arr = Array.isArray(p) ? p : (Array.isArray(p?.secoes) ? p.secoes : null);
        if (arr) { brutas = arr; break; }
      } catch { /* tenta próximo candidato */ }
    }
    if (!brutas.length) { ultimoDiag = `t${tentativa}: raw=${cleaned.length}c, JSON sem secoes`; continue; }

    // Resolve a competência: id válido do catálogo OU nome casado ao catálogo.
    const secoes: SegSecao[] = brutas.map((s: any) => {
      let id = String(s?.competencia_base_id || '').trim();
      if (!ctx.idSet.has(id)) id = ctx.nomeParaId.get(String(s?.competencia_nome || '').trim().toLowerCase()) || '';
      return { s, id };
    }).filter((x) => x.id && x.s?.texto_base).map(({ s, id }) => ({
      competencia_base_id: id,
      nivel_entrada: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_entrada : 'N1') as Nivel,
      nivel_destino: (niveisValidos(s.nivel_entrada, s.nivel_destino) ? s.nivel_destino : 'N2') as Nivel,
      contexto_pedagogico: s.contexto_pedagogico || null,
      titulo: s.titulo || null,
      descritor: s.descritor || null,
      finalidade: s.finalidade || null,
      texto_base: String(s.texto_base),
    }));

    if (secoes.length) return { secoes, diag: `${secoes.length} (t${tentativa})` };
    ultimoDiag = `t${tentativa}: ${brutas.length} brutas, 0 válidas`;
  }
  return { secoes: [], diag: ultimoDiag };
}

/**
 * Segmenta a transcrição/material completo em seções temáticas → 1 módulo por
 * tema. Texto pequeno (≤110k chars): 1 chamada. Texto GRANDE: MAP-REDUCE —
 * fatia em janelas com overlap, segmenta cada uma e deduplica/mescla seções por
 * (competência × transição), removendo o teto de tamanho (livros, cursos, etc).
 */
async function segmentarTranscricao(
  transcricao: string, tituloVideo: string,
): Promise<{ secoes: SegSecao[]; diag: string }> {
  const sb = createSupabaseAdmin();
  const { data: comps } = await sb.from('competencias_base').select('id, nome, segmento, descricao').order('nome');
  const lista = (comps || []) as { id: string; nome: string; segmento: string; descricao?: string }[];
  const ctx: SegCtx = {
    compsListagem: lista.slice(0, 200).map((c) => `- ${c.id} :: ${c.nome} (${c.segmento})${c.descricao ? ' — ' + c.descricao : ''}`).join('\n'),
    idSet: new Set(lista.map((c) => c.id)),
    nomeParaId: new Map(lista.map((c) => [c.nome.trim().toLowerCase(), c.id])),
    model: await getModelForTask(null as any, 'modulo_base_autor'),
  };

  const full = String(transcricao);
  const JANELA = 110000, OVERLAP = 6000, MAX_JANELAS = 12, MAX_SECOES = 12, MERGE_CAP = 14000;

  // Caso comum: cabe numa janela → 1 chamada (comportamento anterior).
  if (full.length <= JANELA) return segmentarJanela(full, tituloVideo, ctx);

  // MAP: janelas com overlap (evita cortar um tema na fronteira).
  const janelas: string[] = [];
  for (let i = 0; i < full.length && janelas.length < MAX_JANELAS; i += (JANELA - OVERLAP)) {
    janelas.push(full.slice(i, i + JANELA));
  }
  const truncado = (MAX_JANELAS - 1) * (JANELA - OVERLAP) + JANELA < full.length;

  const todas: SegSecao[] = [];
  const diags: string[] = [];
  for (let j = 0; j < janelas.length; j++) {
    const r = await segmentarJanela(janelas[j], `${tituloVideo} (parte ${j + 1}/${janelas.length})`, ctx);
    todas.push(...r.secoes);
    diags.push(`j${j + 1}:${r.secoes.length}`);
  }

  // REDUCE: dedup/mescla por (competência × transição). Tema que cruza janelas
  // vira UM módulo com o material combinado (cap), não dois quase-duplicados.
  const map = new Map<string, SegSecao>();
  for (const s of todas) {
    const key = `${s.competencia_base_id}|${s.nivel_entrada}|${s.nivel_destino}`;
    const ex = map.get(key);
    if (ex) {
      if (ex.texto_base.length < MERGE_CAP) ex.texto_base = (ex.texto_base + '\n\n' + s.texto_base).slice(0, MERGE_CAP);
    } else {
      map.set(key, { ...s });
    }
  }
  const secoes = [...map.values()].slice(0, MAX_SECOES);
  const diag = `map-reduce ${janelas.length} janelas → ${todas.length} brutas → ${secoes.length} módulos${truncado ? ' [texto truncado em ' + MAX_JANELAS + ' janelas]' : ''} (${diags.join(' ')})`;
  return { secoes, diag };
}

/**
 * Cria N Módulos-Base rascunho a partir da transcrição completa de um vídeo
 * longo (1 módulo por seção temática). Usado pelo worker (vídeos >1h via rota
 * interna). Para vídeos curtos, o segmentador devolve 1 seção → 1 módulo.
 */
export async function criarModulosDeTranscricao(opts: {
  transcricao: string;
  tituloVideo?: string;
  urlOrigem?: string;
  locale?: string;
  empresaId?: string | null;
  createdBy?: string;
}): Promise<{ modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[]; error?: string }> {
  if (!opts?.transcricao?.trim()) return { modulos: [], error: 'transcrição vazia' };

  const { secoes, diag } = await segmentarTranscricao(opts.transcricao, opts.tituloVideo || '');
  if (!secoes.length) return { modulos: [], error: `Não foi possível segmentar a transcrição. ${diag}` };

  const locale = (opts.locale || 'pt-BR') as Locale;
  // Estrutura as seções EM PARALELO — N módulos levam ~o tempo de 1, em vez de
  // N×(tempo de um). Crucial pra não estourar o timeout no fluxo síncrono
  // (material) e no callback (vídeo) quando há muitos temas.
  const resultados = await Promise.all(secoes.map((s) =>
    estruturarEInserirModulo(
      { ...s, locale } as MetaModulo,
      s.texto_base,
      { empresaId: opts.empresaId, urlOrigem: opts.urlOrigem, createdBy: opts.createdBy },
    ).catch((e: any) => ({ error: e?.message || 'erro' } as any)),
  ));
  const modulos: { id: string; competencia?: string; nivel_entrada?: Nivel; nivel_destino?: Nivel }[] = [];
  const falhas: string[] = [];
  resultados.forEach((res, i) => {
    if (res?.id) modulos.push({ id: res.id, competencia: res.competencia, nivel_entrada: res.nivel_entrada, nivel_destino: res.nivel_destino });
    else falhas.push(`[${String(secoes[i].competencia_base_id).slice(0, 8)}] ${res?.error || 'sem id'}`);
  });
  if (!modulos.length) {
    return { modulos: [], error: `${secoes.length} seções, 0 estruturadas. Motivos: ${falhas.slice(0, 4).join(' · ').slice(0, 380)}` };
  }
  return { modulos };
}

// ════════════════════════════════════════════════════════════════════════════
// IA-auditora — valida o módulo contra spec e seus próprios guarda-corpos
// (padrão Dual-IA — substitui revisão humana cruzada)
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_AUDITOR = `Você é IA-auditora de Módulos-Base de Conteúdo da Vertho. Sua tarefa é validar RIGOROSAMENTE um módulo gerado pela IA-autora contra a spec oficial e os próprios guarda-corpos do módulo. NÃO suavize: marque qualquer problema real.

CRITÉRIOS DE AUDITORIA (verifique TODOS):
1. ESTRUTURA — 4 blocos presentes? conteudo_central com ideia/explicação/≥5 princípios/síntese? conteudo_aplicavel com ≥4 situações/exemplos universais (5 chaves)/≥4 erros/repertório (6 categorias)/≥4 boas práticas? guarda_corpos com preservar/evitar/cuidados? adaptacao_por_formato com texto/podcast_roteiro/video_roteiro?
2. NÃO É RÉGUA DE MATURIDADE — o conteúdo descreve conhecimento aplicável, não comportamentos observáveis por nível. Repetir a régua de maturidade é problema GRAVE.
3. NÃO É AULA FINAL — o módulo é matéria-prima pedagógica pra IA gerar conteúdo depois, não é texto pronto pra colaborador ler.
4. EXEMPLOS UNIVERSAIS — sem cargo específico (salvo se módulo é declaradamente exclusivo de um contexto); sem nomes próprios reais; sem situações ultra-específicas.
5. NADA INVENTADO — leis, normas, estatísticas, citações fabricadas. Gravidade alta.
6. SEM DIAGNÓSTICO PSICOLÓGICO. SEM DISC determinista. Linguagem evita rotular pessoa.
7. AUTO-CONSISTÊNCIA — exemplos e linguagem respeitam os guarda_corpos do PRÓPRIO módulo (não contradizem).
8. PROFUNDIDADE — explicação expandida tem substância (não é stub); princípios têm implicação prática (não genéricos); situações têm risco_comum E boa_abordagem distintos.
9. LINGUAGEM CLARA — sem jargão excessivo; tom profissional aplicado.

RETORNE APENAS JSON válido:
{
  "nota": 0 a 10 (com 1 casa decimal — 0.0 inservível, 10.0 perfeito),
  "veredito": "aprovado" | "aprovado_com_ressalvas" | "reprovado",
  "problemas": [
    {
      "categoria": "estrutura" | "regua-vs-base" | "aula-vs-base" | "exemplos" | "invencao" | "etica" | "auto-consistencia" | "profundidade" | "linguagem",
      "descricao": "explica concretamente o problema (cite trecho se útil)",
      "gravidade": "alta" | "media" | "baixa",
      "campo_afetado": "ex.: conteudo_central.principios[2]"
    }
  ],
  "recomendacoes": ["sugestões de correção, 1-3 itens"],
  "confianca": 0.0 a 1.0
}

ESCALA DE NOTA (0-10, com 1 casa decimal):
- 9.0-10: módulo modelar — estrutura completa, sem problemas relevantes, exemplos universais, linguagem precisa.
- 7.0-8.9: bom com ajustes menores — só problemas de gravidade média/baixa.
- 5.0-6.9: limítrofe — vários ajustes médios ou 1-2 problemas altos pontuais.
- 3.0-4.9: insuficiente — múltiplos problemas altos ou bloco essencial fraco.
- 0.0-2.9: inservível — falhas estruturais graves ou conceito incorreto.

REGRA DE VEREDITO (deve casar com a nota):
- "reprovado" se houver ≥1 problema de gravidade ALTA OU nota < 5.0.
- "aprovado_com_ressalvas" se nota entre 5.0 e 8.9 (só problemas média/baixa).
- "aprovado" se nota ≥ 9.0 e nenhum problema apontado.
- "confianca" = sua certeza no próprio veredito (0-1).`;

export async function auditarModuloBase(id: string) {
  await requireAdminAction('ai.audit.regenerate');
  const sb = createSupabaseAdmin();
  const { data: m } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', id).maybeSingle();
  if (!m) return { error: 'Módulo não encontrado' };

  const comp = await carregarCompetenciaBase(m.competencia_base_id);

  const userPrompt = `## CONTEXTO
- Competência: ${comp?.nome || '—'} (${comp?.segmento || '—'})
- Descritor: ${comp?.descritor_completo || '—'}
- Transição: ${m.nivel_entrada} → ${m.nivel_destino}
- Locale: ${m.locale}
- Contexto pedagógico: ${m.contexto_pedagogico || 'transversal'}
- Título: ${m.titulo}
- Finalidade: ${m.finalidade}

## MÓDULO A AUDITAR (JSON completo dos 4 blocos):
${JSON.stringify({
  conteudo_central: m.conteudo_central,
  conteudo_aplicavel: m.conteudo_aplicavel,
  guarda_corpos: m.guarda_corpos,
  adaptacao_por_formato: m.adaptacao_por_formato,
}, null, 2)}

Responda APENAS com o JSON do veredito.`;

  const model = await getModelForTask(null as any, 'modulo_base_auditor');
  let auditoria: any = null;
  for (let tentativa = 1; tentativa <= 2 && !auditoria; tentativa++) {
    try {
      const raw = await callAI(SYSTEM_AUDITOR, userPrompt, { model }, 16000);
      const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const candidatos = [cleaned];
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) candidatos.push(objMatch[0]);
      for (const c of candidatos) {
        try {
          const p = JSON.parse(c);
          if (p && ['aprovado', 'aprovado_com_ressalvas', 'reprovado'].includes(p.veredito)) {
            auditoria = p; break;
          }
        } catch { /* tenta próximo */ }
      }
    } catch (e: any) {
      console.warn(`[auditarModuloBase] tentativa ${tentativa} falhou:`, e?.message);
    }
  }
  if (!auditoria) return { error: 'IA-auditora não conseguiu emitir veredito válido' };

  // Normaliza campos
  auditoria.problemas = Array.isArray(auditoria.problemas) ? auditoria.problemas : [];
  auditoria.recomendacoes = Array.isArray(auditoria.recomendacoes) ? auditoria.recomendacoes : [];
  auditoria.confianca = typeof auditoria.confianca === 'number' ? auditoria.confianca : 0.5;
  auditoria.nota = typeof auditoria.nota === 'number'
    ? Math.round(Math.max(0, Math.min(10, auditoria.nota)) * 10) / 10
    : null;

  const { error } = await sb.from('modulos_base_conteudo').update({
    auditoria_ia: auditoria,
    auditado_em: new Date().toISOString(),
    auditado_por_modelo: model,
    auditado_em_versao: m.versao,
  }).eq('id', id);
  if (error) return { error: error.message };

  return { ok: true, auditoria };
}

// ════════════════════════════════════════════════════════════════════════════
// Refinar módulo consumindo o feedback estruturado da IA-auditora
// (loop Dual-IA — disparado manualmente pelo autor humano)
// ════════════════════════════════════════════════════════════════════════════

function montarPromptRefinador(m: any, comp: any, a: any): string {
  const nivelTextos: Record<string, string> = {
    N1: comp?.n1_gap || '',
    N2: comp?.n2_desenvolvimento || '',
    N3: comp?.n3_meta || '',
    N4: comp?.n4_referencia || '',
  };

  const problemasOrdenados = [...(Array.isArray(a.problemas) ? a.problemas : [])]
    .sort((x: any, y: any) => {
      const ord: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
      return (ord[x.gravidade] ?? 3) - (ord[y.gravidade] ?? 3);
    });

  const problemasTexto = problemasOrdenados
    .map((p: any, i: number) =>
      `${i + 1}. [${String(p.gravidade || '').toUpperCase()}] ${p.categoria}: ${p.descricao}${p.campo_afetado ? ` (campo: ${p.campo_afetado})` : ''}`)
    .join('\n');

  const recomendacoesTexto = (Array.isArray(a.recomendacoes) ? a.recomendacoes : [])
    .map((r: any) => `- ${r}`)
    .join('\n');

  return `## COMPETÊNCIA CANÔNICA
- Nome: ${comp?.nome || '—'} (${comp?.segmento || '—'})
- Descritor: ${comp?.descritor_completo || comp?.descricao || '—'}
- Transição: ${m.nivel_entrada} → ${m.nivel_destino}
  - ${m.nivel_entrada}: ${nivelTextos[m.nivel_entrada]}
  - ${m.nivel_destino}: ${nivelTextos[m.nivel_destino]}
- Contexto pedagógico: ${m.contexto_pedagogico || 'transversal'}
- Locale: ${m.locale}

## VERSÃO ATUAL DO MÓDULO (v${m.versao}) — a IA-auditora **${(a.veredito || '').replace(/_/g, ' ')}**:
${JSON.stringify({
  conteudo_central: m.conteudo_central,
  conteudo_aplicavel: m.conteudo_aplicavel,
  guarda_corpos: m.guarda_corpos,
  adaptacao_por_formato: m.adaptacao_por_formato,
}, null, 2)}

## FEEDBACK DA IA-AUDITORA (confiança ${Math.round((a.confianca || 0) * 100)}%)

### Problemas apontados (${problemasOrdenados.length}):
${problemasTexto || '(nenhum problema listado)'}

### Recomendações da auditora:
${recomendacoesTexto || '(nenhuma recomendação)'}

## SUA TAREFA — REFINAR (não regerar do zero)
Você é a MESMA IA-autora que produziu a versão atual. A IA-auditora avaliou e devolveu o feedback acima. Sua tarefa é PRODUZIR UMA VERSÃO REFINADA que:

1. **CORRIGE** todos os problemas de gravidade ALTA (obrigatório).
2. **AJUSTA** os de gravidade média/baixa quando viável (fortemente recomendado).
3. **PRESERVA** tudo que não foi apontado como problema — não regere o que está bom.
4. **MANTÉM** consistência conceitual com a versão atual (a auditora vai re-avaliar a comparação).
5. **RESPEITA** o spec original do Módulo-Base (4 blocos completos com os mínimos: ≥5 princípios, ≥4 situações, ≥4 erros, ≥4 boas práticas).

Retorne APENAS JSON válido com a estrutura completa dos 4 blocos. Sem markdown, sem comentários.`;
}

export async function refinarComFeedback(id: string) {
  await requireAdminAction('ai.audit.regenerate');
  const sb = createSupabaseAdmin();
  const { data: m } = await sb.from('modulos_base_conteudo').select(COLS).eq('id', id).maybeSingle();
  if (!m) return { error: 'Módulo não encontrado' };
  if (!m.auditoria_ia) return { error: 'Sem auditoria pra refinar. Submeta pra revisão primeiro pra disparar a IA-auditora.' };

  const a = m.auditoria_ia as any;
  if (a.veredito === 'aprovado') {
    return { error: 'A IA-auditora já aprovou esta versão. Nada a refinar.' };
  }
  if (m.auditado_em_versao !== m.versao) {
    return { error: 'A auditoria não corresponde à versão atual do módulo. Reauditar antes de refinar.' };
  }

  const comp = await carregarCompetenciaBase(m.competencia_base_id);
  const userPrompt = montarPromptRefinador(m, comp, a);

  // IA-autora (Claude Sonnet por default — mesmo modelo da geração inicial,
  // pra manter consistência de estilo).
  const model = await getModelForTask(null as any, 'modulo_base_autor');
  const corpo = await chamarIAComRetry(SYSTEM_AUTOR, userPrompt, model);
  if (!corpo) return { error: 'A IA-autora não conseguiu produzir uma versão refinada. Tente novamente.' };

  const versaoAnterior = m.versao || 1;
  const novaVersao = versaoAnterior + 1;

  const { error: upErr } = await sb.from('modulos_base_conteudo').update({
    conteudo_central:      corpo.conteudo_central      || m.conteudo_central,
    conteudo_aplicavel:    corpo.conteudo_aplicavel    || m.conteudo_aplicavel,
    guarda_corpos:         corpo.guarda_corpos         || m.guarda_corpos,
    adaptacao_por_formato: corpo.adaptacao_por_formato || m.adaptacao_por_formato,
    versao: novaVersao,
  }).eq('id', id);
  if (upErr) return { error: upErr.message };

  // Dispara nova auditoria sobre a versão refinada (fecha o loop dual-IA).
  const auditResult = await auditarModuloBase(id);
  if ('error' in auditResult && auditResult.error) {
    return { ok: true, versaoAnterior, versaoNova: novaVersao, aviso_auditoria: auditResult.error };
  }
  return {
    ok: true,
    versaoAnterior,
    versaoNova: novaVersao,
    auditoria: (auditResult as any).auditoria,
  };
}
