// O fato aflorou, ou o gestor não chegou lá?
//
// 🔴 Medido em 26/08/2026, primeira rodada com o ator corrigido, MESMA persona
// e mesmo gabarito nos dois braços:
//
//     gestor N1  →  1 de 6 fatos  (só D6, o que a professora quase oferece)
//     gestor N3  →  4 de 6 fatos  (D1, D4, D5 e D6)
//
// É o único observável do módulo que não é julgamento sobre desempenho: os
// fatos são declarados no gabarito ANTES da conversa, e depois ou aparecem na
// transcrição, ou não. Todo o resto — âncora do extrator, beat cumprido,
// ditação — passa por opinião de modelo, e este projeto já viu três dessas
// degenerarem.
import { describe, expect, it } from 'vitest';
import {
  chavesDoFato, fatoApareceEm, medirFatosAflorados, MIN_CHAVES,
} from '@/lib/season-engine/cena/fatos';
import type { FatoEnterrado } from '@/lib/season-engine/cena/prompts';

const FATOS: FatoEnterrado[] = [
  {
    descritor: 1,
    fato: 'No portão, Fátima respondeu em voz alta que a mãe não tinha o direito de gritar ali',
    so_revela_se: 'o gestor reconstituir o episódio minuto a minuto',
  },
  {
    descritor: 4,
    fato: 'O acordo anterior era assimétrico: só Fátima assumiu compromisso, Dona Rute não assumiu nenhum',
    so_revela_se: 'o gestor pedir para listar o que cada uma se comprometeu',
  },
];

describe('chavesDoFato — âncoras improváveis de casar por acaso', () => {
  it('fica com as palavras de conteúdo', () => {
    const c = chavesDoFato('Juninho faltou 14 dias porque acompanha o pai na colheita');
    expect(c).toContain('juninho');
    expect(c).toContain('acompanha');
    expect(c).toContain('colheita');
  });

  it('descarta conectivo, que casaria com qualquer fala', () => {
    const c = chavesDoFato('porque quando depois entao assim tambem');
    expect(c).toEqual([]);
  });

  it('descarta palavra curta pelo mesmo motivo', () => {
    expect(chavesDoFato('ela foi la e viu tudo')).toEqual([]);
  });
});

describe('fatoApareceEm — paráfrase passa, coincidência não', () => {
  const FATO = 'O acordo anterior era assimétrico: só Fátima assumiu compromisso, Dona Rute não assumiu nenhum';

  it('reconhece o fato dito com outras palavras', () => {
    // O personagem entrega com a fala DELE, não com a do gabarito.
    expect(fatoApareceEm(FATO, 'naquele acordo quem assumiu compromisso fui eu, a Rute não assumiu nada')).toBe(true);
  });

  it('NÃO casa quando só uma âncora aparece', () => {
    expect(fatoApareceEm(FATO, 'a gente fez um acordo aqui nessa mesa')).toBe(false);
  });

  it('o piso é duas âncoras, mesmo em fato curto', () => {
    expect(MIN_CHAVES(1)).toBe(2);
    expect(MIN_CHAVES(9)).toBe(3);
  });

  it('fato sem palavra de conteúdo nunca "aparece" — não inventa evidência', () => {
    expect(fatoApareceEm('ela foi la', 'ela foi la')).toBe(false);
  });
});

describe('medirFatosAflorados — duas fontes, e a divergência é lida por gente', () => {
  const hist = (falaDele: string) => ([
    { role: 'assistant' as const, content: falaDele, turno: 1 },
    { role: 'user' as const, content: 'e o que mais?', turno: 1 },
  ]);

  it('conta o fato quando o conteúdo aparece na fala do interlocutor', () => {
    const m = medirFatosAflorados(FATOS, hist(
      'naquele acordo quem assumiu compromisso fui eu, a Rute não assumiu nada',
    ));
    expect(m.aflorados).toBe(1);
    expect(m.porFato.find((f) => f.descritor === 4)).toMatchObject({ corroborado: true, aflorou: true });
    expect(m.taxa).toBe(0.5);
  });

  it('conta também quando o interlocutor DECLARA, mesmo sem o texto casar', () => {
    // A corroboração não veta a declaração: o personagem parafraseia, e falso
    // negativo aqui apagaria evidência de que o gestor chegou lá.
    const m = medirFatosAflorados(FATOS, hist('foi tudo por escrito, você viu'), [1]);
    expect(m.porFato.find((f) => f.descritor === 1)).toMatchObject({
      declarado: true, corroborado: false, aflorou: true,
    });
    expect(m.divergentes, 'e a discordância fica registrada para um humano ler').toEqual([1]);
  });

  it('a fala do AVALIADO não conta — senão citar o assunto viraria descoberta', () => {
    const so_do_gestor = [
      { role: 'assistant' as const, content: 'não vou falar disso', turno: 1 },
      { role: 'user' as const, content: 'o acordo era assimétrico, só você assumiu compromisso e a Rute nenhum', turno: 1 },
    ];
    expect(medirFatosAflorados(FATOS, so_do_gestor).aflorados).toBe(0);
  });

  it('o [META] dentro da fala não conta como revelação', () => {
    const comMeta = hist('não vou falar disso\n[META]\n{"fato_revelado":4,"acordo":"assimétrico Fátima compromisso Rute assumiu"}\n[/META]');
    expect(medirFatosAflorados(FATOS, comMeta).aflorados).toBe(0);
  });

  it('sem gabarito, a taxa é null — não vira zero disfarçado', () => {
    expect(medirFatosAflorados([], []).taxa).toBeNull();
    expect(medirFatosAflorados(undefined, []).taxa).toBeNull();
  });
});
