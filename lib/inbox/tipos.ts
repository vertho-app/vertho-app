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
  naoLidas: number;
  janela: Janela;
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

export interface NaoResolvida {
  id: string;
  from_phone: string;
  texto: string | null;
  tipo: string;
  ambiguidade: string | null;
  recebida_em: string;
}
