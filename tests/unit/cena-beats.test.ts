import { describe, it, expect } from 'vitest';
import {
  BEATS_CANONICOS, TURNOS_PARA_IMPASSE,
  NOTAS_DE_VEREDITO, TETO_CENA,
  consolidarCena, descritoresPendentes, montarBeatsDaCena, podeEncerrar, proximoBeat,
  type BeatDaCena, type EvidenciaDescritor, type PerguntaIA3,
} from '@/lib/season-engine/cena/beats';
import { nivelDaNota } from '@/lib/nivel-regua';

/**
 * A cobertura por engenharia é a única coisa que impede a cena de ser PIOR que
 * a prova escrita. O instrumento de hoje cobre os 6 descritores por construção
 * (4 perguntas com `descritores_primarios`); numa conversa livre, a cobertura
 * depende do rumo. Estes testes exercitam as duas regras que restauram a
 * garantia: montar beats só sobre cenário íntegro, e recusar encerramento com
 * beat pendente.
 */

const perguntasOk = (): PerguntaIA3[] => [
  { numero: 1, descritores_primarios: [1, 2], o_que_diferencia_niveis: 'N1 ... | N3 ...', resposta_generica_falha_porque: 'x' },
  { numero: 2, descritores_primarios: [2, 3] },
  { numero: 3, descritores_primarios: [4, 5] },
  { numero: 4, descritores_primarios: [5, 6] },
];

const beatsOk = (): BeatDaCena[] => {
  const { beats, erros } = montarBeatsDaCena(perguntasOk());
  expect(erros).toEqual([]);
  return beats;
};

const estadoBase = (over: Partial<Parameters<typeof podeEncerrar>[0]> = {}) => ({
  turno: 5,
  tetoTurnos: 14,
  beats: beatsOk(),
  beatsCumpridos: [1, 2, 3, 4],
  modeloPediuEncerrar: false,
  motivoDoModelo: null,
  turnosSemAvanco: 0,
  condicaoSatisfeita: false,
  ...over,
});

describe('montarBeatsDaCena — herda o contrato de cobertura da IA3', () => {
  it('liga as 4 perguntas aos 4 beats canônicos, na ordem dos pilares', () => {
    const { beats, erros } = montarBeatsDaCena(perguntasOk());
    expect(erros).toEqual([]);
    expect(beats.map((b) => b.pilar)).toEqual(['ESCOLHA', 'COMO', 'TENSAO_HUMANA', 'SUSTENTABILIDADE']);
    expect(beats[0].descritores).toEqual([1, 2]);
    expect(beats[0].diferenciaNiveis).toContain('N3');
  });

  it('ACUSA descritor sem nenhum beat — o buraco que faria a nota mentir', () => {
    const p = perguntasOk();
    p[3].descritores_primarios = [5]; // D6 fica órfão
    const { erros } = montarBeatsDaCena(p);
    expect(erros.join(' ')).toContain('D6');
  });

  it('ACUSA descritor fora da faixa em vez de ignorar em silêncio', () => {
    const p = perguntasOk();
    p[2].descritores_primarios = [4, 9];
    const { erros } = montarBeatsDaCena(p);
    expect(erros.some((e) => e.includes('fora de 1..6'))).toBe(true);
  });

  it('ACUSA cenário sem as 4 perguntas', () => {
    const { erros } = montarBeatsDaCena(perguntasOk().slice(0, 3));
    expect(erros.join(' ')).toContain('4 perguntas');
  });

  it('ACUSA pergunta sem descritor primário', () => {
    const p = perguntasOk();
    p[1].descritores_primarios = [];
    const { erros } = montarBeatsDaCena(p);
    expect(erros.some((e) => e.includes('sem descritor primário'))).toBe(true);
  });
});

