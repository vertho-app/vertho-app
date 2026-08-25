// O interlocutor cobrou, ou entregou?
//
// Esta é a invariante mais cara do módulo, porque o defeito que ela pega não
// parece defeito: uma cena em que o personagem diz "me dá um nome e um prazo" e
// a pessoa responde com nome e prazo produz uma transcrição ÓTIMA, cobertura
// cheia e nota alta. O que ela não produz é medida — a nota passa a descrever
// a fala do personagem.
import { describe, expect, it } from 'vitest';
import {
  classificarCitacao, elementosConcretos, falaAnteriorDoInterlocutor, medirDitado, TETO_DITADO,
} from '@/lib/season-engine/cena/ditado';
import { validarSaidaDaCena, saidaConfiavel } from '@/lib/season-engine/cena/validar-saida';
import { consolidarCena } from '@/lib/season-engine/cena/beats';

describe('elementosConcretos — número, prazo e nome; nada mais', () => {
  it('pega número, número por extenso, dia da semana e nome próprio', () => {
    const e = elementosConcretos('Eu falo com a Roseli na quinta e entrego os 12 itens em três dias');
    expect(e).toContain('12');
    expect(e).toContain('tres');
    expect(e).toContain('quinta');
    expect(e).toContain('roseli');
  });

  it('NÃO trata a primeira palavra da frase como nome próprio', () => {
    // Senão toda frase teria um "nome", e a taxa de ditação viraria ruído.
    expect(elementosConcretos('Precisamos resolver isso logo')).toEqual([]);
  });

  it('dia da semana não vira nome de gente', () => {
    expect(elementosConcretos('Falo com ela Segunda')).toEqual(['segunda']);
  });
});

describe('classificarCitacao — a fronteira que custou a fase 0c', () => {
  it('ELEMENTO PRONTO na fala anterior = ditado', () => {
    expect(classificarCitacao(
      'a Roseli fica responsável por isso',
      'Põe a Roseli como responsável, ela já conhece os dados.',
    )).toBe('ditado');
  });

  it('COBRANÇA na fala anterior = próprio — foi o avaliado que produziu', () => {
    // 🔴 Medido 25/08: das 69 evidências marcadas `provocado` pelo extrator, o
    // elemento estava na fala anterior em ZERO. A flag pegava resposta a
    // cobrança — que é o beat 2 fazendo o trabalho dele, e é o que o N3 É.
    expect(classificarCitacao(
      'a Roseli fica responsável, entrega sexta',
      'E quem fica responsável por isso? Porque comigo não fica.',
    )).toBe('proprio');
  });

  it('citação sem elemento concreto é indecidível, e devolve isso', () => {
    // Contar como "próprio" faria a taxa mentir para baixo; como "ditado",
    // reprovaria cena boa. Fica de fora do denominador.
    expect(classificarCitacao('a gente vai vendo conforme a demanda', 'Não aceito isso.'))
      .toBe('sem_elemento');
  });

  it('sem fala anterior conhecida, o lado seguro é NÃO acusar', () => {
    expect(classificarCitacao('entrego em três dias', null)).toBe('proprio');
  });
});

describe('falaAnteriorDoInterlocutor', () => {
  const hist = [
    { role: 'assistant' as const, content: 'Quem fica com o Marcos?', turno: 1 },
    { role: 'user' as const, content: 'A Roseli fica.', turno: 1 },
    { role: 'assistant' as const, content: 'Põe a Roseli, então.', turno: 2 },
    { role: 'user' as const, content: 'A Roseli fica.', turno: 2 },
  ];

  it('acha a fala do interlocutor imediatamente anterior ao turno do avaliado', () => {
    expect(falaAnteriorDoInterlocutor(hist, 1)).toBe('Quem fica com o Marcos?');
    expect(falaAnteriorDoInterlocutor(hist, 2)).toBe('Põe a Roseli, então.');
  });

  it('turno ausente devolve null — não inventa vizinho', () => {
    expect(falaAnteriorDoInterlocutor(hist, null)).toBeNull();
    expect(falaAnteriorDoInterlocutor(hist, 9)).toBeNull();
  });
});

