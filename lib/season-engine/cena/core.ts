/**
 * NÚCLEO SEM GATE do Modo Cena (padrão CLAUDE.md: headless → núcleo em `lib/`,
 * fora de `'use server'`). Não toca banco, não autentica, não persiste — recebe
 * contexto pronto e devolve estado. Quem persistir decide onde.
 *
 * ⚠️ TESTE INTERNO (24/08/2026): não existe rota, action nem tela chamando este
 * módulo. O único consumidor é `scripts/_cena-fase0.ts`. Isso é deliberado — a
 * cena vira instrumento de avaliação, e instrumento entra depois de medido, não
 * antes. Antes de expor, ler o portão da fase 0 na proposta: a taxa de
 * descritor sem sinal da cena tem que empatar ou ganhar da prova escrita.
 *
 * A divisão de trabalho com `beats.ts` é a regra do produto, não estilo: o
 * modelo dá insumo, o CÓDIGO decide. Aqui ficam as chamadas de IA e a leitura
 * do [META]; a decisão de encerrar, a escolha do próximo beat e a consolidação
 * das notas são funções puras, testáveis sem chave de API.
 */

import { callAI, callAIChat, type AIConfig } from '@/actions/ai-client';
import { parseJsonIA } from '@/lib/ai-json';
import { maskTextPII, unmaskPII } from '@/lib/pii-masker';
import {
  podeEncerrar, proximoBeat, validarContratoDaCena, validarGabaritoDaCena,
  type BeatDaCena, type EvidenciaDescritor, type MotivoFim,
} from './beats';
import {
  buildInstrucaoDoBeat, buildInterlocutorSystemEstavel,
  promptExtracao, promptGuarda, promptGuardaDoInterlocutor, promptJuizDeBeat, promptPersona,
  promptTriagemAdequacao,
  type ContextoCena, type DescritorDaRegua, type PersonaInterlocutor,
} from './prompts';

export { type ContextoCena, type DescritorDaRegua, type PersonaInterlocutor } from './prompts';

/** Turnos de contexto que o juiz de beat enxerga (últimas N mensagens). */
export const JANELA_DO_JUIZ = 6;

/** Teto duro de turnos. A config manda; isto só evita laço. */
export const TETO_TURNOS_HARD = 16;
/** Teto default de uma cena de avaliação. */
export const TETO_TURNOS_PADRAO = 14;

/**
 * ═══ ALOCAÇÃO DE MODELOS (decisão do Rodrigo, 24/08/2026) ═══
 *
 * Nada de Haiku, em papel nenhum. Os papéis PESADOS vão para Opus 5; os dois
 * papéis de leitura binária vão para Grok 4.6 — e a razão NÃO é preço, é
 * FAMÍLIA DIFERENTE, que é o que esses dois papéis precisam:
 *
 *  - o guarda existe para barrar quem tenta manipular o personagem, que é
 *    Claude — um guarda da mesma casa cai no mesmo truque;
 *  - o juiz de beat existe justamente porque um julgador com interesse na cena
 *    julga errado (medido: enquanto era o próprio personagem, um avaliado N3
 *    cumpriu 1 beat em 14 turnos). Independência de família é a segunda camada
 *    da mesma ideia — o mesmo raciocínio do Dual-IA dos auditores do projeto.
 *
 * ⚠️ O leitor foi Kimi K3 antes do Grok, e trocou por dois motivos MEDIDOS
 * (24/08/2026), não por preferência: latência e cota. Kimi custava 5,7 s no
 * guarda e 7,8 s no juiz — e como os dois rodam a cada turno, a espera por
 * turno pulou de ~8 s para ~19 s, dois minutos e meio de tela parada numa cena
 * de 8 turnos. Junto vieram 43 respostas 429 da nossa conta, com 8 quedas
 * efetivas em fallback: parte do julgamento acabou rodando noutro modelo, o que
 * contamina a própria medida. Grok 4.6 com `effort: 'low'` responde em ~2 s
 * (contra 8,4 s sem o effort — o parâmetro é o que decide) e custa $2/$6,
 * menos que os $3/$15 do Kimi.
 *
 * ⚠️ `max_tokens` SUBIU JUNTO, e isso não é folga: em Opus 5 o thinking é
 * LIGADO POR PADRÃO e o `max_tokens` limita thinking + texto JUNTOS. Os 1.200
 * que bastavam no Sonnet 4.6 seriam consumidos pelo raciocínio, e a fala do
 * personagem voltaria truncada ou vazia — sem erro nenhum, porque uma resposta
 * curta demais é indistinguível de um personagem lacônico.
 *
 * ⚠️ O `effort` também é explícito. O default é `high`, e numa cena de 12
 * turnos com uma pessoa esperando na tela isso é latência que ninguém pediu.
 * O personagem precisa de presença, não de deliberação; o extrator, que é onde
 * a nota nasce, é o único que recebe `high`.
 */
