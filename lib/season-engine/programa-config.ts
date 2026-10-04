/**
 * ProgramaConfig — parâmetros que diferenciam um "modo" do programa (regular x onboarding).
 *
 * Lido de `empresas.sys_config` (JSONB livre, sem CHECK no DB). Desde 03/10/2026
 * o padrão de quem não tem `programa_modo` é a Jornada de 7 semanas
 * (`PROGRAMA_MODO_PADRAO`); antes era o Regular DUO de 14.
 */

import { TUTORIAIS_PLATAFORMA } from '@/lib/tutorial-videos';
import { parseConfigSnapshot, parseProgramaCustom, derivarConfigCustom } from './programa-custom';

export type ProgramaModo = 'regular' | 'onboarding' | 'piloto';
export type ComplexidadeMissao = 'simples' | 'intermediario' | 'completo';
export type FaseCarreira = 'junior' | 'pleno' | 'senior';

/**
 * Tutorial da semana de missão (vídeo no Bunny) — serve às semanas 4, 8 e 12:
 * mesma tela, mesma mecânica, então a narração não cita número de semana.
 * Usado no week page (FirstViewVideo) e no envio de segunda do triggerDiario.
 */
export const APLICACAO_VIDEO_ID = TUTORIAIS_PLATAFORMA.aplicacao.guid;

/**
 * Tutorial da JORNADA semanal — abre na 1ª visita à lista de semanas
 * (`/dashboard/temporada`) e explica a mecânica da trilha inteira.
 *
 * Vive aqui, e não como `const` local da página, porque passou a ter DOIS
 * consumidores (ver `CONCLUSAO_VIDEO_ID`). Duas cópias de um GUID divergem em
 * silêncio: trocar o vídeo num lugar deixaria o outro servindo o antigo, sem
 * erro nenhum na tela.
 */
/*
 * ⚠️ GUID TROCADO 2× EM 25/08/2026.
 *   4d17fac6 (original) → bf1b38c0 → 1279ee99 → 64c4f43d (esta)
 *
 * A 1ª refação corrigiu a MENTIRA: o passo "Marcar como realizado" narrava
 * *"é esse passo que destrava o resto da semana"*, e o botão tinha saído do
 * caminho. Virou "O que destrava a semana", sobre a barra "Sua semana".
 *
 * A 2ª fechou o que o dono apontou ao ASSISTIR: o tutorial falava das
 * Evidências e nunca mostrava o que acontece ao clicar. Entraram três beats —
 * a conversa abrindo, o contador de respostas e a semana concluída. 11 beats,
 * 2min17.
 *
 * A 3ª (esta) corrigiu quatro defeitos que só aparecem VENDO o vídeo:
 *   · o modal do próprio tutorial abria por cima da lista de semanas, e o beat
 *     "sua trilha" saía com a moldura VAZIA;
 *   · o destaque de "Evidências" pegava o item da BARRA, então o botão que a
 *     pessoa precisa apertar nunca era realçado em momento nenhum;
 *   · o card da conversa aterrissava atrás da legenda (agora centralizado);
 *   · o frame da conversa mostrava "pensando…" — esperava relógio, não estado.
 *
 * Os antigos NÃO são apagados junto: saem depois que este estiver provado no
 * ar — a mesma ordem que o `semana_pendente_v2` seguiu em relação ao v1 na
 * Meta. Apagar primeiro deixa sem os dois se algo falhar.
 */
export const JORNADA_VIDEO_ID = TUTORIAIS_PLATAFORMA.jornada.guid;

/**
 * Tutorial do que CONCLUI uma semana — mostrado na tela de semana trancada.
 *
 * 🔴 POR QUE ELE EXISTE (medido 23/08/2026): a régua sequencial é deliberada, mas
 * o que conclui uma semana é a CONVERSA de evidências, e isso não se adivinha —
 * abrir o conteúdo parece suficiente. Na segunda 24/08, 32 das 36 pessoas de
 * Ibipeba e 34 das 38 de Macaé chegam a esta tela; 25 delas sem ter começado a
 * conversa da semana pendente. O texto já está na tela desde 20/08; o vídeo é a
 * mesma explicação para quem não lê.
 *
 * ✅ REUSA O VÍDEO DA JORNADA em vez de pedir um novo: os passos `estado` e
 * `evidencias` do `video-spike/tutorial/storyboard.ts` narram exatamente esta
 * régua — *"a semana só é concluída na conversa de evidências"* e *"é isso que
 * comprova a sua evolução e libera a próxima semana"*. Produzir um quinto tutorial diria a mesma frase com outra
 * voz, e os tutoriais são gravação MANUAL (não saem do pipeline de IA): o custo
 * seria real e a informação, duplicada — com duas narrações a divergir na
 * próxima vez que a régua mudar.
 *
 * ⚠️ A tela usa `sectionKey='jornada'` (a mesma da lista de semanas), de
 * propósito: sendo o MESMO vídeo, quem já o assistiu não deve vê-lo abrir
 * sozinho de novo — ganha só o botão. Se um dia existir um tutorial específico,
 * trocar este GUID e a `sectionKey` no mesmo commit.
 */
export const CONCLUSAO_VIDEO_ID: string | null = JORNADA_VIDEO_ID;

