// Três garantias que existiam no papel e não no caminho (24/08/2026).
//
// A revisão externa achou as três, e todas tinham a mesma assinatura: o
// documento dizia "corrigido" enquanto o código que roda seguia igual.
//
//   1. `validarContratoDaCena` tinha ZERO chamadores — guard escrito, nunca
//      executado. A cena avaliativa continuava nascendo sem armadilha.
//   2. `recuperou`/`piorou` eram inalcançáveis em runtime: a consolidação
//      esperava várias evidências por descritor e o prompt do extrator mandava
//      emitir "EXATAMENTE UMA". Os testes passavam porque injetavam duas na mão.
//   3. O juiz avaliava `proximoBeat` (o pendente AGORA) enquanto o avaliado
//      respondia à provocação do beat ANTERIOR — quando um beat se cumpria, o
//      seguinte era julgado sem nunca ter sido provocado.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  beatsJulgados: [] as string[],
  instrucoes: [] as string[],
  /** O que o modelo devolve em `relacao_hierarquica` ao desenhar a persona. */
  hierarquiaDaPersona: 'liderado_direto' as string | undefined,
  /** O gabarito: um fato enterrado por descritor, salvo quando o teste mexe. */
  enterrados: [1, 2, 3, 4, 5, 6].map((i) => ({
    descritor: i, fato: `fato de D${i}`, so_revela_se: `o gestor perguntar por D${i}`,
  })) as any[],
}));

vi.mock('@/actions/ai-client', () => ({
  callAIChat: async (_sys: string, _msgs: any, _cfg: any, _max: number, opts: any) => {
    mocks.instrucoes.push(String(opts?.systemSuffix ?? ''));
    return 'Não aceito.\n[META]\n{"movimento":"resistir"}\n[/META]';
  },
  callAI: async (system: string, user: string) => {
    if (system.includes('integridade')) return '{"veredito":"ok","motivo":""}';
    if (system.includes('sinal específico')) {
      mocks.beatsJulgados.push(user.split('\n')[1] ?? '');
      return '{"cumprido":true,"porque":"ok"}';
    }
    if (system.includes('desenha o INTERLOCUTOR')) {
      return JSON.stringify({
        quem: 'Fátima, professora do 4º ano',
        relacao_hierarquica: mocks.hierarquiaDaPersona,
        relacao: 'professora da escola que o avaliado dirige',
        objetivo: 'x', o_que_nunca_aceita: 'y', o_que_faz_ceder: 'z',
        tom: 'firme', primeira_fala: 'Olha.',
        fatos: {
          superficie: ['conversei com ela e ficou tudo bem'],
          enterrados: mocks.enterrados,
        },
      });
    }
    return '{}';
  },
}));
vi.mock('@/lib/pii-masker', () => ({ maskTextPII: (t: string) => t, unmaskPII: (t: string) => t }));

