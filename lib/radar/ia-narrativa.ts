import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { stableJsonHash } from './hash';
import type { Escola, SaebSnapshot, IcaSnapshot } from './queries';

const PROMPT_VERSION_NARRATIVA = 'radar-narrativa-v1';

const SYSTEM_NARRATIVA = `Você é um analista educacional sênior do Vertho Mentor IA escrevendo análises públicas para gestores escolares e secretarias.

REGRAS RÍGIDAS:
1. Use APENAS os dados estruturados fornecidos. Nunca invente números, anos ou comparações.
2. Cite anos e fonte (Saeb/INEP, ICA/INEP) sempre que mencionar um número.
3. Tom institucional, técnico-pedagógico. SEM linguagem promocional, SEM persona "BETO".
4. Se um dado não estiver presente, escreva "dado não disponível" — não preencha lacunas.
5. Foque em: o que o número significa, o que merece atenção, perguntas pedagógicas relevantes.
6. Português brasileiro, formal mas acessível.

FORMATO DE SAÍDA: JSON estrito com:
{
  "resumo": "1-2 parágrafos de leitura geral (até 600 chars)",
  "pontos_atencao": ["item 1", "item 2", ...],  // até 4 itens curtos
  "pontos_destaque": ["item 1", ...],           // até 3 itens curtos
  "perguntas_pedagogicas": ["pergunta 1?", "pergunta 2?", ...] // até 3
}`;

type NarrativaIA = {
  resumo: string;
  pontos_atencao: string[];
  pontos_destaque: string[];
  perguntas_pedagogicas: string[];
};

const FALLBACK: NarrativaIA = {
  resumo: 'Análise contextualizada por IA temporariamente indisponível. Confira a leitura determinística e os dados oficiais abaixo.',
  pontos_atencao: [],
  pontos_destaque: [],
  perguntas_pedagogicas: [],
};

function extractJson(text: string): NarrativaIA | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = fenced ? fenced[1] : text;
    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(json.slice(start, end + 1));
    if (typeof parsed?.resumo !== 'string') return null;
    return {
      resumo: String(parsed.resumo).slice(0, 1200),
      pontos_atencao: Array.isArray(parsed.pontos_atencao) ? parsed.pontos_atencao.slice(0, 4).map(String) : [],
      pontos_destaque: Array.isArray(parsed.pontos_destaque) ? parsed.pontos_destaque.slice(0, 3).map(String) : [],
      perguntas_pedagogicas: Array.isArray(parsed.perguntas_pedagogicas) ? parsed.perguntas_pedagogicas.slice(0, 3).map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Detecta se o User-Agent parece bot/crawler. Pra bots, evitamos disparar
 * IA na primeira visita — eles servem cache se existir, senão veem só a
 * leitura determinística. Humanos sempre disparam (e enchem o cache).
 *
 * Anti-padrão: depender de UA é frágil, mas custo de IA × volume de bot
 * justifica. Custo do erro (bot ler determinística é OK; humano não ver
 * IA é ruim) — viés conservador a favor do bot.
 */
const BOT_UA_RE =
  /bot|crawler|spider|crawl|googlebot|bingbot|yandex|baidu|duckduck|slurp|facebookexternalhit|whatsapp|telegram|twitter|preview|lighthouse|headless|chrome-lighthouse|gptbot|chatgpt|anthropic|perplexity/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // sem UA = trate como bot por segurança
  return BOT_UA_RE.test(userAgent);
}

async function getCached(scopeType: string, scopeId: string, dadosHash: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('diag_analises_ia')
    .select('conteudo')
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId)
    .eq('prompt_version', PROMPT_VERSION_NARRATIVA)
    .eq('dados_hash', dadosHash)
    .maybeSingle();
  if (data && (data as any).conteudo) {
    const c = (data as any).conteudo;
    if (typeof c?.resumo === 'string') return c as NarrativaIA;
  }
  return null;
}

