/**
 * CORREÇÃO DE TEXTO da avaliação da IA4: reescreve só os trechos que o check da 2ª IA apontou, sem tocar em nota,
 * nível nem consolidação (decisão do dono, 16/10/2026, Amazon Bowling: "corrigir só o texto apontado").
 *
 * Por que não a reavaliação (`lib/ia4-reavaliacao.ts`): ela REVISA a nota, e medido em Macaé (12/08/2026) reavaliar
 * acima de 65 pontos no check tende a piorar (−7,6 em média). Na Amazon, 23 das 24 avaliações em "revisar" estavam
 * entre 66 e 86, e todas pelo mesmo motivo: o texto atribuía à resposta um detalhe que só estava no cenário (item
 * crítico A2) ou afirmava traço/barreira que as respostas não mostram (F1). Mexer na nota também mudaria a competência
 * escolhida para a pessoa (a menor nota), que já decidiu blueprint, PDI e trilha.
 *
 * Três garantias, todas em código:
 *  1. NÚMEROS E ESTRUTURA VÊM DA ORIGINAL (`mesclarSoTexto`): nota, nível, confiança, consolidação, itens de lista de
 *     objetos e qualquer campo que o modelo omitir. Da correção só entra texto, no mesmo lugar.
 *  2. A CANDIDATA É CONFERIDA PELO MESMO CHECK, EM MEMÓRIA, antes de gravar; só é adotada se o veredito melhorar, ou
 *     empatar com nota maior (`adotarCorrecao`). Senão, nada é gravado.
 *  3. Sem o nome da pessoa na ida (decisão 10b); a volta é desmascarada antes da mescla.
 * O histórico fica em `_correcao_texto`, não em `_revisao`: a fila de reavaliação continua enxergando a resposta como
 * não reavaliada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { callAI } from '@/actions/ai-client';
import { extractJSON } from '@/actions/utils';
import { getModelForTask } from '@/lib/ai-tasks';
import { maskColaborador, maskTextPII, maskDeepPII, unmaskDeepPII } from '@/lib/pii-masker';
import { neutralizarFala } from '@/lib/prompt-seguro';
import { montarCheckIA4Prompt, processCheckResult, IA4_CHECK_CALL_OPTIONS } from '@/lib/check-ia4-core';
import { comModeloDaTask, IA4_CALL_OPTIONS, IA4_MAX_TOKENS } from '@/lib/ia4-avaliacao';
import { textoDoFeedback } from '@/lib/ia4-feedback-idioma';

/** Texto que é número ou nível ("2.33", "3", "N2"): conta como número e vem da original. */
const PARECE_NUMERO = /^\s*(-?\d+([.,]\d+)?|N[1-4])\s*$/i;

/**
 * Chaves que vêm INTEIRAS da original, em qualquer profundidade, mesmo sendo texto: a consolidação (as travas são
 * lista de texto), os nomes que identificam descritor e competência (renomear quebraria o vínculo com a régua) e as
 * categorias (sustentação, tom). Achado do próprio teste: sem isto a correção trocava `travas_aplicadas`.
 */
const CHAVES_FIXAS = new Set([
  'consolidacao', 'insumos_consolidacao', 'profissional', 'cargo', 'competencia', 'nome', 'descritor', 'cod_desc',
  'sustentacao', 'tom_base', '_revisao', '_correcao_texto',
]);

/**
 * Mescla a correção na original levando SÓ texto: onde a original tem número, booleano, nulo ou texto-número, fica a
 * original; onde tem texto, entra o texto da correção (se ela trouxer texto ali). Lista de textos pode crescer ou
 * encolher (tirar uma barreira não demonstrada é uma correção legítima); lista de objetos só é mesclada item a item
 * quando tem o mesmo tamanho, senão fica a original. Chave que só existe na correção é ignorada. PURO.
 */
