/**
 * Competência foco DA PESSOA pela menor nota (15/10/2026, Amazon Bowling). PURO: sem banco, sem IA.
 *
 * A regra é da empresa (`sys_config.foco_individual = 'menor_nota'`): cada pessoa faz a trilha da competência em
 * que teve o pior desempenho na avaliação. A escolha é gravada UMA vez em `colaboradores.foco_individual` (mig 287)
 * pela etapa "Competência de cada pessoa" do Fluxo completo, e daí em diante blueprint, PDI e trilha leem o valor
 * congelado (`focoDaPessoa`). Calcular na leitura faria uma reavaliação trocar a competência de um lado e não do
 * outro (a classe do R-85: dois leitores, duas respostas).
 *
 * A nota de uma competência é a MÉDIA dos descritores (`descriptor_assessments`), arredondada a 2 casas: o mesmo
 * número que o blueprint e o PDI mostram (`nota_decimal`) e que a IA4 grava em `nota_ia4`.
 *
 * Desempate (decisão do dono, 15/10/2026), na ordem:
 *   1. menor média;
 *   2. o PIOR DESCRITOR isolado (a competência que tem o comportamento com a nota mais baixa);
 *   3. a ordem do Top 5 do cargo;
 *   4. ordem alfabética (só para ser determinístico; com o Top 5 configurado não chega aqui).
 */

export const REGRA_FOCO_MENOR_NOTA = 'menor_nota' as const;
export type RegraFocoIndividual = typeof REGRA_FOCO_MENOR_NOTA;

/** A regra ligada na empresa, ou `null` (a empresa segue o foco do cargo). */
export function regraFocoIndividual(sysConfig: unknown): RegraFocoIndividual | null {
  const v = (sysConfig as Record<string, unknown> | null | undefined)?.foco_individual;
  return v === REGRA_FOCO_MENOR_NOTA ? REGRA_FOCO_MENOR_NOTA : null;
}

export interface NotaDescritor {
  competencia: string | null | undefined;
  descritor?: string | null;
  nota: number | string | null | undefined;
}

export type CriterioFoco = 'menor_media' | 'pior_descritor' | 'ordem_top5' | 'ordem_alfabetica';

export interface EscolhaFoco {
  competencia: string;
  media: number;
  /** A menor nota de descritor da competência escolhida. */
  piorDescritor: number;
  /** O que decidiu: a média sozinha, ou o desempate usado. */
  criterio: CriterioFoco;
  /** As competências que empataram na menor média (vazio quando não houve empate). */
  empatadas: string[];
  /** Média de cada competência avaliada (2 casas), para mostrar e auditar a escolha. */
  medias: Record<string, number>;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const duasCasas = (n: number) => Math.round(n * 100) / 100;

export function escolherFocoMenorNota(notas: NotaDescritor[], ordemTop5: string[] = []): EscolhaFoco | null {
  const porComp = new Map<string, { nome: string; notas: number[] }>();
  for (const n of notas) {
    const nome = String(n.competencia ?? '').trim();
    if (!nome || n.nota == null || n.nota === '') continue;
    const v = typeof n.nota === 'number' ? n.nota : Number(n.nota);
    if (!Number.isFinite(v)) continue;
    const k = norm(nome);
    const g = porComp.get(k) ?? porComp.set(k, { nome, notas: [] }).get(k)!;
    g.notas.push(v);
  }
  if (porComp.size === 0) return null;

  const linhas = [...porComp.values()].map((g) => ({
    nome: g.nome,
    media: duasCasas(g.notas.reduce((s, v) => s + v, 0) / g.notas.length),
    pior: duasCasas(Math.min(...g.notas)),
  }));
  const medias = Object.fromEntries(linhas.map((l) => [l.nome, l.media]));
  const escolha = (l: (typeof linhas)[number], criterio: CriterioFoco, empatadas: string[]): EscolhaFoco => ({
    competencia: l.nome, media: l.media, piorDescritor: l.pior, criterio, empatadas, medias,
  });

  const menorMedia = Math.min(...linhas.map((l) => l.media));
  const empatadasMedia = linhas.filter((l) => l.media === menorMedia);
  if (empatadasMedia.length === 1) return escolha(empatadasMedia[0], 'menor_media', []);
  const nomesEmpatados = empatadasMedia.map((l) => l.nome);

  const menorPior = Math.min(...empatadasMedia.map((l) => l.pior));
  const porPior = empatadasMedia.filter((l) => l.pior === menorPior);
  if (porPior.length === 1) return escolha(porPior[0], 'pior_descritor', nomesEmpatados);

  const posicao = (nome: string) => {
    const i = ordemTop5.findIndex((t) => norm(t) === norm(nome));
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const menorPosicao = Math.min(...porPior.map((l) => posicao(l.nome)));
  const porTop5 = porPior.filter((l) => posicao(l.nome) === menorPosicao);
  if (porTop5.length === 1 && Number.isFinite(menorPosicao)) return escolha(porTop5[0], 'ordem_top5', nomesEmpatados);

  const alfabetica = [...porTop5].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return escolha(alfabetica[0], 'ordem_alfabetica', nomesEmpatados);
}

export type ProntidaoFoco = 'pronto' | 'sem_resposta' | 'aguardando_ia4' | 'aguardando_check';

/**
 * A pessoa pode ter a competência escolhida? Só com TODAS as respostas dela avaliadas pela IA4, auditadas pela 2ª
 * IA (a mesma régua que segura o PDI, R-59) e com as notas por descritor gravadas: escolher antes faria a menor nota
 * mudar quando a última avaliação chegasse, depois de blueprint e PDI já escritos sobre a primeira.
 */
export function prontidaoParaFoco(
  respostas: Array<{ competencia_nome?: string | null; avaliada: boolean; checada: boolean }>,
  competenciasComNota: Set<string>,
): ProntidaoFoco {
  if (respostas.length === 0) return 'sem_resposta';
  if (respostas.some((r) => !r.avaliada || !competenciasComNota.has(norm(r.competencia_nome)))) return 'aguardando_ia4';
  if (respostas.some((r) => !r.checada)) return 'aguardando_check';
  return 'pronto';
}

export const normCompetencia = norm;