export const MODELO_PESADO: AIConfig = { model: 'claude-opus-5' };
export const MODELO_LEITOR: AIConfig = { model: 'grok-4.6' };

/** Tetos de saída. Em Opus 5 cobrem thinking + texto — ver o aviso acima. */
export const MAX_TOKENS = {
  persona: 4000,
  turno: 4000,
  extracao: 10000,
  triagem: 6000,
  leitor: 1500,
} as const;

export interface MsgCena {
  role: 'user' | 'assistant';
  content: string;
  turno?: number;
}

export interface EstadoCena {
  historico: MsgCena[];
  turno: number;
  beatsCumpridos: number[];
  descritoresTocados: number[];
  turnosSemAvanco: number;
  /**
   * O beat que a ÚLTIMA fala do interlocutor foi instruída a provocar.
   *
   * 🔴 Existe por um desalinhamento de um turno: o juiz usava `proximoBeat`, o
   * primeiro pendente AGORA. Quando um beat se cumpria, a fala seguinte do
   * avaliado — que ainda respondia à provocação do beat ANTERIOR — passava a
   * ser julgada contra o beat NOVO, que ninguém tinha provocado ainda. Com a
   * janela de 6 mensagens isso é pior, não melhor: o juiz acha um sinal
   * genérico antigo e declara cobertura de um momento que não aconteceu — que
   * é exatamente a garantia central deste módulo.
   */
  beatProvocado: number | null;
  condicaoSatisfeita: boolean;
  concluida: boolean;
  motivoFim: MotivoFim | null;
  /**
   * Auditoria do modo de falha mais provável: o modelo pediu para encerrar e o
   * código negou porque faltava beat. Se esta lista vier cheia na fase 0, o
   * problema não é a régua — é o personagem amolecendo, e a correção é de prompt.
   */
  encerramentosNegados: Array<{ turno: number; beat: number }>;
  /** Turnos barrados pelo guarda (tentativa de sair do papel, vazio, impróprio). */
  bloqueios: Array<{ turno: number; veredito: string; motivo: string }>;
  /**
   * Turnos em que o INTERLOCUTOR entregou o elemento que devia só cobrar.
   *
   * Registra o que sobrou DEPOIS da regeneração — a primeira tentativa some, e
   * é isso que se quer: o que importa para a medida é a fala que chegou à
   * pessoa. Lista não-vazia numa cena de medição é sinal de que o personagem
   * está ensinando, e o teto de ditação (`lib/.../ditado.ts`) confere o efeito
   * disso nas citações. Um degrada e conta; o outro reprova a cena.
   */
  ditados: Array<{ turno: number; elemento: string }>;
}

export interface PIICena {
  map: Record<string, string>;
  nomeMasked?: string;
}

export interface OpcoesCena {
  aiConfig?: AIConfig;
  tetoTurnos?: number;
  pii?: PIICena;
  /** Atribuição no ledger de IA. `source` isola a rodada de medição. */
  ledger?: { empresaId?: string | null; colaboradorId?: string | null; source?: string };
}

const stripMeta = (t: string) => t.replace(/\[META\][\s\S]*?\[\/META\]/g, '').trim();

