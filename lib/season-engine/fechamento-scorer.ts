/**
 * NÚCLEO do scorer do fechamento (Cenário B) — FONTE ÚNICA entre a rota
 * /api/temporada/evaluation (fluxo do colaborador) e a regeneração da
 * auditoria-sem14 (admin), que mantinha um clone SEM as regras novas
 * (trava do piloto, spec_version, régua temporal, retry/guard de narrativa).
 *
 * PURO por contrato: monta prompts, chama IA, parseia, sanitiza, aplica
 * trava e audita. NÃO toca banco e NÃO decide persistência — insumos vêm
 * prontos (e já mascarados de PII) e o output volta mascarado; os CALLERS
 * fazem unmask + persistência (`fechamento-pii.ts`).
 *
 * Ordem (18/09/2026): scorer (nota e rascunho do texto) → fusão da arguição →
 * trava do piloto → anotação do ajuste → REDAÇÃO FINAL (só se alguma nota mudou
 * depois do rascunho) → auditor. A nota nunca muda depois da fusão e da trava;
 * a redação só alinha o texto que a pessoa lê.
 *
 * O retorno carrega metadados operacionais (tentativas, sanitização,
 * narrativa, spec, warnings) pra tela admin e debugging sem vasculhar
 * transcript.
 */

import { callAI } from '@/actions/ai-client';
import { promptEvolutionScenarioScore, validateEvolutionScenarioScore } from './prompts/evolution-scenario';
import { promptEvolutionScenarioCheck, validateEvolutionScenarioCheck } from './prompts/evolution-scenario-check';
import { promptRedacaoFechamento, validarRedacao } from './prompts/fechamento-redacao';
import { aplicarTravaPiloto, sanitizarNarrativaPiloto } from './piloto-trava';
import { anotarAjusteArguicao, fundirArguicao } from './fusao-arguicao';
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
   * Extração da ARGUIÇÃO (Fase A), JÁ MASCARADA pelo caller
   * (`mascararExtracaoArguicao`): desde 18/09/2026 ela vai para a redação final
   * e para o auditor. Quando presente, a nota do cenário é MODULADA (fusão
   * determinística, ±0,5 no código) ANTES da trava piloto.
   * Ausente = fechamento sem arguição (nota do cenário direta).
   */
  evidenciasArguicao?: ArguicaoExtracao | null;
  /**
   * Modelo da 2ª IA (auditor) do sem14. Opcional — se ausente, cai no default
   * da task (`DEFAULT_TASK_MODELS.sem14_check`). Passe o resolvido por empresa
   * (getModelForTask) para override por tenant.
   */
  checkModel?: string;
  /**
   * Instante (epoch ms) até o qual o fechamento inteiro precisa terminar. Quem
   * roda dentro de uma função com `maxDuration` passa o prazo; o scorer e o
   * check recebem `timeoutMs` do que SOBRA, em vez do teto fixo do `callAI`.
   * Ausente (script, admin): tetos de `SCORER_TIMEOUT_MAX_MS` e do check.
   */
  prazoMs?: number;
  /** Atribuição de custo no ledger (sem isto as linhas entram sem empresa). */
  ledger?: { empresaId?: string | null; colaboradorId?: string | null };
}

/**
 * 🔴 POR QUE O SCORER TEM TIMEOUT PRÓPRIO (16/09/2026). Ele pede 10.000 tokens,
 * e o default do `callAI` é 120 s. `Medido:` a única execução que passou em
 * produção levou **119.748 ms** para 7.093 tokens (~59 tok/s), a 0,25 s do corte.
 * Nas outras duas, a chamada foi abortada e a pessoa ficou sem nota. No teto de
 * tokens, a ~59 tok/s, são ~170 s: 210 s dá margem sem estourar a função.
 */
export const SCORER_TIMEOUT_MAX_MS = 210_000;

/**
 * Teto de saída do scorer. Era 10.000 e subiu em 17/09/2026, quando a devolutiva
 * ganhou o FECHO e os PRÓXIMOS PASSOS que a pessoa lê.
 *
 * 📏 `Medido:` 14 execuções ok em 45 dias — saída média de 5.761 tokens e
 * **máxima de 8.372**, a 1.628 do teto antigo. Os dois campos novos somam ~400
 * tokens de prosa (3 a 5 frases + até 3 linhas), então o pior caso passaria a
 * ~8.800 e a folga cairia para menos de 1.200. Truncar aqui não degrada nada: o
 * JSON quebra, o `parseJsonIA` falha e a pessoa fica SEM NOTA.
 *
 * O teto de tempo continua sendo a trava real: a ~59 tok/s medidos, 11.000
 * tokens são ~186 s, dentro dos 210 s de `SCORER_TIMEOUT_MAX_MS`. Subir mais
 * inverteria isso, e o sintoma passaria a ser timeout em vez de truncamento.
 */
