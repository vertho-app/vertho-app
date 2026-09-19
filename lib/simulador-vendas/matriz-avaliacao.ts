import { z } from 'zod';
import { consolidarCompetencia, REGRA_COBERTURA, type RegraCobertura } from '@/lib/simuladores/cobertura';
import { contemCitacao, descarteTolerado } from '@/lib/simuladores/citacao';
import { COMPETENCIAS_PACE, MATRIZ_VERSION } from './matriz';
import type { Estado } from './schema';

const codigos = COMPETENCIAS_PACE.flatMap((c) =>
  c.descritores.map((d) => d.codigo),
);
const evidenciaSchema = z.object({
  origem: z.enum(['planejamento', 'conversa']),
  turno: z.number().int().positive().nullable(),
  citacao: z.string().trim().min(1).max(500),
});
export const matrizAvaliacaoSchema = z.object({
  versao: z.literal(MATRIZ_VERSION),
  descritores: z
    .array(
      z.object({
        codigo: z.enum(codigos as [string, ...string[]]),
        nivel: z
          .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
          .nullable(),
        justificativa: z.string().trim().min(1).max(500),
        evidencias: z.array(evidenciaSchema).max(2),
      }),
    )
    .length(codigos.length),
});
export type AvaliacaoMatriz = z.infer<typeof matrizAvaliacaoSchema>;

/** A versão distingue a escala do exercício dos três graus de dificuldade do cliente. */
export function usaMatrizPace(versao?: string) {
  return versao === 'pace-4' || versao === 'pace-5' || versao === 'pace-6' || versao === 'pace-7';
}
/** Notas gravadas já na escala 1 a 4 (pace-6 em diante); as anteriores são convertidas na leitura. */
export function escalaNativa14(versao?: string) {
  return versao === 'pace-6' || versao === 'pace-7';
}
/** A regra de cobertura comum (4 descritores, 3 competências) vale da pace-7 em diante. */
export function usaRegraCobertura(versao?: string) {
  return versao === 'pace-7';
}
/**
 * E5 e E6 (acompanhamento da implementação e verificação de resultados) não
 * cabem numa reunião inicial simulada. Da pace-7 em diante ficam FORA da
 * avaliação: não contam no total de Engajar nem aparecem como "não observado".
 */
export const FORA_DA_REUNIAO_INICIAL: readonly string[] = ['E5', 'E6'];
/** Regra das versões anteriores à pace-7: média dos observados, sem mínimo. */
const REGRA_LEGADA: RegraCobertura = { versao: 'legado', minDescritores: 1, minCompetencias: 1 };
export const regraDaVersao = (versao?: string): RegraCobertura =>
  usaRegraCobertura(versao) ? REGRA_COBERTURA : REGRA_LEGADA;
/** A matriz como fica gravada: descritores com citação inválida rebaixados e listados. */
export type AvaliacaoMatrizGravada = AvaliacaoMatriz & { descartados?: string[] };
export function planejamentoPendente(
  s: Pick<Estado, 'versaoRegua' | 'planejamento'>,
) {
  return usaMatrizPace(s.versaoRegua) && !s.planejamento?.trim();
}

/**
 * Estrutura errada (descritor faltando, repetido, nota sem evidência) LANÇA e o
 * gerente é reenviado. Citação que não confere com a fonte, em POUCOS
 * descritores (até 20% dos avaliados), rebaixa só esses e os lista em
 * `descartados`; acima disso a avaliação inteira é suspeita e LANÇA, como antes.
 * Até 18/09 qualquer citação inexata entre cerca de 60 derrubava os 30 níveis.
 * A comparação ignora tipografia (aspas, reticências, caixa), como no atendimento.
 */
export function validarMatriz(
  matriz: unknown,
  s: Pick<Estado, 'planejamento' | 'mensagens'>,
): AvaliacaoMatrizGravada {
  const m: AvaliacaoMatrizGravada = matrizAvaliacaoSchema.parse(matriz);
  if (new Set(m.descritores.map((d) => d.codigo)).size !== codigos.length)
    throw new Error('Descritor da matriz ausente ou repetido');
  const invalidos: string[] = [];
  for (const d of m.descritores) {
    if (d.nivel === null) {
      if (d.evidencias.length)
        throw new Error('Descritor não observado com evidências pontuadas');
      continue;
    }
    // A conversa inicial não prova execução de pós-venda. Um compromisso é
    // avaliado em E3/E4; nível em E5/E6 é descartado, não aproveitado.
    if (FORA_DA_REUNIAO_INICIAL.includes(d.codigo)) {
      invalidos.push(d.codigo);
      continue;
    }
    if (!d.evidencias.length) throw new Error('Nível sem evidência observável');
    const valida = d.evidencias.every((e) => {
      if (d.codigo.startsWith('PL'))
        return e.origem === 'planejamento' && e.turno === null && contemCitacao(s.planejamento, e.citacao);
      const fala = s.mensagens.find((f) => f.autor === 'vendedor' && f.turno === e.turno);
      return e.origem === 'conversa' && contemCitacao(fala?.texto, e.citacao);
    });
    if (!valida) invalidos.push(d.codigo);
  }
  const avaliados = m.descritores.filter((d) => d.nivel !== null).length;
  if (!descarteTolerado(invalidos.length, avaliados))
    throw new Error(
      'Evidência inválida: citação que não confere com o planejamento ou com a fala do vendedor',
    );
  if (!invalidos.length) return m;
  return {
    ...m,
    descritores: m.descritores.map((d) =>
      invalidos.includes(d.codigo) ? { ...d, nivel: null, evidencias: [] } : d,
    ),
    descartados: invalidos,
  };
}