function lerMeta(texto: string): any {
  const m = texto.match(/\[META\]([\s\S]*?)\[\/META\]/);
  if (!m) return {};
  try { return parseJsonIA(m[1]); } catch { return {}; }
}

const mascarar = (t: string, pii?: PIICena) => (pii ? maskTextPII(t, pii.map) : t);
const desmascarar = (t: string, pii?: PIICena) => (pii ? unmaskPII(t, pii.map) : t);

function opcoesLedger(o: OpcoesCena, taskKey: string) {
  return {
    taskKey,
    empresaId: o.ledger?.empresaId ?? null,
    colaboradorId: o.ledger?.colaboradorId ?? null,
    ...(o.ledger?.source ? { source: o.ledger.source } : {}),
  };
}

/** Projeta o histórico para o payload da IA: só {role, content} + masking em voo. */
function histParaIA(hist: MsgCena[], pii?: PIICena) {
  return hist.map((m) => ({ role: m.role, content: mascarar(m.content, pii) }));
}

const tetoDe = (o: OpcoesCena) => Math.min(o.tetoTurnos ?? TETO_TURNOS_PADRAO, TETO_TURNOS_HARD);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deriva o interlocutor do cenário. Uma chamada por cena, antes do primeiro turno.
 *
 * Lança se a IA não devolver `o_que_faz_ceder` ou `primeira_fala`: sem a
 * condição de cessão o personagem cede por simpatia e a cena deixa de medir;
 * sem a fala de abertura não há cena. Falha na CONSTRUÇÃO é falha alta — a
 * régua do FMEA — porque aqui ainda há quem conserte.
 */
export async function gerarPersona(ctx: ContextoCena, opts: OpcoesCena = {}): Promise<PersonaInterlocutor> {
  /**
   * 🔴 O CONTRATO É CHECADO AQUI, no núcleo — não no script.
   *
   * A versão anterior tinha `validarContratoDaCena` escrito e ZERO chamadores:
   * um guard que existia no arquivo e não no caminho. Enquanto isso, o script
   * montava `ctx` com `|| ''` e seguia direto para cá, então a cena continuava
   * nascendo sem armadilha exatamente como nas 20 cenas cegas — e o documento
   * já dizia "corrigido".
   *
   * Validar no núcleo, e não no chamador, é o que faz o segundo chamador (rota,
   * action, task) herdar a garantia em vez de repetir o furo.
   */
  const faltando = validarContratoDaCena({
    armadilhaGenerica: ctx.cenario?.armadilhaGenerica,
    tradeoffTestado: ctx.cenario?.tradeoffTestado,
    fatorComplicador: ctx.cenario?.fatorComplicador,
    descritores: ctx.descritores,
  });
  if (faltando.length) {
    throw new Error(
      `Cena sem contrato de entrada — ${faltando.join(', ')}. ` +
      'Sem estes campos o personagem não sabe o que recusar e a cena mede outra coisa.',
    );
  }

  const { system, user } = promptPersona(ctx);
  const raw = await callAI(system, user, opts.aiConfig ?? MODELO_PESADO, MAX_TOKENS.persona, {
    temperature: 0.7, reasoningEffort: 'medium',
    ...opcoesLedger(opts, 'cena_persona'),
  });

  let persona: PersonaInterlocutor;
  try {
    persona = parseJsonIA<PersonaInterlocutor>(raw);
  } catch {
    throw new Error('Persona da cena: IA não devolveu JSON válido');
  }
  const camposDaPersona = (['quem', 'o_que_faz_ceder', 'primeira_fala'] as const).filter(
    (k) => !String(persona?.[k] ?? '').trim(),
  );
  if (camposDaPersona.length) {
    throw new Error(`Persona da cena incompleta — sem ${camposDaPersona.join(', ')}`);
  }

  /**
   * 🔴 O INTERLOCUTOR É SEMPRE LIDERADO DIRETO — e agora o código sabe disso.
   *
   * A regra é do produto: a cena mede LIDERANÇA, e liderança se exerce sobre
   * quem se lidera. Um par, o chefe ou um cliente produziriam uma conversa
   * difícil que não é a competência avaliada.
   *
   * Só que o prompt oferecia a lista inteira — "subordinado, par, gestor,
   * cliente, família..." — e a derivação era livre. Nas duas rodadas medidas a
   * persona caiu em subordinada direta por ACASO do cenário, não por regra:
   * um cenário centrado na Secretaria geraria o secretário, e a cena mediria
   * outra coisa sem nada acusando. É a classe "config declarada ≠ config
   * aplicada" — a regra existia na cabeça de quem desenhou e não no caminho.
   *
   * A conferência é sobre um ENUM que o modelo devolve, nunca sobre a prosa de
   * `relacao`: casar palavra-chave em texto livre é o que fez a flag
   * `provocado` degenerar a 76% neste mesmo módulo.
   */
  const erradoNoGabarito = validarGabaritoDaCena(persona.fatos, ctx.descritores.length);
  if (erradoNoGabarito.length) {
    throw new Error(
      `Gabarito da cena inválido — ${erradoNoGabarito.join('; ')}. ` +
      'Sob a leitura (b) o que se mede é o gestor CHEGAR aos fatos; sem fato enterrado ' +
      'por descritor, a nota sairia da forma da pergunta e não do que ela alcançou.',
    );
  }

  if (persona.relacao_hierarquica !== 'liderado_direto') {
    throw new Error(
      `Persona não é liderado direto (relacao_hierarquica=${JSON.stringify(persona.relacao_hierarquica)}). ` +
      'A cena mede liderança: quem senta na mesa é a pessoa da equipe. ' +
      'Terceiro citado no cenário — mãe, cliente, Secretaria — é assunto da conversa, não personagem dela.',
    );
  }
  return persona;
}

