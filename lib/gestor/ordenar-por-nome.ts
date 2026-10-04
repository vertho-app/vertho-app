/**
 * Pessoas em ORDEM ALFABÉTICA, sem desempate por resultado (R-111, 04/10/2026).
 *
 * A "Evolução da equipe" do gestor abria ordenada por "Maior delta" e oferecia
 * "Menor delta": na prática um ranking de pessoas nomeadas pelo avanço, contra a
 * decisão do dono de que nenhuma tela do cliente ordena gente por resultado (o RH
 * vê a lista em ordem alfabética, e o gestor também). Nome é o único critério que
 * não diz nada sobre ninguém.
 *
 * `localeCompare` em pt-BR com `sensitivity: 'base'`: "Ágata" fica antes de
 * "Bruno" e "ana" empata com "Ana", em vez de a acentuação ou a caixa decidirem a
 * ordem. Quem tem o mesmo nome (a mesma pessoa em duas competências, ou
 * homônimos) mantém a ordem em que chegou, porque `Array.prototype.sort` é
 * estável. Não muta a lista recebida.
 */
export function ordenarPorNome<T extends { colab?: string | null; nome?: string | null }>(lista: T[]): T[] {
  const nomeDe = (x: T) => String(x?.colab ?? x?.nome ?? '');
  return [...lista].sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), 'pt-BR', { sensitivity: 'base' }));
}
