/**
 * FATOS AFLORADOS — o observável central da leitura (b), e o mais verificável
 * que este módulo tem.
 *
 * ═══ POR QUE ELE É DIFERENTE DE TUDO O QUE VEIO ANTES ═══
 *
 * Todo o resto da medida passa por julgamento de modelo: o extrator diz em que
 * âncora o comportamento cai, o juiz diz se o beat se cumpriu, o guarda diz se
 * a fala ditou. Este projeto já viu três desses degenerarem — o juiz que era
 * parte interessada, a cobertura que mentia, a flag `provocado` que marcava 76%.
 *
 * Aqui o sinal é de outra natureza: o gabarito da cena declara, ANTES de
 * qualquer conversa, N fatos que o liderado só entrega sob a sondagem certa.
 * Ou eles aparecem na transcrição, ou não aparecem. Não é opinião sobre o
 * desempenho — é um evento.
 *
 * 🔴 Medido em 26/08/2026, primeira rodada com o ator corrigido, MESMA persona
 * e mesmo gabarito nos dois braços:
 *
 *     gestor N1  →  1 de 6 fatos  (só D6, o que a professora quase oferece)
 *     gestor N3  →  4 de 6 fatos  (D1, D4, D5 e D6)
 *
 * Quatro vezes mais, e nos fatos que exigem reconstituir o episódio, conferir
 * o acordo item a item e perguntar quem mais foi atingido.
 *
 * ═══ COMO SE SABE QUE UM FATO AFLOROU ═══
 *
 * Duas fontes, de propósito, no padrão "prompt pede, código garante":
 *
 *   1. O interlocutor DECLARA no [META] qual fato acabou de entregar. Ele sabe:
 *      o prompt manda soltar um por vez, e só quando a sondagem chega.
 *   2. O código CORROBORA procurando o conteúdo do fato na fala dele.
 *
 * ⚠️ A corroboração NÃO veta a declaração. O personagem entrega o fato com as
 * palavras dele, não com as do gabarito — exigir casamento literal produziria
 * falso negativo em toda paráfrase, e o falso negativo aqui apaga evidência de
 * que o gestor chegou lá. Divergência entre as duas fontes vira AVISO para um
 * humano ler, não veredito automático.
 */

import { createHash } from 'node:crypto';

import type { FatoEnterrado } from './prompts';

/**
 * A IMPRESSÃO DIGITAL DO GABARITO — portão de entrada da âncora humana.
 *
 * O gabarito virou a régua dentro da cena: ele decide o que o gestor precisa
 * descobrir e o quanto isso é difícil. Se ele mudar entre a leitura de um
 * avaliador e a de outro, a auditoria mede alvos diferentes e ninguém percebe —
 * a versão do instrumento tem de ser uma coisa que se possa citar.
 *
 * Entra no hash o que muda a DIFICULDADE: o fato, a condição de revelação e o
 * descritor. Fica de fora o que é cosmético (ordem, espaçamento), porque
 * reordenar a lista não muda a prova.
 *
 * ⚠️ Isto congela o alvo; **não** o valida. Se a condição de revelação de um
 * fato for mais dura que a dos outros, o descritor ficou mais difícil por
 * decisão de quem escreveu — e o hash registra essa decisão sem julgá-la. Quem
 * julga é a auditoria de outra família (`promptAuditorDoGabarito`).
 */