export const SCORER_MAX_TOKENS = 11_000;
/** O que fica reservado, depois do scorer, para check + gravação + relatório. */
const RESERVA_POS_SCORER_MS = 45_000;
/** Abaixo disto uma tentativa de scorer não termina: nem começa (a 2ª inclusive). */
export const SCORER_TIMEOUT_MIN_MS = 90_000;
const CHECK_TIMEOUT_MAX_MS = 120_000;
const RESERVA_POS_CHECK_MS = 10_000;
const CHECK_TIMEOUT_MIN_MS = 20_000;

/** `timeoutMs` do scorer para o que sobra do prazo; `null` = não cabe uma tentativa. */
export function timeoutDoScorer(prazoMs: number | undefined, agoraMs: number): number | null {
  if (prazoMs == null) return SCORER_TIMEOUT_MAX_MS;
  const t = Math.min(SCORER_TIMEOUT_MAX_MS, prazoMs - agoraMs - RESERVA_POS_SCORER_MS);
  return t >= SCORER_TIMEOUT_MIN_MS ? t : null;
}

/** `timeoutMs` do check; `undefined` = default do wrapper; `null` = não cabe. */
export function timeoutDoCheck(prazoMs: number | undefined, agoraMs: number): number | null | undefined {
  if (prazoMs == null) return undefined;
  const t = Math.min(CHECK_TIMEOUT_MAX_MS, prazoMs - agoraMs - RESERVA_POS_CHECK_MS);
  return t >= CHECK_TIMEOUT_MIN_MS ? t : null;
}

/**
 * Redação final: saída curta (a devolutiva inteira tem ~600 tokens). O teto
 * folgado evita truncar o JSON, que faria a redação falhar e manter o rascunho.
 */
export const REDACAO_MAX_TOKENS = 3_000;
const REDACAO_TIMEOUT_MAX_MS = 60_000;
/** Depois da redação só sobra gravar; o check se ajusta ao que restar. */
const RESERVA_POS_REDACAO_MS = 10_000;
const REDACAO_TIMEOUT_MIN_MS = 15_000;

/**
 * `timeoutMs` da redação final; `undefined` = default do wrapper; `null` = não
 * cabe. Com o prazo apertado, a redação vem ANTES do check: o texto que a pessoa
 * lê pesa mais que a auditoria, que nunca bloqueia nada.
 */
export function timeoutDaRedacao(prazoMs: number | undefined, agoraMs: number): number | null | undefined {
  if (prazoMs == null) return undefined;
  const t = Math.min(REDACAO_TIMEOUT_MAX_MS, prazoMs - agoraMs - RESERVA_POS_REDACAO_MS);
  return t >= REDACAO_TIMEOUT_MIN_MS ? t : null;
}

/**
 * O que aconteceu com o texto da pessoa:
 *   · `desnecessaria`: nenhuma nota mudou depois do scorer; o texto dele vale.
 *   · `reescrita`: a redação final reescreveu a devolutiva para as notas finais.
 *   · `falhou` / `pulada-sem-tempo`: a nota mudou e o texto ficou o do rascunho.
 */
export type StatusRedacao = 'desnecessaria' | 'reescrita' | 'falhou' | 'pulada-sem-tempo';

export interface PontuarFechamentoMeta {
  tentativas: number;
  sanitizacaoAplicada: boolean;
  narrativaPilotoOk: boolean;
  specVersion: string | null;
  /** Quantos descritores a arguição modulou (Fase B). 0 = sem arguição/sem ajuste. */
  arguicaoAjustados?: number;
  /** Ausente só quando o scorer falhou (não houve texto a reescrever). */
  redacao?: StatusRedacao;
  warnings: string[];
}

const normDescritor = (s: unknown) => String(s || '').trim().toLowerCase();