import { gerarPersona, turnoCena, abrirCena, type EstadoCena } from '@/lib/season-engine/cena/core';
import { consolidarCena, montarBeatsDaCena, type EvidenciaDescritor, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';
import { buildInterlocutorSystemEstavel, promptAlunoSimulado, promptExtracao, promptPersona } from '@/lib/season-engine/cena/prompts';

const perguntas: PerguntaIA3[] = [
  { numero: 1, descritores_primarios: [1, 2] },
  { numero: 2, descritores_primarios: [3] },
  { numero: 3, descritores_primarios: [4, 5] },
  { numero: 4, descritores_primarios: [6] },
];

const descritores = Array.from({ length: 6 }, (_, i) => ({
  indice: i + 1, nomeCurto: `D${i + 1}`, descritorCompleto: 'x',
  n1: 'a', n2: 'b', n3: 'c', n4: 'd', evidenciasEsperadas: 'e', perguntasAlvo: 'p',
}));

const ctxCheio: any = {
  cargo: 'Gestão Escolar',
  competencia: 'X',
  contextoEmpresa: '',
  cenario: {
    titulo: 't', contexto: 'c',
    tradeoffTestado: 'escolher A ou B',
    fatorComplicador: 'prazo curto',
    armadilhaGenerica: 'alinhar com todos não resolve',
    stakeholders: ['Ana'],
  },
  descritores,
  beats: montarBeatsDaCena(perguntas).beats,
};

const persona: any = {
  quem: 'Professora', relacao: 'liderada', objetivo: 'x',
  o_que_nunca_aceita: 'y', o_que_faz_ceder: 'z', tom: 'firme', primeira_fala: 'Olha.',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('1 · o contrato de entrada é EXECUTADO, não só declarado', () => {
  const semCampo = (campo: string) => ({
    ...ctxCheio,
    cenario: { ...ctxCheio.cenario, [campo]: '' },
  });

  it('aborta a cena sem armadilha — era o estado das 20 cenas da fase 0', async () => {
    await expect(gerarPersona(semCampo('armadilhaGenerica'))).rejects.toThrow(/armadilhaGenerica/);
  });

  it('aborta sem trade-off e sem fator complicador', async () => {
    await expect(gerarPersona(semCampo('tradeoffTestado'))).rejects.toThrow(/tradeoffTestado/);
    await expect(gerarPersona(semCampo('fatorComplicador'))).rejects.toThrow(/fatorComplicador/);
  });

  it('aborta com descritor sem nível-meta', async () => {
    const ctx = { ...ctxCheio, descritores: [{ ...descritores[0], n3: '' }, ...descritores.slice(1)] };
    await expect(gerarPersona(ctx)).rejects.toThrow(/nível-meta/);
  });

  it('a validação é do NÚCLEO — quem chamar de outro lugar herda a garantia', async () => {
    // Se a checagem morasse no script, uma rota futura repetiria o furo. Este
    // teste chama o núcleo direto, sem passar por script nenhum.
    await expect(gerarPersona(semCampo('armadilhaGenerica'))).rejects.toThrow(/contrato de entrada/);
  });
});

describe('2 · o extrator PODE emitir várias evidências por descritor', () => {
  it('o prompt não proíbe mais a segunda entrada — senão recuperou/piorou é código morto', () => {
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(
      system,
      'com "exatamente uma entrada por descritor", a trajetória nunca acende em runtime',
    ).not.toContain('EXATAMENTE UMA entrada por descritor');
    expect(system).toContain('UMA entrada por MOMENTO');
  });

  it('o schema pede o TURNO — é ele que ordena a trajetória', () => {
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(system).toContain('"turno"');
  });

  it('provocado é ECO, não resposta a cobrança — a definição larga capava o N3', () => {
    // Auditoria de 25/08 sobre as 134 evidências: das 69 marcadas provocado, o
    // elemento concreto estava na fala anterior do interlocutor em ZERO. A flag
    // pegava resposta a cobrança — que é o beat 2 funcionando, e é o que o N3 é.
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(system).toContain('"provocado"');
    expect(system, 'o teste tem de ser literal, não "ele cobrou?"').toContain('APARECE PRONTO');
    expect(system).toContain('NÃO é — o nome não estava lá');
  });

  // O classificador ancorado (25/08) só é ancorado se as âncoras chegarem ao
  // modelo. Mostrando apenas o N3, a pergunta que sobra é "chegou lá ou não?" —
  // ocorrência de novo, com outro nome nos campos.
  it('o prompt mostra as TRÊS âncoras de cada descritor, não só a meta', () => {
    const { system, user } = promptExtracao(ctxCheio, 'transcrição');
    expect(user).toContain('n1_gap:');
    expect(user).toContain('n2_em_desenvolvimento:');
    expect(user).toContain('n3_meta:');
    expect(system, 'o schema tem de pedir o campo novo').toContain('"nivel"');
  });

  it('a trajetória ordena por turno, não por beat', () => {
    // Duas evidências no MESMO beat: só o turno as separa. Ordenar por beat
    // empataria, e a recuperação sairia como piora ou sumiria.
    const evs: EvidenciaDescritor[] = [
      { indice: 1, veredito: 'falhou', forca: 'moderada', citacao: 'a', beat: 1, turno: 2 },
      { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: 'b', beat: 1, turno: 5 },
    ];
    const c = consolidarCena(evs);
    expect(c.encerramento.notas[0], 'o assistido é o do turno 5, não o do turno 2').toBe(3.2);
    expect(c.notas[0], 'e a autonomia é a do turno 2').toBe(1.4);
    expect(c.recuperou).toEqual([1]);
  });
});

describe('3 · o juiz avalia o beat PROVOCADO, não o próximo pendente', () => {
  beforeEach(() => { mocks.beatsJulgados = []; mocks.instrucoes = []; });

  const estado = (over: Partial<EstadoCena> = {}): EstadoCena => ({
    historico: [{ role: 'assistant', content: 'Olha.', turno: 1 }],
    turno: 1, beatsCumpridos: [], descritoresTocados: [], turnosSemAvanco: 0,
    beatProvocado: 1, condicaoSatisfeita: false, concluida: false, motivoParada: null,
    encerramentosNegados: [], bloqueios: [], ditados: [], fatosRevelados: [], ...over,
  });

  it('julga o beat 1 mesmo quando o próximo pendente já é o 2', async () => {
    // Cenário do bug: beat 1 acabou de ser cumprido, então `proximoBeat` é 2.
    // Mas a última fala do interlocutor provocou o 1, e é a ela que o avaliado
    // está respondendo. Julgar contra o 2 marcaria um momento nunca criado.
    const r = await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [], beatProvocado: 1 }), 'resposta');
    expect(mocks.beatsJulgados[0]).toContain(ctxCheio.beats[0].sinalDeCumprido.slice(0, 30));
    expect(r.estado.beatsCumpridos).toEqual([1]);
  });

  it('o personagem é instruído a provocar o PRÓXIMO, não o julgado', async () => {
    await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [1], beatProvocado: 1 }), 'resposta');
    // julgou o 1 (o que foi provocado)…
    expect(mocks.beatsJulgados[0]).toContain(ctxCheio.beats[0].sinalDeCumprido.slice(0, 30));
    // …e mandou o personagem criar o 2.
    expect(mocks.instrucoes[0]).toContain('"beat_atual" = 2');
  });

  it('o estado registra qual beat foi provocado, para o turno seguinte julgar certo', async () => {
    const r = await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [1, 2], beatProvocado: 2 }), 'resposta');
    expect(r.estado.beatProvocado).toBe(3);
  });

  it('abrirCena registra o beat de abertura', () => {
    const { estado: e } = abrirCena(persona, ctxCheio.beats[0].numero);
    expect(e.beatProvocado).toBe(1);
  });
});

