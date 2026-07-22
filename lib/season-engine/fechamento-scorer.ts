/**
 * NÚCLEO do scorer do fechamento (Cenário B) — FONTE ÚNICA entre a rota
 * /api/temporada/evaluation (fluxo do colaborador) e a regeneração da
 * auditoria-sem14 (admin), que mantinha um clone SEM as regras novas
 * (trava do piloto, spec_version, régua temporal, retry/guard de narrativa).
 *
 * PURO por contrato: monta prompts, chama IA, parseia, sanitiza, aplica
 * trava e audita. NÃO toca banco e NÃO decide persistência — insumos vêm
 * prontos (e já mascarados de PII) e o output volta mascarado; os CALLERS
 * fazem unmask + persistência.
 *
 * O retorno carrega metadados operacionais (tentativas, sanitização,
 * narrativa, spec, warnings) pra tela admin e debugging sem vasculhar
 * transcript.
 */

import { callAI } from '@/actions/ai-client';
import { promptEvolutionScenarioScore, validateEvolutionScenarioScore } from './prompts/evolution-scenario';
import { promptEvolutionScenarioCheck, validateEvolutionScenarioCheck } from './prompts/evolution-scenario-check';
import { aplicarTravaPiloto, sanitizarNarrativaPiloto } from './piloto-trava';
import { fundirArguicao } from './fusao-arguicao';
import { parseJsonIA } from '@/lib/ai-json';
import { DEFAULT_TASK_MODELS } from '@/lib/ai-tasks';
import type { ProgramaConfig } from './programa-config';
import type { ArguicaoExtracao } from './arguicao';

export interface PontuarFechamentoArgs {
  competencia: string;
  /** Já enriquecidos com régua (n1..n4) + nota_atual fresh. */
  descritores: any[];
  cenario: string;
  /** Já mascarada de PII pelo caller. */
  resposta: string;
  /** Já mascarado de PII pelo caller. */
  nomeColab: string;
  perfilDominante?: string | null;
  /** Já mascaradas de PII pelo caller. */
  evidenciasAcumuladas?: string;
  acumuladoPrimaria?: unknown;
  /** Config resolvida da TRILHA (carimbo) — dá a régua temporal e o modo. */
  config: ProgramaConfig;
  /** Presente só na REGERAÇÃO da auditoria-sem14 (2ª rodada com feedback). */
  regeracao?: {
    feedbackAuditoria: string;
  };
  /**
   * Extração da ARGUIÇÃO (Fase A). Quando presente, a nota do cenário é
   * MODULADA (fusão determinística, ±0,5 no código) ANTES da trava piloto.
   * Ausente = fechamento sem arguição (nota do cenário direta).
   */
  evidenciasArguicao?: ArguicaoExtracao | null;
  /**
   * Modelo da 2ª IA (auditor) do sem14. Opcional — se ausente, cai no default
   * da task (`DEFAULT_TASK_MODELS.sem14_check`). Passe o resolvido por empresa
   * (getModelForTask) para override por tenant.
   */
  checkModel?: string;
}

export interface PontuarFechamentoMeta {
  tentativas: number;
  sanitizacaoAplicada: boolean;
  narrativaPilotoOk: boolean;
  specVersion: string | null;
  /** Quantos descritores a arguição modulou (Fase B). 0 = sem arguição/sem ajuste. */
  arguicaoAjustados?: number;
  warnings: string[];
}

export type PontuarFechamentoResultado =
  | { ok: true; parsed: any; auditoria: any; meta: PontuarFechamentoMeta }
  | { ok: false; erro: string; meta: PontuarFechamentoMeta };

/** Régua temporal + contexto de programa pros prompts (regular = 14/13). */
export function reguaTemporalDoPrograma(config: ProgramaConfig) {
  const isPiloto = config.modo === 'piloto';
  // Semanas de CONTEÚDO da degustação (piloto = 2; custom = 1–4) — dirige a
  // narrativa do scorer e o sanitizer de duração.
  const semanasDegustacao = config.slotsConteudo?.length || 2;
  return {
    isPiloto,
    semanasDegustacao,
    semanaFinal: config.semanaCenarioB,
    semanasEvidencia: config.semanaAcumulada,
    notaPrograma: !isPiloto
      ? ''
      : semanasDegustacao === 1
        ? 'Este é um PILOTO de 1 semana (degustação). O fechamento demonstra o método de avaliação — NÃO mede evolução. Não trate a janela curta de evidências como falha do colaborador; avalie o que a semana única sustenta.'
        : `Este é um PILOTO de ${semanasDegustacao} semanas (degustação). O fechamento demonstra o método de avaliação — NÃO mede evolução. Não trate a janela curta de evidências como falha do colaborador; avalie o que as ${semanasDegustacao} semanas sustentam.`,
  };
}

