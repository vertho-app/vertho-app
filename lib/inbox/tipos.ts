/**
 * Tipos da caixa de entrada.
 *
 * Vivem FORA do arquivo `'use server'` de propósito. Num módulo de Server
 * Actions o Next trata os exports de forma especial, e o TypeScript deixa de
 * estreitar a união discriminada de `ResultadoEnvio` no cliente — o `if (r.ok)`
 * para de funcionar e `r.motivo` vira erro de compilação. Tipo em arquivo comum
 * resolve, e ainda deixa a action importar em vez de declarar.
 */
import type { Janela } from './janela';
import type { ItemThread } from './thread';

export interface Conversa {
  telefone: string;
  colaboradorId: string | null;
  nome: string | null;
  ultimaEm: string;
  ultimoTexto: string | null;
  /** Tipo da última mensagem — decide a prévia quando não há texto. */
  ultimoTipo: string | null;
  naoLidas: number;
  /** Motivo de a última mensagem não ter dono, quando não teve. */
  ambiguidade: string | null;
  janela: Janela;
  /** Quantas mensagens ELA mandou. `0` = nunca respondeu (mig 220). */
  recebidas: number;
  /** Quantas NÓS mandamos. */
  enviadas: number;
  /**
   * De quem foi a última mensagem.
   *
   * A prévia muda de sentido conforme o lado: *"Bom dia!"* de quem escreveu é
   * alguém esperando resposta; a mesma frase vinda de nós é o último disparo.
   */
  ultimoLado: 'pessoa' | 'equipe';
}

/**
 * Conversa na caixa da EQUIPE (todas as empresas).
 *
 * `empresaId` nulo é um estado legítimo, não um defeito de dados: é o telefone
 * que o webhook não conseguiu atribuir. Ele aparece na mesma lista, porque uma
 * pessoa esperando resposta continua esperando enquanto a gente não descobre de
 * qual cliente ela é.
 */
export interface ConversaGlobal extends Conversa {
  empresaId: string | null;
  empresa: string | null;
}

export interface ResumoCaixa {
  conversas: number;
  /** Quantas CONVERSAS têm ao menos uma não lida (≠ total de mensagens). */
  conversasNaoLidas: number;
  naoLidas: number;
  janelasAbertas: number;
  naoIdentificadas: number;
}

/** Candidato a dono de um telefone não resolvido, para a associação manual. */
export interface CandidatoDono {
  colaboradorId: string;
  nome: string | null;
  email: string | null;
  empresaId: string;
  empresa: string;
}

/** Uma conversa não identificada + a quem ela pode pertencer. */
export interface FilaNaoIdentificada {
  telefone: string;
  ultimaEm: string;
  ultimoTexto: string | null;
  ultimoTipo: string | null;
  total: number;
  naoLidas: number;
  ambiguidade: string | null;
  candidatos: CandidatoDono[];
}

export interface ThreadCompleta {
  telefone: string;
  nome: string | null;
  colaboradorId: string | null;
  janela: Janela;
  itens: ItemThread[];
}

/**
 * Resultado de um envio.
 *
 * ⚠️ NÃO É UNIÃO DISCRIMINADA, e isso é uma restrição do projeto, não descuido:
 * o `tsconfig.json` deste repositório tem **`"strict": false`**, e sem
 * `strictNullChecks` o TypeScript NÃO estreita união por booleano literal —
 * `true` e `false` colapsam em `boolean`, e um `if (!r.ok)` deixa de dar acesso
 * a `r.motivo`. Reproduzido isoladamente em 14/08/2026; o erro aparece como
 * "Property 'motivo' does not exist", que parece problema do consumidor e é do
 * compilador.
 *
 * Interface achatada com campos opcionais funciona nos dois modos. O custo é o
 * contrato ficar menos preciso — `motivo` existe no tipo mesmo quando `ok` é
 * verdadeiro —, e a compensação é o comentário abaixo.
 *
 * `janelaFechada` é separado de `motivo` porque a tela reage diferente: motivo
 * vira aviso; janela fechada obriga a recarregar o estado, senão o campo de
 * resposta continua oferecido depois de já não valer.
 */
export interface ResultadoEnvio {
  ok: boolean;
  /** Presente quando `ok`. */
  wamid?: string | null;
  /** Presente quando `!ok`. */
  motivo?: string;
  /** `true` quando a recusa foi a janela de 24h — a tela precisa recarregar. */
  janelaFechada?: boolean;
}

/** Resultado de uma associação manual de telefone não identificado. */
export interface ResultadoAssociacao {
  ok: boolean;
  /** Quantas mensagens daquele telefone foram atribuídas. */
  mensagens?: number;
  motivo?: string;
}
