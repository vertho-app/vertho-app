/**
 * Limpeza e branding do TEXTO de narração para TTS (puro, sem rede/áudio):
 * extrai o bloco de narração limpa do roteiro, normaliza, garante as frases de
 * marca do podcast e quebra em trechos. Extraído de `lib/gemini-tts.ts` (M1).
 */
const BRAND_OPENING_LINE = 'Este é o MentorIA na prática: uma conversa curta sobre desenvolvimento profissional aplicável no seu dia a dia.';
const BRAND_CLOSING_LINE = 'Na Vertho, desenvolvimento profissional não é conceito solto. É prática observável, uma semana de cada vez.';

/** Extrai o bloco de NARRAÇÃO LIMPA do roteiro TTS; remove título, headers e tags. */
export function extractNarration(roteiro: string): string {
  if (!roteiro) return '';
  let txt = roteiro;

  // Roteiros em dupla usam este bloco para preservar speaker labels no TTS.
  const multiSpeakerMatch = roteiro.match(/=+\s*TTS MULTI-SPEAKER\s*\(LIMPO\)\s*=+([\s\S]*?)$/i);
  if (multiSpeakerMatch) {
    return cleanNarrationText(multiSpeakerMatch[1], { keepSpeakerLabels: true });
  }

  // Pega o trecho entre "=== NARRAÇÃO (TEXTO LIMPO) ===" e o próximo "===".
  const limpoMatch = roteiro.match(/=+\s*NARRA[ÇC][ÃA]O\s*\(TEXTO LIMPO\)\s*=+([\s\S]*?)(?:\n=+\s*NARRA|$)/i);
  if (limpoMatch) {
    txt = limpoMatch[1];
  } else {
    // Sem marcadores: remove a linha TÍTULO e quaisquer headers "=== ... ===".
    txt = roteiro.replace(/^\s*T[ÍI]TULO:.*$/im, '').replace(/^=+.*=+\s*$/gim, '');
  }

  return cleanNarrationText(txt);
}

function cleanNarrationText(txt: string, opts: { keepSpeakerLabels?: boolean } = {}): string {
  let cleaned = txt
    .replace(/<break[^>]*\/?>/gi, '') // tags de pausa (não usadas pelo Gemini)
    .replace(/\*([^*]+)\*/g, '$1')    // ênfase em asteriscos
    .replace(/[#>*_`]/g, '')           // resíduos de markdown
    .replace(/^\s*[\[(].*(vinheta|som|m[úu]sica|fade|produção).*[)\]]\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (opts.keepSpeakerLabels) {
    cleaned = cleaned
      .replace(/^VOZ\s*1\s*:/gim, 'Mentor:')
      .replace(/^VOZ\s*2\s*:/gim, 'Campo:');
  }
  return cleaned;
}

export function isMultiSpeakerText(texto: string): boolean {
  return /^\s*Mentor\s*:/im.test(texto) && /^\s*Campo\s*:/im.test(texto);
}

export function ensurePodcastBrandNarration(texto: string): string {
  const clean = stripPodcastClosingNarration(stripPodcastOpeningNarration(texto.trim()));
  const hasClosing = /desenvolvimento profissional n[ãa]o [ée] conceito solto/i.test(clean)
    || /pr[áa]tica observ[áa]vel/i.test(clean);

  if (isMultiSpeakerText(clean)) {
    return [
      clean,
      hasClosing ? null : `Mentor: ${BRAND_CLOSING_LINE}`,
    ].filter(Boolean).join('\n');
  }

  return [
    clean,
    hasClosing ? null : BRAND_CLOSING_LINE,
  ].filter(Boolean).join('\n\n');
}

function stripPodcastOpeningNarration(texto: string): string {
  const openingLine = escapeRegExp(BRAND_OPENING_LINE);
  return texto
    .replace(new RegExp(`^\\s*(?:Mentor\\s*:\\s*)?${openingLine}\\s*(?:\\r?\\n)+`, 'i'), '')
    .replace(/^\s*(?:Mentor\s*:\s*)?Este é o MentorIA na prática:.*(?:\r?\n)+/i, '')
    .replace(new RegExp(`(^|\\r?\\n)\\s*(?:Mentor\\s*:\\s*)?${openingLine}\\s*(?=\\r?\\n|$)`, 'gi'), '$1')
    .replace(/(^|\r?\n)\s*(?:Mentor\s*:\s*)?Este é o MentorIA na prática:.*(?=\r?\n|$)/gi, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripPodcastClosingNarration(texto: string): string {
  const closingLine = escapeRegExp(BRAND_CLOSING_LINE);
  return texto
    .replace(new RegExp(`(^|\\r?\\n)\\s*(?:Mentor\\s*:\\s*)?${closingLine}\\s*(?=\\r?\\n|$)`, 'gi'), '$1')
    .replace(/(^|\r?\n)\s*(?:Mentor\s*:\s*)?Na Vertho, desenvolvimento profissional.*uma semana de cada vez\.?\s*(?=\r?\n|$)/gi, '$1')
    .replace(/\s*Na Vertho, desenvolvimento profissional n[ãa]o [ée] conceito solto\.?\s*[ÉE] pr[áa]tica observ[áa]vel,\s+uma semana de cada vez\.?/gi, '')
    .replace(/\s*[ÉE] pr[áa]tica observ[áa]vel,\s+uma semana de cada vez\.?/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quebra a narração em trechos de ~maxChars, cortando em fim de frase, para
 * evitar o "drift" de voz/volume do TTS em textos longos (a voz deriva e parece
 * outra pessoa no fim quando o input é grande).
 */
export function splitNarrationForTts(texto: string, maxChars = 600): string[] {
  const frases = texto.replace(/\s+/g, ' ').trim().match(/[^.!?…]+[.!?…]+|\S+$/g) || [texto];
  const chunks: string[] = [];
  let atual = '';
  for (const f of frases) {
    const frase = f.trim();
    if (!frase) continue;
    if (atual && (atual.length + frase.length + 1) > maxChars) {
      chunks.push(atual);
      atual = frase;
    } else {
      atual = atual ? `${atual} ${frase}` : frase;
    }
  }
  if (atual) chunks.push(atual);
  return chunks.length ? chunks : [texto];
}