describe('proximoBeat — ordem canônica, não escolha do modelo', () => {
  it('entrega os beats na ordem, garantindo que o 4 aconteça', () => {
    const beats = beatsOk();
    expect(proximoBeat(beats, [])?.numero).toBe(1);
    expect(proximoBeat(beats, [1, 2])?.numero).toBe(3);
    expect(proximoBeat(beats, [1, 2, 3])?.numero).toBe(4);
    expect(proximoBeat(beats, [1, 2, 3, 4])).toBeNull();
  });

  it('lista os descritores que nenhum beat cumprido tocou', () => {
    expect(descritoresPendentes(beatsOk(), [1, 2])).toEqual([4, 5, 6]);
    expect(descritoresPendentes(beatsOk(), [1, 2, 3, 4])).toEqual([]);
  });
});

describe('podeEncerrar — o código decide, o modelo pede', () => {
  it('NEGA o acordo pedido pelo modelo enquanto houver beat pendente', () => {
    const v = podeEncerrar(estadoBase({
      beatsCumpridos: [1, 2],
      modeloPediuEncerrar: true,
      motivoDoModelo: 'acordo',
    }));
    expect(v.encerrar).toBe(false);
    expect(v.negadoPorBeatPendente).toBe(3);
  });

  it('aceita o acordo quando os 4 beats aconteceram', () => {
    const v = podeEncerrar(estadoBase({ modeloPediuEncerrar: true, motivoDoModelo: 'acordo' }));
    expect(v).toMatchObject({ encerrar: true, motivo: 'acordo' });
  });

  it('deixa a RUPTURA passar por cima da cobertura — insistir seria cena falsa', () => {
    const v = podeEncerrar(estadoBase({
      beatsCumpridos: [1],
      modeloPediuEncerrar: true,
      motivoDoModelo: 'ruptura',
    }));
    expect(v).toMatchObject({ encerrar: true, motivo: 'ruptura' });
  });

  it('deixa o TETO passar por cima da cobertura', () => {
    const v = podeEncerrar(estadoBase({ turno: 14, beatsCumpridos: [] }));
    expect(v).toMatchObject({ encerrar: true, motivo: 'teto' });
  });

  it('não declara impasse com beat pendente — primeiro tenta cumprir', () => {
    const v = podeEncerrar(estadoBase({ beatsCumpridos: [1], turnosSemAvanco: TURNOS_PARA_IMPASSE + 2 }));
    expect(v.encerrar).toBe(false);
  });

  it('declara impasse quando cobriu tudo e a cena parou de andar', () => {
    const v = podeEncerrar(estadoBase({ turnosSemAvanco: TURNOS_PARA_IMPASSE }));
    expect(v).toMatchObject({ encerrar: true, motivo: 'impasse' });
  });

  it('segue a cena quando ninguém pediu nada', () => {
    expect(podeEncerrar(estadoBase()).encerrar).toBe(false);
  });
});

