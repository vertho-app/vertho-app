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
  chavesDoFato, fatoApareceEm, hashDoGabarito, medirFatosAflorados, MIN_CHAVES,
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

  it('CONFIRMADO exige as duas fontes', () => {
    const m = medirFatosAflorados(FATOS, hist(
      'naquele acordo quem assumiu compromisso fui eu, a Rute não assumiu nada',
    ), [4]);
    expect(m.porFato.find((f) => f.descritor === 4)).toMatchObject({
      declarado: true, corroborado: true, estado: 'confirmado', aflorou: true,
    });
    expect(m.aflorados).toBe(1);
    expect(m.taxa).toBe(0.5);
  });

  it('uma fonte só é DISPUTADO, e não conta como aflorado', () => {
    // 🔴 Medido nas 10 cenas: 14 de 60 pares têm as duas fontes discordando, e
    // das 23 aflorações elas concordam em 9. Com o OU generoso, o matcher
    // carregava o resultado sozinho — e o corte dele foi escolhido nessas
    // mesmas cenas. Enquanto a leitura humana não arbitrar, disputado não
    // circula como aflorado.
    const soCorroborado = medirFatosAflorados(FATOS, hist(
      'naquele acordo quem assumiu compromisso fui eu, a Rute não assumiu nada',
    ));
    expect(soCorroborado.porFato.find((f) => f.descritor === 4)).toMatchObject({
      estado: 'disputado', aflorou: false,
    });
    expect(soCorroborado.aflorados, 'nada confirmado').toBe(0);
    expect(soCorroborado.disputados).toBe(1);
    expect(soCorroborado.taxa).toBe(0);
    expect(soCorroborado.taxaComDisputados, 'o TETO da medida fica visível').toBe(0.5);

    const soDeclarado = medirFatosAflorados(FATOS, hist('foi tudo por escrito, você viu'), [1]);
    expect(soDeclarado.porFato.find((f) => f.descritor === 1)).toMatchObject({
      declarado: true, corroborado: false, estado: 'disputado', aflorou: false,
    });
    expect(soDeclarado.divergentes).toEqual([1]);
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

describe('hashDoGabarito — congela o alvo antes da auditoria', () => {
  // O gabarito virou a régua dentro da cena. Se ele mudar entre a leitura de um
  // avaliador e a de outro, a auditoria mede alvos diferentes e ninguém percebe.
  const base: FatoEnterrado[] = [
    { descritor: 2, fato: 'nunca ouvi a mãe', so_revela_se: 'perguntar pelo outro lado' },
    { descritor: 1, fato: 'respondi em voz alta', so_revela_se: 'reconstituir o episódio' },
  ];

  it('é estável a reordenação e a espaçamento — o que não muda a prova', () => {
    const trocado = [base[1], base[0]];
    const espacado = base.map((e) => ({ ...e, fato: `  ${e.fato}\n ` }));
    expect(hashDoGabarito(trocado)).toBe(hashDoGabarito(base));
    expect(hashDoGabarito(espacado)).toBe(hashDoGabarito(base));
  });

  it('muda quando a DIFICULDADE muda', () => {
    const maisDuro = base.map((e, i) => (i === 0 ? { ...e, so_revela_se: 'perguntar duas vezes com nome' } : e));
    expect(hashDoGabarito(maisDuro)).not.toBe(hashDoGabarito(base));
  });

  it('muda quando o fato muda, e quando o descritor muda', () => {
    expect(hashDoGabarito([{ ...base[0], fato: 'outra coisa' }, base[1]])).not.toBe(hashDoGabarito(base));
    expect(hashDoGabarito([{ ...base[0], descritor: 5 }, base[1]])).not.toBe(hashDoGabarito(base));
  });

  it('gabarito vazio tem hash — e é sempre o mesmo', () => {
    expect(hashDoGabarito([])).toBe(hashDoGabarito(undefined));
  });
});
