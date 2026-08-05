/**
 * CONARH 52 — a leitura da régua sobre a conversa avaliativa da etapa 2.
 *
 * A nota e o nível NÃO moram no `conteudo.json`: são derivados aqui, dos
 * níveis dos quatro turnos. Se estivessem gravados, o primeiro ajuste de
 * conteúdo (um turno que passa de N1 para N2) deixaria a tela mostrando uma
 * média que não é a média dos turnos que o visitante acabou de ler — e nada
 * no typecheck acusaria. Mesma razão pela qual a auditoria dual-IA deriva o
 * veredito em código em vez de aceitar o que o modelo escreveu.
 *
 * Consumidores: `porta2.tsx` (tela) e `tests/unit/conarh-conteudo.test.ts`
 * (guard de conteúdo). Módulo puro — sem rede, sem env.
 */
import type { CenarioRegua } from '@/app/conarh/_data/types';

export interface LeituraDaRegua {
  /** Média dos níveis dos turnos, uma casa decimal (ex.: 1,5). */
  nota: number;
  /** A nota arredondada — o nível que a régua atribui à conversa. */
  nivel: 1 | 2 | 3 | 4;
}

export function lerConversa(cenario: Pick<CenarioRegua, 'conversa'>): LeituraDaRegua {
  const niveis = cenario.conversa.map((t) => t.nivel);
  const media = niveis.reduce((s, n) => s + n, 0) / niveis.length;
  const nota = Math.round(media * 10) / 10;
  const nivel = Math.min(4, Math.max(1, Math.round(media))) as 1 | 2 | 3 | 4;
  return { nota, nivel };
}

/** Nota no formato da tela e do PDF brasileiro: 1,5 — nunca 1.5. */
export function formatarNota(nota: number): string {
  return nota.toFixed(1).replace('.', ',');
}

export type RelacaoComRegua = 'igual' | 'acima' | 'abaixo';

/**
 * Como a classificação do visitante se relaciona com a da régua.
 *
 * NUNCA "certo/errado" — é "o seu padrão" × "a régua" (aceite do sprint). Quem
 * classifica acima leu a mesma conversa com mais generosidade; quem classifica
 * abaixo, com mais severidade. As duas coisas são informação sobre o padrão da
 * casa dele, não erro dele.
 */
export function compararComRegua(atribuido: number, daRegua: number): RelacaoComRegua {
  if (atribuido === daRegua) return 'igual';
  return atribuido > daRegua ? 'acima' : 'abaixo';
}
