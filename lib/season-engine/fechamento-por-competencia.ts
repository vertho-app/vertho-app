/**
 * O fechamento do ONBOARDING: 5 cenários (um por competência), 4 perguntas cada.
 *
 * O Onboarding fecha em 5 competências de uma vez. O desenho da Onda D (um caso
 * único que integra as 5, uma pergunta por competência) saiu a pedido do dono em
 * 04/10/2026: o fechamento serve os Cenários B por célula que o lote da Fase 5 JÁ
 * gera, um por competência, na ordem da trilha, cada um com as suas 4 perguntas,
 * "da mesma forma que o Cenário A do Mapeamento" (um cenário por competência,
 * quatro respostas, os descritores da competência avaliados contra elas).
 *
 * O slot (`temporada_semana_progresso.feedback`) guarda a LISTA:
 *
 *   feedback.cenarios = [{ competencia, cenario_b_id, cenario, perguntas,
 *                          transcript_completo }, ...]
 *
 * e as trilhas de UMA competência (Jornada, Personalizado, legado) seguem com o
 * formato de sempre (`feedback.cenario`, `.perguntas`, `.transcript_completo`),
 * byte a byte: quem lê o slot decide pela PRESENÇA de `cenarios`, nunca pelo modo.
 *
 * A ARGUIÇÃO segue o padrão da Jornada, repetido por cenário (decisão do dono, 04/10/2026,
 * "o mesmo fluxo e padrão dos cenários da Jornada; a única diferença é que serão sempre 5
 * cenários"): depois das 4 respostas de cada cenário abre a arguição DAQUELA competência
 * (mesmas regras do modo, sondando os descritores dela) e só depois vem o cenário seguinte.
 * A conversa e a extração de cada uma ficam no próprio cenário (`cenarios[i].arguicao`,
 * o mesmo formato de `feedback.arguicao` da Jornada), e a fusão na nota roda por competência.
 *
 * Este módulo é a parte PURA: ler a posição da pessoa no slot (respondendo ou arguindo,
 * em qual cenário), montar os textos que o scorer, a arguição e os leitores do relatório
 * consomem, e JUNTAR as pontuações (uma chamada de IA por competência) no mesmo formato de
 * saída de uma competência só. Trinta descritores numa chamada estourariam o teto de saída
 * do scorer; a pontuação por competência cabe com folga e é o desenho que o Cenário A já usa.
 */
import { normalizarComp } from '@/lib/workshop-competencias';
import { neutralizarFala } from '@/lib/prompt-seguro';
import type { ArguicaoEstado, ArguicaoExtracao } from '@/lib/season-engine/arguicao';

export interface PerguntaDoCenario {
  dimensao: string;
  texto: string;
}

/** Um cenário do fechamento, como fica gravado em `feedback.cenarios`. */
export interface CenarioDoFechamento {
  competencia: string;
  cenario_b_id: string | null;
  /** O texto que a pessoa vê (`## Título` e a descrição). */
  cenario: string;
  perguntas: PerguntaDoCenario[];
  /** As falas deste cenário: a pergunta (assistant) e a resposta (user), em ordem. */
  transcript_completo: any[];
  /**
   * A arguição DESTA competência, no formato de `feedback.arguicao` da Jornada (o estado da
   * conversa e, ao concluir, a `extracao`). Ausente = ainda não aberta (ou arguição desligada).
   */
  arguicao?: ArguicaoDoCenario | null;
}

/** O estado da arguição de um cenário: a conversa (`ArguicaoEstado`) e, ao concluir, o que ela sustentou. */
export type ArguicaoDoCenario = ArguicaoEstado & { extracao?: ArguicaoExtracao | null };

/** A lista de cenários do slot, ou `null` quando é o formato de uma competência. */
export function cenariosDoSlot(feedback: any): CenarioDoFechamento[] | null {
  const lista = feedback?.cenarios;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  return lista.map((c: any) => ({
    competencia: String(c?.competencia ?? ''),
    cenario_b_id: c?.cenario_b_id ?? null,
    cenario: String(c?.cenario ?? ''),
    perguntas: Array.isArray(c?.perguntas) ? c.perguntas : [],
    transcript_completo: Array.isArray(c?.transcript_completo) ? c.transcript_completo : [],
    arguicao: c?.arguicao && typeof c.arguicao === 'object' ? c.arguicao : null,
  }));
}

