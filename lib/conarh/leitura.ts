/**
 * CONARH 52 — a leitura da régua sobre a conversa avaliativa da etapa 2.
 *
 * A nota e o nível NÃO moram no `conteudo.json`: são derivados aqui, dos
 * níveis das quatro respostas. Se estivessem gravados, o primeiro ajuste de
 * conteúdo (uma resposta que passa de N1 para N2) deixaria a tela mostrando
 * uma média que não é a média do que o visitante acabou de ler — e nada no
 * typecheck acusaria. Mesma razão pela qual a auditoria dual-IA deriva o
 * veredito em código em vez de aceitar o que o modelo escreveu.
 *
 * Consumidores: `porta2.tsx` (tela) e `tests/unit/conarh-conteudo.test.ts`
 * (guard de conteúdo). Módulo puro — sem rede, sem env.
 */
import type { CenarioRegua } from '@/app/conarh/_data/types';
import { nivelDaNota } from '@/lib/nivel-regua';

export interface LeituraDaRegua {
  /** Média dos níveis das 4 respostas, uma casa decimal (ex.: 1,5). */
  nota: number;
  /** O nível que a régua atribui ao conjunto — `nivelDaNota`, como no motor. */
  nivel: 1 | 2 | 3 | 4;
}

/**
 * Nota → nível vem da régua ÚNICA do produto (`lib/nivel-regua`): N1 1,00–1,99 ·
 * N2 2,00–2,99 · N3 3,00–3,50 · N4 acima de 3,50. Não é arredondamento — a
 * semântica é "atingiu o nível": 1,5 é meio caminho para o N2, não um N2, e
 * arredondar promoveria a pessoa meio degrau na demo.
 *
 * Até 12/08/2026 este arquivo tinha a sua PRÓPRIA cópia da conversão (`floor`),
 * como outros oito pontos do código — e nenhuma delas conhecia o corte do N4 em
 * 3,5. Régua duplicada é régua que diverge; aqui só se chama a canônica.
 */
export function lerRespostas(cenario: Pick<CenarioRegua, 'perguntas'>): LeituraDaRegua {
  const niveis = cenario.perguntas.map((p) => p.nivel);
  const media = niveis.reduce((s, n) => s + n, 0) / niveis.length;
  const nota = Math.round(media * 10) / 10;
  const nivel = nivelDaNota(media);
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
