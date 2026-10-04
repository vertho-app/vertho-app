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
 * ALARME DE VOCABULÁRIO do texto que a pessoa lê (R-37, 04/10/2026).
 *
 * A devolutiva do fechamento abre o relatório da pessoa. No modo regular ela só
 * tinha a regra de "não citar o instrumento" no fecho; "regressão", "queda" e o
 * número da nota só eram proibidos no piloto, e o prompt do scorer chegava a dizer
 * "Regressão é possível". A decisão do dono é que a evolução é só avanço e que
 * ninguém do cliente vê nota decimal. A regra do PROMPT é a primeira camada; esta
 * é a segunda: um detector puro que olha o texto PRONTO e diz o que apareceu, para
 * o fechamento registrar a degradação em vez de a frase passar calada.
 *
 * `Medido: 04/10/2026` (leitura no banco): 0 de 15 devolutivas gravadas e 0 de 62
 * relatórios de evolução têm esse vocabulário. É prevenção, não reparo.
 *
 * O texto é comparado SEM acento e em minúsculas, e as fronteiras de palavra são
 * as do ASCII (depois da normalização `\b` serve: ver a regra do `\b` em CLAUDE.md).
 * Falso positivo é aceitável (alarme, não bloqueio); falso negativo não.
 */
const VOCABULARIO_PROIBIDO: Array<[string, RegExp]> = [
  ['regressão', /\bregress(?:ao|oes)\b|\bregred(?:iu|iram|ir|indo)\b/],
  ['queda', /\bquedas?\b|\bcaiu\b|\bcairam\b/],
  ['piora', /\bpior(?:a|ar|am|aram|ando|ou)\b/],
  ['retrocesso', /\bretrocess(?:o|os)\b|\bretrocedeu\b/],
  ['desaprendeu', /\bdesaprend(?:eu|eram|er)\b/],
  [
    'nota numérica',
    /\bnota\s+(?:final\s+|inicial\s+)?(?:de\s+)?[1-4](?:[.,]\d+)?\b|\bmedia\s+(?:geral\s+)?(?:de\s+)?[1-4][.,]\d|\b[1-4][.,]\d{1,2}\s*(?:\/|de)\s*4\b/,
  ],
];

/** Os termos proibidos que aparecem nos textos (cada um uma vez, na ordem da lista). */
export function vocabularioProibido(...textos: unknown[]): string[] {
  const alvo = textos
    .flatMap((t) => (Array.isArray(t) ? t : [t]))
    .filter((t): t is string => typeof t === 'string')
    .join('\n')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return VOCABULARIO_PROIBIDO.filter(([, padrao]) => padrao.test(alvo)).map(([rotulo]) => rotulo);
}

/**
 * Os termos proibidos no `resumo_avaliacao` PUBLICADO. Só os textos AUTORAIS (devolutiva,
 * avanço, atenção, fecho, passos): `evidencias_citadas` são trechos da fala da
 * própria pessoa e não entram, ela pode ter escrito "queda" sobre o cenário dela.
 */
export function vocabularioProibidoNoResumo(resumo: any): string[] {
  if (!resumo || typeof resumo !== 'object') return typeof resumo === 'string' ? vocabularioProibido(resumo) : [];
  return vocabularioProibido(
    resumo.mensagem_geral, resumo.principal_avanco, resumo.principal_ponto_de_atencao,
    resumo.mensagem_final, resumo.proximos_passos,
  );
}

/**
 * Os dados do relatório com os textos de IA já legíveis. Só os campos que viram
 * TEXTO para a pessoa; o resto passa intacto.
 */
export function textosDoRelatorio(dados: any): any {
  if (!dados) return dados;
  const t = <T,>(x: T): T => semTratamentoDeGenero(semCodigoDaMatriz(semAbreviacaoColab(x)));
  /**
   * O resumo do fechamento com TODOS os campos que a pessoa lê já legíveis.
   *
   * 🔑 `mensagem_final` e `proximos_passos` (17/09/2026) precisam do `t()` como
   * a `mensagem_geral`, e não só da revisão de gênero: são prosa nova sobre a
   * prática da pessoa, então é exatamente onde um `COO03_D2` do nome do
   * descritor apareceria no papel.
   */
  const resumoLegivel = (r: any): any => {
    if (!r) return r;
    if (typeof r === 'string') return t(r);
    return {
      ...resumoSemTratamentoDeGenero(r),
      mensagem_geral: t(r.mensagem_geral),
      mensagem_final: t(r.mensagem_final),
      proximos_passos: Array.isArray(r.proximos_passos) ? r.proximos_passos.map((p: any) => t(p)) : r.proximos_passos,
    };
  };
  const er = dados.evolutionReport;
  return {
    ...dados,
    evolutionReport: er && {
      ...er,
      insight_geral: t(er.insight_geral),
      proximo_passo: t(er.proximo_passo),
      resumo_avaliacao: resumoLegivel(er.resumo_avaliacao),
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
      resumo_avaliacao: resumoLegivel(dados.sem14.resumo_avaliacao),
    },
  };
}