export interface ProgramaConfig {
  modo: ProgramaModo;
  /** Duração total da trilha em semanas. Regular=14, Jornada=7, Onboarding=12. */
  semanas: number;
  /** Semanas em que ocorre missão prática (aplicação). Regular=[4,8,12]; Jornada e Onboarding não têm. */
  semanasMissao: number[];
  /** Semanas reservadas para avaliação final. Regular=[13,14], Jornada=[7], Onboarding=[12]. */
  semanasAvaliacao: number[];
  /**
   * Semanas de MAPEAMENTO: o Mapeamento das competências, que a pessoa fez ANTES
   * da trilha existir (a geração recusa quem não o fez). A semana nasce
   * CONCLUÍDA, com a data em que o mapeamento acabou: conta no "x de N", libera
   * o gate da semana seguinte, não tem conteúdo, não tem Evidências e não
   * dispara cadência. Só o Onboarding tem (`[1]`, desde 04/10/2026); nos demais
   * modos o campo não existe.
   *
   * É um TIPO declarado (`tipo: 'mapeamento'` no plano), e não um buraco: o
   * defeito do R-20 era uma semana de conteúdo SEM conteúdo, que nunca
   * concluía e trancava as seguintes. Aqui a semana tem caminho de conclusão
   * real (o mapeamento que já aconteceu).
   *
   * ⚠️ O calendário também sabe delas: a trilha nasce com `data_inicio` uma
   * semana ANTES do início do conteúdo para cada semana de mapeamento
   * (`persistirTrilha`), de modo que a invariante "a semana N abre em
   * `data_inicio` + (N-1)*7 dias" continua valendo para TODAS as peças (gate,
   * cadência, painéis) sem que nenhuma precise saber do deslocamento.
   */
  semanasMapeamento?: number[];
  /**
   * Semanas em que o GESTOR faz o checkpoint do liderado.
   *
   * Estava literal como `[5, 10]` em tres lugares do painel do gestor — numeros
   * do programa de 14 semanas. Numa jornada de 7, a semana 10 nao existe: o
   * card "Acao esta semana" prometia checkpoints que nunca chegariam, e a copy
   * dizia "quando chegarem nas semanas 5 e 10" para quem so tem 7.
   *
   * Proporcao mantida (~1/3 e ~2/3 do percurso), para o gestor avaliar duas
   * vezes em qualquer programa.
   */
  semanasCheckpoint: number[];
  /** Semana do wizard Cenário B / avaliação final. Regular=14, Jornada=7, Onboarding=12. */
  semanaCenarioB: number;
  /**
   * Semana em que a Avaliação Acumulada é lida. Regular=13, Jornada=6. No
   * Onboarding é a 11, a última de conteúdo: a leitura parcial das 5 competências
   * roda ao concluí-la (como o piloto faz na sua última semana de conteúdo).
   */
  semanaAcumulada: number;
  /**
   * Turnos de IA da conversa qualitativa. Ausente = 12
   * (`TURNOS_IA_AVALIACAO_QUALITATIVA`), o valor calibrado para fechar 14
   * semanas.
   *
   * Existe porque o custo dela não escala com o tamanho do programa: são os
   * mesmos ~12 descritores para cobrir, mas num encerramento curto 12 turnos
   * viram pedágio na frente do Cenário B — que é o instrumento que mede. E o
   * que a etapa entrega de mais valioso, a Avaliação Acumulada, **não depende
   * do tamanho da conversa**: ela agrega as evidências das semanas de conteúdo
   * e dispara pelo simples fato de a semana ser concluída.
   */
  turnosQualitativa?: number;
  /** Slots de conteúdo (semanas que NÃO são missão, avaliação nem mapeamento). Regular=9 slots, Onboarding=10. */
  slotsConteudo: number[];
  /**
   * Quantos descritores cada semana de missão cobre.
   * -1 = todos os descritores selecionados.
   * Regular: { 4: 3, 8: 6, 12: -1 } (cumulativo).
   */
  blocosCobertos: Record<number, number>;
  /** Complexidade do cenário/missão por semana de aplicação. */
  complexidadeMap: Record<number, ComplexidadeMissao>;
  /** Nível-meta na régua de maturidade. Regular=3 (meta proficiente), Onboarding=2 (em desenvolvimento). */
  nivelMetaAlvo: 2 | 3;
  /** Quantas competências cabem em uma trilha. Regular=1 (aprofundada), Onboarding=5 (2 semanas por competência, em sequência). */
  numCompetencias: number;
  /** Default usado pela IA1 quando nenhum override por cargo é dado. */
  faseCarreiraDefault?: FaseCarreira;
  /**
   * Multi-competência (Onboarding): mapeia semana de conteúdo → índice no
   * array de competências da trilha (2 semanas por competência). Quando
   * undefined, engine usa modo single-competência (regular).
   */
  semanaParaCompetenciaIdx?: Record<number, number>;
  /**
   * Missões integradoras multi-competência: para cada semana de missão, lista
   * os índices das competências já trabalhadas até ali (acumulativo). -1 (em
   * qualquer posição) = todas. Só o Regular DUO usa; o Onboarding deixou de ter
   * missão em 04/10/2026.
   */
  competenciasNaMissao?: Record<number, number[]>;
  /**
   * Piloto: quantos conteúdos (entregas) cada semana de conteúdo recebe.
   * Piloto=2 (1 descritor distinto por entrega, MESMA competência).
   * undefined = 1 entrega (regular/single) ou derivado por competência (DUO).
   */
  conteudosPorSemana?: number;
  /**
   * Piloto: mapeia semana → semana cujo CALENDÁRIO ela herda. Ex.: {3: 2}
   * faz o slot de fechamento (sem 3) liberar junto com a sem 2 (dia 7) —
   * o gate real vira a PROGRESSÃO ("anterior concluída"), não o calendário.
   * undefined (todos os outros modos) = calendário vanilla, zero mudança.
   */
  semanaEspelhoCalendario?: Record<number, number>;
  /**
   * A semana entrega N pílulas mas UMA tarefa POR COMPETÊNCIA. O overlay do kit
   * mantém o desafio de uma entrega por competência (a primeira que tiver kit
   * publicado) e limpa o das outras entregas da mesma competência.
   * undefined/false = um desafio por entrega.
   *
   * Chamava-se `desafioUnicoPorSemana` até 27/08/2026, quando a régua passou a
   * ser por competência — renomeada porque nome que descreve o mecanismo
   * antigo é como um flag passa a mentir. Nenhuma trilha tinha
   * `programa_config` carimbado (0 de 75), então não há snapshot com a chave
   * velha para migrar.
   */
  desafioUnicoPorCompetencia?: boolean;
  /**
   * Arguição conversacional no fechamento (a "defesa oral" da resposta ao
   * Cenário B). Depois das 4 perguntas fixas, a IA sonda a resposta por até
   * `maxTurnos` turnos — expõe profundidade ou fragilidade que o escrito não
   * captura. `ativa:false` (ou undefined) = fechamento SEM arguição, byte-igual
   * ao atual. Fusão da nota (Fase B) e UI (Fase C) vêm depois; aqui só o motor.
   */
  arguicao?: { ativa: boolean; maxTurnos: number };
  /**
   * Personalizado com 2 competências EM SEQUÊNCIA (03/10/2026): a ordem das
   * competências, decidida e validada na geração da PRIMEIRA trilha, e a
   * posição (1 ou 2) DESTA trilha nela. Cada competência é uma trilha própria,
   * como na Jornada; vive no snapshot (`trilhas.programa_config`) para o
   * encadeamento abrir a segunda pela regra congelada na primeira, e não pelo
   * que a tela disser no dia. undefined = programa de uma competência só.
   */
  sequenciaPersonalizado?: SequenciaPersonalizado;
}

