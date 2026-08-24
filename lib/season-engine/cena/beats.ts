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
      'Feche as saídas fáceis. Deixe explícito que atender os dois lados não cabe — ' +
      'tempo, gente ou dinheiro não dão. Force o avaliado a preterir alguma coisa na sua frente.',
    sinalDeCumprido:
      'O avaliado escolheu uma direção sabendo o que ela custa, ou recusou escolher (que também é sinal).',
  },
  {
    numero: 2,
    pilar: 'COMO',
    comoOInterlocutorCria:
      'Aceite a direção só no discurso e resista na execução: "e como você faz isso comigo dizendo não?". ' +
      'Peça o passo concreto, não o princípio.',
    sinalDeCumprido:
      'O avaliado descreveu um passo executável diante de resistência declarada — ou ficou no princípio.',
  },
  {
    numero: 3,
    pilar: 'TENSAO_HUMANA',
    comoOInterlocutorCria:
      'Traga a pessoa para dentro: magoe-se, exalte-se, discorde do julgamento do avaliado sobre você. ' +
      'Este é o beat que a prova escrita quase não alcança — não o abrevie.',
    sinalDeCumprido:
      'O avaliado lidou com a reação humana sem ignorá-la nem capitular a ela — ou fez uma das duas.',
  },
  {
    numero: 4,
    pilar: 'SUSTENTABILIDADE',
    comoOInterlocutorCria:
      'Teste o depois: "e daqui a um mês, quando estivermos no mesmo lugar?". ' +
      '⚠️ Este beat NÃO nasce sozinho numa conversa quente — se você não o provocar, ele não acontece.',
    sinalDeCumprido:
      'O avaliado disse como saberia que funcionou, com algo verificável — ou prometeu sem critério.',
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

  const semCobertura: string[] = [];
  for (let i = 1; i <= numDescritores; i++) if (!cobertos.has(i)) semCobertura.push(`D${i}`);
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

export type MotivoFim = 'acordo' | 'ruptura' | 'impasse' | 'teto';

export interface EstadoParaEncerrar {
  turno: number;
  tetoTurnos: number;
  beats: BeatDaCena[];
  beatsCumpridos: number[];
  /** O modelo pediu para encerrar no [META]. Pedido, não decisão. */
  modeloPediuEncerrar: boolean;
  motivoDoModelo: MotivoFim | null;
  /** Turnos consecutivos sem nenhum beat novo — matéria-prima do impasse. */
  turnosSemAvanco: number;
}

export interface VeredictoEncerramento {
  encerrar: boolean;
  motivo: MotivoFim | null;
  /** Preenchido quando o modelo quis encerrar e o código NEGOU. Vai para o log. */
  negadoPorBeatPendente: number | null;
}

/** Quantos turnos parados bastam para chamar de impasse. */
export const TURNOS_PARA_IMPASSE = 3;

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
    return { encerrar: true, motivo: estado.motivoDoModelo ?? 'acordo', negadoPorBeatPendente: null };
  }
  if (estado.turnosSemAvanco >= TURNOS_PARA_IMPASSE) {
    return { encerrar: true, motivo: 'impasse', negadoPorBeatPendente: null };
  }
  return { encerrar: false, motivo: null, negadoPorBeatPendente: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidação
// ─────────────────────────────────────────────────────────────────────────────

export type VereditoDescritor = 'demonstrou' | 'tentou' | 'falhou' | 'sem_sinal';
export type ForcaEvidencia = 'fraca' | 'moderada' | 'forte';

export interface EvidenciaDescritor {
  /** Índice 1..6 — o mesmo D-n do mapa de cobertura e de `d{n}_nota`. */
  indice: number;
  veredito: VereditoDescritor;
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
const NOTA_POR_VEREDITO: Record<Exclude<VereditoDescritor, 'sem_sinal'>, number> = {
  demonstrou: 3.2, // N3 — nível-meta
  tentou:     2.2, // N2 — em desenvolvimento
  falhou:     1.4, // N1 — lacuna
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

export interface ConsolidacaoCena {
  /** Nota por descritor, índice 1..6. `null` = sem sinal, lacuna declarada. */
  notas: Array<number | null>;
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
  cobertura: { medidos: number; total: number; taxa: number };
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
  ocorrido?: { beats: BeatDaCena[]; beatsCumpridos: number[] },
): ConsolidacaoCena {
  const notas: Array<number | null> = Array.from({ length: numDescritores }, () => null);

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
  const porDescritor = new Map<number, EvidenciaDescritor[]>();
  for (const ev of evidencias) {
    const i = ev.indice;
    if (!Number.isInteger(i) || i < 1 || i > numDescritores) continue;
    if (ev.veredito === 'sem_sinal') continue;
    if (alcancaveis && !alcancaveis.has(i)) continue; // beat não aconteceu → lacuna
    if (!(ev.veredito in NOTA_POR_VEREDITO)) continue;
    porDescritor.set(i, [...(porDescritor.get(i) ?? []), ev]);
  }

  const baixaConfianca: number[] = [];
  const recuperou: number[] = [];
  const piorou: number[] = [];

  for (const [i, evs] of porDescritor) {
    // Ordem TEMPORAL: turno manda; beat é fallback; debrief (sem os dois) fecha.
    const quando = (e: EvidenciaDescritor) => e.turno ?? (e.beat != null ? e.beat : 999);
    const ordenadas = [...evs].sort((a, b) => quando(a) - quando(b));
    const trilha = ordenadas.map((e) => NOTA_POR_VEREDITO[e.veredito as keyof typeof NOTA_POR_VEREDITO]);
    const final = trilha[trilha.length - 1];
    notas[i - 1] = Math.min(final, TETO_CENA);

    if (trilha.length > 1) {
      if (final > trilha[0]) recuperou.push(i);
      else if (final < trilha[0]) piorou.push(i);
    }
    // Confiança: a FORÇA vive aqui e só aqui — nunca na nota.
    if (ordenadas.every((e) => e.forca === 'fraca')) baixaConfianca.push(i);
  }

  const semSinal: number[] = [];
  for (let i = 1; i <= numDescritores; i++) if (notas[i - 1] == null) semSinal.push(i);

  const medidas = notas.filter((n): n is number => n != null);
  const media = medidas.length ? medidas.reduce((a, b) => a + b, 0) / medidas.length : null;

  // O NÍVEL só sai quando a medida o sustenta. A média fica sempre, para
  // auditoria; o rótulo é que não pode circular pela metade, porque quem lê
  // "N2" não vê que ele veio de 3 dos 6 descritores.
  let nivelSuprimidoPorque: string | null = null;
  if (media == null) nivelSuprimidoPorque = 'nenhum descritor medido';
  else if (medidas.length < numDescritores) {
    nivelSuprimidoPorque = `cobertura ${medidas.length}/${numDescritores}`;
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
    cobertura: {
      medidos: medidas.length,
      total: numDescritores,
      taxa: numDescritores ? Number((medidas.length / numDescritores).toFixed(3)) : 0,
    },
  };
}