const APPENDIX_SCORER_REGEN = (nomeColab: string, feedbackAuditoria: string) => `

ATENÇÃO: Esta é uma REGERAÇÃO COM FEEDBACK da avaliação final.

REGRAS ADICIONAIS OBRIGATÓRIAS:
1. O nome do colaborador é "${nomeColab}". No resumo_avaliacao, use SOMENTE "${nomeColab}".
2. NÃO use nomes de personagens do cenário no resumo_avaliacao.
3. Você recebeu feedback da auditoria anterior. Use esse feedback para corrigir APENAS os pontos realmente frágeis.
4. NÃO descarte automaticamente o que já estava defensável.
5. NÃO corrija por estilo. Corrija por coerência metodológica.
6. Se a auditoria anterior apontou supervalorização do cenário, ignorância do acumulado, delta incoerente, justificativa genérica ou ausência de limites — esses pontos precisam ser explicitamente tratados.
7. Preserve a lógica de triangulação: cenário não manda sozinho, acumulado não pode ser apagado, regressão é possível, evolução não deve ser forçada.

FEEDBACK DA AUDITORIA ANTERIOR:
${feedbackAuditoria}

Produza uma nova versão MAIS DEFENSÁVEL da avaliação final.`;

const APPENDIX_CHECK_REGEN = (feedbackAuditoria: string) => `

ATENÇÃO: Esta é uma AUDITORIA DE SEGUNDA RODADA.
Você está auditando uma NOVA VERSÃO do scoring final, gerada após feedback da auditoria anterior.

REGRAS ADICIONAIS OBRIGATÓRIAS:
1. Não trate esta rodada como auditoria cega de primeira passagem.
2. Compare a nova versão com os problemas apontados anteriormente.
3. Sua tarefa é dizer:
   - o que foi corrigido
   - o que foi corrigido parcialmente
   - o que ainda permaneceu frágil
   - se surgiu algum novo problema
4. Se um problema anterior foi resolvido, reconheça explicitamente.
5. Se um problema anterior persistiu, sinalize claramente.
6. Se a nova versão criou novo erro metodológico, destaque.
7. Continue auditando a DEFENSABILIDADE da triangulação, não a "beleza" do texto.
8. Mantenha rigor com: 4.0 sem base, cenário supervalorizado, acumulado ignorado, delta incoerente, justificativa genérica, ausência de limites.

CONTEXTO DA AUDITORIA ANTERIOR:
${feedbackAuditoria}

EXPECTATIVA DESTA RODADA:
- resumo_auditoria deve dizer se a nova versão ficou melhor resolvida, parcialmente corrigida ou ainda frágil
- alertas devem refletir problemas mantidos E novos problemas
- ajustes_sugeridos devem focar no que ainda precisa ser corrigido
- Não seja complacente só porque houve reprocessamento
- Reconheça melhora real quando ela aconteceu`;