export function mesclarSoTexto(original: any, correcao: any): any {
  if (original === null || original === undefined) return original;
  if (typeof original === 'number' || typeof original === 'boolean') return original;
  if (typeof original === 'string') {
    if (PARECE_NUMERO.test(original)) return original;
    return typeof correcao === 'string' && correcao.trim() ? correcao : original;
  }
  if (Array.isArray(original)) {
    if (!Array.isArray(correcao)) return original;
    const soTexto = original.every((x) => typeof x === 'string' && !PARECE_NUMERO.test(x));
    if (soTexto) return correcao.every((x: unknown) => typeof x === 'string') ? correcao : original;
    if (correcao.length !== original.length) return original;
    return original.map((item, i) => mesclarSoTexto(item, correcao[i]));
  }
  if (typeof original === 'object') {
    const c = correcao && typeof correcao === 'object' && !Array.isArray(correcao) ? correcao : {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(original)) out[k] = CHAVES_FIXAS.has(k) ? original[k] : mesclarSoTexto(original[k], c[k]);
    return out;
  }
  return original;
}

const RANK: Record<string, number> = { revisar: 1, aprovado_com_ajustes: 2, aprovado: 3 };

/** Adota a correção só se o veredito do check melhorar, ou empatar com nota maior. PURO. */
export function adotarCorrecao(antes: { status: string | null; nota: number | null }, depois: { status: string | null; nota: number | null }): boolean {
  const ra = RANK[antes.status || ''] ?? 0;
  const rd = RANK[depois.status || ''] ?? 0;
  if (rd !== ra) return rd > ra;
  return rd > 0 && Number(depois.nota ?? -1) > Number(antes.nota ?? -1);
}

const SYSTEM_CORRECAO = `Você é o revisor de TEXTO das avaliações da Vertho.

Recebe uma avaliação (JSON) e os pontos que a auditoria (2ª IA) apontou nela. Sua tarefa é REESCREVER SÓ OS TRECHOS APONTADOS, para que digam apenas o que as respostas da pessoa mostram.

REGRAS:
- O CENÁRIO NÃO É EVIDÊNCIA. Não atribua à resposta um fato, nome, número ou detalhe que só aparece no cenário ou nas perguntas. Se a resposta não disse, o texto não pode dizer que ela disse.
- Não afirme traço, tendência ou barreira da pessoa que as respostas não demonstram. Prefira descrever o que a resposta fez ou não fez neste cenário.
- Quando um ponto apontado pedir uma ação para um gap, escreva a ação de forma concreta e observável.
- NÃO ALTERE nenhum número, nota, nível, confiança, consolidação ou lista de descritores. Eles estão certos e são fixados pelo sistema.
- NÃO mexa no que não foi apontado. Mantenha o idioma, o tom e a estrutura de cada texto.
- Devolva o JSON COMPLETO da avaliação, com a MESMA estrutura e as MESMAS chaves que recebeu, só com os trechos apontados reescritos.

RETORNE APENAS JSON VÁLIDO, sem markdown.`;

export interface ResultadoCorrecao {
  success: boolean;
  error?: string;
  antes?: { status: string | null; nota: number | null };
  depois?: { status: string | null; nota: number | null };
  adotada?: boolean;
  gravada?: boolean;
}

/**
 * Corrige o texto de UMA avaliação em "revisar"/"aprovado com ajustes". Com `aplicar: false` só mede (gera a candidata,
 * confere e devolve os dois vereditos, sem gravar). Headless: `sb` é o client service-role.
 */