/** Citação da arguição por descritor, a mesma entrada que a fusão escolheu. */
function citacoesDaArguicao(ext: ArguicaoExtracao | null | undefined, avaliados: any[]): Map<string, string> {
  const out = new Map<string, string>();
  const evs = Array.isArray(ext?.evidencias_por_descritor) ? ext!.evidencias_por_descritor : [];
  for (const d of avaliados) {
    const chave = normDescritor(d?.descritor);
    const doDescritor = evs.filter((e) => normDescritor(e?.descritor) === chave);
    const escolhida = doDescritor.find((e) => e?.sustentou === d?.sustentacao_arguicao && e?.forca === d?.forca_arguicao)
      ?? doDescritor[0];
    if (escolhida?.citacao) out.set(chave, escolhida.citacao);
  }
  return out;
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
  const { competencia, descritores, cenario, resposta, nomeColab, perfilDominante, evidenciasAcumuladas, acumuladoPrimaria, config, regeracao, evidenciasArguicao, checkModel, prazoMs, ledger } = args;
  const { isPiloto, semanasDegustacao, semanaFinal, semanasEvidencia, notaPrograma } = reguaTemporalDoPrograma(config);

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
    const timeoutMs = timeoutDoScorer(prazoMs, Date.now());
    if (timeoutMs == null) {
      meta.warnings.push(`scorer: sem tempo no prazo do fechamento para a tentativa ${tentativa}`);
      break;
    }
    meta.tentativas = tentativa;
    const r = await callAI(systemScore, user, {}, SCORER_MAX_TOKENS, {
      taskKey: 'sem14_scorer', timeoutMs,
      empresaId: ledger?.empresaId ?? null, colaboradorId: ledger?.colaboradorId ?? null,
    });
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

  // A nota com que o scorer ESCREVEU o texto. Fusão e trava mudam a nota depois;
  // é esta foto que diz se o texto ficou para trás.
  const notaDoRascunho = new Map<string, number | null>(
    parsed.avaliacao_por_descritor.map((d: any) => [normDescritor(d.descritor), typeof d.nota_pos === 'number' ? d.nota_pos : null]),
  );

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

  // A justificativa do scorer cita a nota dele; a linha anotada explica a final.
  parsed = anotarAjusteArguicao(parsed);

  // ── Redação final (18/09/2026): a nota já está decidida; o texto que a
  // pessoa lê é reescrito para ela quando mudou depois do scorer. Nunca derruba
  // o fechamento: se falhar, fica o rascunho e o caller registra a degradação. ──
  const mudaram = parsed.avaliacao_por_descritor.filter((d: any) => {
    const antes = notaDoRascunho.get(normDescritor(d.descritor));
    return typeof antes === 'number' && typeof d.nota_pos === 'number' && Math.abs(d.nota_pos - antes) >= 0.05;
  });
  let rascunhoSubstituido: unknown = null;
  if (mudaram.length === 0) {
    meta.redacao = 'desnecessaria';
  } else {
    const timeoutRedacao = timeoutDaRedacao(prazoMs, Date.now());
    if (timeoutRedacao === null) {
      meta.redacao = 'pulada-sem-tempo';
      meta.warnings.push('redação final pulada: sem tempo no prazo do fechamento; ficou o rascunho do scorer');
    } else {
      const rascunho = parsed.resumo_avaliacao;
      try {
        const citacoes = citacoesDaArguicao(evidenciasArguicao, parsed.avaliacao_por_descritor);
        const { system: sRed, user: uRed } = promptRedacaoFechamento({
          competencia, nomeColab, perfilDominante, semanasEvidencia, notaPrograma,
          descritores: parsed.avaliacao_por_descritor.map((d: any) => ({
            descritor: d.descritor,
            nota_pre: typeof d.nota_pre === 'number' ? d.nota_pre : null,
            nota_rascunho: notaDoRascunho.get(normDescritor(d.descritor)) ?? null,
            nota_final: typeof d.nota_pos === 'number' ? d.nota_pos : null,
            sustentacao_arguicao: d.sustentacao_arguicao ?? null,
            forca_arguicao: d.forca_arguicao ?? null,
            citacao_arguicao: citacoes.get(normDescritor(d.descritor)) ?? null,
            piso_aplicado: !!d.piso_aplicado,
            justificativa: d.justificativa ?? null,
          })),
          rascunho,
          arguicao: evidenciasArguicao?.resumo ?? null,
        });
        const rRed = await callAI(sRed, uRed, {}, REDACAO_MAX_TOKENS, {
          taskKey: 'sem14_redacao',
          ...(timeoutRedacao != null ? { timeoutMs: timeoutRedacao } : {}),
          empresaId: ledger?.empresaId ?? null, colaboradorId: ledger?.colaboradorId ?? null,
        });
        const redigido = validarRedacao(parseJsonIA(rRed), rascunho);
        if (!redigido) throw new Error('a resposta veio sem os quatro textos da devolutiva');
        let candidato = { ...parsed, resumo_avaliacao: redigido };
        if (isPiloto) {
          // A mesma trava de duração do rascunho: texto novo não escapa dela.
          const san = sanitizarNarrativaPiloto(candidato, semanasDegustacao);
          if (!san.ok) throw new Error('a narrativa do piloto saiu com a duração errada');
          candidato = san.parsed;
          if (san.alterou) meta.sanitizacaoAplicada = true;
        }
        parsed = candidato;
        rascunhoSubstituido = rascunho;
        meta.redacao = 'reescrita';
      } catch (e: any) {
        meta.redacao = 'falhou';
        meta.warnings.push(`redação final falhou (${e?.message || e}); ficou o rascunho do scorer`);
      }
    }
  }
  // Carimbo SEMPRE presente, inclusive nulo: os callers gravam `{ ...slot, ...parsed }`,
  // e uma regeração sem ajuste deixaria o rascunho e o status da rodada anterior.
  parsed = {
    ...parsed,
    resumo_avaliacao_rascunho: rascunhoSubstituido,
    redacao_final: { status: meta.redacao, descritores_com_nota_alterada: mudaram.length },
  };

  // Validação-aviso: resumo deve falar com o colaborador, não com personagens
  const resumoText = parsed.resumo_avaliacao?.mensagem_geral || '';
  if (resumoText && nomeColab && !resumoText.includes(nomeColab) && resumoText.length > 50) {
    meta.warnings.push('resumo_avaliacao pode não conter o nome do colaborador');
  }

  // ── Check (2ª IA) — nunca derruba o fechamento; falha vira warning ──
  let auditoria: any = null;
  const timeoutCheck = timeoutDoCheck(prazoMs, Date.now());
  if (timeoutCheck === null) {
    meta.warnings.push('check da 2ª IA pulado: sem tempo no prazo do fechamento');
  } else {
    try {
      // O auditor lê a avaliação que vai para a tela: sem o rascunho substituído
      // (duas devolutivas confundiriam o critério de coerência) e sem o carimbo.
      const { resumo_avaliacao_rascunho: _rascunho, redacao_final: _carimbo, ...avaliacaoParaAuditar } = parsed;
      const { system: sCheck, user: uCheck } = promptEvolutionScenarioCheck({
        competencia, descritores, cenario, resposta,
        avaliacaoPrimaria: avaliacaoParaAuditar,
        evidenciasAcumuladas,
        semanaFinal, semanasEvidencia, notaPrograma,
        arguicao: evidenciasArguicao ?? null,
      });
      const systemCheck = regeracao ? sCheck + APPENDIX_CHECK_REGEN(regeracao.feedbackAuditoria) : sCheck;
      // 2ª IA (auditor) configurável — default GPT 5.6 **Terra** (DEFAULT_TASK_MODELS.sem14_check).
      // Este comentário dizia "Luna" até 25/08/2026; o default virou Terra em 22/07,
      // quando todas as dupla-checagens foram padronizadas. Comentário de modelo
      // envelhece calado: quem lê daqui decide a troca pelo texto, não pela tabela.
      // Caller pode passar checkModel resolvido por empresa; senão cai no default da task.
      const sem14CheckModel = checkModel || DEFAULT_TASK_MODELS['sem14_check'];
      const rCheck = await callAI(systemCheck, uCheck, sem14CheckModel ? { model: sem14CheckModel } : {}, 8000, {
        taskKey: 'sem14_check',
        ...(timeoutCheck != null ? { timeoutMs: timeoutCheck } : {}),
        empresaId: ledger?.empresaId ?? null, colaboradorId: ledger?.colaboradorId ?? null,
      });
      auditoria = validateEvolutionScenarioCheck(parseJsonIA(rCheck));

      if (regeracao && auditoria?.resumo_auditoria) {
        const resumo = auditoria.resumo_auditoria.toLowerCase();
        const temComparacao = ['corrig', 'melhora', 'manteve', 'persist', 'anterior', 'segunda', 'resolv', 'parcial'].some(w => resumo.includes(w));
        if (!temComparacao) meta.warnings.push('resumo_auditoria da 2ª rodada pode não estar comparando com a anterior');
      }
    } catch (e: any) {
      meta.warnings.push(`check da 2ª IA falhou: ${e?.message}`);
    }
  }

  return { ok: true, parsed, auditoria, meta };
}
