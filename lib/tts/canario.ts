/**
 * CANÁRIO semanal do TTS (fase 4 do plano de deriva, 06/09/2026).
 *
 * O modelo GA do Gemini TTS é atualizado in-place pelo Google: a voz pode mudar por
 * baixo sem nenhum deploy nosso, e o único sinal seria reclamação de ouvinte. Toda
 * semana este job sintetiza o MESMO texto, na MESMA direção, em cada voz do elenco,
 * com 1 tentativa (o take como sai, não o melhor de K), e o portão grava o veredito
 * em `tts_qa_log` com origem 'canario': F0 contra o alvo, deriva, e a distância à
 * assinatura de referência da voz (identidade). A regra R19 do health lê a última
 * linha por voz e acusa quando ela falta, reprova ou se afasta da assinatura.
 *
 * Custo: ~60 s de áudio por voz (~US$ 0,01 cada) por semana.
 */
import { generateNarrationAudio } from '@/lib/gemini-tts';
import { ALVO_F0_POR_VOZ } from '@/lib/tts/deriva';

/**
 * Texto fixo de ~4 min (≈ 3.400 caracteres, 11-12 janelas de 20 s): o canário tem que
 * engajar TODOS os eixos do portão com os mesmos vetos da produção — inclinação de F0
 * e de volume só existem a partir de 3 janelas, e o modo de falha que originou este
 * trabalho é a deriva em MINUTOS, não em segundos. Texto original (o repositório é
 * público; nada de tenant aqui), no registro das narrações reais: mentora falando
 * com quem dá aula, com perguntas retóricas, listas e um fechamento.
 */
export const TEXTO_CANARIO = [
  'Você já teve aquela sensação de que a aula estava indo bem... e de repente percebeu que metade da turma tinha ficado pra trás? Não porque o conteúdo era difícil. Não porque eles não queriam entender. Mas porque você passou de um ponto para o outro sem que ninguém tivesse tempo de respirar.',
  'Ritmo não é velocidade. É a sensação de que cada parte da aula tem um lugar, um tempo, uma razão de estar ali. Quando o ritmo funciona, ninguém percebe. Quando falha, todo mundo sente, mesmo sem saber dizer o quê.',
  'Pense na última vez em que você explicou algo importante. Provavelmente você preparou bem o começo: o gancho, o exemplo, a pergunta que abre a conversa. E o meio? O meio é onde a aula costuma escorregar. É ali que a explicação cresce, os exemplos se acumulam e o tempo aperta. A tentação é acelerar para caber tudo. Só que caber não é o mesmo que chegar.',
  'Existe uma diferença simples entre cobrir um conteúdo e fazer a turma atravessá-lo. Cobrir é falar de tudo. Atravessar é garantir que cada passo tenha sido dado antes do próximo. Um professor que cobre termina a aula no horário. Um professor que faz a turma atravessar termina a aula com a turma do outro lado.',
  'Como perceber, no meio da aula, que o ritmo se perdeu? Há três sinais que aparecem antes da nota da prova. O primeiro é o silêncio errado: não o silêncio de quem pensa, mas o de quem desistiu de acompanhar. O segundo é a pergunta que volta: alguém pergunta o que você explicou dois minutos atrás, e não é distração, é que a explicação passou rápido demais para virar entendimento. O terceiro é a cópia: a turma copia o que está no quadro sem perguntar nada, porque copiar é a única coisa que ainda dá para fazer.',
  'E o que fazer quando um desses sinais aparece? A resposta não é parar tudo. É criar um ponto de apoio: uma pergunta curta, um exemplo a mais, trinta segundos para a turma dizer com as próprias palavras o que acabou de ouvir. Esses pontos de apoio custam pouco tempo e devolvem a aula ao ritmo certo. Sem eles, cada minuto ganho no relógio é um minuto perdido na aprendizagem.',
  'Uma turma que acompanha não é uma turma silenciosa nem uma turma agitada. É uma turma que responde no tempo certo. Quando você pergunta e a resposta vem, o ritmo está bom. Quando você pergunta e a resposta demora ou não vem, o ritmo pede um ajuste. Ouvir esse compasso é uma habilidade, e como toda habilidade, ela se treina.',
  'Então, o que você vai observar na sua próxima aula? Um momento em que a turma acompanhou junto, e um em que ela se perdeu. Só isso. Anote os dois. Depois, olhe para o que veio antes de cada um. É por aí que a gente começa.',
].join('\n\n');

/** Direção por voz: a mesma que a produção usa para cada personagem. */
export const DIRECAO_CANARIO: Record<string, string> = {
  Aoede: 'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.',
  Iapetus: 'Narre em português do Brasil como um mentor próximo e seguro, falando diretamente com a pessoa, ritmo moderado e pausas reflexivas naturais.',
};

export interface ResultadoCanario {
  voz: string;
  ok: boolean;
  motivos: string[];
  f0MedHz: number | null;
  timbreVsRefSigma: number | null;
  durS: number | null;
  erro?: string;
}

/** Roda o canário para as vozes dadas (default: todas com alvo de F0 no elenco). */
export async function rodarCanarioTts(vozes: string[] = Object.keys(ALVO_F0_POR_VOZ)): Promise<ResultadoCanario[]> {
  const out: ResultadoCanario[] = [];
  for (const voz of vozes) {
    try {
      const audio = await generateNarrationAudio(TEXTO_CANARIO, {
        voice: voz,
        style: DIRECAO_CANARIO[voz] ?? DIRECAO_CANARIO.Aoede,
        segmentar: false,
        tentativas: 1,
        ledger: { feature: 'canario_tts' },
      });
      const m = audio.qa?.metricas;
      out.push({
        voz,
        ok: audio.qa?.ok ?? false,
        motivos: audio.qa?.motivos ?? ['portão desligado: sem veredito'],
        f0MedHz: m && Number.isFinite(m.f0MedHz) ? m.f0MedHz : null,
        timbreVsRefSigma: m?.timbreVsRefSigma ?? null,
        durS: m?.durS ?? null,
      });
    } catch (e) {
      out.push({ voz, ok: false, motivos: [], f0MedHz: null, timbreVsRefSigma: null, durS: null, erro: (e as Error)?.message });
    }
  }
  return out;
}
