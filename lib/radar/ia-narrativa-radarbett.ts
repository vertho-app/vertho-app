import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { stableJsonHash } from './hash';
import type {
  Escola,
  SaebSnapshot,
  IdebSnapshot,
  EnemEscolaSnapshot,
  EscolaBenchmarkRow,
} from './queries';

const PROMPT_VERSION = 'radarbett-narrativa-v1';
// Modelo primário do glimpse radarbett. Pode ser sobrescrito por env.
const MODEL_PRIMARY = process.env.RADARBETT_AI_MODEL || 'gpt-5.4-mini';
const MODEL_FALLBACK = 'claude-sonnet-4-6';

export type NarrativaRadarbett = {
  resumo: string;
  modelo_usado: string;
};

const FALLBACK: NarrativaRadarbett = {
  resumo: '',
  modelo_usado: 'fallback',
};

const SYSTEM = `Você é analista educacional sênior do Vertho Mentor IA escrevendo a leitura institucional pública (glimpse) de uma escola na plataforma Radar Vertho — versão Bett 2026.

REGRAS RÍGIDAS:
1. Use APENAS os dados estruturados fornecidos. Nunca invente números, anos ou comparações.
2. Cite ano e fonte ao mencionar números (Saeb/INEP, Ideb/INEP, ENEM/INEP, Censo/INEP, SARESP/Seduc-SP).
3. Quando o INSE da escola estiver disponível, contextualize com "INSE Grupo N (escala 1=mais alto, 6=mais baixo)". Quando houver benchmarks de pares INSE/microrregião, use-os para comparações justas em vez de comparar com média geral.
4. ENEM: compare com a média da rede da escola (privada vs pública vs federal) — não com média nacional genérica.
5. Tom institucional, técnico-pedagógico. SEM linguagem promocional, SEM persona "BETO", SEM tom alarmista.
6. Foque em onde há gap pedagógico ou de gestão (frentes em que a Vertho atua) — não em infraestrutura física.
7. Português brasileiro formal mas acessível.

FORMATO DE SAÍDA: APENAS o texto do parágrafo, sem aspas externas, sem JSON, sem prefixo. Máximo 380 caracteres.`;