/** Ver `ProgramaConfig.sequenciaPersonalizado`. `posicao` começa em 1. */
export interface SequenciaPersonalizado {
  competencias: string[];
  posicao: number;
}

/**
 * Default: programa regular de 14 semanas, uma competência aprofundada,
 * missões 4/8/12, avaliação 13/14, nível-meta 3. ESTE é o comportamento
 * preservado byte-exact após a Fase 1.
 */
export const PROGRAMA_REGULAR: ProgramaConfig = Object.freeze({
  modo: 'regular',
  semanas: 14,
  semanasMissao: [4, 8, 12],
  semanasAvaliacao: [13, 14],
  semanasCheckpoint: [5, 10],
  semanaCenarioB: 14,
  semanaAcumulada: 13,
  slotsConteudo: [1, 2, 3, 5, 6, 7, 9, 10, 11],
  blocosCobertos: { 4: 3, 8: 6, 12: -1 },
  complexidadeMap: { 4: 'simples', 8: 'intermediario', 12: 'completo' },
  nivelMetaAlvo: 3,
  numCompetencias: 1,
  // Fase D+ (03/07): arguição LIGADA no regular (single) — validada no piloto.
  arguicao: { ativa: true, maxTurnos: 8 },
}) as ProgramaConfig;

/**
 * Onboarding: trilha de 12 semanas, 5 competências em sequência. Decisão do dono
 * (04/10/2026): 10 semanas de conteúdo, 12 no total; a semana 1 é o Mapeamento e
 * a 12 é o Encerramento.
 *
 *   1       Mapeamento (tipo próprio): nasce CONCLUÍDO, com a data em que a
 *             pessoa terminou o mapeamento das competências
 *   2 e 3   Competência 1 (2 conteúdos por semana)
 *   4 e 5   Competência 2
 *   6 e 7   Competência 3
 *   8 e 9   Competência 4
 *   10 e 11 Competência 5
 *   12      Encerramento: Cenário B + arguição + Evolution Report + certificado
 *
 * No modelo da Jornada: 2 conteúdos por semana (descritores distintos da MESMA
 * competência), UM desafio por semana (`desafioUnicoPorCompetencia`) e nenhuma
 * semana dedicada de missão (`semanasMissao: []`). A ordem das competências é a
 * do Top 5 do cargo. Nível-meta 2 (funcional / autonomia supervisionada): o
 * scorer segue na régua absoluta, decisão do dono.
 *
 * ⚠️ A SEMANA 1 NÃO É A "CALIBRAGEM" QUE O R-20 REMOVEU. Aquela era uma semana
 * de CONTEÚDO sem conteúdo: sem botão de Evidências ela nunca concluía e o gate
 * sequencial trancava as demais para sempre. Esta é um tipo declarado
 * (`semanasMapeamento`) com caminho de conclusão real: a geração recusa quem
 * não tem o Perfil e o Mapeamento das 5 competências, então a semana já nasce
 * concluída. Não tem conteúdo, não tem botão de Evidências, não dispara
 * cadência; o cartão dela diz que o Mapeamento está concluído e leva ao que a
 * pessoa já tem dele.
 *
 * CALENDÁRIO: a semana 2 abre na data de início da trilha (a pessoa acabou de
 * mapear; não fica uma semana inteira parada), e as seguintes a cada 7 dias.
 * Para isso a trilha grava `data_inicio` uma semana ANTES (`persistirTrilha`):
 * a invariante "a semana N abre em `data_inicio` + (N-1)*7 dias" segue valendo
 * para o gate, a cadência, o painel do gestor e a "semana atual", sem que
 * nenhum deles precise conhecer o deslocamento.
 *
 * Acumulada na semana 11 (a última de conteúdo): a leitura parcial das 5
 * competências roda ao concluí-la, como a do piloto na sua última semana de
 * conteúdo. O Cenário B INTEGRADOR da semana 12 (a escolha do cenário e o
 * gerador) é do lote `d-cenb`: aqui só a config.
 *
 * `semanasCheckpoint` fica VAZIO: eram `[3, 6]`, as semanas das missões
 * integradoras, que deixaram de existir. A Jornada não tem checkpoint do gestor
 * (dono, 04/09/2026) e ninguém definiu um para este formato; preencher por
 * analogia com o outro modelo seria inventar regra de produto.
 *
 * Nenhuma trilha, empresa, turma ou colaborador usa este modo em produção
 * (medido 04/10/2026): não há plano de 9 semanas para migrar.
 */
