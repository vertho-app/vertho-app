/**
 * ELENCO de vozes — fonte ÚNICA de "quem fala" no produto.
 *
 * Por que existe (06/09/2026). A identidade da voz estava escrita em cinco lugares
 * (podcast, vídeo, devolutiva, saudação na box, alvo de F0 do portão), e foi assim
 * que a saudação "Olá, {nome}" saiu num modelo e o corpo do vídeo em outro: o mesmo
 * nome de voz soa DIFERENTE entre modelos (0,6σ de timbre entre Aoede-3.1 e
 * Aoede-2.5, medido no bake-off). Um personagem é voz + modelo + alvo, junto.
 *
 * Env continua vencendo o código (`GEMINI_TTS_VOICE`, `VIDEO_TTS_VOICE`,
 * `GEMINI_TTS_MODEL`, …), mas o DEFAULT de todos os consumidores sai daqui. O guard
 * `tests/unit/tts/elenco-guard.test.ts` impede literal de nome de voz fora deste
 * arquivo. Ao recastar: trocar aqui, recalcular a assinatura de timbre
 * (`scripts/_gerar-assinaturas-voz.ts`) e subir a `versao`.
 */
export interface PerfilVoz {
  /** Nome da voz prebuilt do Gemini TTS. */
  voz: string;
  /** Id do modelo no Vertex (produção) e no AI Studio (box de render, sondas). */
  modeloVertex: string;
  modeloAiStudio: string;
  /** F0 mediano medido nos takes aprovados; o portão tolera ±1 st. */
  alvoF0Hz: number;
  /** Muda quando voz OU modelo mudam: entra em chaves de cache e no ledger. */
  versao: string;
}

export const ELENCO = {
  /** Mentora Vertho: podcast, narração do vídeo, saudação nominal, speaker "Campo". */
  mentora: { voz: 'Aoede', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts', alvoF0Hz: 208, versao: '2026-09-05' },
  /** Beto: devolutiva comportamental, speaker "Mentor" no podcast a duas vozes. */
  beto: { voz: 'Iapetus', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts', alvoF0Hz: 144, versao: '2026-09-05' },
} as const satisfies Record<string, PerfilVoz>;

export type Personagem = keyof typeof ELENCO;

/** Alvo de F0 por NOME de voz (o portão julga pela voz que sintetizou). */
export function alvosF0DoElenco(): Record<string, { f0Hz: number }> {
  return Object.fromEntries(Object.values(ELENCO).map((p) => [p.voz, { f0Hz: p.alvoF0Hz }]));
}