describe('consolidarCena — nota em código, lacuna declarada', () => {
  const ev = (indice: number, veredito: any, forca: any, beat: number | null = 1): EvidenciaDescritor =>
    ({ indice, veredito, forca, citacao: '...', beat });

  it('sem_sinal vira LACUNA, nunca nota baixa', () => {
    const c = consolidarCena([
      ev(1, 'demonstrou', 'forte'),
      ev(2, 'sem_sinal', 'fraca'),
      ev(3, 'tentou', 'moderada'),
    ]);
    expect(c.notas[1]).toBeNull();
    expect(c.semSinal).toEqual([2, 4, 5, 6]);
    // Média só sobre o medido: 3,2 e 2,2. Nunca puxada por zeros.
    expect(c.media).toBe(2.7);
  });

  // ── Proficiência × confiança são eixos diferentes ──────────────────────────
  // A tabela antiga cruzava os dois e produzia `falhou/forte` = 1,7 contra
  // `falhou/fraca` = 1,2 — quanto mais forte a evidência de falha, MAIOR a nota.
  it('a FORÇA não mexe na nota — só na confiança', () => {
    const forte = consolidarCena([ev(1, 'falhou', 'forte')]);
    const fraca = consolidarCena([ev(1, 'falhou', 'fraca')]);
    expect(
      forte.notas[0],
      'evidência forte de falha não pode valer mais que evidência fraca de falha',
    ).toBe(fraca.notas[0]);
    expect(fraca.baixaConfianca).toEqual([1]);
    expect(forte.baixaConfianca).toEqual([]);
  });

  it('cada veredito ancora na faixa da régua', () => {
    expect(consolidarCena([ev(1, 'demonstrou', 'forte')]).notas[0]).toBe(3.2); // N3
    expect(consolidarCena([ev(1, 'tentou', 'forte')]).notas[0]).toBe(2.2);     // N2
    expect(consolidarCena([ev(1, 'falhou', 'forte')]).notas[0]).toBe(1.4);     // N1
  });

  it('RECUPERAÇÃO conta — o desempenho final vale, e a trajetória fica visível', () => {
    // Errou no beat 1 e reparou no beat 3. Em liderança isso é a competência
    // aparecendo; o `Math.min` anterior devolvia 1,4 e apagava a recuperação.
    const c = consolidarCena([ev(1, 'falhou', 'moderada', 1), ev(1, 'demonstrou', 'forte', 3)]);
    expect(c.encerramento.notas[0], 'o desempenho ASSISTIDO é o do fim').toBe(3.2);
    expect(c.notas[0], 'a AUTONOMIA continua sendo o que ela fez sozinha').toBe(1.4);
    expect(c.recuperou).toEqual([1]);
    expect(c.piorou).toEqual([]);
  });

  it('eco do molde não chega ao nível-meta — mas conta como o N2 que é', () => {
    // Fase 0c: interlocutor ditou o número, avaliado repetiu, extrator marcou
    // demonstrou, last-wins subiu D1 de 1,4 para 3,2. Quatro N1 viraram N2.
    //
    // O teto é a correção; APAGAR a evidência não é. Medido na re-extração de
    // 25/08: o filtro que tirava provocadas da série descartava 40 n2 e 1 n1 e
    // NENHUM n3 — deixou de conter inflação e passou a truncar a cena, com a
    // última evidência sumindo em 27 dos 59 descritores. Preencher o molde que
    // acabaram de te dar é um N2 legítimo; dizer que nada aconteceu é falso.
    const c = consolidarCena([
      { indice: 1, veredito: 'falhou', forca: 'moderada', citacao: 'a gente vê', beat: 1, turno: 1, provocado: false },
      { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: 'menos de três dias', beat: 4, turno: 8, provocado: true },
    ]);
    expect(c.encerramento.notas[0], 'eco não pode promover N1 a N3').toBe(2.2);
    expect(c.notas[0], 'e o hábito autônomo continua sendo o N1 da abertura').toBe(1.4);
    expect(c.recuperou, 'subiu de 1,4 para 2,2 — é trajetória, e aparece').toEqual([1]);
  });

  it('recuperação ESPONTÂNEA continua valendo — a tabela não mudou', () => {
    const c = consolidarCena([
      { indice: 1, veredito: 'falhou', forca: 'moderada', citacao: 'a', beat: 1, turno: 1, provocado: false },
      { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: 'b', beat: 3, turno: 5, provocado: false },
    ]);
    expect(c.encerramento.notas[0]).toBe(3.2);
    expect(c.notas[0]).toBe(1.4);
    expect(c.recuperou).toEqual([1]);
  });

  it('só-provocado não passa de tentou — demonstrou ditado não existe', () => {
    const c = consolidarCena([
      { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: 'três dias', beat: 4, turno: 8, provocado: true },
    ]);
    expect(c.notas[0]).toBe(2.2);
  });

  it('PIORA também fica visível', () => {
    const c = consolidarCena([ev(1, 'demonstrou', 'forte', 1), ev(1, 'falhou', 'forte', 3)]);
    expect(c.encerramento.notas[0]).toBe(1.4);
    expect(c.notas[0], 'quem abre no nível-meta e desaba abre no nível-meta').toBe(3.2);
    expect(c.piorou).toEqual([1]);
  });

  it('reporta a cobertura ao lado da nota — o número que decide se a cena substitui', () => {
    const c = consolidarCena([ev(1, 'demonstrou', 'forte'), ev(2, 'tentou', 'fraca')]);
    expect(c.cobertura).toEqual({ medidos: 2, total: 6, taxa: 0.333 });
  });

  it('cena que não mediu nada devolve nota nula, não N1', () => {
    const c = consolidarCena([]);
    expect(c.media).toBeNull();
    expect(c.nivel).toBeNull();
    expect(c.cobertura.medidos).toBe(0);
  });

  // ── Teto de observabilidade: a cena não emite N4 sozinha ───────────────────
  // O N4 da régua descreve fenômeno organizacional (equipe que se auto-organiza,
  // prática institucionalizada, resultado sustentado). Uma conversa 1:1 não
  // demonstra isso, por melhor que seja a fala — e com a tabela antiga
  // (demonstrou/forte = 3,9) 2 dos 5 alunos N3 saíram N4 na fase 0.
  it('cena perfeita para nos SEIS descritores em N3, nunca N4', () => {
    const todosFortes = [1, 2, 3, 4, 5, 6].map((i) => ev(i, 'demonstrou', 'forte'));
    const c = consolidarCena(todosFortes);
    expect(c.media).toBe(3.2);
    expect(c.nivel, 'N4 exige triangulação — cena + evidência real + repetição').toBe(3);
  });

  // Este é o teste que realmente guarda o teto. A constante `TETO_CENA` NÃO
  // guarda: subi-la para 4,0 numa mutação deixou os 26 testes verdes, porque
  // `demonstrou` já vale menos que ela. Quem impede N4 é a TABELA, e é a tabela
  // que precisa de asserção — senão o dia em que alguém subir `demonstrou` para
  // 3,6 "porque a cena estava severa", a cena volta a emitir N4 sozinha.
  it('nenhum veredito da tabela alcança o piso do N4', () => {
    for (const [veredito, nota] of Object.entries(NOTAS_DE_VEREDITO)) {
      expect(nivelDaNota(nota), `${veredito} = ${nota} chegaria a N4`).toBeLessThan(4);
      expect(nota).toBeLessThanOrEqual(TETO_CENA);
    }
  });

  it('NÃO publica nível com cobertura incompleta — a média fica, o rótulo não', () => {
    const c = consolidarCena([ev(1, 'demonstrou', 'forte'), ev(2, 'demonstrou', 'forte')]);
    expect(c.media).toBe(3.2);
    expect(
      c.nivel,
      '"N3" lido de 2 de 6 descritores é decisão de competência tomada pela metade',
    ).toBeNull();
    expect(c.nivelSuprimidoPorque).toContain('2/6');
  });

  it('NÃO publica nível quando a maioria da evidência é fraca', () => {
    const c = [1, 2, 3, 4, 5, 6].map((i) => ev(i, 'demonstrou', i <= 4 ? 'fraca' : 'forte'));
    const r = consolidarCena(c);
    expect(r.cobertura.medidos).toBe(6);
    expect(r.nivel).toBeNull();
    expect(r.nivelSuprimidoPorque).toContain('evidência fraca');
  });

  // ── Extração inválida não pode virar nota (medido 25/08/2026) ─────────────
  // O extrator passou a numerar as ENTRADAS (1…18 num cenário de 6 descritores)
  // em vez de apontar o descritor. As seis primeiras foram lidas como D1–D6, as
  // doze restantes descartadas em silêncio, e a cobertura ainda dizia 6/6 —
  // porque 1…6 sempre existem. O `continue` calado escondeu o defeito.
  it('índice fora da faixa SUPRIME o nível e é reportado, não descartado calado', () => {
    const evs = Array.from({ length: 18 }, (_, k) =>
      ev(k + 1, k < 6 ? 'falhou' : 'demonstrou', 'forte', 1));
    const c = consolidarCena(evs);
    expect(c.indicesInvalidos, 'os índices 7..18 têm de aparecer').toEqual(
      [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    );
    expect(c.nivel, 'extração malformada não pode produzir nível').toBeNull();
    expect(c.nivelSuprimidoPorque).toContain('extração inválida');
  });

  it('extração sã não reporta índice inválido', () => {
    const c = consolidarCena([1, 2, 3, 4, 5, 6].map((i) => ev(i, 'demonstrou', 'forte')));
    expect(c.indicesInvalidos).toEqual([]);
    expect(c.nivel).toBe(3);
  });

  it('ignora índice fora da faixa em vez de estourar', () => {
    const c = consolidarCena([ev(9, 'demonstrou', 'forte'), ev(1, 'tentou', 'forte')]);
    expect(c.cobertura.medidos).toBe(1);
  });
});

describe('BEATS_CANONICOS', () => {
  it('tem os 4 pilares da IA3, numerados para casar com perguntas[].numero', () => {
    expect(BEATS_CANONICOS.map((b) => b.numero)).toEqual([1, 2, 3, 4]);
    // O beat 4 carrega o aviso de que ele não nasce sozinho numa conversa quente
    // — é o que a prova escrita pega de graça e a cena precisa provocar.
    expect(BEATS_CANONICOS[3].comoOInterlocutorCria).toContain('não o provocar');
  });
});

describe('o beat declarado tem de MEDIR aquele descritor', () => {
  const ev = (indice: number, veredito: any, beat: number, turno = 1): EvidenciaDescritor =>
    ({ indice, veredito, forca: 'forte', citacao: '...', beat, turno });

  // 🔴 Medido 25/08/2026: 31 de 171 evidências (18,1%) vinham de um beat que
  // não mede o descritor que pontuavam, e em 17 de 60 resultados finais foi uma
  // delas que VENCEU — D1, que pertence só ao beat 1, fechava em 3,20 com uma
  // fala do beat 4. Isso esvazia a garantia central: se D1 pode ser decidido em
  // qualquer momento, "o beat 1 aconteceu" deixa de significar "D1 foi sondado".
  it('descarta evidência de beat incompatível e a REPORTA', () => {
    const beats = beatsOk(); // b1→[1,2] b2→[2,3] b3→[4,5] b4→[5,6]
    const c = consolidarCena(
      [ev(1, 'falhou', 1), ev(1, 'demonstrou', 4)],
      6,
      { beats, beatsCumpridos: [1, 2, 3, 4] },
    );
    expect(c.notas[0], 'a evidência do beat 4 não pode decidir D1').toBe(1.4);
    expect(c.forasDoMapa).toEqual([{ descritor: 1, beat: 4 }]);
  });

  it('evidência no beat certo continua valendo', () => {
    const beats = beatsOk();
    const c = consolidarCena([ev(1, 'demonstrou', 1)], 6, { beats, beatsCumpridos: [1, 2, 3, 4] });
    expect(c.notas[0]).toBe(3.2);
    expect(c.forasDoMapa).toEqual([]);
  });

  it('sem o mapa (nenhum beat informado) nada é descartado', () => {
    const c = consolidarCena([ev(1, 'demonstrou', 4)]);
    expect(c.notas[0]).toBe(3.2);
    expect(c.forasDoMapa).toEqual([]);
  });
});

describe('ABERTURA — o hábito autônomo, separado da coachability', () => {
  const ev = (indice: number, nivel: any, turno: number, beat = 1): EvidenciaDescritor =>
    ({ indice, nivel, veredito: 'sem_sinal', forca: 'forte', citacao: '...', beat, turno });

  // 🔴 ESTE É O TESTE QUE TRANCA A DECISÃO DE 25/08/2026.
  //
  // Se alguém devolver o encerramento ao topo — por achar que "a nota final é a
  // última", ou para "dar crédito pela recuperação" —, ele cai. O rótulo que
  // alimenta PDI e trilha é a AUTONOMIA, e a razão está medida: o encerramento
  // tem DOSE ENDÓGENA. O interlocutor dita mais para quem trava e menos para
  // quem anda, então duas pessoas com o mesmo encerramento fizeram provas
  // diferentes — e a prova mais fácil vai justamente para quem foi melhor.
  it('o TOPO é a autonomia: quem abre em N1 e fecha em N3 publica N1', () => {
    const c = consolidarCena([
      ev(1, 'n1_gap', 1), ev(1, 'n3_meta', 9),
      ev(2, 'n1_gap', 2), ev(2, 'n3_meta', 8),
      ev(3, 'n1_gap', 1), ev(4, 'n1_gap', 1), ev(5, 'n1_gap', 1), ev(6, 'n1_gap', 1),
    ]);
    expect(c.media, 'autonomia = o que a pessoa fez antes de a cena ensinar').toBe(1.4);
    expect(c.nivel, 'e é ele que sai como rótulo').toBe(1);
    expect(c.encerramento.media, 'o assistido fica ao lado, não some').toBe(2.0);
    expect(c.encerramento.nivel).toBe(2);
    expect(c.recuperou, 'a diferença entre os dois é a coachability, e tem nome').toEqual([1, 2]);
  });

  it('sem deriva, as duas medidas coincidem', () => {
    const evs = [1, 2, 3, 4, 5, 6].map((i) => ev(i, 'n3_meta', 1));
    const c = consolidarCena(evs);
    expect(c.encerramento.media).toBe(c.media);
  });

  it('a supressão é da CENA, não da leitura: cobertura incompleta cala as duas', () => {
    // Se a régua valesse só para uma delas, a outra circularia com rótulo numa
    // cena que o próprio código considera insuficiente.
    const c = consolidarCena([ev(1, 'n3_meta', 1), ev(2, 'n3_meta', 1)]);
    expect(c.media).toBe(3.2);
    expect(c.nivel).toBeNull();
    expect(c.encerramento.media).toBe(3.2);
    expect(c.encerramento.nivel, 'o assistido cala junto').toBeNull();
  });

  it('confiança baixa cala as DUAS medidas', () => {
    const fracas = [1, 2, 3, 4, 5, 6].map((i) => ({
      indice: i, nivel: 'n2_em_desenvolvimento' as const, forca: 'fraca' as const,
      citacao: 'x', beat: 1, turno: 1,
    }));
    const c = consolidarCena(fracas);
    expect(c.nivel).toBeNull();
    expect(c.encerramento.nivel).toBeNull();
    expect(c.nivelSuprimidoPorque).toContain('fraca');
  });

  it('o veredito antigo ainda é lido — artefatos de antes de 25/08 continuam válidos', () => {
    const antigo: EvidenciaDescritor = { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: '...', beat: 1, turno: 1 };
    expect(consolidarCena([antigo]).notas[0]).toBe(3.2);
  });
});

describe('a cessão declarada FECHA a cena — o espelho que faltava', () => {
  // 🔴 Medido na fase 0d: a cena 4 do braço N3 terminou como IMPASSE com
  // `condicao_de_cessao_satisfeita: true`, `movimento: "ceder"`, os quatro
  // beats cumpridos e a persona dizendo "Está bem. Eu vou nessa". Faltou só o
  // `encerrar: true` do modelo.
  //
  // O defeito é o espelho da filosofia deste arquivo: ela foi escrita contra o
  // modelo encerrar CEDO, e por isso o código nunca confiou no `encerrar` —
  // mas na outra direção continuou dependendo exatamente dele. Resultado: o
  // ramo pré-registrado disparou com "impasse 100% no braço N3", e 1 dos 3
  // era isto.
  const cede = (over: any = {}) => podeEncerrar(estadoBase({ condicaoSatisfeita: true, ...over }));

  it('beats completos + cessão declarada = ACORDO, sem o modelo pedir', () => {
    const v = cede({ modeloPediuEncerrar: false });
    expect(v).toMatchObject({ encerrar: true, motivo: 'acordo' });
  });

  it('mas NÃO fecha com beat pendente — a garantia central não afrouxa', () => {
    const v = cede({ beatsCumpridos: [1, 2] });
    expect(v.encerrar, 'cessão não compra cobertura').toBe(false);
  });

  it('cessão vence o impasse: quem cedeu não está parado', () => {
    const v = cede({ turnosSemAvanco: 9 });
    expect(v.motivo, 'impasse é "ninguém saiu do lugar" — o oposto disto').toBe('acordo');
  });

  it('sem cessão, o impasse continua sendo impasse', () => {
    const v = podeEncerrar(estadoBase({ condicaoSatisfeita: false, turnosSemAvanco: 9 }));
    expect(v).toMatchObject({ encerrar: true, motivo: 'impasse' });
  });

  it('ruptura ainda passa por cima de tudo', () => {
    const v = cede({ beatsCumpridos: [], modeloPediuEncerrar: true, motivoDoModelo: 'ruptura' });
    expect(v.motivo).toBe('ruptura');
  });
});

describe('FORA DO ALCANCE — a cena não observa, logo não é gap da pessoa', () => {
  // 🔴 Medido na fase 0e, desagregando por descritor: D2 (2,44) e D4 (2,24)
  // ficaram parados enquanto D1/D3/D5/D6 chegaram a 3,00 · 3,00 · 3,20 · 2,80.
  // São exatamente os dois cujo N3 exige a outra parte na sala — "escuta TODAS
  // AS PARTES" e "acordo com compromissos DE AMBOS". A mãe não está na cena.
  // Sem eles, o braço fecha em 3,00: o nível-meta cravado.
  const beats = beatsOk();
  const evs = (nivel: any) => [1, 2, 3, 4, 5, 6].map((i) => ({
    indice: i, nivel, forca: 'forte' as const, citacao: 'x',
    beat: beats.find((b) => b.descritores.includes(i))!.numero, turno: 1,
  }));

  it('descritor não-observável não entra na conta, mesmo com evidência extraída', () => {
    const c = consolidarCena(evs('n3_meta'), 6, {
      beats, beatsCumpridos: [1, 2, 3, 4], observaveis: [1, 3, 5, 6],
    });
    expect(c.foraDoAlcance).toEqual([2, 4]);
    expect(c.notas[1], 'D2 não pode virar nota').toBeNull();
    expect(c.notas[3], 'D4 tampouco').toBeNull();
    expect(c.cobertura.medidos).toBe(4);
  });

  it('e a cena NÃO publica nível de competência — isso é da bateria', () => {
    // Publicar N3 a partir de 4 de 6 é a "nota com buraco" que este arquivo
    // existe para impedir. A média fica, para a bateria agregar; o rótulo não.
    const c = consolidarCena(evs('n3_meta'), 6, {
      beats, beatsCumpridos: [1, 2, 3, 4], observaveis: [1, 3, 5, 6],
    });
    expect(c.media, 'o que foi medido continua valendo').toBe(3.2);
    expect(c.nivel).toBeNull();
    expect(c.nivelSuprimidoPorque).toContain('BATERIA');
    expect(c.nivelSuprimidoPorque).toContain('D2, D4');
  });

  it('fora do alcance é DIFERENTE de beat que não aconteceu', () => {
    // O primeiro é propriedade do desenho — rodar de novo não resolve. O
    // segundo é acidente da conversa. Os dois viram lacuna e saem em campos
    // separados, senão o defeito de desenho se disfarça de azar.
    const c = consolidarCena(evs('n3_meta'), 6, {
      beats, beatsCumpridos: [1, 2], observaveis: [1, 3, 5, 6],
    });
    expect(c.foraDoAlcance).toEqual([2, 4]);
    expect(c.semSinal, 'D3/D5/D6 caíram por beat não cumprido, não por alcance')
      .toEqual(expect.arrayContaining([5, 6]));
  });

  it('sem declaração de observáveis, nada muda — artefatos antigos seguem iguais', () => {
    const c = consolidarCena(evs('n3_meta'), 6, { beats, beatsCumpridos: [1, 2, 3, 4] });
    expect(c.foraDoAlcance).toEqual([]);
    expect(c.nivel).toBe(3);
  });
});
