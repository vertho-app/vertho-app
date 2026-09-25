/**
 * Avatar compartilhado por grupo (empresa × módulo × cargo) — peças PURAS.
 *
 * O avatar (intro e outro) é ~65% do custo de um vídeo, e hoje cada célula DISC do
 * mesmo módulo paga o seu. O plano (docs/GERADOR-VIDEO-MODULO.md) é a 1ª célula do
 * grupo gerar o avatar e as irmãs reaproveitarem o clipe. Este arquivo concentra o
 * que dá para decidir sem rede nem banco, para ser testado isolado.
 */

interface CenaComNarracao { id: string; narration?: string | null }

export interface PlanoNarracao<C extends CenaComNarracao = CenaComNarracao> {
  /** Cenas com texto a narrar, na ordem do roteiro. */
  cenasComTexto: C[];
  /** As que ainda não têm áudio neste vídeo. */
  pendentes: C[];
  /** Sintetizar as pendentes numa chamada só (a "narração única"). */
  usarTakeUnico: boolean;
}

/**
 * Decide o que a narração do vídeo precisa sintetizar, e se pode ser num take só.
 *
 * A narração única existe para a voz não mudar de uma cena para outra (06/09/2026).
 * Ela só vale quando TODO o áudio que já existe é de um take com a mesma voz — senão
 * o vídeo fica com dois takes emendados sem ninguém ter decidido isso. Por isso:
 *   · sem nada gerado → take único sobre tudo (o caso de sempre);
 *   · resume parcial ou retake de cena (`regerarCenas`) → caminho por cena, como antes;
 *   · cenas `fixas` (o avatar do grupo, já pronto e aprovado) não contam como "já
 *     gerado": o take único sai sobre o resto, e é o alvo do portão que casa a altura.
 *
 * Sem `fixas`, o resultado é idêntico ao `nadaGerado` que o trigger usava.
 */
export function planoDeNarracao<C extends CenaComNarracao>(
  cenas: C[],
  temAudio: (id: string) => boolean,
  opts: { fixas?: ReadonlySet<string> } = {},
): PlanoNarracao<C> {
  const fixas = opts.fixas ?? new Set<string>();
  const cenasComTexto = cenas.filter((s) => String(s.narration ?? '').trim());
  const pendentes = cenasComTexto.filter((s) => !temAudio(s.id));
  const jaGeradasForaDasFixas = cenasComTexto.filter((s) => temAudio(s.id) && !fixas.has(s.id)).length;
  return {
    cenasComTexto,
    pendentes,
    usarTakeUnico: pendentes.length > 1 && jaGeradasForaDasFixas === 0,
  };
}