/**
 * A ausência de observação fica fora da média 1 a 4, nunca vira N1. Da pace-7 em
 * diante vale a regra de cobertura comum (nível só com 4 observados) e E5/E6
 * saem do total; as versões anteriores seguem lidas como foram geradas.
 */
export function consolidarMatriz(m: AvaliacaoMatriz, versao?: string) {
  const regra = regraDaVersao(versao);
  const fora = usaRegraCobertura(versao) ? FORA_DA_REUNIAO_INICIAL : [];
  return COMPETENCIAS_PACE.map((c) => {
    const aplicaveis = c.descritores.filter((d) => !fora.includes(d.codigo));
    const niveis = aplicaveis.map(
      (d) => m.descritores.find((a) => a.codigo === d.codigo)?.nivel ?? null,
    );
    return { codigo: c.codigo, ...consolidarCompetencia(niveis, regra) };
  });
}

/** Projeção da mesma avaliação na escala de treino: N1=2,5, N2=5, N3=7,5, N4=10.
 * Arredondamento somente no resultado da etapa; nenhuma nota 0–10 é convertida em nível.
 * Planejamento tem avaliação própria e não entra na média histórica dos quatro pilares.
 */
export function notasDaMatriz(m: AvaliacaoMatriz) {
  const competencias = consolidarMatriz(m);
  const nota = (codigo: string) => {
    const media = competencias.find((c) => c.codigo === codigo)!.nota;
    return media === null ? 0 : Math.round(media * 5) / 2;
  };
  return { P: nota('P'), A: nota('A'), C: nota('C'), E: nota('E') };
}

export function promptMatrizPace() {
  return `## Matriz de competências PACE ${MATRIZ_VERSION}
Avalie os 30 descritores abaixo, uma única vez cada. N3 é a meta; N4 sustenta N3 e acrescenta o comportamento de referência descrito. A dificuldade do cliente não altera a rubrica. Avalie condutas, sem inferir personalidade, exigir extroversão, descoberta de itens ocultos ou fechamento da venda como condição de nível alto.
Preencha Matriz com versao e descritores. Cada descritor tem codigo, nivel (1, 2, 3, 4 ou null), justificativa (até 240 caracteres) e evidencias (até duas citações literais, até 350 caracteres cada).
Cada citacao precisa ser um trecho CONTÍNUO copiado exatamente do texto original, com a mesma pontuação e capitalização. Nunca resuma, una partes separadas ou acrescente reticências (... ou …). Se a fala for longa, copie um trecho menor; para duas partes distintas, use dois objetos em evidencias. Uma citação abreviada ou reescrita invalida o relatório.
Evidências da conversa usam origem="conversa" e o turno da fala do VENDEDOR. Evidências do plano usam origem="planejamento" e turno=null. Não use falas do cliente, briefing ou gabarito como se fossem ações do vendedor. Uma omissão deve ser justificada pelo contexto observado e ancorada em uma fala pertinente, sem inventar uma citação do comportamento ausente.
PL1–PL6 são avaliados exclusivamente no planejamento enviado ANTES da conversa. Planejamento proposto é evidência de preparo, nunca de execução da venda. Intenções vagas não atendem N3. Não pontue planejamento retrospectivamente pela conversa.
Se não houve oportunidade de observar, use nivel=null, evidencias=[] e explique o limite. E5 e E6 devem SEMPRE ficar null: esta simulação cobre a reunião inicial, não a execução posterior. Prometer acompanhamento é evidência de E3/E4, nunca de E5/E6. Não confunda ausência de oportunidade com lacuna demonstrada numa situação que exigiu o comportamento.
Considere contexto e relevância: análise breve pode ser adequada ao cliente informado. A mesma evidência pode sustentar comportamentos distintos apenas se a justificativa mostrar o que foi observado em cada descritor.
Não gere P, A, C, E, Media nem Violacoes: o servidor calcula notas a partir dos níveis observados. Os textos Preparacao, Analise, Cocriacao, Engajamento e Resumo devem explicar os comportamentos, sem inventar números. Recomendações apontam descritores prioritários e uma ação prática para avançar.

${COMPETENCIAS_PACE.map(
  (c) =>
    `${c.nome}: ${c.descricao}\n${c.descritores
      .map(
        (d) =>
          `${d.codigo} — ${d.nome}: ${d.descricao}\nN1: ${d.niveis.n1}\nN2: ${d.niveis.n2}\nN3: ${d.niveis.n3}\nN4: ${d.niveis.n4}`,
      )
      .join('\n\n')}`,
).join('\n\n')}
`;
}