/** Abre a cena. O turno 1 é a fala do interlocutor, já em tensão. */
export function abrirCena(
  persona: PersonaInterlocutor,
  primeiroBeat: number,
): { estado: EstadoCena; fala: string } {
  const fala = persona.primeira_fala.trim();
  return {
    estado: {
      historico: [{ role: 'assistant', content: fala, turno: 1 }],
      turno: 1,
      beatsCumpridos: [],
      descritoresTocados: [],
      turnosSemAvanco: 0,
      // A fala de abertura entra em tensão: é a função do beat 1 (ESCOLHA), e é
      // a ela que o avaliado responde no turno seguinte.
      beatProvocado: primeiroBeat,
      condicaoSatisfeita: false,
      concluida: false,
      motivoFim: null,
      encerramentosNegados: [],
      bloqueios: [],
      ditados: [],
    },
    fala,
  };
}

export interface ResultadoGuarda {
  veredito: 'ok' | 'quebra_de_papel' | 'impropria' | 'vazia';
  motivo: string;
}

/**
 * Guarda de cena. Falha ABERTA de propósito: se a chamada quebrar, a cena
 * continua. Barrar o avaliado por indisponibilidade do modelo barato seria
 * trocar um risco de integridade por uma parada dura no meio de uma avaliação.
 */
export async function checarGuarda(mensagem: string, opts: OpcoesCena = {}): Promise<ResultadoGuarda> {
  const { system, user } = promptGuarda(mensagem);
  try {
    const raw = await callAI(system, user, MODELO_LEITOR, MAX_TOKENS.leitor, {
      temperature: 0, reasoningEffort: 'low',
      ...opcoesLedger(opts, 'cena_guarda'),
    });
    const r = parseJsonIA<ResultadoGuarda>(raw);
    const vs = ['ok', 'quebra_de_papel', 'impropria', 'vazia'];
    return {
      veredito: vs.includes(r?.veredito) ? r.veredito : 'ok',
      motivo: String(r?.motivo ?? ''),
    };
  } catch {
    return { veredito: 'ok', motivo: 'guarda indisponível' };
  }
}

