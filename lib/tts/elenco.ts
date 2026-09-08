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
  /**
   * Direção de estilo do personagem — como ele FALA, e é parte da identidade
   * tanto quanto o nome da voz. O gênero vai EXPLÍCITO: a direção dirige a
   * prosódia e, sem ele, a entrega não acompanha a troca da voz prebuilt.
   *
   * ⚠️ É a mesma string que a PRODUÇÃO e o CANÁRIO usam. Trocá-la muda o take e
   * invalida a comparação com `assinaturas-voz.ts`: recalcule a assinatura no
   * mesmo commit (`scripts/_gerar-assinaturas-voz.ts`) ou confirme por medição
   * que o timbre não se moveu.
   */
  direcao: string;
  /** Muda quando voz OU modelo mudam: entra em chaves de cache e no ledger. */
  versao: string;
}

export const ELENCO = {
  /**
   * Mentora Vertho: podcast, narração do vídeo, saudação nominal, speaker "Campo".
   *
   * `tolSt`/`tentativas` CALIBRADOS em 07/09/2026 com 143 tentativas reais do portão
   * (`tts_qa_log`, 7 dias, Vertex) — não com a projeção do bake-off, que previa ~7 % de
   * retake e errou por 4×. A distribuição real: F0 185-242 Hz, mediana 207,8 (o alvo
   * 208 está certo), p10-p90 de 2,25 st. Com ±1 st entravam 73 % dos takes e 2 tentativas
   * deixavam **7,4 % de fail-open** — batendo com os 9 áudios reprovados publicados em
   * 111 sínteses. Com ±1,25 st e 3 tentativas: 82 % na faixa e **0,6 %**. Alargar a
   * tolerância REDUZ a variação que a pessoa ouve, porque o que sai fora da faixa é o
   * fail-open publicando um take de 185 ou 242 Hz (até 4,7 st do alvo), muito pior que
   * os 2,5 st da faixa. 39 das 42 reprovações são de registro: volume, timbre e deriva
   * dentro do arquivo praticamente não aparecem mais — o problema de junho está fechado.
   */
  mentora: {
    voz: 'Aoede', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts',
    alvoF0Hz: 208, tolSt: 1.25, tentativas: 3,
    direcao: 'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.',
    versao: '2026-09-05',
  },
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
  beto: {
    voz: 'Algieba', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts',
    alvoF0Hz: 170, tolSt: 1.5, tentativas: 3,
    // O gênero é EXPLÍCITO e a string é a mesma da devolutiva (a produção do Beto):
    // o canário só prova alguma coisa se medir o que a pessoa ouve.
    direcao: 'Narre em português do Brasil, com voz masculina brasileira acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como um mentor falando diretamente com a pessoa',
    versao: '2026-09-07',
  },
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

/**
 * Personagem que fala nesta voz, ou `null` se a voz não é do elenco.
 *
 * Existe porque o que é ESTÁVEL é o personagem, não o nome da voz prebuilt: o
 * Beto já foi Iapetus e virou Algieba em 07/09/2026. Quem indexa configuração
 * pelo NOME da voz precisa ser reeditado a cada recast, e o que não for
 * reeditado passa a valer para ninguém — em silêncio.
 */
export function direcaoDoPersonagem(p: Personagem): string {
  return ELENCO[p].direcao;
}

export function personagemDaVoz(voz: string): Personagem | null {
  const par = (Object.entries(ELENCO) as [Personagem, PerfilVoz][]).find(([, p]) => p.voz === voz);
  return par ? par[0] : null;
}
