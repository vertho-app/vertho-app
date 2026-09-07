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
  /** F0 mediano medido nos takes aprovados. */
  alvoF0Hz: number;
  /** Tolerância de registro em semitons (default 1,0). Voz mais dispersa entre takes
   *  precisa de faixa maior — senão o portão reprova quase tudo e o fail-open publica. */
  tolSt?: number;
  /** Tentativas do portão para esta voz (default `TTS_QA_TENTATIVAS`, 2). Voz que
   *  acerta o registro em 2 de 3 takes precisa de mais tentativas para a mesma garantia. */
  tentativas?: number;
  /** Muda quando voz OU modelo mudam: entra em chaves de cache e no ledger. */
  versao: string;
}

export const ELENCO = {
  /** Mentora Vertho: podcast, narração do vídeo, saudação nominal, speaker "Campo". */
  mentora: { voz: 'Aoede', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts', alvoF0Hz: 208, versao: '2026-09-05' },
  /**
   * Beto: devolutiva comportamental, speaker "Mentor" no podcast a duas vozes.
   *
   * **Algieba desde 07/09/2026** (escolha do Rodrigo no kit voz × rosto). `Medido` em
   * 6 takes do texto de 4 min, no Vertex: o registro dela varia **4,67 st entre takes**
   * (145-190 Hz) — contra 1,2-2,3 st do Iapetus e 0,4-1,0 st da Aoede. Dentro do
   * arquivo ela é estável (slope −0,86 a +0,73 st/min, longe do veto de 1,5; o bake-off
   * de 05/09 tinha medido +2,66 e a reprovou por isso) e o timbre é consistente
   * (0,06-0,10σ da própria assinatura). O preço da escolha é a DISPERSÃO entre takes:
   * por isso `tolSt: 1.5` e `tentativas: 3` — com alvo 170 Hz, 4 de 6 takes entram na
   * faixa e a chance de as 3 tentativas falharem é 4 %. Com a tolerância padrão (±1 st)
   * seriam 2 de 6, e o fail-open publicaria a maioria.
   */
  beto: { voz: 'Algieba', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts', alvoF0Hz: 170, tolSt: 1.5, tentativas: 3, versao: '2026-09-07' },
} as const satisfies Record<string, PerfilVoz>;

export type Personagem = keyof typeof ELENCO;

/** Os perfis como `PerfilVoz` (o `as const` deixa cada um com tipo literal próprio). */
const perfis = (): PerfilVoz[] => Object.values(ELENCO) as unknown as PerfilVoz[];

/** Alvo de F0 por NOME de voz (o portão julga pela voz que sintetizou). */
export function alvosF0DoElenco(): Record<string, { f0Hz: number; tolSt?: number }> {
  return Object.fromEntries(perfis().map((p) => [p.voz, { f0Hz: p.alvoF0Hz, ...(p.tolSt ? { tolSt: p.tolSt } : {}) }]));
}

/** Tentativas do portão para a voz (perfil do personagem), ou `undefined` = default global. */
export function tentativasDaVoz(voz: string): number | undefined {
  return perfis().find((p) => p.voz === voz)?.tentativas;
}
