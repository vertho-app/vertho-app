/**
 * COBERTURA POR ENGENHARIA — o núcleo puro do Modo Cena.
 *
 * Zero IA, zero banco: só a régua que garante que uma CONVERSA meça os mesmos
 * 6 descritores que a prova escrita mede hoje. Testável sem chave de API.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * O instrumento de assessment de hoje não cobre os 6 descritores por sorte —
 * ele cobre por CONSTRUÇÃO. O prompt da IA3 (`lib/ia3-cenarios.ts`) fixa quatro
 * perguntas com função declarada (ESCOLHA / COMO / TENSÃO HUMANA /
 * SUSTENTABILIDADE), exige `descritores_primarios` em cada uma e valida que as
 * quatro JUNTAS cubram todos os descritores. `respostas.d1_nota…d6_nota` é o
 * outro lado desse contrato: uma competência = 6 descritores = 6 notas.
 *
 * Numa conversa livre a cobertura evapora. O interlocutor segue a própria
 * agenda, e o descritor 5 só aparece se a conversa der sorte de passar por ele.
 * Trocar a prova escrita por uma cena SEM resolver isso não seria um upgrade —
 * seria perder a única propriedade que faz do cenário um instrumento.
 *
 * A tradução, então, é literal: cada PERGUNTA vira um BEAT — um momento que o
 * interlocutor é obrigado a criar —, herdando o mesmo `descritores_primarios`.
 * O que era "responda a P3" vira "a cena tem que chegar num ponto em que a
 * outra pessoa resiste, sofre ou discorda na sua frente".
 *
 * ⚠️ A decisão de encerrar é DE CÓDIGO, não do modelo (mesma filosofia da IA4:
 * a IA dá insumo, a consolidação é calculada). Um modelo treinado para ajudar
 * encerra cedo — é o modo de falha mais provável desta feature. Por isso
 * `podeEncerrar` recusa acordo/impasse com beat pendente, e só ruptura e teto
 * passam por cima.
 */

import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

/** Função dramática de cada beat — herdada 1:1 dos 4 pilares da IA3. */
export interface BeatCanonico {
  numero: 1 | 2 | 3 | 4;
  /** O nome do pilar na IA3, para o rastro ser óbvio ao ler os dois lados. */
  pilar: 'ESCOLHA' | 'COMO' | 'TENSAO_HUMANA' | 'SUSTENTABILIDADE';
  /** O que o interlocutor precisa PROVOCAR — instrução de cena, não de prova. */
  comoOInterlocutorCria: string;
  /** Quando o beat conta como cumprido (o modelo marca; o código confere). */
  sinalDeCumprido: string;
}

/**
 * Os 4 beats, na ordem dos 4 pilares da IA3. A ordem NÃO é cronológica rígida:
 * uma conversa real embaralha. O que a ordem fixa é a NUMERAÇÃO — beat 3 é
 * sempre a tensão humana, em qualquer cenário, de qualquer cargo —, porque é
 * ela que casa com `perguntas[].numero` e, por tabela, com o mapa de cobertura.
 */
export const BEATS_CANONICOS: readonly BeatCanonico[] = Object.freeze([
  {
    numero: 1,
    pilar: 'ESCOLHA',
    comoOInterlocutorCria:
      'Ponha o caso na mesa pela SUPERFÍCIE: a versão conveniente, verdadeira e ' +
      'incompleta. Deixe claro que já está resolvido, ou que não há o que fazer. ' +
      'Quem quiser mais fundo vai ter de perguntar.',
    sinalDeCumprido:
      'O gestor recusou a versão pronta e pediu o caso concreto — ou aceitou a ' +
      'superfície e seguiu adiante (que também é sinal).',
  },
  {
    numero: 2,
    pilar: 'COMO',
    comoOInterlocutorCria:
      'Responda em GENERALIDADE quando ele sondar: "conversei com ela", "ficou tudo ' +
      'certo", "a gente se entendeu". Nunca ofereça o exemplo; espere ser cobrado por ele.',
    sinalDeCumprido:
      'O gestor pediu o exemplo específico — o que foi dito, por quem, quando — ou ' +
      'aceitou o resumo e seguiu adiante (que também é sinal, e é o mais comum).',
  },
  {
    numero: 3,
    pilar: 'TENSAO_HUMANA',
    comoOInterlocutorCria:
      'Quando a sondagem chegar perto do que dói, reaja como gente: magoe-se, ' +
      'defenda-se, questione por que ele está perguntando isso. Este é o beat que ' +
      'separa quem sustenta a pergunta de quem recua para não constranger.',
    sinalDeCumprido:
      'O gestor sustentou a investigação sem desistir nem endurecer — ou recuou ' +
      'diante do desconforto e deixou o fato onde estava.',
  },
  {
    numero: 4,
    pilar: 'SUSTENTABILIDADE',
    comoOInterlocutorCria:
      'Ofereça o encerramento fácil: "então tá, vou tentar de novo". ' +
      '⚠️ Este beat NÃO nasce sozinho — se você não oferecer a saída morna, ' +
      'ninguém testa se o gestor fecha com algo verificável.',
    sinalDeCumprido:
      'O gestor fechou com o que ele mesmo vai conferir e quando — ou aceitou a ' +
      'promessa sem critério.',
  },
]);

/** Uma pergunta do cenário da IA3, na forma em que ela é persistida. */
export interface PerguntaIA3 {
  numero: number;
  texto?: string;
  objetivo_diagnostico?: string;
  descritores_primarios?: number[];
  o_que_diferencia_niveis?: string;
  resposta_generica_falha_porque?: string;
}

/** Um beat já ligado ao cenário concreto: função dramática + descritores. */
export interface BeatDaCena extends BeatCanonico {
  /** Índices 1..6 dos descritores que este beat existe para revelar. */
  descritores: number[];
  /** O que separa N1 de N3 NESTE beat — vem da pergunta correspondente. */
  diferenciaNiveis: string;
  /** Por que a resposta genérica falha aqui — o que o interlocutor não aceita. */
  genericaFalhaPorque: string;
}

export interface MontagemBeats {
  beats: BeatDaCena[];
  /** Vazio = a cena pode ser construída. Não-vazio = ABORTAR a construção. */
  erros: string[];
}

/**
 * Liga os 4 beats canônicos às perguntas do cenário e AUDITA a cobertura.
 *
 * Falha alto de propósito. A régua do FMEA é explícita: na CONSTRUÇÃO falhe,
 * na ENTREGA degrade. Uma cena montada sobre um cenário que não cobre os 6
 * descritores produziria notas com buraco silencioso — e nota com buraco vira
 * PDI e trilha erradas, sem nada na tela acusando.
 */