/**
 * Juiz de beat — leitor sem agenda. Ver a nota longa em `promptJuizDeBeat`:
 * enquanto era o próprio personagem que marcava, a cena não andava.
 *
 * Falha FECHADA (não cumpriu) de propósito: um beat marcado por engano encerra
 * a cena cedo e deixa descritor sem medir; um beat não marcado apenas insiste
 * mais um turno, e o teto sempre existe. Errar para o lado de insistir é o
 * lado barato.
 */
export async function julgarBeat(
  beat: BeatDaCena, janela: string, falaAvaliado: string, opts: OpcoesCena = {},
): Promise<{ cumprido: boolean; porque: string }> {
  const { system, user } = promptJuizDeBeat(beat, janela, falaAvaliado);
  try {
    const raw = await callAI(system, user, MODELO_LEITOR, MAX_TOKENS.leitor, {
      temperature: 0, reasoningEffort: 'low',
      ...opcoesLedger(opts, 'cena_juiz_beat'),
    });
    const r = parseJsonIA<{ cumprido: boolean; porque: string }>(raw);
    return { cumprido: r?.cumprido === true, porque: String(r?.porque ?? '') };
  } catch {
    return { cumprido: false, porque: 'juiz indisponível' };
  }
}

export interface ResultadoTurno {
  estado: EstadoCena;
  fala: string;
  concluida: boolean;
  /** Preenchido quando o guarda barrou — a mensagem NÃO entrou no histórico. */
  barrado: ResultadoGuarda | null;
}

/**
 * Processa um turno: guarda → interlocutor → leitura do [META] → decisão.
 *
 * A ordem importa. O guarda roda ANTES do personagem porque uma tentativa de
 * "ignore suas instruções" não deve nem chegar ao interlocutor: numa cena que
 * gera nota, convencer o personagem a sair do papel é colar na prova, e o
 * caminho mais barato de impedir é não entregar o texto.
 */
/**
 * O interlocutor entregou o elemento que devia só cobrar?
 *
 * Mesma política de indisponibilidade do `checarGuarda`: se o leitor cair, a
 * cena SEGUE. Barrar o personagem por falha do modelo barato pararia uma
 * avaliação ao vivo por um problema que não é dela — e o teto de ditação
 * confere o efeito depois, sobre as citações, sem depender de IA nenhuma.
 * Degradar aqui é seguro justamente porque a rede de baixo é de código.
 */
export async function checarDitado(
  fala: string,
  beat: BeatDaCena,
  opts: OpcoesCena = {},
): Promise<{ dita: boolean; elemento: string }> {
  const { system, user } = promptGuardaDoInterlocutor(fala, beat);
  try {
    const raw = await callAI(system, user, MODELO_LEITOR, MAX_TOKENS.leitor, {
      temperature: 0, reasoningEffort: 'low',
      ...opcoesLedger(opts, 'cena_guarda_interlocutor'),
    });
    const r = parseJsonIA<{ dita_formato?: boolean; elemento?: string }>(raw);
    return { dita: r?.dita_formato === true, elemento: String(r?.elemento ?? '') };
  } catch {
    return { dita: false, elemento: '' };
  }
}