/** Quantas respostas da pessoa o cenário já tem. */
export function respostasDoCenarioN(c: Pick<CenarioDoFechamento, 'transcript_completo'>): number {
  return (c.transcript_completo || []).filter((m: any) => m?.role === 'user').length;
}

export type EtapaDoCenario = 'respondendo' | 'arguindo';

export interface PosicaoNoFechamento {
  totalCenarios: number;
  totalPerguntas: number;
  totalRespostas: number;
  /** Índice (0) do cenário em que a pessoa está; `null` quando todos terminaram (respostas e, se ligada, arguição). */
  cenarioAtual: number | null;
  /** Índice (0) da pergunta a responder dentro dele; `null` fora da etapa `respondendo`. */
  perguntaAtual: number | null;
  /** O que falta no cenário atual: responder as perguntas ou concluir a arguição dele. `null` quando todos terminaram. */
  etapa: EtapaDoCenario | null;
}

/**
 * Onde a pessoa está: o primeiro cenário que ainda não terminou. Um cenário termina quando
 * as perguntas foram respondidas E, com a arguição ligada (`arguicaoAtiva`), a arguição dele
 * foi concluída: só então vem o seguinte (o mesmo padrão da Jornada, cenário por cenário).
 * Retomar volta a este cenário e a esta etapa, e é a mesma conta da rota e da tela.
 */
export function posicaoNoFechamento(cenarios: CenarioDoFechamento[], opts: { arguicaoAtiva?: boolean } = {}): PosicaoNoFechamento {
  let totalPerguntas = 0;
  let totalRespostas = 0;
  let cenarioAtual: number | null = null;
  let perguntaAtual: number | null = null;
  let etapa: EtapaDoCenario | null = null;
  cenarios.forEach((c, i) => {
    const n = c.perguntas.length;
    const r = Math.min(respostasDoCenarioN(c), n);
    totalPerguntas += n;
    totalRespostas += r;
    if (cenarioAtual !== null) return;
    if (r < n) {
      cenarioAtual = i;
      perguntaAtual = r;
      etapa = 'respondendo';
    } else if (opts.arguicaoAtiva && !c.arguicao?.concluida) {
      cenarioAtual = i;
      etapa = 'arguindo';
    }
  });
  return { totalCenarios: cenarios.length, totalPerguntas, totalRespostas, cenarioAtual, perguntaAtual, etapa };
}

/**
 * As respostas de UM cenário, rotuladas pela pergunta. As N PRIMEIRAS falas da
 * pessoa de propósito: um reenvio antigo pode ter deixado falas duplicadas depois
 * delas, e elas não respondem pergunta nenhuma (mesma regra do cenário único).
 */
export function respostaDoCenario(c: Pick<CenarioDoFechamento, 'perguntas' | 'transcript_completo'>): string {
  const respostasUser = (c.transcript_completo || []).filter((m: any) => m?.role === 'user');
  return c.perguntas
    .map((p, i) => `[${p.dimensao}] ${p.texto}\n→ ${neutralizarFala(respostasUser[i]?.content) || '(sem resposta)'}`)
    .join('\n\n');
}

/** As respostas dos 5 cenários num texto só, com o nome da competência de cada bloco. */
export function respostasDosCenarios(cenarios: CenarioDoFechamento[]): string {
  return cenarios.map((c) => `### ${c.competencia}\n${respostaDoCenario(c)}`).join('\n\n');
}

/** Os 5 cenários num texto só (o que o auditor, a redação e a tela do admin leem). */
export function textoDosCenarios(cenarios: CenarioDoFechamento[]): string {
  return cenarios.map((c) => `### Competência: ${c.competencia}\n\n${c.cenario}`).join('\n\n---\n\n');
}

/** O rótulo da trilha inteira, na convenção de sempre (`A + B + C`). */
export function rotuloDasCompetencias(cenarios: Array<Pick<CenarioDoFechamento, 'competencia'>>): string {
  return cenarios.map((c) => c.competencia).join(' + ');
}

export interface GrupoDeDescritores {
  competencia: string;
  descritores: any[];
}

/**
 * Separa os descritores da trilha por competência, na ordem dos cenários. O que não
 * pertence a nenhuma competência dos cenários volta em `semCenario`: pontuar de
 * menos calado deixaria o descritor sem nota no relatório, então quem chama recusa.
 */
