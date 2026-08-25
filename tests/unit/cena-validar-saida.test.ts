// Cada `it` aqui corresponde a um jeito de a cena produzir número sem
// significado. Três rodadas de medição foram perdidas por defeitos que só
// apareceram depois de rodar — porque nada olhava o resultado. Média e nível
// sempre saem, inclusive quando a entrada não faz sentido.
import { describe, expect, it } from 'vitest';
import { validarSaidaDaCena, saidaConfiavel, normalizar, semConectorDeBorda, type EntradaValidacao } from '@/lib/season-engine/cena/validar-saida';
import { consolidarCena, type EvidenciaDescritor } from '@/lib/season-engine/cena/beats';

const FALA_1 = 'Olha, eu vou tirar o levantamento de dados da sua lista e passar para a Roseli, até sexta-feira.';
const FALA_2 = 'Se a Roseli não conseguir, eu mesmo faço no domingo e você recebe segunda de manhã.';

const ev = (
  indice: number, veredito: any, citacao: string, turno = 2, beat = 1, forca: any = 'forte',
): EvidenciaDescritor => ({ indice, veredito, forca, citacao, beat, turno });

function entrada(over: Partial<EntradaValidacao> = {}): EntradaValidacao {
  const evidencias = over.evidencias ?? [
    ev(1, 'demonstrou', 'vou tirar o levantamento de dados da sua lista e passar para a Roseli'),
    ev(2, 'demonstrou', 'Se a Roseli não conseguir, eu mesmo faço no domingo'),
  ];
  return {
    numDescritores: 6,
    totalBeats: 4,
    turnos: 8,
    beatsCumpridos: [1, 2, 3, 4],
    contrato: { armadilha: 'alinhar com todos não resolve', tradeoff: 'A ou B', complicador: 'prazo curto' },
    evidencias,
    consolidacao: consolidarCena(evidencias),
    falasDoAvaliado: [FALA_1, FALA_2],
    ...over,
  };
}

describe('validarSaidaDaCena · o caminho feliz', () => {
  it('saída íntegra não gera erro', () => {
    const vs = validarSaidaDaCena(entrada());
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
    expect(saidaConfiavel(vs)).toBe(true);
  });
});

describe('a citação tem de ser LITERAL', () => {
  it('paráfrase é ERRO — é o alicerce da âncora humana', () => {
    // O avaliador humano classifica CONTRA a citação. Se ela for paráfrase, não
    // há o que auditar — e paráfrase é indistinguível de invenção.
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou', 'ele disse que iria repassar a tarefa para outra pessoa da equipe')],
    }));
    expect(vs.some((x) => x.severidade === 'erro' && x.campo === 'evidencias.citacao')).toBe(true);
  });

  it('tolera acento, caixa e pontuação — não é comparação exata', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou', 'VOU TIRAR O LEVANTAMENTO DE DADOS DA SUA LISTA, e passar para a Roseli!')],
    }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('EMENDA com reticências é legítima — cada fragmento é verificado por si', () => {
    // Medido 25/08/2026: o extrator une dois trechos reais com "...". Recusar
    // isso reprovaria citação honesta e treinaria o extrator a citar menos —
    // o oposto do que a auditoria humana precisa.
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou',
        'vou tirar o levantamento de dados da sua lista... eu mesmo faço no domingo e você recebe segunda')],
    }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('mas emenda com fragmento INVENTADO continua sendo erro', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou',
        'vou tirar o levantamento de dados da sua lista... e prometo que nunca mais vai acontecer isso aqui')],
    }));
    expect(vs.some((x) => x.severidade === 'erro' && x.campo === 'evidencias.citacao')).toBe(true);
  });

  it('citação curta demais é AVISO, não erro — não dá para verificar nem auditar', () => {
    const vs = validarSaidaDaCena(entrada({ evidencias: [ev(1, 'demonstrou', 'até sexta')] }));
    expect(vs.some((x) => x.severidade === 'aviso' && x.campo === 'evidencias.citacao')).toBe(true);
    expect(saidaConfiavel(vs)).toBe(true);
  });

  it('sem_sinal não precisa de citação', () => {
    const vs = validarSaidaDaCena(entrada({ evidencias: [ev(1, 'sem_sinal', '')] }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });
});