export async function corrigirTextoAvaliacaoCore(
  sb: SupabaseClient, alvo: { empresaId: string; respostaId: string }, opts: { aplicar: boolean },
): Promise<ResultadoCorrecao> {
  const { empresaId, respostaId } = alvo;
  try {
    // Client service-role (o banco não filtra): o tenant vai na cadeia.
    const { data: resp, error } = await sb.from('respostas')
      .select('id, empresa_id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, avaliacao_ia, nivel_ia4, payload_ia4, status_ia4')
      .eq('empresa_id', empresaId).eq('id', respostaId).single();
    if (error || !resp) return { success: false, error: `resposta: ${error?.message || 'não encontrada'}` };
    const original = typeof resp.avaliacao_ia === 'string' ? JSON.parse(resp.avaliacao_ia) : resp.avaliacao_ia;
    const checkAntes = typeof resp.payload_ia4 === 'string' ? JSON.parse(resp.payload_ia4) : resp.payload_ia4;
    if (!original || !checkAntes) return { success: false, error: 'sem avaliação ou sem check para corrigir' };
    const antes = { status: resp.status_ia4 ?? null, nota: Number.isFinite(Number(checkAntes.nota)) ? Number(checkAntes.nota) : null };

    // O prompt do check traz cenário, perguntas e respostas JÁ mascarados: a correção vê exatamente o que o auditor viu.
    const ctx = await montarCheckIA4Prompt(sb, resp, resp.empresa_id);
    const pii = ctx.pii;
    const apontados = [...(checkAntes.itens_falhos || [])].map((s: unknown) => maskTextPII(neutralizarFala(String(s)), pii));
    const user = [
      ctx.prefix,
      `═══ RESPOSTAS DA PESSOA ═══\nR1: ${maskTextPII(neutralizarFala(String(resp.r1 || '')), pii) || '(sem resposta)'}\nR2: ${maskTextPII(neutralizarFala(String(resp.r2 || '')), pii) || '(sem resposta)'}\nR3: ${maskTextPII(neutralizarFala(String(resp.r3 || '')), pii) || '(sem resposta)'}\nR4: ${maskTextPII(neutralizarFala(String(resp.r4 || '')), pii) || '(sem resposta)'}`,
      `═══ AVALIAÇÃO (JSON) ═══\n${JSON.stringify(maskDeepPII(original, pii), null, 2)}`,
      `═══ PONTOS APONTADOS PELA AUDITORIA ═══\n${apontados.map((a) => `- ${a}`).join('\n') || '(nenhum)'}`,
    ].join('\n\n');

    const cfg = await comModeloDaTask({}, resp.empresa_id);
    const bruto = await callAI(SYSTEM_CORRECAO, user, cfg, IA4_MAX_TOKENS, { ...IA4_CALL_OPTIONS, taskKey: 'ia4_avaliacao', empresaId: resp.empresa_id, colaboradorId: resp.colaborador_id ?? null, locale: 'pt-BR' });
    const doModelo = await extractJSON(bruto);
    if (!doModelo || typeof doModelo !== 'object') return { success: false, error: 'a IA não devolveu a avaliação corrigida', antes };
    const candidata = mesclarSoTexto(original, unmaskDeepPII(doModelo, pii));

    // O mesmo check, sobre a candidata, sem gravar.
    const conf = await montarCheckIA4Prompt(sb, { ...resp, avaliacao_ia: candidata }, resp.empresa_id);
    const model = await getModelForTask(resp.empresa_id, 'ia4_check');
    // As MESMAS opções do check de produção (`checarUmaRespostaCore`): o veredito da candidata tem de ser comparável.
    const brutoCheck = await callAI(conf.system, conf.user, { model }, 8192, {
      ...IA4_CHECK_CALL_OPTIONS, cachedUserPrefix: conf.prefix, taskKey: 'ia4_check', empresaId: resp.empresa_id, colaboradorId: resp.colaborador_id ?? null,
    });
    const { status, check } = processCheckResult(await extractJSON(brutoCheck), candidata, conf.pii);
    if (!check) return { success: false, error: 'o check da candidata não devolveu nota', antes };
    const depois = { status, nota: Number(check.nota) };
    const adotada = adotarCorrecao(antes, depois);
    if (!adotada || !opts.aplicar) return { success: true, antes, depois, adotada, gravada: false };

    const final = {
      ...candidata,
      _correcao_texto: { avaliacao_anterior: original, check_anterior: checkAntes, status_anterior: resp.status_ia4, corrigido_em: new Date().toISOString() },
    };
    const { data: upd, error: errUpd } = await sb.from('respostas').update({
      avaliacao_ia: final,
      feedback_ia4: textoDoFeedback(candidata.feedback) || null,
      status_ia4: status,
      payload_ia4: check,
    }).eq('id', respostaId).eq('empresa_id', resp.empresa_id).select('id');
    if (errUpd) return { success: false, error: `gravação: ${errUpd.message}`, antes, depois, adotada };
    if (!upd?.length) return { success: false, error: 'gravação: 0 linhas', antes, depois, adotada };
    return { success: true, antes, depois, adotada, gravada: true };
  } catch (e: any) {
    return { success: false, error: String(e?.message || e) };
  }
}
