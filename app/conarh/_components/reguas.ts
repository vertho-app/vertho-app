// CONARH 52 — a lista de réguas (competências) que a demo oferece.
//
// Vive aqui, e não dentro da porta 1, porque DUAS telas dependem da mesma
// escolha: a porta 1 mostra a matriz da competência e a porta 2 roda o
// cenário dela. Montar a lista em cada componente deixaria as duas livres
// para divergir — e a porta 2 rodaria o cenário de uma competência que o
// visitante não escolheu.
//
// A competência do CASO vem sempre primeiro: é ela que segue nas portas 3 a
// 5 (PDI, kit e painel do Diego). As outras são vitrine — provam que a
// engrenagem não é um truque de liderança.

import type { ConteudoConarh, ReguaVitrine } from '../_data/types';

export const ID_REGUA_CASO = 'caso';

export function montarReguas(conteudo: ConteudoConarh): ReguaVitrine[] {
  const { porta1 } = conteudo;
  const caso: ReguaVitrine = {
    id: ID_REGUA_CASO,
    eixo: porta1.eixo ?? 'Liderança',
    competencia: porta1.competencia,
    introducao: porta1.introducao,
    descritores: porta1.descritores,
    // O `!` não é chute: `_data/conteudo.json` sempre traz o cenário do caso,
    // e o guard de conteúdo (tests/unit/conarh-conteudo.test.ts) falha se
    // alguma régua vier sem cenário — inclusive esta.
    cenario: porta1.cenario!,
  };
  return [caso, ...(porta1.reguas_vitrine ?? [])];
}

export function acharRegua(conteudo: ConteudoConarh, id: string): ReguaVitrine {
  const reguas = montarReguas(conteudo);
  return reguas.find((r) => r.id === id) ?? reguas[0];
}