export async function turnoCena(
  ctx: ContextoCena,
  persona: PersonaInterlocutor,
  estado: EstadoCena,
  mensagem: string,
  opts: OpcoesCena = {},
): Promise<ResultadoTurno> {
  if (estado.concluida) return { estado, fala: '', concluida: true, barrado: null };

  const teto = tetoDe(opts);
  const guarda = await checarGuarda(mensagem, opts);
  if (guarda.veredito !== 'ok') {
    return {
      estado: {
        ...estado,
        bloqueios: [...estado.bloqueios, { turno: estado.turno, veredito: guarda.veredito, motivo: guarda.motivo }],
        ditados: estado.ditados,
      },
      fala: '',
      concluida: false,
      barrado: guarda,
    };
  }

  // DOIS beats, de propósito — um para cada papel:
  //  - `beatAProvocar` é o que o personagem tem que criar AGORA (o próximo pendente);
  //  - `beatJulgado` é o que a fala do avaliado está respondendo, ou seja, o que
  //    a última fala do interlocutor provocou. Confundir os dois marcava como
  //    cumprido um momento que ninguém tinha criado.
  const beatAProvocar = proximoBeat(ctx.beats, estado.beatsCumpridos) ?? ctx.beats[ctx.beats.length - 1];
  const beatJulgado = ctx.beats.find((b) => b.numero === estado.beatProvocado) ?? beatAProvocar;
  const novoTurno = estado.turno + 1;
  const historico: MsgCena[] = [...estado.historico, { role: 'user', content: mensagem }];

  /**
   * Interlocutor e juiz rodam EM PARALELO, e isso é correto — não é atalho.
   *
   * Os dois olham a MESMA mensagem do avaliado: o interlocutor para responder,
   * o juiz para dizer se o momento se cumpriu. Nenhum lê a saída do outro. O
   * beat marcado agora só muda qual instrução o personagem recebe no turno
   * SEGUINTE, e esse turno ainda não existe.
   *
   * O ganho é medido e grande: em série, guarda + juiz + interlocutor somavam
   * ~19 s por turno (24/08/2026 — juiz sozinho custava 9 s), o que numa cena de
   * 8 turnos vira dois minutos e meio de tela parada com uma pessoa esperando.
   * Em paralelo, o turno passa a custar o mais lento dos dois em vez da soma.
   *
   * ⚠️ O guarda continua ANTES e em série, de propósito: ele existe para o
   * texto não chegar ao personagem, e paralelizá-lo entregaria a mensagem que
   * ele deveria barrar.
   */
  /**
   * O juiz vê uma JANELA, não a última troca.
   *
   * Uma troca só produz falso negativo em dois casos comuns: compromisso
   * construído em 2-3 turnos ("então fica a Roseli" … "e ela entrega sexta"), e
   * referência de volta ("como eu falei, faço amanhã"). Nos dois, o sinal
   * existe e a troca isolada não o contém — e beat não cumprido é cena que não
   * anda, que foi o modo de falha que travou a fase 0 na primeira rodada.
   */
  const janela = estado.historico
    .slice(-JANELA_DO_JUIZ)
    .map((m) => `${m.role === 'user' ? 'AVALIADO' : 'INTERLOCUTOR'}: ${stripMeta(m.content)}`)
    .join('\n\n');

  const [rawInicial, julgamento] = await Promise.all([
    callAIChat(
      buildInterlocutorSystemEstavel(ctx, persona, teto),
      histParaIA(historico, opts.pii),
      opts.aiConfig ?? MODELO_PESADO,
      MAX_TOKENS.turno,
      {
        temperature: 0.85, // personagem, não avaliador: variação é realismo
        reasoningEffort: 'low', // presença, não deliberação — e a cena é ao vivo
        systemSuffix: buildInstrucaoDoBeat(beatAProvocar, novoTurno, teto, ctx.modo),
        ...opcoesLedger(opts, 'cena_turno'),
      },
    ),
    // O beat NÃO é marcado pelo [META] do personagem — ver `julgarBeat`.
    julgarBeat(beatJulgado, janela, mensagem, opts),
  ]);

  /**
   * UMA regeneração quando o personagem entrega o elemento em vez de cobrá-lo.
   *
   * Uma, e não um laço: com teto, a cena tem um custo previsível e não trava
   * numa fala que o leitor insiste em reprovar. O que passar da segunda vez
   * fica REGISTRADO em `estado.ditados` em vez de sumir — fallback silencioso é
   * o que esta base proíbe, e a taxa de ditação medida depois sobre as citações
   * é que decide se a cena vale como medida.
   *
   * Só em cena de medição: no ensaio, mostrar a forma é o produto.
   */
  let raw = rawInicial;
  const ditadosNoTurno: Array<{ turno: number; elemento: string }> = [];
  if ((ctx.modo ?? 'medicao') === 'medicao') {
    const primeiro = await checarDitado(stripMeta(rawInicial), beatAProvocar, opts);
    if (primeiro.dita) {
      const segundo = await callAIChat(
        buildInterlocutorSystemEstavel(ctx, persona, teto),
        histParaIA(historico, opts.pii),
        opts.aiConfig ?? MODELO_PESADO,
        MAX_TOKENS.turno,
        {
          temperature: 0.85,
          reasoningEffort: 'low',
          systemSuffix:
            buildInstrucaoDoBeat(beatAProvocar, novoTurno, teto, ctx.modo) +
            `\n\n⚠️ Sua resposta anterior ENTREGOU o que você devia só cobrar` +
            `${primeiro.elemento ? ` (${primeiro.elemento})` : ''}. ` +
            'Refaça: recuse, cobre a consequência, exija — sem nomear o elemento que falta.',
          ...opcoesLedger(opts, 'cena_turno'),
        },
      );
      const aindaDita = await checarDitado(stripMeta(segundo), beatAProvocar, opts);
      raw = segundo;
      if (aindaDita.dita) ditadosNoTurno.push({ turno: novoTurno, elemento: aindaDita.elemento });
    }
  }

  const fala = desmascarar(stripMeta(raw), opts.pii);
  const meta = lerMeta(raw);

  const cumpriuAgora = julgamento.cumprido;
  const beatsCumpridos = cumpriuAgora && !estado.beatsCumpridos.includes(beatJulgado.numero)
    ? [...estado.beatsCumpridos, beatJulgado.numero]
    : estado.beatsCumpridos;

  const tocadosNoTurno = (Array.isArray(meta?.descritores_tocados) ? meta.descritores_tocados : [])
    .map((d: any) => Number(d))
    .filter((d: number) => Number.isInteger(d) && d >= 1 && d <= ctx.descritores.length);
  const descritoresTocados = [...new Set([...estado.descritoresTocados, ...tocadosNoTurno])].sort((a, b) => a - b);

  const avancou = beatsCumpridos.length > estado.beatsCumpridos.length;
  const turnosSemAvanco = avancou ? 0 : estado.turnosSemAvanco + 1;

  const cedeu = estado.condicaoSatisfeita || meta?.condicao_de_cessao_satisfeita === true;
  const veredicto = podeEncerrar({
    turno: novoTurno,
    tetoTurnos: teto,
    condicaoSatisfeita: cedeu,
    beats: ctx.beats,
    beatsCumpridos,
    modeloPediuEncerrar: meta?.encerrar === true,
    motivoDoModelo: (meta?.motivo_encerramento as MotivoFim) ?? null,
    turnosSemAvanco,
  });

  historico.push({ role: 'assistant', content: desmascarar(raw, opts.pii), turno: novoTurno });

  return {
    estado: {
      historico,
      turno: novoTurno,
      beatsCumpridos,
      descritoresTocados,
      turnosSemAvanco,
      beatProvocado: beatAProvocar.numero,
      condicaoSatisfeita: cedeu,
      concluida: veredicto.encerrar,
      motivoFim: veredicto.motivo,
      encerramentosNegados: veredicto.negadoPorBeatPendente
        ? [...estado.encerramentosNegados, { turno: novoTurno, beat: veredicto.negadoPorBeatPendente }]
        : estado.encerramentosNegados,
      bloqueios: estado.bloqueios,
      ditados: [...estado.ditados, ...ditadosNoTurno],
    },
    fala,
    concluida: veredicto.encerrar,
    barrado: null,
  };
}

