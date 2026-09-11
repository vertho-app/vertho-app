import { createHash } from 'node:crypto';
import { ELENCO } from '../../lib/tts/elenco';

/**
 * Acréscimo de direção por flow — e o que ele PODE e NÃO pode fazer.
 *
 * `Medido 10/09/2026`, mesmo texto, 3 takes por direção, portão desligado:
 *
 * | flow       | direção                          | F0 médio | deriva média |
 * |------------|----------------------------------|---------:|-------------:|
 * | boasvindas | "leveza no registro médio"       |  179 Hz  |        ~2,0  |
 * | boasvindas | **pura do elenco**               |  135 Hz  |        ~2,6  |
 * | boasvindas | "grave e de peito"               |  170 Hz  |        ~0,9  |
 * | macae      | "termine com convicção"          |  134 Hz  |    **~6,3**  |
 * | macae      | pura do elenco                   |  135 Hz  |        ~4,9  |
 * | macae      | **"sustente a mesma altura"**    |  145 Hz  |    **~1,4**  |
 *
 * Duas conclusões que não são intuitivas e que custaram takes para aprender:
 *
 * 1. **Pedir uma ALTURA não funciona.** "Registro médio-alto" no `aplicacao` produziu
 *    137 Hz; "grave e de peito" no `boasvindas` produziu 170. O modelo não obedece
 *    instrução de altura — ele reage ao conjunto, e às vezes ao contrário do pedido.
 *    Quem controla a altura é o TEXTO; a direção só a desloca por efeito colateral.
 * 2. **Pedir ESTABILIDADE funciona.** "Sustente a mesma altura do começo ao fim" levou
 *    a deriva do `macae` de ~5,5 para ~1,4 st/min. E o inverso também: pedir progressão
 *    ("comece acolhedor e TERMINE com convicção") é pedir deriva, e o modelo entrega —
 *    era por isso que aquele flow reprovava 10 de 10 pelo veto de inclinação.
 *
 * Por isso cada flow leva o acréscimo que resolve o SEU problema, e nenhum leva
 * instrução de altura. A direção pura do elenco é o default — é ela que o Rodrigo
 * aprovou no kit voz × rosto, e qualquer acréscimo desloca o take para longe dela.
 */
function acrescimoDeDirecao(flow: string): string {
  // `macae` e `boasvindas-geral` derivam por construção do roteiro (convite com arco
  // emocional): a única instrução que segura é a de sustentação. Não é analogia — o
  // genérico é o roteiro de Macaé com abertura e fecho reescritos, 6 dos 8 beats
  // idênticos, e na direção PURA mediu deriva média de +4,97 st/min (máx 10,97) em
  // 15 takes, com 14 reprovações por inclinação. O mesmo perfil que a sustentação
  // baixou de ~5,5 para ~1,4 no flow de Macaé.
  if (flow === 'macae') return '. Sustente a mesma altura de voz do começo ao fim — não suba o tom ao longo da narração, e não soe festivo.';
  /*
   * `boasvindas-geral` SAIU do par com `macae` em 11/09/2026, a pedido do dono:
   * "o de boas-vindas podemos deixar mais entusiasmado o começo (é um boas-vindas!)".
   *
   * O pedido colide de frente com o "não soe festivo", que existe por medição:
   * é o flow que reprovou 20 de 20 por deriva quando o roteiro abria e fechava
   * em exclamação.
   *
   * ⚠️ A PRIMEIRA TENTATIVA DE ATENDER O PEDIDO FOI UM EXPERIMENTO CONFUNDIDO:
   * troquei a DIREÇÃO ("abra caloroso e genuinamente contente…") e o TEXTO da
   * abertura na mesma rodada. Deu 30 tentativas, 0 aprovadas, com a deriva de
   * volta em 5-11 st/min — e sem saber qual das duas cobrava, porque as duas
   * mexem no mesmo eixo. Medir duas coisas de uma vez é não medir nenhuma.
   *
   * Então a direção volta a ser a MEDIDA (a mesma do `macae`, que levou a deriva
   * de ~5,5 para ~1,4) e o entusiasmo passa a vir só das PALAVRAS do roteiro —
   * "Boas-vindas à Vertho", "é um prazer ter você com a gente" —, que é onde ele
   * não custa inclinação. "Não soe festivo" não é o contrário de acolhedor: é o
   * contrário de subir o tom ao longo da narração.
   */
  if (flow === 'boasvindas-geral') return '. Sustente a mesma altura de voz do começo ao fim — não suba o tom ao longo da narração, e não soe festivo.';
  // `aplicacao` e `jornada` passaram em 10/09 COM instrução de altura ("médio-alto" e
  // "registro médio"), mas passaram apesar dela, não graças a ela: um custou 11 takes e
  // o outro chegou na 5ª tentativa. A instrução de altura sai dos dois — fica só a de
  // sustentação, que é a que a medição mostra funcionar. O preço é regerar os dois (a
  // chave inclui a direção), e é barato perto de manter no código uma instrução que
  // mede-se produzir o contrário do que pede.
  if (flow === 'aplicacao') return '. Leia este tutorial com voz clara, como um instrutor explicando algo simples. Sustente o mesmo registro do início ao fim.';
  if (flow === 'jornada') return '. Para esta explicação prática, mantenha clareza didática e energia de conversa, sustentando o mesmo registro.';
  // `boasvindas`, `disc` e `pdi`: direção PURA. No boasvindas isso é a correção — o
  // acréscimo anterior o levava a 179 Hz, fora de qualquer alvo ancorado no aprovado.
  return '';
}