export const PROGRAMA_ONBOARDING: ProgramaConfig = Object.freeze({
  modo: 'onboarding',
  semanas: 12,
  semanasMissao: [],
  semanasAvaliacao: [12],
  semanasMapeamento: [1],
  semanasCheckpoint: [],
  semanaCenarioB: 12,
  semanaAcumulada: 11, // a última semana de conteúdo
  slotsConteudo: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 5 competências x 2 semanas
  blocosCobertos: {},
  complexidadeMap: {},
  nivelMetaAlvo: 2,
  numCompetencias: 5,
  conteudosPorSemana: 2,
  desafioUnicoPorCompetencia: true,
  // Sem 2 e 3 = Comp[0], 4 e 5 = Comp[1], 6 e 7 = Comp[2], 8 e 9 = Comp[3], 10 e 11 = Comp[4]
  semanaParaCompetenciaIdx: { 2: 0, 3: 0, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 4, 11: 4 },
  // Arguição LIGADA (maxTurnos 6, janela mais curta pra recém-formados).
  arguicao: { ativa: true, maxTurnos: 6 },
}) as ProgramaConfig;

/**
 * Regular DUO: mesma profundidade do Regular (14 semanas, nível-meta 3),
 * com 2 competências em paralelo nas semanas de conteúdo.
 *
 * Modelo "entrega dupla": cada semana de conteúdo recebe duas entregas
 * (segunda e terça), uma por competência. As missões 4/8/12 são
 * INTEGRADORAS das duas (complexidade crescente: simples → intermediário
 * → completo).
 *
 * Estrutura idêntica ao Regular (slots/missões/avaliação) — só a alocação
 * de descritores e as missões viram multi-competência. Isso mantém intactos
 * week-gating, progresso, dashboard week-view e Cenário B (sem 14).
 *
 * Foi o default GLOBAL até 03/10/2026; hoje empresa sem `programa_modo` nasce
 * na Jornada (`PROGRAMA_MODO_PADRAO`) e este formato saiu da tela de escolha
 * (`MODOS_DESCONTINUADOS`). Continua no motor para as trilhas carimbadas
 * `regular_duo` e para a trilha legada SEM carimbo (`getProgramaConfigLegado`).
 */
export const PROGRAMA_REGULAR_DUO: ProgramaConfig = Object.freeze({
  modo: 'regular',
  semanas: 14,
  semanasMissao: [4, 8, 12],
  semanasAvaliacao: [13, 14],
  semanasCheckpoint: [5, 10],
  semanaCenarioB: 14,
  semanaAcumulada: 13,
  slotsConteudo: [1, 2, 3, 5, 6, 7, 9, 10, 11],
  blocosCobertos: { 4: 3, 8: 6, 12: -1 },
  complexidadeMap: { 4: 'simples', 8: 'intermediario', 12: 'completo' },
  nivelMetaAlvo: 3,
  numCompetencias: 2,
  // 2 comps ativas desde o início. (-1 = todas as comps da trilha; complexidade
  // cresce via complexidadeMap.) ⚠️ 28/07 (decisão de produto): a missão cobre o
  // BLOCO QUE ACABOU DE FECHAR — descritores desde a missão anterior (corte por
  // `semanas_ids` em descritoresEntreguesNaMissao): semana 4 → semanas 1-3,
  // semana 8 → semanas 5-7. Só a ÚLTIMA (semana 12) é cumulativa (as 9 semanas).
  // Antes a semana 4 já cobrava o bloco que só começava na semana 5.
  competenciasNaMissao: { 4: [-1], 8: [-1], 12: [-1] },
  // SEM semanaParaCompetenciaIdx: a competência de cada semana de conteúdo
  // vem do descritor (selectDescriptorsDuo grava .competencia). O mapa
  // semana→comp é exclusivo do onboarding (2 semanas por competência, em sequência).
  // Fase D+ (03/07): arguição LIGADA no Regular DUO (default global) — validada
  // no piloto. Onboarding segue OFF (modo à parte; ligar sob demanda).
  arguicao: { ativa: true, maxTurnos: 8 },
  /**
   * 🔴 LIGADO em 27/08/2026 (decisão do Rodrigo). As semanas do DUO entregam 2
   * pílulas, e **232 das 324** semanas de conteúdo de ibipeba trazem os dois
   * descritores da MESMA competência — duas tarefas para o mesmo tema, cobradas
   * na mesma conversa de 6 turnos. Medido nas 65 conversas concluídas de lá:
   * **39 terminaram com a IA abrindo o segundo desafio no turno 6** e sendo
   * cortada pelo contador; só 13 chegaram ao bloco de fechamento.
   *
   * A unificação é por COMPETÊNCIA e não por semana (ver `manterUmDesafio`):
   * as outras 92 semanas do DUO trazem 2 competências distintas e continuam com
   * uma tarefa cada, porque as duas contam na régua de nível.
   */
  desafioUnicoPorCompetencia: true,
}) as ProgramaConfig;