describe('o teto de ditação REPROVA a cena de medição', () => {
  const FALA = 'Eu passo o levantamento para a Roseli e ela entrega na sexta-feira, com os 12 itens.';

  const entrada = (over: any = {}) => {
    const evidencias = over.evidencias ?? [];
    return {
      numDescritores: 6,
      totalBeats: 4,
      turnos: 4,
      beatsCumpridos: [1, 2, 3, 4],
      contrato: { armadilha: 'a', tradeoff: 'b', complicador: 'c' },
      evidencias,
      consolidacao: consolidarCena(evidencias),
      falasDoAvaliado: [FALA],
      ...over,
    };
  };

  const ev = (citacao: string, turno = 1) =>
    ({ indice: 1, nivel: 'n3_meta' as const, forca: 'forte' as const, citacao, beat: 1, turno });

  it('cena em que o personagem entrega os elementos é ERRO', () => {
    const historico = [
      { role: 'assistant' as const, content: 'Põe a Roseli nisso, e quero na sexta-feira.', turno: 1 },
      { role: 'user' as const, content: FALA, turno: 1 },
    ];
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev('passo o levantamento para a Roseli e ela entrega na sexta-feira')],
      historico,
    }));
    expect(vs.some((x) => x.severidade === 'erro' && x.campo === 'cena.ditado')).toBe(true);
    expect(saidaConfiavel(vs)).toBe(false);
  });

  it('cena em que o personagem só cobra passa', () => {
    const historico = [
      { role: 'assistant' as const, content: 'Isso não me resolve. E quando falhar de novo?', turno: 1 },
      { role: 'user' as const, content: FALA, turno: 1 },
    ];
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev('passo o levantamento para a Roseli e ela entrega na sexta-feira')],
      historico,
    }));
    expect(vs.filter((x) => x.campo === 'cena.ditado')).toEqual([]);
  });

  it('em cena de ENSAIO o teto não vale — ali ditar é o produto', () => {
    const historico = [
      { role: 'assistant' as const, content: 'Põe a Roseli nisso, e quero na sexta-feira.', turno: 1 },
      { role: 'user' as const, content: FALA, turno: 1 },
    ];
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev('passo o levantamento para a Roseli e ela entrega na sexta-feira')],
      historico,
      modo: 'ensaio',
    }));
    expect(vs.filter((x) => x.campo === 'cena.ditado')).toEqual([]);
  });

  it('sem histórico a checagem NÃO roda — melhor não medir que medir pela metade', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev('passo o levantamento para a Roseli e ela entrega na sexta-feira')],
    }));
    expect(vs.filter((x) => x.campo === 'cena.ditado')).toEqual([]);
  });
});

describe('medirDitado — a linha de base é ZERO, e o teto ainda pode disparar', () => {
  it('o teto tem folga real sobre o medido', () => {
    // Base medida na fase 0c re-extraída: 0 de 59 citações eram eco. O teto de
    // 0,20 existe para pegar o interlocutor VOLTANDO a entregar, não para
    // reprovar a cena de hoje — e um teto que nunca pode disparar é enfeite.
    expect(TETO_DITADO).toBeGreaterThan(0);
    expect(TETO_DITADO).toBeLessThan(1);
  });

  it('conta ditadas, próprias e indecidíveis separadamente', () => {
    const historico = [
      { role: 'assistant' as const, content: 'Põe a Roseli.', turno: 1 },
      { role: 'user' as const, content: 'A Roseli fica.', turno: 1 },
      { role: 'assistant' as const, content: 'E o prazo?', turno: 2 },
      { role: 'user' as const, content: 'Entrego em três dias.', turno: 2 },
      { role: 'assistant' as const, content: 'Não serve.', turno: 3 },
      { role: 'user' as const, content: 'A gente vai vendo.', turno: 3 },
    ];
    const d = medirDitado([
      { citacao: 'A Roseli fica', turno: 1 },
      { citacao: 'Entrego em três dias', turno: 2 },
      { citacao: 'A gente vai vendo', turno: 3 },
    ], historico);
    expect(d).toMatchObject({ ditadas: 1, proprias: 1, semElemento: 1, taxa: 0.5 });
  });

  it('taxa é null quando nada era decidível — não vira zero disfarçado', () => {
    const d = medirDitado([{ citacao: 'a gente vai vendo', turno: 1 }], []);
    expect(d.taxa).toBeNull();
  });
});
