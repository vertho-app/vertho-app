'use server';

import { findColabByEmail } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } from '@/lib/disc-arquetipos';
import { buildInsightsExecutivosPrompt } from '@/lib/prompts/insights-executivos-prompt';
import { isPerfilComportamentalLiberado } from '@/lib/votacao/status';

const INSIGHTS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const COLS = [
  // `empresa_id` não é cosmético: as mutações desta tela usam
  // `.eq('id').eq('empresa_id')` (D2), e sem a coluna aqui o predicado filtraria
  // por `undefined` e casaria 0 linhas — falha silenciosa, do jeito exato que a
  // sprint está fechando.
  'id', 'empresa_id', 'nome_completo', 'perfil_dominante', 'mapeamento_em',
  // DISC Natural
  'd_natural', 'i_natural', 's_natural', 'c_natural',
  // Liderança
  'lid_executivo', 'lid_motivador', 'lid_metodico', 'lid_sistematico',
  // Tipo psicológico textual (legado, mas alimenta as tags executivas)
  'tp_introvertido_extrovertido', 'tp_sensor_intuitivo', 'tp_racional_emocional',
  // 16 Competências
  'comp_ousadia', 'comp_comando', 'comp_objetividade', 'comp_assertividade',
  'comp_persuasao', 'comp_extroversao', 'comp_entusiasmo', 'comp_sociabilidade',
  'comp_empatia', 'comp_paciencia', 'comp_persistencia', 'comp_planejamento',
  'comp_organizacao', 'comp_detalhismo', 'comp_prudencia', 'comp_concentracao',
  // Cache de insights
  'insights_executivos', 'insights_executivos_at',
].join(', ');

/**
 * Carrega todos os dados do perfil comportamental do colaborador:
 * DISC natural, liderança, 16 competências e perfil dominante.
 */
export async function loadPerfilCIS() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab: any = await findColabByEmail(email, COLS + ', empresa_id, perfil_externo_fonte, perfil_externo_dados, perfil_externo_pdf_path');
  if (!colab) return { error: 'Colaborador nao encontrado' };

  // Empresa usa fonte externa de perfil (OPQ32 etc.)?
  let empresaPerfilExternoFonte: string | null = null;
  let empresaPerfilExternoLabel = 'mapeamento comportamental próprio';
  let perfilComportamentalLiberado = true;
  if (colab.empresa_id) {
    const sb = createSupabaseAdmin();
    const { data: empCfg } = await sb.from('empresas')
      .select('sys_config')
      .eq('id', colab.empresa_id)
      .maybeSingle();
    const cfg = (empCfg?.sys_config as any) || {};
    empresaPerfilExternoFonte = cfg.perfil_externo_fonte ?? null;
    perfilComportamentalLiberado = isPerfilComportamentalLiberado(cfg);
    empresaPerfilExternoLabel =
      cfg.perfil_externo_label ||
      cfg.perfil_externo_nome ||
      cfg.perfil_comportamental_nome ||
      'mapeamento comportamental próprio';
  }

  // Resumo executivo: arquétipo + tags + insights (do cache OU fallback)
  const arquetipo = derivarArquetipo(colab.perfil_dominante);
  const tags = derivarTagsExecutivas(colab);

  let insights = null;
  let insightsCached = false;
  if (Array.isArray(colab.insights_executivos) && colab.insights_executivos.length) {
    insights = colab.insights_executivos;
    insightsCached = true;
  }

  return {
    colaborador: colab,
    arquetipo,
    tags,
    insights: insights || insightsHardcoded(colab.perfil_dominante),
    insightsCached,
    empresaPerfilExternoFonte,
    empresaPerfilExternoLabel,
    perfilComportamentalLiberado,
    temPdfPerfilExterno: !!colab.perfil_externo_pdf_path,
  };
}

/**
 * URL assinada do PDF do perfil externo (OPQ32/Hogan) DO PRÓPRIO usuário.
 *
 * Não recebe parâmetro de propósito: o colaborador vem da SESSÃO, então não há
 * identificador do cliente para forjar e a posse é trivial (é a própria pessoa).
 * Contraste com `getPerfilExternoPdfUrl` (dashboard do gestor), que recebe
 * `colabId` do cliente e por isso precisa de gate de posse explícito.
 */