describe('4 · o ator joga o jogo da SONDAGEM, não o de resolver', () => {
  // 🔴 Medido na primeira rodada sob (b): o ator "N3" fechou em 8 turnos com
  // acordo — plano bonito, zero sondagem — e os dois braços afloraram 1 de 6
  // fatos. Nenhuma discriminação, porque nenhum dos dois estava investigando.
  //
  // Causa: eu reescrevi cinco contratos para (b) e esqueci o sexto. O prompt do
  // ator ainda mandava "se comportar no nível X" com os descritores na mão, e a
  // trava do N1 proibia nomear prazo, número e responsável — que é falha de
  // quem RESOLVE. Sob (b), o N1 falha por aceitar a primeira versão.
  it('N1 é instruído a aceitar a primeira versão, e proibido de sondar', () => {
    const n1 = promptAlunoSimulado('Gestão Escolar', 1, descritores);
    expect(n1).toContain('ACEITA A PRIMEIRA VERSÃO');
    expect(n1, 'a trava tem de ser sobre sondar, não sobre nomear prazo')
      .toContain('PROIBIDO, mesmo no último turno: pedir exemplo específico');
  });

  it('N3 é instruído a investigar ANTES de decidir', () => {
    const n3 = promptAlunoSimulado('Gestão Escolar', 3, descritores);
    expect(n3).toContain('INVESTIGA ANTES DE DECIDIR');
    expect(n3, 'e o outro lado é parte explícita da sondagem')
      .toContain('Pergunta a versão de quem não está');
    expect(n3).not.toContain('ACEITA A PRIMEIRA VERSÃO');
  });

  it('os dois recebem a régua como critério do que perguntar', () => {
    for (const nv of [1, 3] as const) {
      const p = promptAlunoSimulado('Gestão Escolar', nv, descritores);
      expect(p).toContain('É ela que decide o que você acha importante perguntar');
      expect(p, 'e a cena é de investigar um caso, não de resolver um problema')
        .toContain('Ela é verdadeira e INCOMPLETA');
    }
  });
});