/**
 * Piloto: degustação de 2 semanas, 1 competência, 4 conteúdos (2/semana,
 * cada um sobre 1 descritor DISTINTO — top-4 por gap). Objetivo é rodar o
 * FLUXO inteiro (diagnóstico completo → conteúdo → fechamento com cenário
 * + avaliação IA), NÃO demonstrar evolução na competência.
 *
 * Estrutura do plano (3 entradas, "2 semanas" de calendário):
 *   1, 2 — conteúdo, 2 entregas cada (conteudosPorSemana=2), resolvidas
 *          pela via EXISTENTE (formato-core por preferência×taxa + opcionais)
 *   3    — fechamento (Cenário B + scorer). CALENDÁRIO espelhado na sem 2
 *          (semanaEspelhoCalendario {3:2}): libera assim que os 2 conteúdos
 *          da sem 2 concluem (gate de progressão), sem esperar dia 14.
 *
 * Acumulada (single-comp) roda em background ao concluir a sem 2 e persiste
 * na row da sem 2 (semanaAcumulada=2) — NÃO há semana de conversa qualitativa.
 * Sem missões. O fechamento do piloto carimba spec_version 'piloto-v1' e
 * aplica a trava de piso (nota_pos_exibido ≥ baseline) SÓ nesse caminho.
 *
 * ⛔ Não é mais oferecido (03/10/2026, "não temos mais degustação de jornada"):
 * saiu da tela de escolha e o servidor recusa gravação nova dele. Segue no
 * motor para as trilhas já carimbadas `piloto` e para quem já está gravado
 * assim (override de colaborador, `sys_config` de empresa).
 */
export const PROGRAMA_PILOTO: ProgramaConfig = Object.freeze({
  modo: 'piloto',
  semanas: 3,
  semanasMissao: [],
  semanasAvaliacao: [3],
  semanasCheckpoint: [2],
  semanaCenarioB: 3,
  semanaAcumulada: 2, // persistência do acumulado; NÃO é semana de conversa
  slotsConteudo: [1, 2],
  blocosCobertos: {},
  complexidadeMap: {},
  nivelMetaAlvo: 3,
  numCompetencias: 1,
  conteudosPorSemana: 2,
  semanaEspelhoCalendario: { 3: 2 },
  // Fase D (03/07): arguição LIGADA no piloto — testbed de degustação (2 sem).
  // Regular/DUO/onboarding seguem OFF até validar aqui. 4 turnos (janela curta).
  arguicao: { ativa: true, maxTurnos: 4 },
  /**
   * 🔴 LIGADO em 27/08/2026, fechando o último modo que ainda cobrava duas
   * tarefas numa conversa de 6 turnos. As 2 entregas da semana do piloto são da
   * MESMA competência por construção (`numCompetencias: 1`, top-4 descritores
   * por gap), então aqui a unificação por competência sempre resulta em uma
   * tarefa — o mesmo desenho da jornada.
   *
   * Numa degustação isso pesa mais do que no programa cheio: são 2 semanas para
   * a pessoa formar opinião sobre o produto, e a conversa cortada no meio era
   * metade do que ela via.
   */
  desafioUnicoPorCompetencia: true,
}) as ProgramaConfig;

/**
 * Jornada (05/08/2026) — o formato novo do programa: **7 semanas**, sendo 6 de
 * conteúdo e a última de avaliação. UMA competência por jornada, 2 conteúdos
 * por semana (as duas pílulas) e **um desafio por semana**, que cobre as duas
 * — no lugar das semanas dedicadas de missão (4/8/12), que deixam de existir.
 *
 * O DUO passa a ser DUAS jornadas em sequência: terminou a primeira (com
 * fechamento próprio), a segunda começa na competência seguinte. Por isso a
 * config descreve UMA jornada e não 14 semanas: cada uma é uma trilha completa,
 * com seu Cenário B, sua arguição e seu Evolution Report.
 *
 * `modo: 'regular'` de propósito. `modo: 'piloto'` liga comportamentos que são
 * só da degustação (trava de piso na nota, spec_version 'piloto-v1', evidência
 * por cobertos) — a jornada é programa cheio, não amostra.
 *
 * ⚠️ Só vale para trilha NOVA. As em andamento servem o `temporada_plano` já
 * gravado, com a estrutura de 14 semanas — mudar a config não as regenera, e é
 * exatamente isso que se quer.
 */
