/**
 * Pipeline Dual-IA para classificação de texto aberto do Pulso.
 *
 * Modelo 1 (classifier — default Sonnet 4.6):
 *   Lê o texto da pergunta aberta e devolve JSON estruturado:
 *     { themes: string[], sentiment: 'positive'|'negative'|'neutral'|'mixed',
 *       evidence: string, confidence: 'low'|'medium'|'high' }
 *
 * Modelo 2 (auditor — default Gemini Flash):
 *   Recebe o texto original + saída do modelo 1 e:
 *     - aprova ou aponta divergências
 *     - decide a confidence final
 *     - escreve note curta (1 frase)
 *
 * A confidence final entra como filtro: agregação ignora temas com
 * confidence='low' OU rebaixa visualmente. Insights executivos só são
 * gerados se ao menos 60% das classificações tiverem confidence >= medium.
 *
 * Anti-vazamento: NUNCA persistir o texto bruto do colaborador no
 * pulse_classifications. O classifier_evidence é uma frase curta — apenas
 * pra debug e nunca exibida a gestor/RH (regra de privacidade da spec).
 */

import { callAI } from '@/actions/ai-client';
import { THEMES, THEME_KEYS, getThemesPromptList } from './themes-taxonomy';

export type Confidence = 'low' | 'medium' | 'high';

export interface ClassifyResult {
  themes: string[];                                       // chaves da taxonomia
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  evidence: string;
  confidence: Confidence;
  raw: string;
}

export interface AuditResult {
  agrees: boolean;
  divergences: { theme: string; reason: string }[];
  confidence_adjusted: Confidence;
  notes: string;
  raw: string;
}

// ─── Modelo 1: classifier ────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `Você é um classificador de respostas curtas sobre ambiente de desenvolvimento profissional. Sua tarefa é extrair temas de um conjunto fechado.

REGRAS:
1. Use APENAS as chaves da taxonomia abaixo. Não invente temas.
2. Retorne JSON puro, sem markdown, sem comentários, sem ressalvas.
3. Inclua no máximo 3 temas — só os mais evidentes no texto.
4. Se nenhum tema couber, retorne themes: [].
5. Evidence: uma frase curta (máx 80 chars) do texto que justifica os temas — sem identificar pessoas.
6. Confidence: high (3+ temas claros), medium (1-2 temas claros), low (texto vago/curto).
7. Linguagem cautelosa — não diagnostique burnout, doença, assédio.

TAXONOMIA:
${getThemesPromptList()}

FORMATO DE SAÍDA (JSON único):
{"themes": ["key1", "key2"], "sentiment": "positive|negative|neutral|mixed", "evidence": "frase curta", "confidence": "low|medium|high"}`;

export async function classifyOpenText(
  text: string,
  classifierModel: string = 'claude-sonnet-5',
): Promise<ClassifyResult> {
  if (!text || text.trim().length < 5) {
    return {
      themes: [], sentiment: 'neutral', evidence: '',
      confidence: 'low', raw: '(texto vazio)',
    };
  }

  const user = `TEXTO DA RESPOSTA:\n"""${text.trim().slice(0, 2000)}"""\n\nClassifique segundo a taxonomia.`;
  const raw = await callAI(CLASSIFY_SYSTEM, user, { model: classifierModel }, 512);

  return parseClassifyResponse(raw);
}

function parseClassifyResponse(raw: string): ClassifyResult {
  let cleaned = raw.trim();
  // Remove markdown fences se houver
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    const themes = Array.isArray(obj.themes)
      ? obj.themes.filter((t: any) => typeof t === 'string' && THEME_KEYS.includes(t)).slice(0, 3)
      : [];
    const sentiment = ['positive', 'negative', 'neutral', 'mixed'].includes(obj.sentiment) ? obj.sentiment : 'neutral';
    const evidence = typeof obj.evidence === 'string' ? obj.evidence.slice(0, 120) : '';
    const confidence: Confidence = ['low', 'medium', 'high'].includes(obj.confidence) ? obj.confidence : 'medium';
    return { themes, sentiment, evidence, confidence, raw };
  } catch {
    return { themes: [], sentiment: 'neutral', evidence: '', confidence: 'low', raw };
  }
}

// ─── Modelo 2: auditor ───────────────────────────────────────────────────

const AUDIT_SYSTEM = `Você é um auditor da classificação de outro modelo. Sua tarefa é verificar se a classificação faz sentido pro texto original.

REGRAS:
1. Aprove APENAS quando os temas refletem o texto. Não invente temas novos.
2. Se discordar, liste qual tema não deveria estar (com 1 razão curta).
3. Confidence_adjusted:
   - high: classificação clara e correta
   - medium: parcialmente correta, ressalvas leves
   - low: classificação fraca, texto muito curto ou ambíguo
4. Notes: 1 frase, no máximo 100 chars.
5. Linguagem cautelosa.

FORMATO DE SAÍDA (JSON único):
{"agrees": true|false, "divergences": [{"theme": "key", "reason": "..."}], "confidence_adjusted": "low|medium|high", "notes": "..."}`;

export async function auditClassification(
  originalText: string,
  classification: ClassifyResult,
  auditorModel: string = 'gpt-5.6-terra',
): Promise<AuditResult> {
  const user = `TEXTO ORIGINAL:
"""${originalText.trim().slice(0, 2000)}"""

CLASSIFICAÇÃO DO MODELO 1:
${JSON.stringify({ themes: classification.themes, sentiment: classification.sentiment, confidence: classification.confidence }, null, 2)}

Audite.`;

  const raw = await callAI(AUDIT_SYSTEM, user, { model: auditorModel }, 512);
  return parseAuditResponse(raw);
}

function parseAuditResponse(raw: string): AuditResult {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    const agrees = obj.agrees === true;
    const divergences = Array.isArray(obj.divergences)
      ? obj.divergences.filter((d: any) => d && typeof d.theme === 'string').map((d: any) => ({
          theme: d.theme, reason: String(d.reason || '').slice(0, 150),
        }))
      : [];
    const confidence_adjusted: Confidence = ['low', 'medium', 'high'].includes(obj.confidence_adjusted)
      ? obj.confidence_adjusted : 'medium';
    const notes = typeof obj.notes === 'string' ? obj.notes.slice(0, 200) : '';
    return { agrees, divergences, confidence_adjusted, notes, raw };
  } catch {
    return { agrees: false, divergences: [], confidence_adjusted: 'low', notes: 'falha no parse do auditor', raw };
  }
}

// ─── Decisão final de confidence ─────────────────────────────────────────

/**
 * Combina classifier + auditor numa confidence final.
 * Regras:
 *   - Se auditor='low' → final='low'
 *   - Se auditor não concorda E divergiu em >=1 tema → rebaixa 1 nível
 *   - Caso contrário, usa confidence_adjusted do auditor
 */
export function resolveFinalConfidence(c: ClassifyResult, a: AuditResult): Confidence {
  if (a.confidence_adjusted === 'low') return 'low';
  if (!a.agrees && a.divergences.length > 0) {
    if (a.confidence_adjusted === 'high') return 'medium';
    return 'low';
  }
  return a.confidence_adjusted;
}

/**
 * Após auditoria, filtra os temas que o auditor rejeitou.
 */
export function applyAuditCorrections(c: ClassifyResult, a: AuditResult): string[] {
  if (a.agrees) return c.themes;
  const rejected = new Set(a.divergences.map(d => d.theme));
  return c.themes.filter(t => !rejected.has(t));
}