describe('o índice tem de ser descritor, não contador de linha', () => {
  it('índice fora da faixa é ERRO', () => {
    const evs = Array.from({ length: 9 }, (_, k) => ev(k + 1, 'demonstrou', 'vou tirar o levantamento de dados da sua lista'));
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.some((x) => x.severidade === 'erro' && x.campo === 'evidencias.descritor')).toBe(true);
  });

  it('pega o contador DISFARÇADO: 1,2,3…6 na ordem, com mais entradas depois', () => {
    // Este é o caso que passou batido em 25/08: os índices ficam dentro de 1..6
    // e mesmo assim são contador. Só a FORMA denuncia.
    const evs = [
      ...Array.from({ length: 6 }, (_, k) => ev(k + 1, 'falhou', 'vou tirar o levantamento de dados da sua lista')),
      ev(7, 'demonstrou', 'Se a Roseli não conseguir, eu mesmo faço no domingo'),
    ];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(
      vs.some((x) => x.severidade === 'erro' && x.detalhe.includes('contador')),
      'sem isto, 1..6 em sequência passa por cobertura completa',
    ).toBe(true);
  });
});

describe('turno, beat e enums', () => {
  it('turno fora da cena é ERRO', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou', 'vou tirar o levantamento de dados da sua lista', 99)],
    }));
    expect(vs.some((x) => x.campo === 'evidencias.turno')).toBe(true);
  });

  it('beat inexistente é ERRO', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'demonstrou', 'vou tirar o levantamento de dados da sua lista', 2, 9)],
    }));
    expect(vs.some((x) => x.campo === 'evidencias.beat' && x.severidade === 'erro')).toBe(true);
  });

  it('evidência num beat NÃO cumprido é aviso', () => {
    const vs = validarSaidaDaCena(entrada({
      beatsCumpridos: [1],
      evidencias: [ev(1, 'demonstrou', 'vou tirar o levantamento de dados da sua lista', 2, 3)],
    }));
    expect(vs.some((x) => x.severidade === 'aviso' && x.campo === 'evidencias.beat')).toBe(true);
  });

  it('veredito e força fora do enum são ERRO', () => {
    const vs = validarSaidaDaCena(entrada({
      evidencias: [ev(1, 'excelente' as any, 'vou tirar o levantamento de dados da sua lista', 2, 1, 'altissima' as any)],
    }));
    expect(vs.some((x) => x.campo === 'evidencias.veredito')).toBe(true);
    expect(vs.some((x) => x.campo === 'evidencias.forca')).toBe(true);
  });
});

describe('a aritmética da consolidação tem de fechar', () => {
  it('média informada diferente da calculada é ERRO', () => {
    const e = entrada();
    const vs = validarSaidaDaCena({ ...e, consolidacao: { ...e.consolidacao, media: 3.9 } });
    expect(vs.some((x) => x.campo === 'consolidacao.media')).toBe(true);
  });

  it('cobertura que não bate com as notas é ERRO', () => {
    const e = entrada();
    const vs = validarSaidaDaCena({
      ...e,
      consolidacao: { ...e.consolidacao, cobertura: { medidos: 6, total: 6, taxa: 1 } },
    });
    expect(vs.some((x) => x.campo === 'consolidacao.cobertura')).toBe(true);
  });

  it('nível publicado JUNTO com motivo de supressão é ERRO', () => {
    const e = entrada();
    const vs = validarSaidaDaCena({
      ...e,
      consolidacao: { ...e.consolidacao, nivel: 3, nivelSuprimidoPorque: 'cobertura 2/6' },
    });
    expect(vs.some((x) => x.campo === 'consolidacao.nivel')).toBe(true);
  });

  it('nível nulo SEM motivo é ERRO', () => {
    const e = entrada();
    const vs = validarSaidaDaCena({
      ...e,
      consolidacao: { ...e.consolidacao, nivel: null, nivelSuprimidoPorque: null },
    });
    expect(vs.some((x) => x.campo === 'consolidacao.nivel')).toBe(true);
  });
});

describe('o contrato de entrada', () => {
  it('armadilha vazia é ERRO — foi o estado das 20 primeiras cenas', () => {
    const vs = validarSaidaDaCena(entrada({
      contrato: { armadilha: '', tradeoff: 'A ou B', complicador: 'prazo' },
    }));
    expect(vs.some((x) => x.campo === 'contrato' && x.detalhe.includes('armadilha'))).toBe(true);
  });
});

