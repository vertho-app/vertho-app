import { descritorParaHumano } from '@/lib/descritor-humano';
import { resumoSemTratamentoDeGenero, semTratamentoDeGenero } from '@/lib/redacao-sem-genero';

/**
 * Texto que entra no relatório da temporada (PDF e tela) do jeito que a pessoa
 * deve lê-lo: sem a abreviação "colab" e sem o código da matriz.
 *
 * 🔑 POR QUE (17/09/2026, revisão do relatório de evolução): "A colab conduziu
 * o Conselho de Classe…" saía na síntese de uma missão, dentro do documento que
 * a pessoa leva para casa. "colab" é vocabulário interno: os prompts de missão
 * o usam nas instruções, e o modelo às vezes o repete na saída (1 de 11
 * sínteses de um cliente, medido 17/09). O pedido foi escrever "colaborador(a)".
 *
 * A correção fica na LEITURA, não no prompt: vale para o que já está gravado e
 * não mexe no extrator que dá as notas (trocar prompt de pontuação por causa de
 * uma palavra arrisca a régua). O gênero fica neutro de propósito, porque o
 * modelo não sabe o da pessoa.
 *
 * 🔴 CÓDIGO DA MATRIZ NUNCA APARECE (dono, 17/09/2026): o PDF mostrava
 * "COO03_D1 — Consciência de limites" no título do comportamento. A tela já
 * limpava com `descritorParaHumano`; o PDF lia o campo cru. Medido 17/09: 12
 * descritores gravados em relatórios têm o código, e nenhum texto livre (síntese,
 * devolutiva, antes/depois) tem. A limpeza do texto livre fica mesmo assim, de
 * guarda: o custo de um código vazar é maior que o de uma regex.
 */

// `\b` do JavaScript não conhece letra acentuada ("à" não é word char), então
// as fronteiras são por classe Unicode.
const ANTES = '(?<![\\p{L}\\p{N}_])';
const DEPOIS = '(?![\\p{L}\\p{N}_])';

const TROCAS: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // artigo + abreviação: "A colab", "o colab" → "O(a) colaborador(a)"
  [new RegExp(`${ANTES}([AaOo]) colab${DEPOIS}`, 'gu'), (_m, art) => `${art === art.toUpperCase() ? 'O' : 'o'}(a) colaborador(a)`],
  [new RegExp(`${ANTES}([Dd])[ao] colab${DEPOIS}`, 'gu'), (_m, d) => `${d}o(a) colaborador(a)`],
  [new RegExp(`${ANTES}([Nn])[ao] colab${DEPOIS}`, 'gu'), (_m, n) => `${n}o(a) colaborador(a)`],
  [new RegExp(`${ANTES}([Pp])el[ao] colab${DEPOIS}`, 'gu'), (_m, p) => `${p}elo(a) colaborador(a)`],
  [new RegExp(`${ANTES}([Aa])o colab${DEPOIS}|${ANTES}([Àà]) colab${DEPOIS}`, 'gu'), (_m, a, crase) => `${(a || crase) === (a || crase).toUpperCase() ? 'A' : 'a'}o(à) colaborador(a)`],
  [new RegExp(`${ANTES}([Oo]|[Aa])s colabs${DEPOIS}`, 'gu'), (_m, art) => `${art === art.toUpperCase() ? 'O' : 'o'}s(as) colaboradores(as)`],
  [new RegExp(`${ANTES}colabs${DEPOIS}`, 'gu'), 'colaboradores(as)'],
  [new RegExp(`${ANTES}Colab${DEPOIS}`, 'gu'), 'Colaborador(a)'],
  [new RegExp(`${ANTES}colab${DEPOIS}`, 'gu'), 'colaborador(a)'],
];

/** `COO03_D6 — `, `(GES12_D3)`, `DIR7_D10` no meio de um texto. */
const CODIGO_NO_TEXTO = /\(?\b[A-Z]{2,5}\d{1,3}_[A-Z]\d+\b\)?(?:\s*[—–-]\s*)?/g;

export function semCodigoDaMatriz<T>(texto: T): T {
  if (typeof texto !== 'string' || !/[A-Z]{2,5}\d{1,3}_[A-Z]\d+/.test(texto)) return texto;
  return texto.replace(CODIGO_NO_TEXTO, '').replace(/ {2,}/g, ' ').replace(/ ([,.;:])/g, '$1').trim() as unknown as T;
}

export function semAbreviacaoColab<T>(texto: T): T {
  if (typeof texto !== 'string' || !/colabs?(?![\p{L}])/iu.test(texto)) return texto;
  let s: string = texto;
  for (const [re, por] of TROCAS) s = s.replace(re, por as any);
  return s as unknown as T;
}

/**
 * Os dados do relatório com os textos de IA já legíveis. Só os campos que viram
 * TEXTO para a pessoa; o resto passa intacto.
 */
export function textosDoRelatorio(dados: any): any {
  if (!dados) return dados;
  const t = <T,>(x: T): T => semTratamentoDeGenero(semCodigoDaMatriz(semAbreviacaoColab(x)));
  const er = dados.evolutionReport;
  return {
    ...dados,
    evolutionReport: er && {
      ...er,
      insight_geral: t(er.insight_geral),
      proximo_passo: t(er.proximo_passo),
      resumo_avaliacao: resumoSemTratamentoDeGenero(er.resumo_avaliacao),
      descritores: Array.isArray(er.descritores)
        ? er.descritores.map((d: any) => ({
          ...d,
          descritor: d?.descritor ? descritorParaHumano(d.descritor) : d?.descritor,
          antes: t(d?.antes), depois: t(d?.depois),
        }))
        : er.descritores,
    },
    momentos: Array.isArray(dados.momentos)
      ? dados.momentos.map((m: any) => ({
        ...m, insight: t(m?.insight), descritor: m?.descritor ? descritorParaHumano(m.descritor) : m?.descritor,
      }))
      : dados.momentos,
    missoes: Array.isArray(dados.missoes)
      ? dados.missoes.map((m: any) => ({ ...m, compromisso: t(m?.compromisso), sintese: t(m?.sintese) }))
      : dados.missoes,
    sem14: dados.sem14 && {
      ...dados.sem14,
      resumo_avaliacao: typeof dados.sem14.resumo_avaliacao === 'string'
        ? t(dados.sem14.resumo_avaliacao)
        : dados.sem14.resumo_avaliacao && {
          ...resumoSemTratamentoDeGenero(dados.sem14.resumo_avaliacao),
          mensagem_geral: t(dados.sem14.resumo_avaliacao.mensagem_geral),
        },
    },
  };
}