export interface ExtracaoCena {
  leitura_geral: string;
  momento_decisivo: string;
  evidencias: EvidenciaDescritor[];
}

/** Transcrição legível — sem [META], sem a fala de abertura marcada como turno. */
export function transcrever(estado: EstadoCena, rotuloAvaliado = 'AVALIADO'): string {
  return estado.historico
    .map((m) => `${m.role === 'user' ? rotuloAvaliado : 'INTERLOCUTOR'}: ${stripMeta(m.content)}`)
    .join('\n\n');
}

/**
 * Extrai o que a cena sustentou, por descritor. Devolve `null` quando a IA não
 * produz JSON — o caller decide, porque aqui não dá para inventar evidência.
 */
export async function extrairEvidenciasCena(
  ctx: ContextoCena,
  estado: EstadoCena,
  opts: OpcoesCena = {},
): Promise<ExtracaoCena | null> {
  const transcricao = mascarar(transcrever(estado), opts.pii);
  const { system, user } = promptExtracao(ctx, transcricao);

  const raw = await callAI(system, user, opts.aiConfig ?? MODELO_PESADO, MAX_TOKENS.extracao, {
    temperature: 0.2, reasoningEffort: 'high', // é aqui que a nota nasce
    ...opcoesLedger(opts, 'cena_extracao'),
  });

  let ext: ExtracaoCena;
  try {
    ext = parseJsonIA<ExtracaoCena>(raw);
  } catch {
    return null;
  }
  if (!ext || !Array.isArray(ext.evidencias)) return null;

  ext.leitura_geral = desmascarar(String(ext.leitura_geral ?? ''), opts.pii);
  ext.momento_decisivo = desmascarar(String(ext.momento_decisivo ?? ''), opts.pii);
  /**
   * `descritor` é o nome canônico; `indice` fica como fallback de compatibilidade
   * e NUNCA como preferência. O campo foi renomeado em 25/08/2026 porque com o
   * nome "indice" o modelo passou a numerar as ENTRADAS (1…18 em 6 descritores),
   * e a consolidação lia as seis primeiras como D1–D6.
   */
  ext.evidencias = ext.evidencias.map((e: any) => ({
    ...e,
    indice: Number(e.descritor ?? e.indice),
    turno: e.turno == null ? null : Number(e.turno),
    citacao: desmascarar(String(e.citacao ?? ''), opts.pii),
    beat: e.beat == null ? null : Number(e.beat),
    provocado: e.provocado === true || e.provocado === 'true',
  }));
  return ext;
}