describe('normalizar', () => {
  it('remove acento, caixa e pontuação, colapsa espaço', () => {
    expect(normalizar('  Até   SEXTA-feira, sim!  ')).toBe('ate sexta feira sim');
  });
});

describe('o classificador ancorado (25/08) e o artefato velho convivem', () => {
  const CIT = 'vou tirar o levantamento de dados da sua lista e passar para a Roseli';
  const evNivel = (nivel: any): any => ({ indice: 1, nivel, forca: 'forte', citacao: CIT, beat: 1, turno: 2 });

  it('evidência só com "nivel" passa — é a forma canônica agora', () => {
    const evs = [evNivel('n3_meta')];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('evidência só com "veredito" continua passando — artefato de antes da troca', () => {
    const evs = [ev(1, 'demonstrou', CIT)];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('SEM nenhum dos dois é ERRO — senão o descritor sumia como "a cena não exigiu"', () => {
    const evs = [{ indice: 1, forca: 'forte', citacao: CIT, beat: 1, turno: 2 } as any];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.some((x) => x.severidade === 'erro' && x.campo === 'evidencias.nivel')).toBe(true);
  });

  it('nível fora do enum é ERRO', () => {
    const evs = [evNivel('n4_referencia')];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.some((x) => x.detalhe.includes('nível desconhecido'))).toBe(true);
  });

  it('sem_sinal por "nivel" dispensa citação, como já dispensava por veredito', () => {
    const evs = [{ indice: 1, nivel: 'sem_sinal', forca: 'fraca', citacao: '', beat: 1, turno: 2 } as any];
    const vs = validarSaidaDaCena(entrada({ evidencias: evs, consolidacao: consolidarCena(evs) }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });
});

describe('emenda: o conector da borda é do extrator, não do falante', () => {
  // 🔴 Medido na fase 0e: uma cena INTEIRA foi invalidada por isto. O avaliado
  // disse "…zero tolerância escrito, não na minha cabeça, e as outras mães
  // vendo, POR ISSO o segundo episódio da Dona Rute já ter consequência formal";
  // o extrator cortou o meio e emendou com "e" no lugar de "por isso". Nada
  // mudou de sentido, e a régua reprovou citação honesta.
  //
  // ⚠️ Esta regra foi escrita DEPOIS de ver este caso. Ela é defensável por si
  // — emenda precisa de tecido conjuntivo nas bordas, é assim que citação
  // emendada funciona em qualquer texto —, mas o ajuste não foi validado em
  // dado que ele nunca viu.
  const FALA = 'Isso eu trato como falha do combinado e escalo pra direção com registro formal, ' +
    'zero tolerância escrito, não na minha cabeça, e as outras mães vendo, por isso o segundo ' +
    'episódio da Dona Rute já ter consequência formal e visível.';

  it('aceita a emenda quando só o conector da borda difere', () => {
    const vs = validarSaidaDaCena(entrada({
      falasDoAvaliado: [FALA],
      evidencias: [ev(1, 'demonstrou',
        'zero tolerância escrito, não na minha cabeça... e o segundo episódio da Dona Rute já ter consequência formal')],
    }));
    expect(vs.filter((x) => x.severidade === 'erro')).toEqual([]);
  });

  it('mas o MIOLO continua tendo de bater palavra por palavra', () => {
    const vs = validarSaidaDaCena(entrada({
      falasDoAvaliado: [FALA],
      evidencias: [ev(1, 'demonstrou',
        'zero tolerância escrito, não na minha cabeça... e o segundo episódio da Dona Rute será punido com advertência')],
    }));
    expect(
      vs.some((x) => x.severidade === 'erro' && x.campo === 'evidencias.citacao'),
      'senão a tolerância de borda viraria licença para parafrasear',
    ).toBe(true);
  });

  it('semConectorDeBorda tira só a borda, nunca o miolo', () => {
    expect(semConectorDeBorda('e o segundo episodio')).toBe('o segundo episodio');
    expect(semConectorDeBorda('por isso o segundo episodio e a mae')).toBe('o segundo episodio e a mae');
    expect(semConectorDeBorda('entrego ate sexta e')).toBe('entrego ate sexta');
    expect(semConectorDeBorda('entrego e recebo'), 'conector no meio fica').toBe('entrego e recebo');
  });
});