export function hashDoGabarito(enterrados: FatoEnterrado[] | undefined): string {
  const canonico = (enterrados ?? [])
    .map((e) => ({
      d: Number(e.descritor),
      f: String(e.fato ?? '').replace(/\s+/g, ' ').trim(),
      s: String(e.so_revela_se ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .sort((a, b) => a.d - b.d || a.f.localeCompare(b.f));
  return createHash('sha256').update(JSON.stringify(canonico)).digest('hex').slice(0, 16);
}

const PALAVRAS_VAZIAS = new Set([
  'porque', 'quando', 'aquele', 'aquela', 'aquilo', 'depois', 'antes', 'mesmo',
  'ainda', 'sempre', 'nunca', 'muito', 'pouco', 'tambem', 'apenas', 'sobre',
  'entre', 'contra', 'durante', 'dentro', 'atraves', 'enquanto', 'entao',
  'assim', 'ficou', 'ficar', 'estava', 'estar', 'fazer', 'sendo', 'foram',
]);

const semAcento = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * As palavras que carregam o CONTEÚDO do fato.
 *
 * Corte em 6 letras + lista de vazias: abaixo disso a maioria é conectivo, e
 * conectivo casa com qualquer fala. O objetivo não é precisão linguística — é
 * ter um punhado de âncoras improváveis de aparecer por acaso.
 */
export function chavesDoFato(fato: string): string[] {
  return [...new Set(
    semAcento(fato).split(/[^a-z0-9]+/)
      .filter((w) => w.length > 5 && !PALAVRAS_VAZIAS.has(w)),
  )];
}

/**
 * O conteúdo do fato aparece neste texto?
 *
 * Exige a MAIOR parte das âncoras — não todas (o personagem parafraseia) e não
 * uma só (uma palavra casa por acaso). Um terço, com piso de duas, foi o corte
 * que separou os braços na primeira rodada; está exposto para poder mudar com
 * denominador em vez de por intuição.
 */
export const MIN_CHAVES = (total: number) => Math.max(2, Math.ceil(total / 3));

export function fatoApareceEm(fato: string, texto: string): boolean {
  const chaves = chavesDoFato(fato);
  if (!chaves.length) return false;
  const alvo = semAcento(texto);
  return chaves.filter((c) => alvo.includes(c)).length >= MIN_CHAVES(chaves.length);
}

export interface FalaDoInterlocutor {
  role: 'user' | 'assistant';
  content: string;
  turno?: number;
}

/**
 * TRÊS ESTADOS, não um booleano.
 *
 * 🔴 Medido nas 10 cenas de 26/08: das 60 combinações cena × fato, **14 (23,3%)
 * têm as duas fontes discordando** — 13 em que só o matcher achou e 1 em que só
 * o ator declarou. Das 23 aflorações contadas, as fontes concordam em **9**.
 *
 * Chamei isso de "duplo-fonte". Com `declarado || corroborado` era um OU
 * generoso, e o matcher carregava o resultado sozinho na maioria dos casos —
 * um detector com corte escolhido porque separou os braços na primeira rodada.
 *
 * Enquanto a leitura humana não arbitrar, **`disputado` não conta como
 * aflorado**. É a mesma regra do nível suprimido: o que não se sustenta não
 * circula como se sustentasse.
 */
export type EstadoDoFato = 'confirmado' | 'disputado' | 'ausente';

export interface VeredictoDoFato {
  descritor: number;
  /** O interlocutor disse, no [META], que entregou este fato. */
  declarado: boolean;
  /** O conteúdo do fato aparece na fala dele. */
  corroborado: boolean;
  estado: EstadoDoFato;
  /** Só `confirmado`. `disputado` fica de fora até a arbitragem humana. */
  aflorou: boolean;
}

export interface MedidaDeFatos {
  porFato: VeredictoDoFato[];
  /** Só os `confirmado`. É o número que pode circular. */
  aflorados: number;
  /** Os `disputado` — visíveis ao lado, nunca somados por baixo do pano. */
  disputados: number;
  total: number;
  /** `aflorados / total`. Estrita, como o campo acima. */
  taxa: number | null;
  /**
   * A taxa que sairia com o OU generoso de antes. Fica exposta porque é o
   * TETO da medida — e a distância entre as duas diz o quanto o resultado
   * depende de arbitragem que ainda não aconteceu.
   */
  taxaComDisputados: number | null;
  /** Fatos em que declaração e corroboração discordam — para humano ler. */
  divergentes: number[];
}

/**
 * @param declarados índices de descritor que o [META] do interlocutor anunciou
 *                   ter revelado ao longo da cena.
 */
export function medirFatosAflorados(
  enterrados: FatoEnterrado[] | undefined,
  historico: FalaDoInterlocutor[],
  declarados: number[] = [],
): MedidaDeFatos {
  const lista = enterrados ?? [];
  const falaDele = historico
    .filter((m) => m.role === 'assistant')
    .map((m) => String(m.content).replace(/\[META\][\s\S]*?\[\/META\]/g, ''))
    .join(' ');
  const anunciados = new Set(declarados);

  const porFato: VeredictoDoFato[] = lista.map((e) => {
    const declarado = anunciados.has(e.descritor);
    const corroborado = fatoApareceEm(e.fato, falaDele);
    const estado: EstadoDoFato = declarado && corroborado
      ? 'confirmado'
      : (declarado || corroborado) ? 'disputado' : 'ausente';
    return { descritor: e.descritor, declarado, corroborado, estado, aflorou: estado === 'confirmado' };
  });

  const aflorados = porFato.filter((f) => f.estado === 'confirmado').length;
  const disputados = porFato.filter((f) => f.estado === 'disputado').length;
  return {
    porFato,
    aflorados,
    disputados,
    total: lista.length,
    taxa: lista.length ? Number((aflorados / lista.length).toFixed(3)) : null,
    taxaComDisputados: lista.length
      ? Number(((aflorados + disputados) / lista.length).toFixed(3))
      : null,
    divergentes: porFato.filter((f) => f.estado === 'disputado').map((f) => f.descritor),
  };
}