export async function getMeuPerfilExternoPdfUrl(): Promise<{ url?: string; error?: string }> {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab: any = await findColabByEmail(email, 'id, perfil_externo_pdf_path');
  if (!colab) return { error: 'Colaborador não encontrado' };
  if (!colab.perfil_externo_pdf_path) return { error: 'Seu relatório ainda não foi carregado pela empresa' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.storage
    .from('perfis-externos')
    .createSignedUrl(colab.perfil_externo_pdf_path, 60 * 10); // 10 min
  if (error || !data?.signedUrl) return { error: error?.message || 'Falha gerando o link do PDF' };
  return { url: data.signedUrl };
}

/**
 * Extrai os insights da resposta crua do modelo de forma tolerante. Tenta, em
 * ordem: (1) JSON do texto limpo, (2) primeiro objeto {...} embutido (caso o
 * modelo adicione preâmbulo), (3) primeiro array [...] cru. Aceita tanto
 * `{ insights: [...] }` quanto um array direto. Retorna até 3 strings ou null.
 */
function extractInsights(raw: string | null | undefined): string[] | null {
  const text = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  if (!text) return null;

  const candidates = [text];
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) candidates.push(objMatch[0]);
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) candidates.push(arrMatch[0]);

  for (const cand of candidates) {
    try {
      const parsed = JSON.parse(cand);
      const arr = Array.isArray(parsed) ? parsed : parsed?.insights;
      if (Array.isArray(arr)) {
        const insights = arr.filter((s: any) => typeof s === 'string' && s.trim()).slice(0, 3);
        if (insights.length >= 1) return insights;
      }
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

/**
 * Gera 3 insights executivos via LLM, salva em colaboradores.insights_executivos
 * com timestamp. Reusa cache se < 30 dias e `force` for false.
 */
export async function gerarInsightsExecutivos(opts: any = {}) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };

    const colab: any = await findColabByEmail(email, COLS);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const force = !!opts.force;
    if (!force && Array.isArray(colab.insights_executivos) && colab.insights_executivos_at) {
      const age = Date.now() - new Date(colab.insights_executivos_at).getTime();
      if (age < INSIGHTS_CACHE_MAX_AGE_MS) {
        return { insights: colab.insights_executivos, cached: true };
      }
    }

    const arquetipo = derivarArquetipo(colab.perfil_dominante);
    const tags = derivarTagsExecutivas(colab);
    const prompt = buildInsightsExecutivosPrompt({ colab, arquetipo, tags });
    const system = 'Você é um consultor sênior de desenvolvimento humano da Vertho. DISC é tendência, não sentença. Nunca cite score numérico. Responda APENAS com JSON válido no formato { "insights": ["...", "...", "..."] }, sem markdown nem comentários.';

    const { getModelForTask } = await import('@/lib/ai-tasks');
    const model = await getModelForTask(colab.empresa_id, 'insights_executivos');

    // Geração tolerante a falhas: extração de JSON robusta + 1 retry. Antes,
    // qualquer preâmbulo/markdown/truncamento derrubava o JSON.parse e os
    // insights ficavam null silenciosamente, sem nova tentativa. Tokens 800 →
    // 1500 evita truncar os 3 insights no meio (o que invalidava o JSON).
    let insights: string[] | null = null;
    for (let attempt = 1; attempt <= 2 && !insights; attempt++) {
      try {
        const raw = await callAI(system, prompt, { model }, 1500);
        insights = extractInsights(raw);
        if (!insights) console.warn(`[gerarInsightsExecutivos] tentativa ${attempt}: resposta sem JSON de insights válido`);
      } catch (e: any) {
        console.warn(`[gerarInsightsExecutivos] tentativa ${attempt} falhou:`, e?.message);
      }
    }

    if (!insights || insights.length < 1) {
      return { error: 'Nenhum insight retornado pelo modelo' };
    }

    const sb = createSupabaseAdmin();
    await sb.from('colaboradores')
      .update({ insights_executivos: insights, insights_executivos_at: new Date().toISOString() })
      .eq('id', colab.id).eq('empresa_id', colab.empresa_id);

    return { insights, cached: false };
  } catch (err) {
    console.error('[gerarInsightsExecutivos]', err);
    return { error: err?.message || 'Erro ao gerar insights' };
  }
}
