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
    expect(c.notas[0]).toBe(3.2);
    expect(c.recuperou).toEqual([1]);
    expect(c.piorou).toEqual([]);
  });

  it('PIORA também fica visível', () => {
    const c = consolidarCena([ev(1, 'demonstrou', 'forte', 1), ev(1, 'falhou', 'forte', 3)]);
    expect(c.notas[0]).toBe(1.4);
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