export async function pontuarFechamento(args: PontuarFechamentoArgs): Promise<PontuarFechamentoResultado> {
  const { competencia, descritores, cenario, resposta, nomeColab, perfilDominante, evidenciasAcumuladas, acumuladoPrimaria, config, regeracao, evidenciasArguicao, checkModel } = args;
  const { isPiloto, semanaFinal, semanasEvidencia, notaPrograma } = reguaTemporalDoPrograma(config);

  const meta: PontuarFechamentoMeta = {
    tentativas: 0,
    sanitizacaoAplicada: false,
    narrativaPilotoOk: true,
    specVersion: null,
    warnings: [],
  };

  // ── Scorer (1ª IA) — até 2 tentativas: a 2ª só roda se o parse falhou OU
  // (piloto) a narrativa saiu com régua temporal errada e a sanitização
  // cirúrgica não resolveu ("14 semanas" numa degustação de 2). ──
  const { system, user } = promptEvolutionScenarioScore({
    competencia, descritores, cenario, resposta, nomeColab, perfilDominante,
    evidenciasAcumuladas, acumuladoPrimaria,
    semanaFinal, semanasEvidencia, notaPrograma,
  });
  const systemScore = regeracao ? system + APPENDIX_SCORER_REGEN(nomeColab, regeracao.feedbackAuditoria) : system;

  let parsed: any = {};
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    meta.tentativas = tentativa;
    const r = await callAI(systemScore, user, {}, 10000, { taskKey: 'sem14_scorer' });
    try {
      parsed = validateEvolutionScenarioScore(parseJsonIA(r));
    } catch (e: any) {
      meta.warnings.push(`parse do scorer falhou (tentativa ${tentativa}): ${e?.message}`);
      parsed = {};
      continue;
    }
    if (isPiloto) {
      const san = sanitizarNarrativaPiloto(parsed, config.slotsConteudo?.length || 2);
      parsed = san.parsed;
      meta.narrativaPilotoOk = san.ok;
      if (san.alterou) meta.sanitizacaoAplicada = true;
      if (!san.ok) {
        meta.warnings.push(`narrativa piloto com régua temporal errada (tentativa ${tentativa})`);
        continue;
      }
    }
    break;
  }

  // Guard: avaliação vazia ou narrativa piloto ainda inválida → NUNCA publica.
  if (!Array.isArray(parsed?.avaliacao_por_descritor) || parsed.avaliacao_por_descritor.length === 0 || !meta.narrativaPilotoOk) {
    return { ok: false, erro: 'A avaliação automática falhou ao processar a resposta (parse/narrativa inválida).', meta };
  }

  // FUSÃO da arguição (Fase B) — MODULA a nota do cenário (±0,5, clamp no
  // código; derivada da classificação da extração, sem IA nova). Roda ANTES
  // da trava piloto. Sem evidências → no-op (nota do cenário intacta).
  if (evidenciasArguicao) {
    const fus = fundirArguicao(parsed, evidenciasArguicao);
    parsed = fus.parsed;
    meta.arguicaoAjustados = fus.ajustados;
  }

  // TRAVA piloto-only (piso no baseline; bruto + piso_aplicado preservados;
  // spec_version carimbada). Aplica sobre a nota FUNDIDA. Demais modos: reto.
  if (isPiloto) {
    parsed = aplicarTravaPiloto(parsed, descritores);
  }
  meta.specVersion = parsed?.spec_version ?? null;

  // Validação-aviso: resumo deve falar com o colaborador, não com personagens
  const resumoText = parsed.resumo_avaliacao?.mensagem_geral || '';
  if (resumoText && nomeColab && !resumoText.includes(nomeColab) && resumoText.length > 50) {
    meta.warnings.push('resumo_avaliacao pode não conter o nome do colaborador');
  }

  // ── Check (2ª IA) — nunca derruba o fechamento; falha vira warning ──
  let auditoria: any = null;
  try {
    const { system: sCheck, user: uCheck } = promptEvolutionScenarioCheck({
      competencia, descritores, cenario, resposta,
      avaliacaoPrimaria: parsed,
      evidenciasAcumuladas,
      semanaFinal, semanasEvidencia, notaPrograma,
    });
    const systemCheck = regeracao ? sCheck + APPENDIX_CHECK_REGEN(regeracao.feedbackAuditoria) : sCheck;
    // 2ª IA (auditor) configurável — default GPT 5.6 Luna (DEFAULT_TASK_MODELS.sem14_check).
    // Caller pode passar checkModel resolvido por empresa; senão cai no default da task.
    const sem14CheckModel = checkModel || DEFAULT_TASK_MODELS['sem14_check'];
    const rCheck = await callAI(systemCheck, uCheck, sem14CheckModel ? { model: sem14CheckModel } : {}, 8000, { taskKey: 'sem14_check' });
    auditoria = validateEvolutionScenarioCheck(parseJsonIA(rCheck));

    if (regeracao && auditoria?.resumo_auditoria) {
      const resumo = auditoria.resumo_auditoria.toLowerCase();
      const temComparacao = ['corrig', 'melhora', 'manteve', 'persist', 'anterior', 'segunda', 'resolv', 'parcial'].some(w => resumo.includes(w));
      if (!temComparacao) meta.warnings.push('resumo_auditoria da 2ª rodada pode não estar comparando com a anterior');
    }
  } catch (e: any) {
    meta.warnings.push(`check da 2ª IA falhou: ${e?.message}`);
  }

  return { ok: true, parsed, auditoria, meta };
}
