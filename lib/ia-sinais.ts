/**
 * Sinais de confiança DERIVADOS EM CÓDIGO sobre uma saída de IA.
 *
 * Primitiva compartilhada por três consumidores do plano de custo/qualidade:
 *   - S4 (eval harness): graders objetivos sobre goldens.
 *   - S5 (cascata econômico→forte): decide escalar do modelo barato pro forte.
 *   - S7 (auditoria por risco): força 100% de auditoria em baixa confiança.
 *
 * NUNCA confia na "confiança" declarada pelo modelo — só em fatos verificáveis
 * (JSON válido, campos presentes, nota na régua, divergência com o
 * determinístico). É a lição do projeto: a primária violou a régua COM
 * confiança e passou 3 módulos ALTA. Sinal ⇒ evidência, não auto-relato.
 */

export interface SinaisConfianca {
  jsonValido: boolean;
  camposFaltando: string[];
  notaForaDaRegua: boolean;
  respostaGenerica: boolean;
  /** |nota_modelo − nota_determinística| acima do limite (quando há score em código). */
  divergenteDoDeterministico: boolean;
  /** true se QUALQUER sinal vermelho disparou → baixa confiança. */
  baixaConfianca: boolean;
}

export interface SinaisInput {
  /** Texto cru devolvido pelo modelo (pré-parse). */
  raw: string;
  /** Objeto já parseado, se houver. */
  parsed?: any;
  /** Campos obrigatórios no objeto parseado. */
  camposObrigatorios?: string[];
  /** Notas do output a validar contra a régua (1..4). */
  notas?: number[];
  /** Nota determinística (score em código) p/ comparar, se existir. */
  notaDeterministica?: number | null;
  /** Nota do modelo p/ comparar com a determinística. */
  notaModelo?: number | null;
  /** Limite de divergência aceitável (default 1 nível). */
  limiteDivergencia?: number;
}

export function jsonValido(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    // Tolera cercas ```json ... ``` (parse do miolo).
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    JSON.parse((m ? m[1] : raw).trim());
    return true;
  } catch {
    return false;
  }
}

export function notaNaRegua(nota: unknown, min = 1, max = 4): boolean {
  return typeof nota === 'number' && Number.isFinite(nota) && nota >= min && nota <= max;
}

export function camposFaltando(obj: any, obrigatorios: string[] = []): string[] {
  if (!obj || typeof obj !== 'object') return obrigatorios.slice();
  return obrigatorios.filter((c) => obj[c] === undefined || obj[c] === null || obj[c] === '');
}

/**
 * Heurística de resposta genérica/vazia: muito curta, ou template óbvio de
 * fallback ("não foi possível", "como posso ajudar"). Conservadora — pega o
 * caso claro, não julga qualidade pedagógica (isso é do harness/rubrica).
 */
export function respostaGenerica(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (t.length < 15) return true;
  const templates = [
    'não foi possível', 'nao foi possivel', 'como posso ajudar',
    'desculpe, não entendi', 'desculpe, nao entendi', 'não tenho informações',
  ];
  return templates.some((p) => t.includes(p));
}

export function computarSinais(inp: SinaisInput): SinaisConfianca {
  const jv = jsonValido(inp.raw);
  const faltando = inp.parsed !== undefined ? camposFaltando(inp.parsed, inp.camposObrigatorios) : [];
  const foraRegua = (inp.notas || []).some((n) => !notaNaRegua(n));
  const generica = respostaGenerica(inp.raw);
  const lim = inp.limiteDivergencia ?? 1;
  const divergente =
    inp.notaDeterministica != null && inp.notaModelo != null
      ? Math.abs(inp.notaModelo - inp.notaDeterministica) > lim
      : false;

  const baixa =
    (inp.camposObrigatorios || inp.parsed !== undefined ? !jv : false) ||
    faltando.length > 0 ||
    foraRegua ||
    generica ||
    divergente;

  return {
    jsonValido: jv,
    camposFaltando: faltando,
    notaForaDaRegua: foraRegua,
    respostaGenerica: generica,
    divergenteDoDeterministico: divergente,
    baixaConfianca: baixa,
  };
}