export function descritoresPorCompetencia(
  descritores: any[],
  competencias: string[],
): { grupos: GrupoDeDescritores[]; semCenario: any[] } {
  const grupos: GrupoDeDescritores[] = competencias.map((competencia) => ({ competencia, descritores: [] }));
  const semCenario: any[] = [];
  for (const d of descritores || []) {
    const chave = normalizarComp(d?.competencia);
    const grupo = chave ? grupos.find((g) => normalizarComp(g.competencia) === chave) : undefined;
    if (grupo) grupo.descritores.push(d);
    else semCenario.push(d);
  }
  return { grupos, semCenario };
}

/** O que o scorer recebe de UMA competência: o cenário dela, as respostas dela e a régua dela. */
export interface EntradaPorCompetencia {
  competencia: string;
  /** Já enriquecidos com régua (n1..n4) e nota fresh. */
  descritores: any[];
  cenario: string;
  /** Já mascarada de PII pelo caller. */
  resposta: string;
  /** Já mascaradas de PII pelo caller. */
  evidenciasAcumuladas?: string;
  acumuladoPrimaria?: unknown;
  /**
   * O que a arguição DESTA competência sustentou (a extração, já mascarada pelo caller). A
   * fusão na nota roda por competência, sobre esta extração; ausente = sem ajuste nela.
   */
  evidenciasArguicao?: ArguicaoExtracao | null;
}

const nomeDoDescritor = (d: any) => String(d?.descritor ?? '').trim().toLowerCase();

/**
 * A leitura acumulada só da competência: o scorer de uma competência não precisa
 * dos descritores das outras quatro (mais prompt, mais ruído). O resumo geral fica
 * inteiro. Sem lista de avaliações, devolve como veio.
 */
export function acumuladoDaCompetencia(acumulado: any, descritores: any[], competencia: string): any {
  if (!acumulado || !Array.isArray(acumulado.avaliacao_acumulada)) return acumulado;
  const nomes = new Set(descritores.map(nomeDoDescritor));
  const chave = normalizarComp(competencia);
  return {
    ...acumulado,
    avaliacao_acumulada: acumulado.avaliacao_acumulada.filter((a: any) => (
      nomes.has(nomeDoDescritor(a)) && (!a?.competencia || normalizarComp(a.competencia) === chave)
    )),
  };
}

// ── O conjunto de descritores que o fechamento pontua ────────────────────────

/** Uma linha do mapeamento da pessoa (o Cenário A): `descriptor_assessments`. */
export interface LinhaDoMapeamento {
  competencia: string;
  descritor: string;
  nota: number | string | null;
}

/**
 * O conjunto de descritores que o fechamento do Onboarding PONTUA em cada competência.
 *
 * Decisão do dono (04/10/2026): o B passa pelos 6 descritores de cada competência, "da
 * mesma forma que o Cenário A": o MESMO conjunto que o A avaliou em
 * `descriptor_assessments`, para o fechamento comparar B contra A descritor a descritor.
 * A trilha só selecionou 4 por competência (os de maior distância até a meta) para o
 * CONTEÚDO das semanas; pontuar só esses deixaria dois descritores de cada competência
 * fora da comparação.
 *
 * Por competência, na ordem dada: primeiro os descritores da trilha (com a nota, a ordem
 * e os campos de sempre), depois os que só o mapeamento tem, do menor para o maior nível
 * e, no empate, por nome (ordem estável). Os do mapeamento entram como a seleção os
 * guarda (`descritor`, `competencia`, `nota_atual`). Um descritor da trilha cuja
 * competência não está na lista vai para o FIM, intacto: quem monta as entradas o recusa
 * ("sem cenário"), em vez de a pontuação deixá-lo cair calada.
 *
 * `semMapeamento` lista as competências sem nenhuma linha no mapeamento: elas seguem só
 * com os descritores da trilha, e o chamador avisa.
 */