export const PROGRAMA_JORNADA: ProgramaConfig = Object.freeze({
  modo: 'regular',
  semanas: 7,
  // Sem semana dedicada de aplicação: a tarefa da semana é o desafio, que
  // agora vem uma vez por semana cobrindo as duas pílulas.
  semanasMissao: [],
  semanasAvaliacao: [7],
  // SEM checkpoint, e isso é do desenho do programa (dono, 04/09/2026): a
  // jornada de 7 semanas não tem a parada de avaliação do gestor que o modelo
  // de 14 tem nas semanas 5 e 10. O `[3, 5]` que estava aqui foi analogia
  // minha, não régua do produto — e fazia o card do gestor convocar para um
  // ritual inexistente. O que o gestor acompanha toda semana é QUEM PAROU, que
  // não depende de calendário de programa.
  semanasCheckpoint: [],
  semanaCenarioB: 7,
  // Como no piloto: sem semana de conversa qualitativa separada, a acumulada
  // roda ao fechar a última semana de conteúdo e persiste na row dela.
  semanaAcumulada: 6,
  slotsConteudo: [1, 2, 3, 4, 5, 6],
  blocosCobertos: {},
  complexidadeMap: {},
  nivelMetaAlvo: 3,
  numCompetencias: 1,
  conteudosPorSemana: 2,
  desafioUnicoPorCompetencia: true,
  arguicao: { ativa: true, maxTurnos: 6 },
}) as ProgramaConfig;

/**
 * Rótulos persistíveis de modo (colaboradores.programa_modo e
 * trilhas.programa_modo, migrations 154/182). Distintos de ProgramaModo:
 * 'regular' ambíguo vira 'regular_duo' | 'regular_single'. 'custom' = o
 * Personalizado: a config NÃO vem de constante; geração deriva de
 * `sys_config.programa_custom` e o runtime lê o snapshot
 * `trilhas.programa_config` (ver lib/season-engine/programa-custom.ts).
 */
export type ProgramaModoLabel = 'jornada' | 'regular_duo' | 'regular_single' | 'onboarding' | 'piloto' | 'custom';

/**
 * O formato de quem não tem `programa_modo`: a Jornada de 7 semanas (decisão do
 * dono, 03/10/2026). Até essa data era o Regular DUO de 14, que já não era o
 * formato do produto (`Medido: 12/09/2026`, 112 de 152 trilhas eram jornada).
 * As 15 empresas do banco tinham `programa_modo` gravado em 03/10, então a
 * troca só alcança empresa NOVA.
 */
export const PROGRAMA_MODO_PADRAO = 'jornada' as const satisfies ProgramaModoLabel;

/**
 * Os formatos que a tela OFERECE e que o servidor aceita em gravação NOVA
 * (03/10/2026): Jornada, Onboarding e Personalizado.
 */
export const MODOS_OFERECIDOS = ['jornada', 'onboarding', 'custom'] as const satisfies readonly ProgramaModoLabel[];

/**
 * Os formatos que SAÍRAM da escolha (03/10/2026) mas que o motor segue lendo:
 * há trilhas carimbadas com eles (`regular_duo` em Ibipeba, `regular_single` na
 * demo, `piloto` na acme) e registros gravados (override de colaborador,
 * `sys_config` de empresa). Tirar o rótulo do tipo quebraria a leitura deles;
 * sai só da escolha. `'regular'` é a grafia antiga do `regular_duo`.
 */
export const MODOS_DESCONTINUADOS = ['regular_duo', 'regular_single', 'piloto', 'regular'] as const;

export type ModoDescontinuado = (typeof MODOS_DESCONTINUADOS)[number];

/** O valor gravado é um formato que saiu da tela de escolha? */
export function ehModoDescontinuado(modo: unknown): modo is ModoDescontinuado {
  return (MODOS_DESCONTINUADOS as readonly unknown[]).includes(modo);
}

/**
 * FONTE ÚNICA da leitura de um rótulo bruto (`sys_config`, override, turma)
 * para a GERAÇÃO. Ausente ou desconhecido → `PROGRAMA_MODO_PADRAO`.
 * `'regular'` (grafia antiga) → `'regular_duo'`.
 */
export function normalizarModoPrograma(bruto: unknown): ProgramaModoLabel {
  if (bruto === 'jornada' || bruto === 'onboarding' || bruto === 'regular_single' || bruto === 'piloto' || bruto === 'custom') return bruto;
  if (bruto === 'regular_duo' || bruto === 'regular') return 'regular_duo';
  return PROGRAMA_MODO_PADRAO;
}

/**
 * Mapeia um rótulo de modo → template. Ausente/desconhecido → a Jornada
 * (`PROGRAMA_MODO_PADRAO`). `'regular'` é a grafia antiga do DUO.
 * ⚠️ 'custom' NÃO tem constante: geração e runtime tratam o label ANTES de
 * chamar esta função (trilha-core / resolverConfigDaTrilha /
 * getProgramaConfigDaTrilha). Se chegar aqui sem snapshot, cai na Jornada, que
 * é o formato do qual o Personalizado é a versão de duração ajustável.
 */
