/**
 * O compromisso da semana: o TEXTO e a ORIGEM, separados.
 *
 * 🔴 POR QUE (medido 27/08/2026, na PRIMEIRA conversa real pós-deploy)
 * ───────────────────────────────────────────────────────────────────
 * `compromisso_proxima` é uma string só, e carregava TRÊS coisas diferentes:
 * o compromisso que a pessoa assumiu, o que o mentor propôs no fechamento, e —
 * pior — uma meta-observação explicando que não houve nenhum:
 *
 *   "Nenhum compromisso foi explicitamente assumido pelo colaborador. O
 *    compromisso presente no output foi proposto pela IA, não declarado."
 *
 * O extrator estava sendo HONESTO. O problema é o destino: os dois painéis
 * exibem o campo cru — `🎯 {compromisso_proxima}` em /admin/vertho/evidencias e
 * um bloco "Compromisso" em /admin/temporadas. Quem lê é o RH, e a explicação
 * ocupa o lugar da promessa.
 *
 * Censo das 88 conversas concluídas: **52 vazias (59%), 16 meta-observação
 * (18%), 20 compromisso real (23%)**. Ou seja, o campo só era confiável em um
 * quarto dos casos.
 *
 * ⚠️ E a tendência é PIORAR: até 27/08, 73% das conversas eram cortadas antes do
 * turno 6 e o campo saía vazio. Agora que elas fecham, o fechamento sempre
 * propõe um compromisso — então cresce tanto o real quanto a meta-observação.
 * Corrigir o corte sem corrigir isto trocaria um silêncio por uma afirmação
 * errada, que é pior.
 */

/** Quem assumiu o compromisso — a distinção que o campo de texto não fazia. */
export type CompromissoOrigem = 'colaborador' | 'ia' | 'ausente';

/**
 * Frases com que o extrator DESCREVE a ausência em vez de devolver vazio.
 *
 * Defesa, não substituto da instrução: o prompt já pede `""` + origem. Mas
 * instrução de prompt não é garantia, e este campo tem consumidor humano —
 * `config declarada não é config aplicada` vale aqui também.
 */
const META_OBSERVACAO = new RegExp([
  'nenhum compromisso',
  // "não houve compromisso declarado" — o substantivo entra no meio, então o
  // padrão precisa tolerar palavras entre o verbo e o particípio.
  'n[ãa]o houve\\s+(\\w+\\s+){0,2}compromisso',
  'sem compromisso',
  // "não foi assumido", "não chegou a ser declarado", "não foi explicitamente firmado"
  'n[ãa]o (foi|chegou a( ser)?|é)\\s+(\\w+\\s+){0,2}(assumido|declarado|firmado)',
  'proposto pela ia',
  'sugerido pela ia',
].join('|'), 'i');

/**
 * Normaliza `compromisso_proxima` + `compromisso_origem` no objeto extraído
 * (MUTA, como os demais validadores desta rota).
 *
 * Regras, nesta ordem:
 *   1. origem fora do enum vira inferência pelo texto (retrocompat: extrações
 *      anteriores a 27/08 não têm o campo);
 *   2. texto que DESCREVE a ausência não é compromisso — vira `''` + 'ausente';
 *   3. sem texto, a origem é sempre 'ausente' — não existe compromisso de
 *      alguém sem compromisso.
 */
export function normalizarCompromisso(parsed: any): void {
  const texto = typeof parsed?.compromisso_proxima === 'string' ? parsed.compromisso_proxima.trim() : '';
  const origemBruta = String(parsed?.compromisso_origem || '').trim().toLowerCase();
  const valida = ['colaborador', 'ia', 'ausente'].includes(origemBruta);

  if (texto && META_OBSERVACAO.test(texto)) {
    parsed.compromisso_proxima = '';
    parsed.compromisso_origem = 'ausente' as CompromissoOrigem;
    return;
  }
  if (!texto) {
    parsed.compromisso_proxima = '';
    parsed.compromisso_origem = 'ausente' as CompromissoOrigem;
    return;
  }
  parsed.compromisso_proxima = texto;
  // Sem o campo (extração antiga), o texto é um compromisso de verdade e não dá
  // para saber quem o assumiu. 'colaborador' seria um palpite otimista sobre
  // dado que ninguém verificou; 'ia' seria pessimista. O honesto é dizer que
  // não se sabe — e a UI trata isso como "origem não registrada".
  parsed.compromisso_origem = valida ? origemBruta : null;
}

/** Rótulo curto para a UI. `null` = extração antiga, origem não registrada. */
export function rotuloOrigemCompromisso(origem: string | null | undefined): string | null {
  if (origem === 'colaborador') return null; // o caso normal não precisa de selo
  if (origem === 'ia') return 'proposto pelo mentor';
  if (origem === 'ausente') return null;
  return 'origem não registrada';
}