describe('5 · o interlocutor é SEMPRE liderado direto', () => {
  // A cena mede LIDERANÇA, e liderança se exerce sobre quem se lidera. A regra
  // é do produto e não estava no caminho: o prompt oferecia "subordinado, par,
  // gestor, cliente, família..." e a derivação era livre. Nas duas rodadas
  // medidas a persona caiu em subordinada direta por ACASO do cenário.
  it('o prompt proíbe par, chefe e externo, e manda o terceiro virar ASSUNTO', () => {
    const { system } = promptPersona(ctxCheio);
    expect(system).toContain('SEMPRE UM LIDERADO DIRETO DO AVALIADO');
    expect(system, 'o terceiro do cenário não pode virar personagem')
      .toContain('ASSUNTO da conversa, não personagem dela');
    expect(system, 'o campo é enum fechado, não prosa').toContain('"relacao_hierarquica": "liderado_direto"');
  });

  it('liderado direto passa', async () => {
    mocks.hierarquiaDaPersona = 'liderado_direto';
    await expect(gerarPersona(ctxCheio)).resolves.toMatchObject({ relacao_hierarquica: 'liderado_direto' });
  });

  it('par, chefe ou externo ABORTAM a cena', async () => {
    // Enum devolvido pelo modelo, conferido pelo código. Casar palavra-chave na
    // prosa de `relacao` seria repetir o erro que fez `provocado` degenerar.
    for (const h of ['par', 'gestor', 'cliente', undefined]) {
      mocks.hierarquiaDaPersona = h;
      await expect(gerarPersona(ctxCheio), `hierarquia=${h}`).rejects.toThrow(/liderado direto/);
    }
    mocks.hierarquiaDaPersona = 'liderado_direto';
  });
});

describe('6 · o gabarito é o contrato de cobertura da leitura (b)', () => {
  // Sob (b), o que se mede é o gestor CHEGAR aos fatos. Um descritor sem fato
  // enterrado não tem como ser medido: não há nada para descobrir, e a nota
  // sairia da forma da pergunta em vez do que ela alcançou.
  it('persona sem fatos enterrados ABORTA a cena', async () => {
    mocks.enterrados = [];
    await expect(gerarPersona(ctxCheio)).rejects.toThrow(/sem gabarito não há o que sondar/);
  });

  it('descritor sem fato enterrado ABORTA, e diz qual', async () => {
    mocks.enterrados = [1, 2, 3, 4].map((i) => ({
      descritor: i, fato: 'x', so_revela_se: 'y',
    }));
    await expect(gerarPersona(ctxCheio)).rejects.toThrow(/D5, D6/);
  });

  it('fato sem "so_revela_se" ABORTA — sairia de graça', async () => {
    // Sem a condição, o interlocutor não sabe quando soltar, e solta sempre.
    // Aí não há sondagem para medir: todo gestor chegaria a todo fato.
    mocks.enterrados = [1, 2, 3, 4, 5, 6].map((i) => ({
      descritor: i, fato: 'x', so_revela_se: i === 3 ? '' : 'y',
    }));
    await expect(gerarPersona(ctxCheio)).rejects.toThrow(/D3: sem "so_revela_se"/);
  });

  it('o interlocutor recebe os fatos, com a ordem de não entregar de bandeja', () => {
    const sys = buildInterlocutorSystemEstavel(ctxCheio, {
      quem: 'Fátima', relacao: 'professora', objetivo: 'x', o_que_nunca_aceita: 'y',
      o_que_faz_ceder: 'z', tom: 'firme', primeira_fala: 'Olha.',
      fatos: {
        superficie: ['conversei com ela e ficou tudo bem'],
        enterrados: [{ descritor: 2, fato: 'nunca ouvi a mãe', so_revela_se: 'ele perguntar pelo outro lado' }],
      },
    } as any, 14);
    expect(sys).toContain('O QUE VOCÊ SÓ ENTREGA SE FOR SONDADO');
    expect(sys).toContain('nunca ouvi a mãe');
    expect(sys).toContain('SÓ SAI SE: ele perguntar pelo outro lado');
    expect(sys, 'e não pode denunciar que existe algo escondido')
      .toContain('nunca diga que existe algo escondido');
  });

  it('o extrator sabe que PERGUNTAR é o comportamento', () => {
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(system).toContain('A PERGUNTA DO GESTOR É O COMPORTAMENTO');
    expect(system, 'a regra antiga tem de estar explicitamente revogada')
      .toContain('ISTO INVERTE A REGRA ANTERIOR');
    expect(system).toContain('exigiu o padrão × aceitou a superfície');
  });
});
