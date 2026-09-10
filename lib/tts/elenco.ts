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
  /**
   * Quantas tentativas do portão embasaram `alvoF0Hz`/`tolSt`/`tentativas`, e quando.
   *
   * Existe porque **amostra pequena erra por 4×**: a projeção do bake-off dava ~7 % de
   * retake para a Aoede e o real na primeira semana foi 29 %, com 8,1 % das sínteses
   * saindo pelo fail-open. Abaixo de `CALIBRACAO_AMOSTRA_MINIMA` o perfil é PROVISÓRIO,
   * e a R20 do health avisa assim que houver amostra real suficiente para refazer —
   * é o que impede a recalibração de depender da memória de alguém.
   * Recalibrar: `npx tsx scripts/_calibrar-voz.ts <Voz> 7`.
   */
  calibracao: { tentativas: number; em: string };
  /**
   * F0 do take em que o personagem foi ESCOLHIDO — a âncora humana do alvo.
   *
   * Existe por causa de 07-10/09/2026: o alvo do Beto foi para 170 Hz porque foi posto
   * no centro de uma amostra de 6 takes, enquanto o take que o Rodrigo ouviu e aprovou
   * tinha **123 Hz**. Por três dias o portão garantiu, com precisão, uma voz que ninguém
   * escolheu — e nada acusou, porque nenhuma régua ligava o alvo à decisão.
   *
   * O guard em `tests/unit/tts/elenco-guard.test.ts` exige que este valor caia DENTRO
   * da faixa do alvo (`|st(aprovado, alvo)| <= tolSt`). Recalibrar o alvo é livre; o que
   * não pode é ele se afastar do que foi aprovado sem que a escolha seja refeita.
   */
  aprovadoF0Hz?: number;
}

/** Abaixo disto, a calibração de uma voz é provisória (a R20 do health cobra). */
export const CALIBRACAO_AMOSTRA_MINIMA = 30;

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
    calibracao: { tentativas: 143, em: '2026-09-07' },
    direcao: 'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.',
    versao: '2026-09-05',
  },
  /**
   * Beto: devolutiva comportamental, speaker "Mentor" no podcast a duas vozes.
   *
   * **Algieba desde 07/09/2026** (escolha do Rodrigo no kit voz × rosto). Ela é estável
   * DENTRO do arquivo (slope −0,86 a +0,73 st/min, longe do veto de 1,5) e o timbre é
   * consistente (0,06-0,10σ da própria assinatura). O problema nunca foi esse: é a
   * DISPERSÃO entre takes, e é ela que o alvo tem que endereçar.
   *
   * ⚠️ **O alvo era 170 Hz e estava errado — não por pouco (10/09/2026).** Ele saiu de
   * 6 takes de um texto de 4 min (145-190 Hz) e foi posto no CENTRO daquela amostra. Só
   * que o take em que o Rodrigo ESCOLHEU a voz, no kit voz × rosto, tem **123 Hz**: a
   * Algieba ainda não estava no elenco naquele dia, não tinha alvo, e o portão a aprovou
   * sem régua de registro. Resultado: por 3 dias o portão garantiu com precisão uma voz
   * que ninguém tinha aprovado — as devolutivas publicadas saíram entre 144 e 198 Hz,
   * **4,5 a 8,2 st acima** do que foi escolhido (3,5 st já soam como outra pessoa).
   *
   * A lição não é "erramos um número": é que **o registro desta voz é função do TEXTO**,
   * e um alvo tirado de um texto não descreve outro. `Medido` no mesmo personagem, mesma
   * direção: ~120 Hz num texto de 20 s (6 takes), 137-145 num roteiro de tutorial de
   * 60-115 s (42 takes), 107-198 num texto de 3-4 min (37 takes, mediana 158). Calibrar
   * na mediana de um contexto joga os outros para fora.
   *
   * **128 Hz ±2,5 st, 5 tentativas** — calibrado em 79 tentativas reais (`tts_qa_log`,
   * modelo de produção), ancorado no take APROVADO e não na mediana da amostra. Cobre os
   * dois contextos com uma régua só: 33 % por take no tutorial (era 12 %) e 38 % no texto
   * longo (era 41 %), o que com 5 tentativas dá **87 % e 91 %** de sucesso. E o que sai
   * fica entre 1,8 st abaixo e 3,2 st acima do aprovado, contra os 4,5-8,2 st de antes.
   * Validado de ouvido pelo Rodrigo em 10/09, comparando a mesma rodada julgada pelas
   * duas réguas (138 Hz contra 165 Hz).
   *
   * 🔑 Ao trocar de voz ou de modelo, recalibre com o texto do USO REAL, não com um
   * trecho curto de demonstração: foi assim que a escolha e a régua se descolaram.
   */
  beto: {
    voz: 'Algieba', modeloVertex: 'gemini-2.5-flash-tts', modeloAiStudio: 'gemini-2.5-flash-preview-tts',
    alvoF0Hz: 128, tolSt: 2.5, tentativas: 5,
    // O take do kit voz × rosto de 06/09 (`Downloads/deriva-podcast/vozes-com-rosto-beto/
    // M3_Algieba.mp4`), medido em 123 Hz. É a escolha do Rodrigo, e o alvo responde a ela.
    aprovadoF0Hz: 123,
    calibracao: { tentativas: 79, em: '2026-09-10' },
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

/** Vozes cuja calibração é PROVISÓRIA (amostra menor que o mínimo). */
export function vozesComCalibracaoProvisoria(): { voz: string; personagem: string; tentativas: number; em: string }[] {
  return Object.entries(ELENCO)
    .map(([personagem, p]) => ({ personagem, ...(p as unknown as PerfilVoz) }))
    .filter((p) => p.calibracao.tentativas < CALIBRACAO_AMOSTRA_MINIMA)
    .map((p) => ({ voz: p.voz, personagem: p.personagem, tentativas: p.calibracao.tentativas, em: p.calibracao.em }));
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