export function montarBeatsDaCena(
  perguntas: PerguntaIA3[],
  numDescritores = 6,
  observaveis?: number[],
): MontagemBeats {
  const erros: string[] = [];

  if (!Array.isArray(perguntas) || perguntas.length !== 4) {
    erros.push(`Esperado 4 perguntas no cenário, recebido ${Array.isArray(perguntas) ? perguntas.length : 0}`);
    return { beats: [], erros };
  }

  const beats: BeatDaCena[] = [];
  const cobertos = new Set<number>();

  for (const canonico of BEATS_CANONICOS) {
    const p = perguntas.find((q) => Number(q?.numero) === canonico.numero);
    if (!p) {
      erros.push(`Cenário sem a pergunta ${canonico.numero} (pilar ${canonico.pilar})`);
      continue;
    }

    // Só índices dentro da faixa entram. Um `descritores_primarios: [7]` num
    // cenário de 6 descritores não é "quase certo": é o beat apontando para um
    // descritor que não existe, e o silêncio faria D7 sumir da conta.
    const descritores = (Array.isArray(p.descritores_primarios) ? p.descritores_primarios : [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= numDescritores);

    const forasDaFaixa = (p.descritores_primarios || []).filter(
      (d) => !Number.isInteger(Number(d)) || Number(d) < 1 || Number(d) > numDescritores,
    );
    if (forasDaFaixa.length) {
      erros.push(`Pergunta ${canonico.numero} aponta descritor fora de 1..${numDescritores}: ${forasDaFaixa.join(', ')}`);
    }
    if (descritores.length === 0) {
      erros.push(`Pergunta ${canonico.numero} (pilar ${canonico.pilar}) sem descritor primário`);
    }

    descritores.forEach((d) => cobertos.add(d));
    beats.push({
      ...canonico,
      descritores,
      diferenciaNiveis: (p.o_que_diferencia_niveis || '').trim(),
      genericaFalhaPorque: (p.resposta_generica_falha_porque || '').trim(),
    });
  }

  /**
   * 🔴 O MAPA DA IA3 E O ALCANCE DA CENA TÊM DE CONCORDAR.
   *
   * Medido em 25/08/2026: os beats da cena do piloto declaravam
   *
   *     beat1 → D1+D2   beat2 → D3+D4   beat3 → D2+D5   beat4 → D3+D6
   *
   * ou seja, D2 duas vezes e D4 uma como descritor PRIMÁRIO — e são exatamente
   * os dois que a cena não consegue observar (o N3 deles exige a outra parte,
   * que não está na sala). As quatro cenas fechavam "4/4 beats cumpridos" e
   * "cobertura 6/6" sem nunca terem oferecido oportunidade para dois deles.
   *
   * O validador conferia que o beat existe, que foi cumprido e que mede aquele
   * descritor. Nenhuma dessas três perguntas é "a cena consegue observar isso".
   * O mapa declara o que se QUER medir; o alcance declara o que a cena OFERECE.
   * Quando os dois discordam, um dos dois está errado — e seguir em frente é
   * como a cobertura declarada-e-não-medida acontece.
   */
  if (observaveis !== undefined) {
    const obs = new Set(observaveis);
    const conflito: string[] = [];
    for (const b of beats) {
      for (const d of b.descritores) {
        if (!obs.has(d)) conflito.push(`beat ${b.numero} declara D${d}`);
      }
    }
    if (conflito.length) {
      erros.push(
        `Mapa da IA3 discorda do alcance declarado: ${conflito.join('; ')} — ` +
        'esses descritores estão fora do que a cena observa. Corrija o mapa OU o alcance; ' +
        'seguir assim produz "beats cumpridos" sem oportunidade real.',
      );
    }
  }

  const semCobertura: string[] = [];
  // Descritor fora do alcance não precisa de beat: ele não é medido aqui.
  const exigidos = observaveis !== undefined
    ? observaveis.filter((i) => Number.isInteger(i) && i >= 1 && i <= numDescritores)
    : Array.from({ length: numDescritores }, (_, i) => i + 1);
  for (const i of exigidos) if (!cobertos.has(i)) semCobertura.push(`D${i}`);
  if (semCobertura.length) {
    erros.push(`Descritores sem beat: ${semCobertura.join(', ')} — a cena mediria com buraco`);
  }

  return { beats, erros };
}

/**
 * CONTRATO DE ENTRADA da cena. Falha alto, na construção.
 *
 * 🔴 EXISTE POR UM CUSTO MEDIDO (24/08/2026): as 20 cenas da fase 0 rodaram com
 * `armadilhaGenerica`, `tradeoffTestado` e `fatorComplicador` VAZIOS, porque o
 * leitor buscava `alternativas.cenario.*` e o persistidor grava na raiz de
 * `alternativas`. O `|| ''` virou string vazia e nada acusou — o personagem
 * ficou sem a única regra que o faz recusar "eu alinharia com todos", e o
 * resultado "não amoleceu" passou a vir da teimosia do prompt.
 *
 * Campo vazio aqui não é degradação aceitável: é a cena medindo outra coisa.
 */
export interface ContratoCena {
  armadilhaGenerica?: string;
  tradeoffTestado?: string;
  fatorComplicador?: string;
  descritores?: Array<{ n3?: string }>;
}

export function validarContratoDaCena(c: ContratoCena): string[] {
  const faltando: string[] = [];
  if (!String(c.armadilhaGenerica ?? '').trim()) faltando.push('armadilhaGenerica');
  if (!String(c.tradeoffTestado ?? '').trim()) faltando.push('tradeoffTestado');
  if (!String(c.fatorComplicador ?? '').trim()) faltando.push('fatorComplicador');
  const semN3 = (c.descritores ?? []).filter((d) => !String(d?.n3 ?? '').trim()).length;
  if (semN3) faltando.push(`${semN3} descritor(es) sem nível-meta`);
  return faltando;
}

/**
 * COBERTURA POR ENGENHARIA, na leitura (b): cada descritor precisa de um FATO
 * ENTERRADO que só aflore sob a sondagem característica dele.
 *
 * 🔑 É o contrato que substitui — e completa — o mapa descritor↔beat. Os beats
 * criam os MOMENTOS da sondagem; os fatos enterrados criam a EVIDÊNCIA. Um
 * descritor sem fato enterrado não tem como ser medido nesta cena: não há nada
 * para o gestor descobrir, e a nota dele sairia da forma da pergunta, não do
 * que ela alcançou.
 *
 * Falha alto, como todo contrato de construção deste módulo: cena montada sobre
 * gabarito incompleto produz nota com buraco silencioso.
 */
export function validarGabaritoDaCena(
  fatos: { enterrados?: Array<{ descritor: number; fato?: string; so_revela_se?: string }> } | undefined,
  numDescritores: number,
): string[] {
  const erros: string[] = [];
  const enterrados = fatos?.enterrados ?? [];
  if (!enterrados.length) return ['a persona não trouxe fatos enterrados — sem gabarito não há o que sondar'];

  const porDescritor = new Map<number, number>();
  for (const e of enterrados) {
    const i = Number(e?.descritor);
    if (!Number.isInteger(i) || i < 1 || i > numDescritores) {
      erros.push(`fato apontando descritor fora de 1..${numDescritores}: ${e?.descritor}`);
      continue;
    }
    if (!String(e?.fato ?? '').trim()) erros.push(`D${i}: fato vazio`);
    if (!String(e?.so_revela_se ?? '').trim()) {
      // Sem a condição, o interlocutor não sabe quando soltar — e solta sempre.
      erros.push(`D${i}: sem "so_revela_se" — o fato sairia de graça`);
    }
    porDescritor.set(i, (porDescritor.get(i) ?? 0) + 1);
  }
  /**
   * EXATAMENTE UM por descritor — não "pelo menos um".
   *
   * 🔴 Com "pelo menos", dois fatos para D1 e um para cada outro passava: D1
   * ganhava duas chances de aflorar e pesava o dobro na taxa, sem que nada
   * acusasse. A métrica é POR DESCRITOR, e ela só é comparável entre eles se
   * cada um contribuir com no máximo 1.
   *
   * É uma decisão, e ela troca flexibilidade por comparabilidade: quem quiser
   * dois ângulos para o mesmo descritor precisa de duas cenas, não de dois
   * fatos na mesma.
   */
  const duplicados = [...porDescritor.entries()].filter(([, n]) => n > 1).map(([i]) => i);
  if (duplicados.length) {
    erros.push(
      `mais de um fato para ${duplicados.map((i) => `D${i}`).join(', ')} — ` +
      'a taxa é por descritor, e descritor com dois fatos pesa o dobro',
    );
  }

  const sem: number[] = [];
  for (let i = 1; i <= numDescritores; i++) if (!porDescritor.has(i)) sem.push(i);
  if (sem.length) {
    erros.push(
      `sem fato enterrado: ${sem.map((i) => `D${i}`).join(', ')} — ` +
      'não há o que o gestor descubra nesses, então a cena não os mede',
    );
  }
  return erros;
}

/** Índices de descritor que nenhum beat cumprido ainda tocou. */
export function descritoresPendentes(beats: BeatDaCena[], beatsCumpridos: number[]): number[] {
  const feitos = new Set(beatsCumpridos);
  const tocados = new Set<number>();
  beats.filter((b) => feitos.has(b.numero)).forEach((b) => b.descritores.forEach((d) => tocados.add(d)));
  const todos = new Set<number>();
  beats.forEach((b) => b.descritores.forEach((d) => todos.add(d)));
  return [...todos].filter((d) => !tocados.has(d)).sort((a, b) => a - b);
}

/**
 * Qual beat o interlocutor tem que criar AGORA.
 *
 * ⚠️ A ORDEM É RÍGIDA, e o comentário anterior dizia o contrário — dizia que a
 * ordem "não é cronológica rígida" enquanto a função devolvia sempre o primeiro
 * pendente e o teste confirmava 1→2→3→4. Comentário que descreve outra coisa é
 * pior que comentário nenhum: quem lê acha que a conversa tem folga que ela não
 * tem, e o efeito na tela é a cena soando como questionário.
 *
 * A rigidez fica por ora **de propósito**, com um motivo e uma dívida:
 *
 *  - MOTIVO: o beat 4 (sustentabilidade) não emerge sozinho de conversa tensa —
 *    ninguém, no meio de um conflito, pergunta espontaneamente como vai saber
 *    que funcionou daqui a um mês. Sem fila, ele fica para trás.
 *  - DÍVIDA: o certo é elegibilidade, não fila — dois ou três beats abertos ao
 *    mesmo tempo, o personagem pressionando o que a última fala do avaliado
 *    abriu, e o 4 forçado a partir de `teto − 3` se ainda não nasceu. A
 *    cobertura continua garantida pelo código; o que muda é só quem escolhe a
 *    ordem. Enquanto isso não existe, a cena é mais mecânica do que precisaria.
 */
export function proximoBeat(beats: BeatDaCena[], beatsCumpridos: number[]): BeatDaCena | null {
  const feitos = new Set(beatsCumpridos);
  return beats.find((b) => !feitos.has(b.numero)) ?? null;
}

/**
 * POR QUE O MOTOR PAROU — e só isso.
 *
 * 🔴 O enum anterior (`acordo | ruptura | impasse | teto`) misturava duas
 * perguntas: por que a conversa acabou e o que ela produziu. Com isso, "impasse"
 * era lido como "a investigação falhou" — e na rodada de 26/08 os **8 impasses
 * tinham os quatro beats cumpridos**: nenhum era conversa travada, todos eram
 * "os beats acabaram e a cessão não fechou em 3 turnos". O teto pré-registrado
 * de 40% de impasse foi escrito para o outro significado.
 *
 * Agora são dois campos: aqui, por que parou; em `ConsolidacaoCena.resultado`,
 * o que foi medido.
 *
 *   `concluiu`    — o personagem cedeu, com os beats completos
 *   `ruptura`     — ele encerrou a relação (passa por cima de tudo)
 *   `inatividade` — turnos sem NENHUM avanço (beat novo ou fato novo)
 *   `teto`        — acabaram os turnos
 */
export type MotivoParada = 'concluiu' | 'ruptura' | 'inatividade' | 'teto';

/**
 * Lê o motivo de parada de um estado gravado, traduzindo o enum ANTIGO.
 *
 * Artefatos anteriores a 26/08/2026 gravaram `motivoFim` com
 * `acordo | ruptura | impasse | teto`. A tradução fica aqui, num lugar só, e
 * é explícita de propósito: `impasse` virou `inatividade`, e quem ler um
 * relatório antigo precisa saber que aquilo NÃO significava "a investigação
 * falhou" — significava "os beats acabaram e a cessão não fechou".
 *
 * Uma função compartilhada, e não uma cópia por script: régua duplicada é
 * régua que diverge, e este módulo já pagou isso.
 */
export function lerMotivoParada(estado: any): MotivoParada | null {
  if (estado?.motivoParada) return estado.motivoParada as MotivoParada;
  const legado = estado?.motivoFim;
  if (!legado) return null;
  return ({ acordo: 'concluiu', impasse: 'inatividade', ruptura: 'ruptura', teto: 'teto' } as const)[
    legado as 'acordo' | 'impasse' | 'ruptura' | 'teto'
  ] ?? null;
}

/** Os quatro motivos, na ordem em que aparecem nos relatórios. */
export const MOTIVOS_PARADA: readonly MotivoParada[] = ['concluiu', 'ruptura', 'inatividade', 'teto'];

/** O que o [META] do personagem pode PEDIR. Vocabulário dele, não do motor. */
export type PedidoDoModelo = 'acordo' | 'ruptura';

/**
 * O QUE A CENA PRODUZIU — dimensão separada do motivo de parada.
 *
 * Sob o gênero de investigação, cobertura é o que a sondagem alcançou: um
 * descritor sem sinal significa que o gestor não chegou ao fato dele.
 */
export type ResultadoDaCena = 'suficiente' | 'parcial' | 'insuficiente';

export interface EstadoParaEncerrar {
  turno: number;
  tetoTurnos: number;
  beats: BeatDaCena[];
  beatsCumpridos: number[];
  /** O modelo pediu para encerrar no [META]. Pedido, não decisão. */
  modeloPediuEncerrar: boolean;
  motivoDoModelo: PedidoDoModelo | null;
  /** Turnos consecutivos sem nenhum beat novo — matéria-prima do impasse. */
  turnosSemAvanco: number;
  /**
   * O personagem declarou, no [META], que a condição de cessão dele foi
   * satisfeita. É INSUMO, como `modeloPediuEncerrar` — mas insumo que faltava.
   *
   * 🔴 MEDIDO NA FASE 0d (25/08/2026): a cena 4 do braço N3 terminou marcada
   * como IMPASSE com `condicao_de_cessao_satisfeita: true`, `movimento:
   * "ceder"`, os quatro beats cumpridos e a persona dizendo "Isso eu consigo
   * olhar e cobrar. Aceito" e "Está bem. Eu vou nessa". O que faltou foi o
   * `encerrar: true` do modelo — e o impasse saiu por esgotamento de turnos
   * sem avanço.
   *
   * O defeito é o ESPELHO da filosofia deste arquivo. Ela foi escrita contra
   * o modelo encerrar CEDO ("um modelo treinado para ajudar encerra assim que
   * a cena resolve"), e por isso o código nunca confiou no `encerrar`. Só que
   * na outra direção o código continuou dependendo exatamente dele: o
   * personagem cedeu, disse que cedeu, e a cena foi rotulada como se ninguém
   * tivesse chegado a lugar nenhum.
   *
   * Custo: o ramo pré-registrado da 0d disparou com "impasse 100% no braço N3"
   * — e 1 dos 3 era este defeito. A conclusão sobre a condição de cessão
   * estava apoiada num número contaminado.
   */
  condicaoSatisfeita: boolean;
}

export interface VeredictoEncerramento {
  encerrar: boolean;
  motivo: MotivoParada | null;
  /** Preenchido quando o modelo quis encerrar e o código NEGOU. Vai para o log. */
  negadoPorBeatPendente: number | null;
}

/** Quantos turnos parados bastam para chamar de impasse. */
export const TURNOS_PARA_INATIVIDADE = 3;

/**
 * A direção de cena. Roda em CÓDIGO porque o modelo é parte interessada:
 * treinado para cooperar, ele fecha assim que a conversa "resolve" — e uma
 * conversa pode resolver com dois dos quatro beats, deixando metade dos
 * descritores sem sinal e a nota com buraco.
 *
 * Ruptura e teto passam por cima da cobertura, e devem passar: insistir num
 * beat depois que o interlocutor bateu a porta produziria cena falsa, e o teto
 * existe justamente para o caso em que nada converge.
 */
export function podeEncerrar(estado: EstadoParaEncerrar): VeredictoEncerramento {
  const pendente = proximoBeat(estado.beats, estado.beatsCumpridos);

  if (estado.turno >= estado.tetoTurnos) {
    return { encerrar: true, motivo: 'teto', negadoPorBeatPendente: null };
  }
  if (estado.modeloPediuEncerrar && estado.motivoDoModelo === 'ruptura') {
    return { encerrar: true, motivo: 'ruptura', negadoPorBeatPendente: null };
  }
  if (pendente) {
    return {
      encerrar: false,
      motivo: null,
      negadoPorBeatPendente: estado.modeloPediuEncerrar ? pendente.numero : null,
    };
  }
  if (estado.modeloPediuEncerrar) {
    return { encerrar: true, motivo: estado.motivoDoModelo === 'ruptura' ? 'ruptura' : 'concluiu', negadoPorBeatPendente: null };
  }
  /**
   * Beats completos + o personagem cedeu = ACORDO, decidido pelo CÓDIGO.
   *
   * Vem antes do impasse de propósito: impasse é "ninguém saiu do lugar", e
   * uma condição de cessão satisfeita é o oposto disso. Só alcança aqui quando
   * não há beat pendente — então nunca fecha uma cena pela metade, que é a
   * garantia que este arquivo existe para dar.
   */
  if (estado.condicaoSatisfeita) {
    return { encerrar: true, motivo: 'concluiu', negadoPorBeatPendente: null };
  }
  if (estado.turnosSemAvanco >= TURNOS_PARA_INATIVIDADE) {
    return { encerrar: true, motivo: 'inatividade', negadoPorBeatPendente: null };
  }
  return { encerrar: false, motivo: null, negadoPorBeatPendente: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidação
// ─────────────────────────────────────────────────────────────────────────────

export type VereditoDescritor = 'demonstrou' | 'tentou' | 'falhou' | 'sem_sinal';

/** O nível que o extrator ancorado devolve. */
export type NivelDescritor = 'n1_gap' | 'n2_em_desenvolvimento' | 'n3_meta' | 'sem_sinal';

/**
 * Compatibilidade com artefatos gravados antes de 25/08/2026, quando o extrator
 * classificava OCORRÊNCIA (demonstrou/tentou/falhou) e o código lia MATURIDADE.
 * A tradução é 1:1 porque era exatamente essa a leitura implícita — o que muda
 * é que agora o modelo escolhe o nível olhando as três âncoras, em vez de o
 * código inferir maturidade a partir de "houve ação".
 */
export const VEREDITO_PARA_NIVEL: Record<VereditoDescritor, NivelDescritor> = {
  demonstrou: 'n3_meta',
  tentou: 'n2_em_desenvolvimento',
  falhou: 'n1_gap',
  sem_sinal: 'sem_sinal',
};

export const nivelDaEvidencia = (e: { nivel?: NivelDescritor; veredito?: VereditoDescritor }): NivelDescritor =>
  e.nivel ?? VEREDITO_PARA_NIVEL[e.veredito ?? 'sem_sinal'] ?? 'sem_sinal';
export type ForcaEvidencia = 'fraca' | 'moderada' | 'forte';

export interface EvidenciaDescritor {
  /** Índice 1..6 — o mesmo D-n do mapa de cobertura e de `d{n}_nota`. */
  indice: number;
  /**
   * O nível ancorado — a forma canônica desde 25/08/2026.
   *
   * Opcional só por COMPATIBILIDADE: artefatos gravados antes dessa data trazem
   * `veredito` no lugar. Uma evidência sem nenhum dos dois não é "neutra": é
   * ilegível, e `validarSaidaDaCena` a trata como erro em vez de deixá-la virar
   * `sem_sinal` silencioso.
   */
  nivel?: NivelDescritor;
  /** @deprecated Compat com artefatos anteriores a 25/08/2026. Use `nivel`. */
  veredito?: VereditoDescritor;
  forca: ForcaEvidencia;
  citacao: string;
  /** Em qual beat a evidência apareceu (null = veio do debrief). */
  beat: number | null;
  /**
   * Turno em que a evidência apareceu. É o que ORDENA a trajetória.
   *
   * ⚠️ O beat não serve para ordenar: um descritor pode aparecer duas vezes
   * dentro do MESMO beat (a pessoa erra e se corrige na mesma troca), e o
   * debrief vem sem beat nenhum. Ordenar por beat empataria os dois casos e
   * `recuperou`/`piorou` sairiam errados — que é o mesmo tipo de erro de ordem
   * que já mordeu aqui em `.limit()` sem `order`.
   */
  turno?: number | null;
  /**
   * O elemento concreto da citação (nome, prazo, número, rito) foi PEDIDO ou
   * ENTREGUE pronto na fala anterior do interlocutor — o avaliado só preencheu
   * o molde.
   *
   * 🔴 MEDIDO NA FASE 0c (25/08/2026): o interlocutor disse "quero um número:
   * quantos dias de adaptação e quantos itens prontos" e o avaliado repetiu os
   * dois números. O extrator marcou `demonstrou/forte`. Last-wins promoveu D1
   * de 1,4 para 3,2. Quatro de cinco atores N1 saíram N2. O único que ficou N1
   * foi o que NÃO ecoou.
   *
   * O corte de "falhou" PEGOU no começo da cena. O que não pegou foi tratar o
   * eco do molde como competência. `provocado` não mexe na tabela (1,4 · 2,2 ·
   * 3,2): só decide QUAL evidência entra na last-wins. Eco não recupera.
   */
  provocado?: boolean;
}

/**
 * ═══ PROFICIÊNCIA E CONFIANÇA SÃO EIXOS DIFERENTES ═══
 *
 * 🔴 A versão anterior cruzava os dois numa tabela `veredito × força`, e o
 * resultado era incoerente: `falhou/forte` valia **1,7** e `falhou/fraca`
 * valia **1,2** — quanto mais forte a evidência de que a pessoa falhou, MAIOR
 * a nota. O mesmo cruzamento fazia `demonstrou/fraca` (2,8) empatar com um
 * "tentou" bem evidenciado.
 *
 * A separação correta:
 *   - o VEREDITO estima proficiência → vira nota;
 *   - a FORÇA estima confiança naquele veredito → NÃO mexe na nota. Confiança
 *     baixa pede nova sondagem ou marca a medida como frágil; ela não
 *     transforma um comportamento em outro.
 *
 * As três notas ancoram nas faixas da régua oficial (`lib/nivel-regua`), em vez
 * de serem escolhidas a olho: `falhou` cai no meio do N1, `tentou` no meio do
 * N2 (em desenvolvimento) e `demonstrou` no N3 (a meta). A régua NOTA→NÍVEL
 * continua vivendo só em `lib/nivel-regua` — aqui não se reimplementa nada.
 *
 * ⚠️ `demonstrou` NÃO alcança N4 de propósito — ver `TETO_CENA`.
 */
const NOTA_POR_VEREDITO: Record<Exclude<NivelDescritor, 'sem_sinal'>, number> = {
  n3_meta:               3.2, // meio do N3
  n2_em_desenvolvimento: 2.2, // meio do N2
  n1_gap:                1.4, // meio do N1
};

/**
 * Teto de observabilidade da cena: **N3**.
 *
 * O N4 da régua descreve fenômeno organizacional — equipe que se auto-organiza,
 * prática institucionalizada, resultado sustentado ao longo do tempo. Uma
 * conversa de 1:1 com um interlocutor de IA não demonstra isso, por mais
 * brilhante que seja a fala. Deixar `demonstrou/forte` valer 3,9 fazia a cena
 * emitir N4 sozinha — e foi o que aconteceu com 2 dos 5 alunos N3 na fase 0.
 *
 * A cena pode produzir evidência COMPATÍVEL com N4; ela não sustenta a
 * classificação sozinha. N4 exige triangulação: cena + evidência real +
 * repetição ou confirmação externa.
 *
 * ⚠️ HOJE ESTE TETO NÃO CORTA NADA — e isso está escrito aqui porque um teste
 * de mutação mostrou: subi `TETO_CENA` para 4,0 e os 26 testes continuaram
 * verdes, porque `demonstrou` vale 3,2 e já fica abaixo. Ele é um FREIO para o
 * dia em que alguém subir uma nota da tabela, não uma regra ativa. Quem
 * garante o N4 hoje é a própria tabela — e é isso que o teste estrutural
 * abaixo protege, não este número.
 */
export const TETO_CENA = 3.4; // logo abaixo do TETO_N3 (3,5) da régua oficial

/** Notas de veredito, expostas para o teste estrutural do teto. */
export const NOTAS_DE_VEREDITO: Readonly<Record<string, number>> = NOTA_POR_VEREDITO;

/** Uma das duas leituras da cena, com a mesma forma. */
export interface MedidaDaCena {
  notas: Array<number | null>;
  media: number | null;
  nivel: Nivel | null;
}

export interface ConsolidacaoCena {
  /**
   * 🔑 O TOPO É A AUTONOMIA — a PRIMEIRA evidência de cada descritor, antes de
   * o interlocutor ensinar o formato. `notas`, `media` e `nivel` são ela, e é
   * daqui que PDI e trilha leem.
   *
   * Não é o primeiro turno da conversa: é o primeiro momento DAQUELE descritor.
   * D4 (sustentabilidade) só nasce no beat 4, depois de 6-8 turnos — o que se
   * mede é o primeiro movimento na faceta, não o nervosismo de abertura.
   *
   * A escolha está medida (25/08/2026, 10 cenas, mesma transcrição): a
   * autonomia põe 5 de 5 atores N1 em N1 sob as duas regras de série; o
   * encerramento deixa 2 vazarem para N2. E o encerramento tem **dose
   * endógena** — o interlocutor dita mais para quem trava e menos para quem
   * anda, então duas pessoas com o mesmo encerramento fizeram provas
   * diferentes. A régua descreve HÁBITO ("define metas", "acompanha com
   * regularidade"); quem só produz o nível-meta com o molde na mão não é o
   * nível-meta da régua — é treinável, e isso tem nome próprio abaixo.
   */
  notas: Array<number | null>;
  /**
   * ASSISTIDO — a última evidência de cada descritor, com todo o apoio que a
   * cena deu no caminho. Vira *coachability* na devolutiva, junto com
   * `recuperou`/`piorou`.
   *
   * ⚠️ NUNCA compõe o nível. Nem por média com a autonomia, nem por "crédito
   * pela recuperação": no dia em que compuser, o andaime do interlocutor volta
   * para dentro da nota pela porta dos fundos — que é exatamente o defeito que
   * a separação existe para impedir. Com ATOR SIMULADO ele é artefato por
   * construção; só vira leitura com gente.
   */
  encerramento: MedidaDaCena;
  /** Índices que voltaram sem sinal — a métrica que decide se a cena substitui. */
  semSinal: number[];
  /** Descritores cuja evidência foi FRACA: a nota vale, a confiança não. */
  baixaConfianca: number[];
  /**
   * Descritores em que a pessoa PIOROU ou RECUPEROU ao longo da cena.
   * Em liderança, reparar depois de errar é competência — e some numa média.
   */
  recuperou: number[];
  piorou: number[];
  /** Média das notas existentes. `null` quando nada foi medido. */
  media: number | null;
  /**
   * `null` sempre que a medida não sustenta um nível publicável: cobertura
   * incompleta ou maioria das evidências em confiança baixa. A média continua
   * disponível para auditoria — o que não sai é o RÓTULO, porque quem lê "N2"
   * não vê que ele veio de metade dos descritores.
   */
  nivel: Nivel | null;
  /** Por que o nível não saiu, quando não saiu. */
  nivelSuprimidoPorque: string | null;
  /** Cobertura efetiva: quantos dos N descritores saíram com sinal. */
  /** A cena mediu o que se propôs? Denominador = descritores observáveis. */
  cobertura: { medidos: number; total: number; taxa: number };
  /** Quanto da competência esta cena alcança. `observaveis === total` = régua inteira. */
  alcance: { observaveis: number; total: number; taxa: number };
  /**
   * O QUE A CENA PRODUZIU — separado de por que ela parou (`MotivoParada`).
   *
   * Sob investigação, descritor sem sinal significa que o gestor **não chegou
   * ao fato**. Cobertura vira medida, não acidente — e por isso ela é o eixo
   * deste campo.
   */
  resultado: ResultadoDaCena;
  /**
   * Índices de descritor que a extração devolveu FORA da faixa 1..N.
   *
   * Vazio é o esperado. Não-vazio significa que o extrator não está apontando
   * descritor — provavelmente está numerando as entradas —, e **a consolidação
   * inteira não vale**. Ver o comentário em `consolidarCena`.
   */
  indicesInvalidos: number[];
  /**
   * Descritores que ESTA cena não consegue observar, declarados na entrada.
   *
   * Vazio = a cena cobre a régua inteira. Não-vazio significa que o nível de
   * competência NÃO sai daqui: sai da bateria que junta as cenas. Ver o
   * comentário em `consolidarCena`.
   */
  foraDoAlcance: number[];
  /**
   * Evidências descartadas por virem de um beat que NÃO mede aquele descritor.
   *
   * Vazio é o esperado. Não-vazio significa que o extrator não está respeitando
   * o mapa descritor↔beat — e o mapa É o contrato de cobertura deste módulo:
   * sem ele, "o beat 1 aconteceu" deixa de significar "D1 foi sondado".
   */
  forasDoMapa: Array<{ descritor: number; beat: number }>;

}

/**
 * Consolida a extração em notas — em CÓDIGO, como a IA4 já faz.
 *
 * ⚠️ A média ignora os `sem_sinal` em vez de tratá-los como zero. Isso é
 * deliberado e tem um custo que precisa ficar visível: uma cena que mediu 2 de
 * 6 descritores produz uma média com cara de completa. Por isso `cobertura` sai
 * ao lado da nota e nunca depois dela — quem consumir isto sem olhar a taxa vai
 * tomar decisão sobre um número que não representa a competência.
 */
export function consolidarCena(
  evidencias: EvidenciaDescritor[],
  numDescritores = 6,
  ocorrido?: {
    beats: BeatDaCena[];
    beatsCumpridos: number[];
    /**
     * Os descritores que ESTA cena consegue observar.
     *
     * 🔴 Medido em 25/08/2026: o mapa descritor↔beat da IA3 diz o que se QUER
     * medir; nunca ninguém perguntou o que a cena OFERECE para observar. Os
     * dois foram tratados como a mesma coisa, e o resultado é cobrar 6/6 de
     * uma cena que observa 4 — com os outros 2 entrando na média como nota
     * baixa em vez de lacuna.
     *
     * D2 ("escuta TODAS AS PARTES") e D4 ("acordo com compromissos DE AMBOS")
     * não têm como acontecer com uma só das partes na sala. Eles fecharam em
     * 2,44 e 2,24 enquanto os outros quatro chegaram a 3,00 · 3,00 · 3,20 ·
     * 2,80. Não é o avaliado que falhou neles: é a cena que não os oferece.
     *
     * Ausente = todos observáveis (comportamento anterior, para artefatos e
     * chamadores que não declaram nada).
     */
    observaveis?: number[];
  },
): ConsolidacaoCena {
  // `notas` = AUTONOMIA (primeira evidência) — o topo, o que vira rótulo.
  const notas: Array<number | null> = Array.from({ length: numDescritores }, () => null);
  const notasEncerramento: Array<number | null> = Array.from({ length: numDescritores }, () => null);

  /**
   * 🔴 MEDIDO NA FASE 0 (24/08/2026): sem este filtro, a cobertura reportada
   * MENTE. Numa cena em que só o beat 1 se cumpriu em 14 turnos, o extrator
   * devolveu evidência para os 6 descritores — inclusive marcadas `beat: 3` e
   * `beat: 4`, momentos que nunca existiram na conversa. A causa é a instrução
   * "EXATAMENTE UMA entrada por descritor", herdada do extrator da arguição: lá
   * ela é inofensiva, porque a arguição sonda um texto que já cobre tudo; aqui
   * ela força o modelo a preencher lacuna, e lacuna preenchida vira nota.
   *
   * A correção é de CÓDIGO, não de prompt: descritor cujo beat não aconteceu é
   * `sem_sinal` por construção, independentemente do que a IA escreveu. Prompt
   * pede; código garante — e "6 de 6" volta a significar seis.
   */
  const alcancaveis = ocorrido
    ? new Set(
        ocorrido.beats
          .filter((b) => ocorrido.beatsCumpridos.includes(b.numero))
          .flatMap((b) => b.descritores),
      )
    : null;

  /**
   * FORA DO ALCANCE ≠ SEM SINAL POR ACASO.
   *
   * "O beat não aconteceu" é acidente da conversa: da próxima vez pode
   * acontecer. "A cena não observa este descritor" é propriedade do desenho:
   * nunca vai acontecer, e insistir produz nota baixa sistemática que parece
   * gap da pessoa. Os dois viram lacuna, mas só um deles é defeito de desenho —
   * e por isso saem em campos separados.
   */
  /**
   * ⚠️ `!== undefined`, NÃO `.length`. Uma lista VAZIA é uma declaração — "esta
   * cena não observa nada" — e o `.length` a lia como ausência, devolvendo o
   * comportamento permissivo justamente para quem calculou a lista e obteve
   * zero. É a armadilha clássica da veracidade de array vazio, e aqui ela
   * inverteria o sentido do campo mais novo do módulo.
   */
  const observaveis = ocorrido?.observaveis !== undefined
    ? new Set(ocorrido.observaveis.filter((i) => Number.isInteger(i) && i >= 1 && i <= numDescritores))
    : null;
  const foraDoAlcance: number[] = [];
  if (observaveis) {
    for (let i = 1; i <= numDescritores; i++) if (!observaveis.has(i)) foraDoAlcance.push(i);
  }

  /**
   * Um descritor pode aparecer em mais de um beat (o mapa da IA3 permite, ex.:
   * `D2: [1,2]`). A versão anterior resolvia isso com `Math.min` — "uma falha
   * pesa mais que um acerto isolado".
   *
   * 🔴 Isso estava errado para o que a cena mede. Numa conversa de liderança,
   * errar no beat 1 e REPARAR no beat 3 é a competência aparecendo, não uma
   * falha a ser preservada. O mínimo apagava a recuperação inteira e devolvia
   * a mesma nota de quem nunca se recuperou.
   *
   * Agora vale a evidência do beat MAIS TARDIO (o desempenho final), e a
   * trajetória fica visível em `recuperou` / `piorou`. Média não distingue
   * "estável em 2,2" de "1,4 que virou 3,2" — e são pessoas diferentes.
   */
  /**
   * 🔴 ÍNDICE FORA DA FAIXA NÃO É RUÍDO — É EXTRAÇÃO INVÁLIDA.
   *
   * A versão anterior fazia `continue` em silêncio, e foi isso que escondeu o
   * pior defeito do módulo (medido 25/08/2026): o extrator passou a numerar as
   * ENTRADAS em vez de apontar o descritor — 18 evidências numeradas 1…18 num
   * cenário de 6 descritores. As seis primeiras foram lidas como D1–D6, as doze
   * restantes descartadas caladas, e a nota inteira mediu "como foram os seis
   * primeiros momentos". A cobertura ainda dizia 6/6, porque 1…6 sempre existem.
   *
   * Um `continue` sobre dado que não devia existir é fallback invisível — o que
   * este projeto proíbe. Agora conta e devolve: quem consome decide, mas ninguém
   * decide sem saber.
   */
  const foraDaFaixa: number[] = [];
  const forasDoMapa: Array<{ descritor: number; beat: number }> = [];
  const porDescritor = new Map<number, EvidenciaDescritor[]>();
  for (const ev of evidencias) {
    const i = ev.indice;
    if (!Number.isInteger(i) || i < 1 || i > numDescritores) {
      if (Number.isFinite(Number(i))) foraDaFaixa.push(Number(i));
      continue;
    }
    if (nivelDaEvidencia(ev) === 'sem_sinal') continue;
    if (observaveis && !observaveis.has(i)) continue; // a cena não observa isto
    if (alcancaveis && !alcancaveis.has(i)) continue; // beat não aconteceu → lacuna

    /**
     * 🔴 O BEAT DECLARADO TEM DE MEDIR AQUELE DESCRITOR.
     *
     * Medido em 25/08/2026: **31 de 171 evidências (18,1%)** vinham de um beat
     * que não mede o descritor que elas pontuavam — e em 17 de 60 resultados
     * finais foi uma delas que venceu. D1 (que pertence só ao beat 1) fechava
     * em 3,20 com uma fala do beat 4 sobre indicadores.
     *
     * Isso esvazia a garantia central do módulo. O mapa descritor↔beat É o
     * contrato de cobertura: se D1 pode ser decidido por qualquer momento da
     * conversa, então "o beat 1 aconteceu" deixa de significar "D1 foi
     * sondado", e a cobertura 6/6 vira contagem de linhas outra vez.
     *
     * O validador conferia que o beat EXISTE e foi CUMPRIDO — nunca que ele
     * mede aquele descritor. Faltava esta linha, não outra checagem.
     */
    if (ocorrido && ev.beat != null) {
      const beatDaEvidencia = ocorrido.beats.find((b) => b.numero === ev.beat);
      if (beatDaEvidencia && !beatDaEvidencia.descritores.includes(i)) {
        forasDoMapa.push({ descritor: i, beat: ev.beat });
        continue;
      }
    }
    if (!(nivelDaEvidencia(ev) in NOTA_POR_VEREDITO)) continue;
    porDescritor.set(i, [...(porDescritor.get(i) ?? []), ev]);
  }

  const baixaConfianca: number[] = [];
  const recuperou: number[] = [];
  const piorou: number[] = [];

  for (const [i, evs] of porDescritor) {
    // Ordem TEMPORAL: turno manda; beat é fallback; debrief (sem os dois) fecha.
    const quando = (e: EvidenciaDescritor) => e.turno ?? (e.beat != null ? e.beat : 999);
    const ordenadas = [...evs].sort((a, b) => quando(a) - quando(b));
    /**
     * A SÉRIE É A CENA INTEIRA. `provocado` não remove evidência — só limita o
     * quanto ela pode valer (ver `notaDe`).
     *
     * 🔴 A versão anterior tirava da série toda evidência provocada quando
     * houvesse ao menos uma espontânea. Ela nasceu contra o extrator de
     * OCORRÊNCIA, que rotulava eco de molde como `demonstrou`. Com o
     * classificador ancorado (25/08) o eco já sai `n2_em_desenvolvimento` +
     * `provocado: true` — e o filtro passou a punir duas vezes a mesma coisa.
     *
     * Medido na re-extração de 25/08 (10 cenas, 134 evidências): das 41
     * evidências provocadas que o filtro descartava, **40 eram n2 e 1 era n1 —
     * NENHUMA era n3**. Ou seja, ele já não removia nota inflada; removia o
     * miolo da cena. E em **27 dos 59 descritores** a evidência descartada era
     * a ÚLTIMA — então o campo chamado "encerramento" não era o fim da cena,
     * era o fim do trecho espontâneo. O braço N1 fechava em 1,51 contra 1,51 de
     * abertura: os dois campos mediam quase a mesma coisa, e a separação de
     * 1,02 entre os braços vinha de ter cortado fora a deriva, não de medi-la.
     *
     * Com a série completa, a deriva aparece: N1 abre em 1,56 e fecha em 1,93,
     * com 2 dos 5 atores N1 vazando para N2 no encerramento — enquanto a
     * ABERTURA segura os 5 em N1. É esse o achado, e escondê-lo com um filtro
     * seria comprar número bonito com medida errada.
     */
    const serie = ordenadas;
    const notaDe = (e: EvidenciaDescritor) => {
      const v = nivelDaEvidencia(e) as keyof typeof NOTA_POR_VEREDITO;
      // Só-provocado: o teto é o N2. Nível-meta ditado pelo interlocutor não é
      // nível-meta da pessoa — é eco do molde que ela recebeu pronto.
      if (e.provocado && v === 'n3_meta') return NOTA_POR_VEREDITO.n2_em_desenvolvimento;
      return NOTA_POR_VEREDITO[v];
    };
    const trilha = serie.map(notaDe);
    const final = trilha[trilha.length - 1];
    notas[i - 1] = Math.min(trilha[0], TETO_CENA);
    notasEncerramento[i - 1] = Math.min(final, TETO_CENA);

    /**
     * ABERTURA — a PRIMEIRA evidência de cada descritor, guardada em separado.
     *
     * 🔴 MEDIDO EM 25/08/2026 e é o achado que reorganiza a medida: no braço N1,
     * os vereditos vão de **76% n1_gap no início** a **44% n3_meta no fim**. O
     * extrator acerta o N1 na abertura; quem muda é o avaliado, porque o
     * interlocutor fecha saídas e dita o formato turno após turno.
     *
     * Com um interlocutor didático NÃO EXISTE agregador único que deixe N1=N1 e
     * N3=N3 ao mesmo tempo — os dois sobem porque a cena ensina. Então são duas
     * medidas com significados diferentes:
     *   · ABERTURA     → hábito autônomo, o que a pessoa faz ANTES de a cena
     *                     ensinar o formato.
     *   · ENCERRAMENTO → coachability: o quanto ela incorpora durante a
     *                     conversa. É o que `media`/`nivel` publicam HOJE.
     *
     * ⚠️ Qual das duas deve carregar o RÓTULO é decisão de produto em aberto, e
     * o código não finge que já foi tomada: `nivel` continua vindo do
     * encerramento. A evidência (re-extração de 25/08) aponta para a abertura —
     * ela põe 5 de 5 atores N1 em N1 sob as DUAS regras de série, enquanto o
     * encerramento deixa 2 vazarem para N2. Mas trocar a fonte do rótulo muda o
     * que "a nota da cena" significa para PDI e trilha; não é ajuste de código.
     */
    if (trilha.length > 1) {
      if (final > trilha[0]) recuperou.push(i);
      else if (final < trilha[0]) piorou.push(i);
    }
    // Confiança: a FORÇA vive aqui e só aqui — nunca na nota.
    if (serie.every((e) => e.forca === 'fraca')) baixaConfianca.push(i);
  }

  /**
   * DISJUNTOS por construção.
   *
   * 🔴 Sem esta exclusão os dois campos traziam a MESMA lista — D2 e D4 em
   * `foraDoAlcance` e também em `semSinal` —, e a distinção que o módulo acabou
   * de publicar virava enfeite: quem lesse `semSinal` continuaria entendendo
   * "a conversa não chegou nesses" onde a verdade é "esta cena nunca chega".
   *
   * `semSinal`      = pertence ao desenho da cena e não apareceu nesta execução.
   * `foraDoAlcance` = não pertence ao desenho da cena, e nenhuma execução muda.
   */
  const semSinal: number[] = [];
  for (let i = 1; i <= numDescritores; i++) {
    if (notas[i - 1] == null && !foraDoAlcance.includes(i)) semSinal.push(i);
  }

  const medidas = notas.filter((n): n is number => n != null);
  /** Quantos descritores ESTA cena se propôs a medir. */
  const esperados = numDescritores - foraDoAlcance.length;
  const media = medidas.length ? medidas.reduce((a, b) => a + b, 0) / medidas.length : null;

  // O NÍVEL só sai quando a medida o sustenta. A média fica sempre, para
  // auditoria; o rótulo é que não pode circular pela metade, porque quem lê
  // "N2" não vê que ele veio de 3 dos 6 descritores.
  let nivelSuprimidoPorque: string | null = null;
  if (foraDaFaixa.length) {
    nivelSuprimidoPorque = `extração inválida: ${foraDaFaixa.length} índice(s) fora de 1..${numDescritores}`;
  } else if (media == null) nivelSuprimidoPorque = 'nenhum descritor medido';
  else if (foraDoAlcance.length) {
    /**
     * Cena que não observa a régua inteira NÃO publica nível de competência —
     * mesmo tendo medido bem tudo o que consegue observar.
     *
     * A nota dos 4 observáveis é legítima e vai em `media`, para a BATERIA
     * agregar. O que não pode circular é o rótulo N1–N4 da competência saindo
     * de 4 de 6 descritores: quem lê "N2" não vê que dois nunca tiveram
     * chance de aparecer. É a mesma razão de suprimir por cobertura — a
     * diferença é que aqui o buraco é de desenho, e some ao juntar as cenas
     * da bateria, não ao rodar esta de novo.
     */
    nivelSuprimidoPorque =
      `cena observa ${numDescritores - foraDoAlcance.length} de ${numDescritores} descritores ` +
      `(fora do alcance: ${foraDoAlcance.map((i) => `D${i}`).join(', ')}) — nível é da BATERIA`;
  } else if (medidas.length < esperados) {
    nivelSuprimidoPorque = `cobertura ${medidas.length}/${esperados}`;
  } else if (baixaConfianca.length * 2 > numDescritores) {
    nivelSuprimidoPorque = `${baixaConfianca.length} de ${numDescritores} descritores com evidência fraca`;
  }

  return {
    notas,
    semSinal,
    baixaConfianca: baixaConfianca.sort((a, b) => a - b),
    recuperou: recuperou.sort((a, b) => a - b),
    piorou: piorou.sort((a, b) => a - b),
    media: media == null ? null : Number(media.toFixed(2)),
    nivel: nivelSuprimidoPorque ? null : nivelDaNota(media as number),
    nivelSuprimidoPorque,
    /**
     * COBERTURA é da CENA: mediu tudo o que se propôs a medir?
     *
     * 🔴 Antes o denominador era a régua inteira, e uma cena que observa 4
     * descritores e mede os 4 aparecia como "4/6" — cobertura incompleta, com
     * a mesma cara de cena que falhou. São duas perguntas diferentes, e agora
     * têm dois campos: `cobertura` responde "a cena entregou o que prometeu",
     * `alcance` responde "quanto da competência esta cena alcança".
     */
    cobertura: {
      medidos: medidas.length,
      total: esperados,
      taxa: esperados ? Number((medidas.length / esperados).toFixed(3)) : 0,
    },
    alcance: {
      observaveis: esperados,
      total: numDescritores,
      taxa: numDescritores ? Number((esperados / numDescritores).toFixed(3)) : 0,
    },
    resultado: !esperados || medidas.length === 0
      ? 'insuficiente'
      : medidas.length === esperados
        ? 'suficiente'
        : medidas.length * 2 >= esperados ? 'parcial' : 'insuficiente',
    indicesInvalidos: [...new Set(foraDaFaixa)].sort((a, b) => a - b),
    foraDoAlcance,
    /**
     * O encerramento herda a MESMA régua de supressão — cobertura, índice
     * inválido e confiança são propriedades da cena, não da leitura. Se a
     * supressão valesse só para uma delas, a outra circularia com rótulo em
     * cena que o próprio código considera insuficiente.
     */
    encerramento: (() => {
      const ms = notasEncerramento.filter((n): n is number => n != null);
      const m = ms.length ? Number((ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)) : null;
      return {
        notas: notasEncerramento,
        media: m,
        nivel: nivelSuprimidoPorque || m == null ? null : nivelDaNota(m),
      };
    })(),
    forasDoMapa,
  };
}
