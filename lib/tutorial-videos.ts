/** Catálogo dos tutoriais genéricos. Não contém vídeos curriculares/nominais. */
export const TUTORIAIS_PLATAFORMA = {
  // Revisão de 10/09/2026: telas recapturadas (as antigas eram de 23/07 a 25/08 e o app
  // mudou) e narração regerada na voz atual do Beto. Os GUIDs anteriores continuam na
  // lista — `resolverVersaoTutorial` mantém `/v/<antigo>` funcionando para quem já
  // recebeu o link.
  //
  // Revisão de 11/09/2026 — quatro defeitos que só o dono ASSISTINDO pegou, nenhum
  // visível para teste, guard ou log:
  //  · legenda: o ramo da cartela na composição devolvia antes do bloco de legenda, e
  //    os 7 flows abrem E fecham em cartela — o 1º e o último beat de TODO tutorial
  //    saíam mudos de lettering (10 s na abertura do PDI);
  //  · PDI: o modal do `FirstViewVideo` (a versão ANTERIOR deste mesmo tutorial) abriu
  //    por cima das 4 capturas, e as molduras emolduraram o que estava atrás dele;
  //  · jornada: os chips de formato viraram `<button>` e o seletor da captura ainda
  //    procurava `a[href*="/api/conteudo"]` — zero elementos, tolerado em silêncio.
  //    A narração prometia vídeo e a tela mostrava três formatos;
  //  · disc: o corte entre dois beats caía a −18 dB, em cima da voz (1:27 do `ajuda`).
  //    O corte agora procura o vale da onda e ganha rampa de 25 ms.
  /*
   * ⛔ `discApp` SAIU em 11/09/2026 (decisão do dono). Era o corte curto (7 beats,
   * 78 s) do MESMO roteiro do `discAjuda`: só o "como responder", sem o que o DISC
   * é nem o que o resultado significa, com fecho "Bora começar?".
   *
   * Foi feito para tocar no instante em que a pessoa vai se mapear — e nunca
   * chegou a ser usado: o único consumidor do catálogo é
   * `perfil-comportamental/mapeamento/page.tsx`, e ele aponta para o `discAjuda`.
   * Seguia sendo renderizado e publicado a cada rodada sem ninguém assistir.
   * O corte 'app' continua no `storyboard.ts` (é só um filtro de beats), mas não
   * se publica mais: `build.mts disc app` serve para prévia, não para entrega.
   *
   * Os GUIDs dele não entram em `anteriores` de ninguém porque nunca estiveram em
   * `videos-publicos.ts` — nenhum link foi compartilhado por fora.
   */
  discAjuda: { guid: 'cfd74cb8-3b18-47b3-a59e-e35fdbaada51', anteriores: ['dc371aff-2740-4edf-8464-196d8c3f3e6d', '62e15c9e-fd34-419f-8297-e71c92dbb536', '95c94328-009e-47e9-9a18-7f60c3ef3d9b', 'a352dbdf-4515-45ba-8797-72f62798402c'] as string[] },
  jornada: { guid: '00a29b1b-a053-443b-b95d-8e1b8882f3a7', anteriores: ['53af3581-f196-4dd3-b0e1-ae193c48b201', '9e9178cc-ed79-49c6-a042-f505b33332b3', '64c4f43d-7c5d-4b1e-9433-725a1dddbf34'] as string[] },
  pdi: { guid: '4bd7af78-24fd-4b55-8f1c-05c55f0908d4', anteriores: ['4408b79f-d037-4f1e-bcbb-7ccbb32639d0', 'adcd3828-5b72-45a4-8f0d-5cc7a9812d58', 'b8a4534e-326a-4ba4-b638-befc63294dda'] as string[] },
  aplicacao: { guid: '80f4da74-4384-419f-aab8-89ed346e7b5b', anteriores: [] as string[] },
  boasvindasUniAnchieta: { guid: '482e3eab-65bd-4e0d-98d6-1f2af6141071', anteriores: [] as string[] },
  /*
   * Estes dois ganharam take NOVO em 11/09/2026, não só remontagem: a voz dizia
   * "o material chega do jeito CERTO" e a legenda, que vem do roteiro, dizia "do
   * SEU jeito" — o dono ouviu a divergência em 1:13. Uma palavra, e ela é a que
   * carrega o sentido do beat (personalização).
   *
   * 🔑 Para conseguir o take foi preciso mexer na PONTUAÇÃO do roteiro (as duas
   * exclamações que o emolduravam viraram ponto). Com "Olá!" e "Até já!",
   * `Medido 11/09`: 20 tentativas, 0 aprovadas, todas por deriva de registro,
   * mediana +4,4 st/min. Com ponto: macae passou na 5ª (+1,34) e o genérico na
   * 3ª da 4ª rodada (−0,78). Detalhe no comentário de `storyboard.ts`.
   */
  boasvindasMacae: { guid: '25d4a35a-0d28-457c-ad64-169102ba08c7', anteriores: ['daeab47f-ffb7-4893-8ded-714b63b80c5a', '747c65a8-1764-46c0-95d4-f9fb40873341'] as string[] },
  /**
   * Boas-vindas GENÉRICO (10/09/2026) — o único sem nome de cliente, e por isso o
   * único que serve qualquer empresa nova. Os dois acima continuam porque já foram
   * enviados: os links estão em mensagens de WhatsApp que não dá para editar.
   */
  boasvindasGeral: { guid: 'b902d843-4739-42fc-974b-45081326e9ba', anteriores: ['4fda700f-d228-4a0b-8f2c-67834db48780', '4f156a19-3517-40e1-86b4-4c170cf38899'] as string[] },
} as const;

/** Mantém /v/<GUID antigo> funcional, sem conceder acesso público por si só. */
export function resolverVersaoTutorial(id: string): string {
  const value = (id || '').toLowerCase();
  const entry = Object.values(TUTORIAIS_PLATAFORMA).find(t => t.guid === value || t.anteriores.includes(value));
  return entry?.guid || id;
}