export function getProgramaConfigByModo(modo?: string | null): ProgramaConfig {
  if (modo === 'jornada') return PROGRAMA_JORNADA;
  if (modo === 'onboarding') return PROGRAMA_ONBOARDING;
  if (modo === 'regular_single') return PROGRAMA_REGULAR;
  if (modo === 'piloto') return PROGRAMA_PILOTO;
  if (modo === 'regular_duo' || modo === 'regular') return PROGRAMA_REGULAR_DUO;
  return PROGRAMA_JORNADA;
}

/**
 * Resolve a config do PROGRAMA DA EMPRESA a partir do `sys_config` (o que uma
 * geração nova produziria). Consumidores: o blueprint (duração e semanas de
 * avaliação do PDI) e o fallback das trilhas antigas.
 *
 *   - 'jornada'         → PROGRAMA_JORNADA (7 sem: 6 conteúdo + avaliação)
 *   - 'onboarding'      → PROGRAMA_ONBOARDING (12 sem: mapeamento, 5 comps x 2 sem, encerramento)
 *   - 'custom'          → derivada de `sys_config.programa_custom` (a config de
 *                         UMA competência; `derivarConfigCustom`)
 *   - 'regular_duo' / 'regular' / 'regular_single' / 'piloto' → as constantes
 *                         descontinuadas (seguem lidas)
 *   - ausente / outro   → PROGRAMA_JORNADA (padrão desde 03/10/2026)
 */
export function getProgramaConfig(sysConfig?: { programa_modo?: string; programa_custom?: unknown } | null): ProgramaConfig {
  if (sysConfig?.programa_modo === 'custom') {
    const inputs = parseProgramaCustom(sysConfig.programa_custom);
    if (inputs) return derivarConfigCustom(inputs);
  }
  return getProgramaConfigByModo(sysConfig?.programa_modo);
}

/**
 * Config de trilha LEGADA, sem carimbo (anterior à mig 154). Ela nasceu quando
 * o padrão era o DUO de 14 semanas, e é isso que o plano dela tem (`Medido:
 * 03/10/2026`, as 11 trilhas sem carimbo têm 14 entradas). Por isso o padrão
 * NOVO (Jornada) não vale aqui: sem `programa_modo` reconhecido na empresa, ela
 * segue no DUO, byte-igual a antes de 03/10. Mudar isto reinterpretaria trilha
 * em andamento.
 */
export function getProgramaConfigLegado(sysConfig?: { programa_modo?: string } | null): ProgramaConfig {
  const modo = sysConfig?.programa_modo;
  if (modo === 'jornada' || modo === 'onboarding' || modo === 'regular_single' || modo === 'piloto') {
    return getProgramaConfigByModo(modo);
  }
  return PROGRAMA_REGULAR_DUO;
}

/**
 * FONTE ÚNICA da precedência de GERAÇÃO: override do colaborador →
 * default da empresa → `PROGRAMA_MODO_PADRAO`. Retorna o RÓTULO resolvido (o
 * que a geração carimba em trilhas.programa_modo). Nunca resolva o modo de
 * outro jeito, senão o carimbo e o plano podem divergir.
 */
export function resolverModoColab(
  colab?: { programa_modo?: string | null } | null,
  sysConfig?: { programa_modo?: string } | null,
): ProgramaModoLabel {
  return normalizarModoPrograma(colab?.programa_modo || sysConfig?.programa_modo);
}

/**
 * A config que uma GERAÇÃO NOVA aplicaria, a partir da config EFETIVA da pessoa
 * (empresa → turma → participação, com o override do colaborador no lugar dele:
 * `resolverConfigEfetiva`). É a leitura de quem precisa DIZER o programa antes de
 * haver trilha (o PDI, a prontidão): ausente ou desconhecido vira a Jornada, e o
 * Personalizado deriva de `programa_custom`, como `getProgramaConfig`.
 *
 * Não substitui a leitura de uma trilha que existe: ela serve o carimbo
 * (`getProgramaConfigDaTrilha`), que congela as regras.
 */
export function getProgramaConfigDaGeracao(
  configEfetiva?: { programa_modo?: unknown; programa_custom?: unknown } | null,
): ProgramaConfig {
  return getProgramaConfig({
    programa_modo: normalizarModoPrograma(configEfetiva?.programa_modo),
    programa_custom: configEfetiva?.programa_custom,
  });
}

/**
 * Snapshot gravado antes de um campo existir: completa SÓ o que o snapshot
 * ignora e que é lido sem ele. Hoje é `semanasCheckpoint` (as 37 trilhas da
 * Ibipeba, carimbadas em 02/09 com 9 semanas, não têm a chave). Os checkpoints
 * além do fim do plano não existem: a semana 10 de um programa de 9 não chega.
 */
function completarSnapshot(snapshot: ProgramaConfig, base: ProgramaConfig): ProgramaConfig {
  const checkpoints = (snapshot.semanasCheckpoint ?? base.semanasCheckpoint ?? []).filter((n) => n <= snapshot.semanas);
  return { ...snapshot, semanasCheckpoint: checkpoints };
}

