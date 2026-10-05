export type SpeechResult = {
  0: { transcript: string };
};

/**
 * `results` contém a transcrição inteira da sessão, não só o trecho novo.
 * Reconstituir sobre uma base fixa também tolera eventos que reenviam finais
 * ou revisam a mesma posição (Chrome no Android), sem duplicar a fala.
 */
export function speechTranscript(base: string, results: ArrayLike<SpeechResult>): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = results[i][0].transcript.trim();
    if (text) parts.push(text);
  }
  const transcript = parts.join(' ').replace(/\s+/g, ' ');
  if (!transcript) return base;
  const prefix = base.trimEnd();
  return prefix ? `${prefix} ${transcript}` : transcript;
}