/** Tutorial é o Beto explicando o produto, sem personalização por participante. */
export function perfilTutorial(flow: string) {
  const p = ELENCO.beto;
  return {
    personagem: 'beto', voice: p.voz, backend: 'vertex', model: p.modeloVertex,
    versao: p.versao, alvoF0Hz: p.alvoF0Hz, tolSt: p.tolSt,
    mode: 'continuous', tentativas: p.tentativas,
    style: p.direcao + acrescimoDeDirecao(flow),
  };
}

export type TutorialProfile = ReturnType<typeof perfilTutorial>;
export type TutorialClip = {
  id: string; audio: string; seconds: number; key: string; sha256: string;
  sourceSha256: string; sourceStart: number; sourceEnd: number;
  // QA do take contínuo de origem, não uma medição independente da fatia.
  qa: { ok: boolean; motivos: string[]; tentativas: number; metricas: unknown };
  createdAt: string;
};
export type TutorialNarration = {
  schema: 3; flow: string; profile: TutorialProfile; key: string; text: string;
  audio: string; seconds: number; sha256: string; qa: TutorialClip['qa']; createdAt: string;
};
export type TutorialAudioManifest = {
  schema: 3; flow: string; profile: TutorialProfile; source: TutorialNarration; clips: TutorialClip[];
};

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** Texto, voz, backend, modelo, direção e régua invalidam um take congelado. */
export function chaveNarracao(flow: string, stepId: string, text: string, profile = perfilTutorial(flow)): string {
  return sha256(JSON.stringify({ schema: 3, flow, stepId, text, profile }));
}

export function clipAtual(clip: TutorialClip | undefined, key: string, bytes?: Buffer): boolean {
  return !!clip && clip.key === key && clip.qa?.ok === true
    && Number.isFinite(clip.seconds) && clip.seconds > 0 && !!clip.sha256
    && (!bytes || sha256(bytes) === clip.sha256);
}

export function validarClipsTutorial(
  flow: { id: string; steps: Array<{ id: string; narration: string }> },
  manifest: TutorialAudioManifest,
): Map<string, TutorialClip> {
  if (manifest.schema !== 3 || manifest.flow !== flow.id) throw new Error('Manifesto de áudio legado ou de outro tutorial; gere a narração atual');
  if (!manifest.source?.qa?.ok || manifest.source.flow !== flow.id
    || manifest.source.key !== chaveNarracao(flow.id, 'continuous', manifest.source.text)
    || JSON.stringify(manifest.source.profile) !== JSON.stringify(perfilTutorial(flow.id))) {
    throw new Error('Take contínuo de origem ausente, desatualizado ou reprovado');
  }
  const clips = new Map(manifest.clips.map(c => [c.id, c]));
  if (clips.size !== manifest.clips.length) throw new Error('Manifesto com etapas duplicadas');
  for (const step of flow.steps) {
    const clip = clips.get(step.id);
    if (!clipAtual(clip, chaveNarracao(flow.id, step.id, step.narration))
      || clip!.sourceSha256 !== manifest.source.sha256
      || !(clip!.sourceStart >= 0 && clip!.sourceEnd > clip!.sourceStart && clip!.sourceEnd <= manifest.source.seconds + 0.05)) {
      throw new Error(`Narração ausente, desatualizada ou reprovada: ${flow.id}/${step.id}`);
    }
  }
  return clips;
}