export interface TriagemAdequacao {
  por_descritor: Array<{ indice: number; sondavel: boolean; que_pergunta_revelaria: string }>;
  /**
   * A decisão é da COMPETÊNCIA INTEIRA, e é por isso que não há "parcial".
   *
   * 🔴 O roteamento é por competência: ou ela vai para a cena, ou vai para o
   * cenário escrito. Não existe metade — se UM descritor não puder ser cobrado
   * numa conversa de feedback, a competência inteira vai para o escrito.
   *
   * A versão anterior tinha `parcial` e uma lista de descritores "que ficam de
   * fora", o que implicava cena medindo 4 de 6. Isso confundia duas coisas: o
   * que a cena alcança (propriedade do desenho) e o que se decide medir nela
   * (roteamento). Com roteamento por competência, cobertura 6/6 por cena volta
   * a ser a exigência certa.
   */
  destino: 'cena' | 'cenario_escrito';
  justificativa: string;
  /** Quais descritores empurraram a competência para o escrito. */
  descritores_que_impedem?: number[];
}

/**
 * A competência cabe numa cena? Ver a nota longa em `promptTriagemAdequacao`:
 * competência intrapessoal (autocuidado, regulação emocional) não tem com quem
 * encenar, e forçar produziria nota baixa por artefato do instrumento.
 *
 * Não é gate — é relatório. Quem escolhe a competência do piloto é humano.
 */
export async function triarAdequacao(
  cargo: string,
  competencia: string,
  descritores: DescritorDaRegua[],
  opts: OpcoesCena = {},
): Promise<TriagemAdequacao | null> {
  const { system, user } = promptTriagemAdequacao(cargo, competencia, descritores);
  const raw = await callAI(system, user, opts.aiConfig ?? MODELO_PESADO, MAX_TOKENS.triagem, {
    temperature: 0.1, reasoningEffort: 'high',
    ...opcoesLedger(opts, 'cena_triagem'),
  });
  try {
    return parseJsonIA<TriagemAdequacao>(raw);
  } catch {
    return null;
  }
}