async function gerarComFallback(systemPrompt: string, userPrompt: string): Promise<NarrativaRadarbett | null> {
  // 1. Modelo primário (gpt-5.4-mini ou env override)
  if (process.env.OPENAI_API_KEY) {
    try {
      const resp = await callAI(systemPrompt, userPrompt, { model: MODEL_PRIMARY }, 600, { temperature: 0.4 });
      const txt = String(resp || '').trim().replace(/^["']|["']$/g, '');
      if (txt.length >= 40) return { resumo: txt.slice(0, 1200), modelo_usado: MODEL_PRIMARY };
      console.warn(`[radarbett-narrativa] ${MODEL_PRIMARY} retornou texto muito curto`);
    } catch (err) {
      console.error(`[radarbett-narrativa] ${MODEL_PRIMARY} falhou, tentando Claude:`, err);
    }
  }
  // 2. Fallback Claude
  try {
    const resp = await callAI(systemPrompt, userPrompt, { model: MODEL_FALLBACK }, 600, { temperature: 0.4 });
    const txt = String(resp || '').trim().replace(/^["']|["']$/g, '');
    if (txt.length >= 40) return { resumo: txt.slice(0, 1200), modelo_usado: MODEL_FALLBACK };
    console.warn('[radarbett-narrativa] Claude também retornou texto muito curto');
  } catch (err) {
    console.error('[radarbett-narrativa] Claude fallback falhou:', err);
  }
  return null;
}

async function getCached(scopeId: string, dadosHash: string): Promise<NarrativaRadarbett | null> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('diag_analises_ia')
    .select('conteudo, modelo')
    .eq('scope_type', 'escola')
    .eq('scope_id', scopeId)
    .eq('prompt_version', PROMPT_VERSION)
    .eq('dados_hash', dadosHash)
    .maybeSingle();
  const c = (data as any)?.conteudo;
  if (typeof c?.resumo === 'string' && c.resumo.length >= 20) {
    return { resumo: c.resumo, modelo_usado: c.modelo_usado || (data as any)?.modelo || 'cache' };
  }
  return null;
}

async function saveCache(scopeId: string, dadosHash: string, c: NarrativaRadarbett) {
  const sb = createSupabaseAdmin();
  await sb.from('diag_analises_ia').upsert(
    {
      scope_type: 'escola',
      scope_id: scopeId,
      prompt_version: PROMPT_VERSION,
      dados_hash: dadosHash,
      conteudo: c,
      modelo: c.modelo_usado,
    },
    { onConflict: 'scope_type,scope_id,prompt_version,dados_hash' },
  );
}

export async function getNarrativaRadarbettEscola(
  escola: Escola,
  saeb: SaebSnapshot[],
  opts: {
    generateIfMissing?: boolean;
    censo?: any;
    ideb?: IdebSnapshot[];
    enem?: EnemEscolaSnapshot[];
    benchmarks?: EscolaBenchmarkRow[];
  } = { generateIfMissing: true },
): Promise<NarrativaRadarbett> {
  const enem = opts.enem || [];
  const ideb = opts.ideb || [];
  const benchmarks = opts.benchmarks || [];
  const censoScores = opts.censo
    ? {
        basica: opts.censo.score_basica,
        pedagogica: opts.censo.score_pedagogica,
        acessibilidade: opts.censo.score_acessibilidade,
        conectividade: opts.censo.score_conectividade,
      }
    : null;
  const dadosHash = stableJsonHash({
    inep: escola.codigo_inep,
    rede: escola.rede,
    inse: escola.inse_grupo,
    saeb: saeb.slice(0, 12),
    ideb: ideb.slice(0, 8),
    enem: enem.slice(0, 2),
    censoScores,
    benchmarks: benchmarks.map((b) => ({ scope: b.scope, ideb_5ef: b.ideb_5ef, ideb_9ef: b.ideb_9ef, ideb_3em: b.ideb_3em, inse_grupo: b.inse_grupo })),
  });

  const cached = await getCached(escola.codigo_inep, dadosHash);
  if (cached) return cached;
  if (!opts.generateIfMissing) return FALLBACK;

  const benchmarkMicro = benchmarks.find((b) => b.scope === 'microrregiao');
  const benchmarkEstado = benchmarks.find((b) => b.scope === 'estado');

  const partes: string[] = [
    `Escola: ${escola.nome} (INEP ${escola.codigo_inep})`,
    `Município: ${escola.municipio}/${escola.uf} · Rede: ${escola.rede || 'não informada'}`,
    `Microrregião: ${escola.microrregiao || 'não informada'} · Zona: ${escola.zona || 'não informada'}`,
    `INSE Grupo da escola: ${escola.inse_grupo ?? 'não informado'} (escala 1=mais alto, 6=mais baixo)`,
  ];
  if (benchmarkMicro) {
    partes.push(
      '',
      `Benchmark da microrregião (média entre escolas da microrregião com INSE comparável):`,
      JSON.stringify({
        ideb_5ef: benchmarkMicro.ideb_5ef,
        ideb_9ef: benchmarkMicro.ideb_9ef,
        ideb_3em: benchmarkMicro.ideb_3em,
        saeb_5ef_lp: benchmarkMicro.saeb_5ef_lp,
        saeb_5ef_mat: benchmarkMicro.saeb_5ef_mat,
        saeb_9ef_lp: benchmarkMicro.saeb_9ef_lp,
        saeb_9ef_mat: benchmarkMicro.saeb_9ef_mat,
        saeb_3em_lp: benchmarkMicro.saeb_3em_lp,
        saeb_3em_mat: benchmarkMicro.saeb_3em_mat,
        inse_grupo_referencia: benchmarkMicro.inse_grupo,
        qtd_escolas: benchmarkMicro.qtd_escolas,
      }, null, 2),
    );
  }
  if (benchmarkEstado) {
    partes.push(
      '',
      `Benchmark estadual (UF ${escola.uf}):`,
      JSON.stringify({
        ideb_5ef: benchmarkEstado.ideb_5ef,
        ideb_9ef: benchmarkEstado.ideb_9ef,
        ideb_3em: benchmarkEstado.ideb_3em,
        qtd_escolas: benchmarkEstado.qtd_escolas,
      }, null, 2),
    );
  }
  if (saeb.length) {
    partes.push('', `Saeb (mais recente primeiro):`, JSON.stringify(saeb.slice(0, 10), null, 2));
  }
  if (ideb.length) {
    partes.push('', `Ideb (resultados e metas oficiais INEP):`, JSON.stringify(ideb.slice(0, 8), null, 2));
  }
  if (enem.length) {
    partes.push(
      '',
      `ENEM (microdados por escola, somente snapshots públicos):`,
      JSON.stringify(enem.slice(0, 2), null, 2),
    );
  }
  if (censoScores) {
    partes.push('', `Infraestrutura — scores 0-100 (Censo Escolar):`, JSON.stringify(censoScores, null, 2));
  }
  partes.push('', 'Escreva o parágrafo da leitura institucional do glimpse.');

  const parsed = await gerarComFallback(SYSTEM, partes.join('\n'));
  if (parsed) {
    saveCache(escola.codigo_inep, dadosHash, parsed).catch(() => {});
    return parsed;
  }
  return FALLBACK;
}

const BOT_UA_RE =
  /bot|crawler|spider|crawl|googlebot|bingbot|yandex|baidu|duckduck|slurp|facebookexternalhit|whatsapp|telegram|twitter|preview|lighthouse|headless|chrome-lighthouse|gptbot|chatgpt|anthropic|perplexity/i;

export function isLikelyBotRadarbett(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_UA_RE.test(userAgent);
}