export function descritoresDoFechamento(
  selecionados: any[],
  mapeamento: LinhaDoMapeamento[],
  competencias: string[],
): { descritores: any[]; semMapeamento: string[] } {
  const descritores: any[] = [];
  const semMapeamento: string[] = [];
  const chaves = new Set(competencias.map((c) => normalizarComp(c)));
  for (const competencia of competencias) {
    const chave = normalizarComp(competencia);
    const daTrilha = (selecionados || []).filter((d) => normalizarComp(d?.competencia) === chave);
    descritores.push(...daTrilha);
    const jaTem = new Set(daTrilha.map(nomeDoDescritor));
    const doMapa = (mapeamento || []).filter((l) => normalizarComp(l?.competencia) === chave && nomeDoDescritor(l));
    if (doMapa.length === 0) semMapeamento.push(competencia);
    const extras: Array<{ nome: string; descritor: string; nota: number | null }> = [];
    for (const l of doMapa) {
      const nome = nomeDoDescritor(l);
      if (jaTem.has(nome)) continue;
      jaTem.add(nome);
      const nota = Number(l.nota);
      extras.push({ nome, descritor: String(l.descritor).trim(), nota: Number.isFinite(nota) ? nota : null });
    }
    extras.sort((a, b) => (a.nota ?? Infinity) - (b.nota ?? Infinity) || a.nome.localeCompare(b.nome, 'pt-BR'));
    for (const e of extras) descritores.push({ descritor: e.descritor, competencia, nota_atual: e.nota });
  }
  descritores.push(...(selecionados || []).filter((d) => !chaves.has(normalizarComp(d?.competencia))));
  return { descritores, semMapeamento };
}

const textoDe = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// ── A arguição, uma por competência ─────────────────────────────────────────

/**
 * A chave da citação da arguição de um descritor: o nome, e a competência quando o descritor a
 * traz (Onboarding, onde o nome pode se repetir entre competências). Sem competência (uma só),
 * é o nome de sempre.
 */
export function chaveDaCitacao(d: any): string {
  const competencia = normalizarComp(d?.competencia);
  return competencia ? `${competencia}|${nomeDoDescritor(d)}` : nomeDoDescritor(d);
}

/**
 * As extrações das arguições (uma por competência, cada uma já mascarada pelo chamador)
 * juntas no formato de UMA extração, que é o que a redação final e o auditor leem. O
 * texto de cada leitura leva o nome da competência na frente, e cada evidência traz a
 * `competencia` de onde veio (o nome do descritor pode se repetir entre competências).
 * A FUSÃO na nota não usa esta junção: ela roda por competência, sobre a extração dela.
 * Nenhuma arguição concluída (ou sem extração) devolve `null`.
 */
export function extracaoDoConjunto(
  partes: Array<{ competencia: string; extracao: ArguicaoExtracao | null | undefined }>,
): ArguicaoExtracao | null {
  const com = partes.filter((p): p is { competencia: string; extracao: ArguicaoExtracao } => !!p.extracao);
  if (!com.length) return null;
  const texto = (campo: 'leitura_geral' | 'sustentacao_mais_forte' | 'fragilidade_mais_relevante') => com
    .map((p) => (textoDe(p.extracao.resumo?.[campo]) ? `${p.competencia}: ${textoDe(p.extracao.resumo?.[campo])}` : ''))
    .filter(Boolean)
    .join('\n\n');
  return {
    resumo: {
      leitura_geral: texto('leitura_geral'),
      sustentacao_mais_forte: texto('sustentacao_mais_forte'),
      fragilidade_mais_relevante: texto('fragilidade_mais_relevante'),
    },
    evidencias_por_descritor: com.flatMap((p) => (Array.isArray(p.extracao.evidencias_por_descritor) ? p.extracao.evidencias_por_descritor : [])
      .map((e) => ({ ...e, competencia: p.competencia }))),
  };
}

// ── Juntar as pontuações ────────────────────────────────────────────────────