async function saveCache(
  scopeType: string,
  scopeId: string,
  dadosHash: string,
  conteudo: NarrativaIA,
) {
  const sb = createSupabaseAdmin();
  await sb.from('diag_analises_ia').upsert({
    scope_type: scopeType,
    scope_id: scopeId,
    prompt_version: PROMPT_VERSION_NARRATIVA,
    dados_hash: dadosHash,
    conteudo,
    modelo: 'claude-sonnet-4-6',
  }, {
    onConflict: 'scope_type,scope_id,prompt_version,dados_hash',
  });
}

export async function getNarrativaEscola(
  escola: Escola,
  saeb: SaebSnapshot[],
  opts: { generateIfMissing?: boolean } = { generateIfMissing: true },
): Promise<NarrativaIA> {
  const dadosHash = stableJsonHash({ escola: { codigo_inep: escola.codigo_inep, ano_referencia: escola.ano_referencia, inse_grupo: escola.inse_grupo }, saeb });
  const cached = await getCached('escola', escola.codigo_inep, dadosHash);
  if (cached) return cached;

  // Se foi pedido pra não gerar (bot, ou modo économico), retorna fallback
  if (!opts.generateIfMissing) return FALLBACK;

  const userMessage = `Escola: ${escola.nome} (INEP ${escola.codigo_inep})
Município: ${escola.municipio}/${escola.uf} · Rede: ${escola.rede || 'não informada'}
Microrregião: ${escola.microrregiao || 'não informada'} · Zona: ${escola.zona || 'não informada'}
INSE Grupo: ${escola.inse_grupo ?? 'não informado'} (1=mais alto, 6=mais baixo)
Etapas oferecidas: ${(escola.etapas || []).join(', ') || 'não informadas'}

Snapshots Saeb (mais recente primeiro):
${JSON.stringify(saeb.slice(0, 12), null, 2)}

Escreva a análise pública seguindo o formato JSON.`;

  try {
    const resp = await callAI(SYSTEM_NARRATIVA, userMessage, { model: 'claude-sonnet-4-6' }, 1200, { temperature: 0.4 });
    const parsed = extractJson(resp);
    if (parsed) {
      saveCache('escola', escola.codigo_inep, dadosHash, parsed).catch(() => {});
      return parsed;
    }
  } catch (err) {
    console.error('[ia-narrativa] escola falhou', err);
  }
  return FALLBACK;
}

export async function getNarrativaMunicipio(
  municipio: { ibge: string; nome: string; uf: string; totalEscolas: number; redes: Record<string, number> },
  ica: IcaSnapshot[],
  opts: { generateIfMissing?: boolean } = { generateIfMissing: true },
): Promise<NarrativaIA> {
  const dadosHash = stableJsonHash({ ibge: municipio.ibge, totalEscolas: municipio.totalEscolas, ica });
  const cached = await getCached('municipio', municipio.ibge, dadosHash);
  if (cached) return cached;

  if (!opts.generateIfMissing) return FALLBACK;

  const userMessage = `Município: ${municipio.nome}/${municipio.uf} (IBGE ${municipio.ibge})
Total de escolas no Radar: ${municipio.totalEscolas}
Distribuição por rede: ${JSON.stringify(municipio.redes)}

Indicador Criança Alfabetizada — séries históricas:
${JSON.stringify(ica.slice(0, 12), null, 2)}

Escreva a análise pública seguindo o formato JSON.`;

  try {
    const resp = await callAI(SYSTEM_NARRATIVA, userMessage, { model: 'claude-sonnet-4-6' }, 1200, { temperature: 0.4 });
    const parsed = extractJson(resp);
    if (parsed) {
      saveCache('municipio', municipio.ibge, dadosHash, parsed).catch(() => {});
      return parsed;
    }
  } catch (err) {
    console.error('[ia-narrativa] municipio falhou', err);
  }
  return FALLBACK;
}

export const PROMPT_VERSION = PROMPT_VERSION_NARRATIVA;