/**
 * FONTE ÚNICA do RUNTIME (síncrona): config da trilha pelo SNAPSHOT congelado
 * (`trilhas.programa_config`, mig 182) ou, sem ele, pelo CARIMBO
 * (`trilhas.programa_modo`, gravado na geração: congela as regras).
 *
 * - O snapshot vale para QUALQUER rótulo, quando o chamador o selecionou: é ele
 *   que tem a duração real. A Ibipeba é `regular_duo` com snapshot de 9 semanas
 *   (encerrada como projeto de 7, 02/09/2026); lendo só o rótulo, o painel do
 *   gestor e o resumo de WhatsApp dizem "sem X/14" para um programa de 9 e
 *   acusam de atraso quem já concluiu tudo (R-101).
 * - Personalizado sem snapshot: o `programa_custom` da empresa, se o chamador o
 *   passou; senão a Jornada. Nenhuma trilha gerada depois da mig 182 chega aqui
 *   sem snapshot, então isto é só um último recurso.
 * - Trilha legada sem carimbo → `getProgramaConfigLegado` (comportamento
 *   pré-154, que é o DUO quando a empresa não diz outra coisa).
 *
 * Quer a DURAÇÃO? Use `duracaoDaTrilha` (duracao-trilha.ts): é a fonte única da
 * conta, e esta função é o que ela lê quando a trilha não traz o plano.
 *
 * A versão assíncrona, que busca o snapshot quando ele não veio no select, é
 * `resolverConfigDaTrilha` (trilha-runtime).
 */
export function getProgramaConfigDaTrilha(
  trilha?: { programa_modo?: string | null; programa_config?: unknown } | null,
  sysConfig?: { programa_modo?: string; programa_custom?: unknown } | null,
): ProgramaConfig {
  const modo = trilha?.programa_modo;
  const snapshot = parseConfigSnapshot(trilha?.programa_config);
  if (modo === 'custom') {
    if (snapshot) return completarSnapshot(snapshot, PROGRAMA_JORNADA);
    const inputs = parseProgramaCustom(sysConfig?.programa_custom);
    if (inputs) return derivarConfigCustom(inputs);
    return getProgramaConfigByModo(modo);
  }
  const base = modo ? getProgramaConfigByModo(modo) : getProgramaConfigLegado(sysConfig);
  return snapshot ? completarSnapshot(snapshot, base) : base;
}

/**
 * Semana cujo CALENDÁRIO governa a liberação de `semana`. Nos modos sem
 * espelho (todos exceto piloto) devolve a própria semana — comportamento
 * vanilla inalterado. Usar SEMPRE que for chamar semanaLiberadaPorData.
 */
export function semanaCalendario(config: ProgramaConfig, semana: number): number {
  return config.semanaEspelhoCalendario?.[semana] ?? semana;
}

/**
 * Conveniência: dados os descritores selecionados, retorna a lista de
 * descritores cobertos por uma semana de missão. Centraliza a lógica de
 * `blocosCobertos[semana] = N | -1`.
 */
export function descritoresCobertosNaMissao<T>(
  descritoresSelecionados: T[],
  semana: number,
  config: ProgramaConfig,
): T[] {
  const n = config.blocosCobertos[semana];
  if (n === undefined) return [];
  if (n === -1) return [...descritoresSelecionados];
  return descritoresSelecionados.slice(0, n);
}

/**
 * A semana é de MAPEAMENTO neste programa (`ProgramaConfig.semanasMapeamento`)?
 * Só o Onboarding tem; nos demais modos é sempre `false`.
 */
export function ehSemanaDeMapeamento(config: Pick<ProgramaConfig, 'semanasMapeamento'>, semana: number): boolean {
  return (config.semanasMapeamento ?? []).includes(Number(semana));
}

/**
 * Quantas semanas de mapeamento abrem o programa (0 fora do Onboarding). É
 * quanto o calendário da trilha anda para trás ao nascer: ver
 * `ProgramaConfig.semanasMapeamento` e `persistirTrilha`.
 */
export function semanasDeMapeamentoDoPrograma(config: Pick<ProgramaConfig, 'semanasMapeamento'>): number {
  return (config.semanasMapeamento ?? []).length;
}

/**
 * Concluir ESTA semana dispara a acumulada parcial do Onboarding?
 *
 * Sim quando o programa é o Onboarding, a semana é de conteúdo e é a da
 * acumulada (`semanaAcumulada`, a 11: a última de conteúdo). A leitura cobre as 5
 * competências da trilha e o fechamento (semana 12) lê o resultado na linha
 * desta semana. Até 04/10/2026 ela rodava ao fim de cada missão integradora
 * (3/6/8); as missões deixaram de existir.
 *
 * Função PURA, para a rota e o teste decidirem pela mesma regra: a mutação que
 * troca a semana ou o modo tem que derrubar o caso.
 */
export function deveRodarAcumuladaParcialDoOnboarding(
  config: Pick<ProgramaConfig, 'modo' | 'semanaAcumulada'>,
  semanaPlan: { tipo?: string | null } | null | undefined,
  semana: number | string,
  concluiu: boolean,
): boolean {
  return concluiu
    && config.modo === 'onboarding'
    && semanaPlan?.tipo === 'conteudo'
    && Number(semana) === config.semanaAcumulada;
}