export interface PartePontuada {
  competencia: string;
  /** A saída do scorer de UMA competência, já validada (`validateEvolutionScenarioScore`). */
  parsed: any;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A média do validador do scorer: uma casa, e `null` quando não há valor. */
function media(valores: unknown[]): number | null {
  const nums = valores.filter((v): v is number => typeof v === 'number');
  return nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

/**
 * Junta as saídas do scorer (uma por competência) NO FORMATO DE UMA COMPETÊNCIA SÓ,
 * o que o relatório, o Evolution Report e o certificado já leem:
 *
 *  - `avaliacao_por_descritor`: os descritores de todas, na ordem dos cenários, cada
 *    um com a `competencia` de onde veio (chave nova: o nome do descritor pode se
 *    repetir entre competências, e o Evolution Report passa a casar pelas duas);
 *  - `nota_media_*` e `delta_medio`: refeitos sobre o conjunto, pela MESMA conta do
 *    validador (uma casa decimal);
 *  - `resumo_avaliacao`: um RASCUNHO, com o texto de cada competência. A devolutiva
 *    que a pessoa lê é escrita uma vez só, pela redação final, a partir das notas;
 *  - `alertas_metodologicos`: a união, com a competência na frente de cada um.
 *
 * `avaliacao_por_competencia` é só informação (a média de cada competência) e não
 * entra em nenhum leitor existente.
 */
export function mesclarPontuacoes(partes: PartePontuada[]): any {
  const descritores = partes.flatMap((p) => (p.parsed?.avaliacao_por_descritor || []).map((d: any) => ({ ...d, competencia: p.competencia })));

  const nota_media_pre = media(descritores.map((d: any) => d.nota_pre));
  const nota_media_acumulada = media(descritores.map((d: any) => d.nota_acumulada));
  const nota_media_cenario = media(descritores.map((d: any) => d.nota_cenario));
  const nota_media_pos = media(descritores.map((d: any) => d.nota_pos));
  const delta_medio = nota_media_pre != null && nota_media_pos != null ? round1(nota_media_pos - nota_media_pre) : null;

  const resumos = partes.map((p) => ({ competencia: p.competencia, r: p.parsed?.resumo_avaliacao || {} }));
  const porCompetencia = (campo: string) => resumos
    .map(({ competencia, r }) => (textoDe(r[campo]) ? `${competencia}: ${textoDe(r[campo])}` : ''))
    .filter(Boolean)
    .join('\n\n');
  const unicos = (campo: string): string[] => [...new Set(resumos.flatMap(({ r }) => (Array.isArray(r[campo]) ? r[campo] : []))
    .filter((x: unknown) => typeof x === 'string' && x.trim()) as string[])];

  // Os próximos passos: o primeiro de cada competência, depois os demais, até o teto de 3
  // do validador (a redação reescreve; isto é o que sobra se ela não sair).
  const passosPorCompetencia = resumos.map(({ r }) => (Array.isArray(r.proximos_passos) ? r.proximos_passos.filter((x: unknown) => typeof x === 'string' && x.trim()) : []));
  const passos: string[] = [];
  for (let i = 0; passos.length < 3 && passosPorCompetencia.some((l) => l.length > i); i++) {
    for (const lista of passosPorCompetencia) if (passos.length < 3 && lista[i]) passos.push(lista[i]);
  }

  return {
    avaliacao_por_descritor: descritores,
    nota_media_pre,
    nota_media_acumulada,
    nota_media_cenario,
    nota_media_pos,
    delta_medio,
    resumo_avaliacao: {
      mensagem_geral: porCompetencia('mensagem_geral'),
      evidencias_citadas: unicos('evidencias_citadas'),
      principal_avanco: porCompetencia('principal_avanco'),
      principal_ponto_de_atencao: porCompetencia('principal_ponto_de_atencao'),
      mensagem_final: porCompetencia('mensagem_final'),
      proximos_passos: passos,
    },
    alertas_metodologicos: partes.flatMap((p) => (Array.isArray(p.parsed?.alertas_metodologicos) ? p.parsed.alertas_metodologicos : [])
      .map((a: unknown) => (typeof a === 'string' ? `${p.competencia}: ${a}` : a))),
    avaliacao_por_competencia: partes.map((p) => ({
      competencia: p.competencia,
      descritores: (p.parsed?.avaliacao_por_descritor || []).length,
      nota_media_pre: p.parsed?.nota_media_pre ?? null,
      nota_media_cenario: p.parsed?.nota_media_cenario ?? null,
      nota_media_pos: p.parsed?.nota_media_pos ?? null,
      delta_medio: p.parsed?.delta_medio ?? null,
    })),
  };
}

/** Descritores com o mesmo nome em competências diferentes (o nome sozinho não os distingue). */
export function descritoresHomonimos(grupos: GrupoDeDescritores[]): string[] {
  const donos = new Map<string, Set<string>>();
  for (const g of grupos) {
    for (const d of g.descritores) {
      const chave = nomeDoDescritor(d);
      if (!chave) continue;
      (donos.get(chave) ?? donos.set(chave, new Set()).get(chave)!).add(normalizarComp(g.competencia));
    }
  }
  return [...donos.entries()].filter(([, comps]) => comps.size > 1).map(([nome]) => nome);
}
