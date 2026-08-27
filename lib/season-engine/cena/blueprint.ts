/**
 * BLUEPRINT DE ALCANÇABILIDADE — a cena consegue OBSERVAR este descritor?
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * 🔴 MEDIDO EM 25/08/2026, desagregando as 5 cenas do braço N3 da fase 0e:
 *
 *   D1 Desescalada              assistido 3,00   (N3 em 7 de 9 evidências)
 *   D2 Escuta imparcial         assistido 2,44
 *   D3 Identificação de causas  assistido 3,00
 *   D4 Mediação                 assistido 2,24   (N3 em 1 de 8)
 *   D5 Reparação                assistido 3,20
 *   D6 Prevenção                assistido 2,80
 *
 * Quatro descritores chegam ao nível-meta. Dois não saem do lugar — e são
 * exatamente aqueles cujo N3 exige **a outra parte na sala**:
 *
 *   D2 — "Escuta TODAS AS PARTES com neutralidade genuína"
 *   D4 — "constrói acordo com compromissos DE AMBOS"
 *
 * A cena tem a professora. A mãe não está lá. O avaliado consegue dizer que vai
 * ouvi-la e planejar a mediação; não consegue executá-las — e o extrator manda,
 * corretamente, que "falar sobre o comportamento não é ter o comportamento".
 *
 * Tirando D2 e D4, o braço N3 fecha em 3,00: exatamente o nível-meta. O "teto
 * do N3" que eu tinha declarado inadjudicável sem gente era isto, e custou zero
 * de IA para achar — bastava desagregar a média.
 *
 * ═══ O QUE ESTE ARQUIVO FAZ, E O QUE NÃO FAZ ═══
 *
 * Ele SUSPEITA, não decide. Devolve os descritores cujo texto de nível-meta
 * traz marcador de algo que uma conversa de 11 turnos não alcança, com o trecho
 * que disparou a suspeita, para um humano confirmar ou recusar.
 *
 * ⚠️ Não é gate, e a razão está registrada: um classificador de "natureza de
 * descritor" já foi tentado neste projeto e removido — ele lia `perguntas_alvo`,
 * que é o roteiro da conversa de evidências e é retrospectivo para TODO
 * descritor, e os 10 testes passavam porque foram alimentados com os mesmos
 * exemplos de onde os padrões saíram. Validar o instrumento contra ele mesmo.
 *
 * Aqui a diferença é de fonte e de papel: lê-se o TEXTO DO N3 (o que a pessoa
 * precisa fazer para estar no nível-meta), procurando marcadores explícitos de
 * multiplicidade e de duração — e o resultado é RELATÓRIO, do mesmo tipo da
 * triagem de competências. Quem decide qual descritor entra em qual cena é
 * humano, com a lista na frente.
 */

import type { DescritorDaRegua } from './prompts';

export type RiscoDeAlcance = 'exige_outra_parte' | 'exige_tempo';

/**
 * Marcadores de MULTIPLICIDADE: o comportamento-meta envolve mais de uma
 * pessoa presente. Numa cena 1:1 o avaliado só consegue prometer.
 */
const MARCADORES_OUTRA_PARTE: ReadonlyArray<readonly [string, RegExp]> = [
  ['todas as partes', /\btodas as partes\b/],
  ['ambas as partes', /\bambas as partes\b/],
  ['de ambos', /\bde ambos\b|\bde ambas\b/],
  ['as duas partes', /\bas duas partes\b|\bdas duas partes\b/],
  ['entre as partes', /\bentre as partes\b/],
  ['cada parte', /\bcada (uma das )?partes?\b/],
  ['os envolvidos', /\b(todos os )?envolvidos\b/],
  ['mediação/reciprocidade', /\bmedia[çc][ãa]o\b|\brec[íi]proc|\bm[úu]tu[ao]/],
];

/**
 * Marcadores de DURAÇÃO: o comportamento-meta acontece ao longo de semanas ou
 * meses. Uma conversa mostra a INTENÇÃO de instituí-lo, nunca o hábito.
 *
 * Esta classe já tinha aparecido no projeto, sem nome: "observa aulas com
 * critério e devolve ao professor" é comportamento que acontece sozinho ao
 * longo de meses, e nenhum instrumento situacional o alcança — a conclusão foi
 * registrada em 24/08 e depois esquecida ao montar os beats.
 */
const MARCADORES_TEMPO: ReadonlyArray<readonly [string, RegExp]> = [
  ['rotina', /\brotinas?\b/],
  ['periodicidade', /\b(mensal|semanal|quinzenal|bimestral|semestral|peri[óo]dic)/],
  ['recorrência', /\brecorrente|\bsistematicamente\b|\bregularmente\b/],
  ['ao longo do tempo', /\bao longo d[oa]s?\b|\bcom o tempo\b/],
  ['acompanhamento continuado', /\bacompanha(mento)? cont[íi]nu|\bcontinuad[ao]\b/],
];

export interface SuspeitaDeAlcance {
  indice: number;
  nomeCurto: string;
  risco: RiscoDeAlcance;
  /** O marcador que disparou — para o humano julgar a suspeita, não engolir. */
  marcador: string;
  /** O trecho do nível-meta onde ele apareceu. */
  trecho: string;
}

const semAcento = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Recorta ~60 caracteres em torno do casamento, para o relatório. */
function trechoEmVolta(texto: string, re: RegExp): string {
  const alvo = semAcento(texto);
  const m = alvo.match(re);
  if (!m || m.index == null) return texto.slice(0, 80);
  const ini = Math.max(0, m.index - 25);
  return (ini > 0 ? '…' : '') + texto.slice(ini, m.index + m[0].length + 45).trim() + '…';
}

/**
 * Lê o texto do NÍVEL-META de cada descritor e devolve as suspeitas.
 *
 * Vazio NÃO significa "todos alcançáveis" — significa que nenhum marcador
 * conhecido apareceu. A lista de marcadores é finita e foi escrita a partir de
 * um conjunto pequeno; ela erra por omissão, nunca por excesso, e é por isso
 * que o resultado é relatório e não gate.
 */
export function auditarAlcancabilidade(descritores: DescritorDaRegua[]): SuspeitaDeAlcance[] {
  const out: SuspeitaDeAlcance[] = [];
  for (const d of descritores) {
    const alvo = semAcento(d.n3);
    if (!alvo.trim()) continue;
    for (const [rotulo, re] of MARCADORES_OUTRA_PARTE) {
      if (re.test(alvo)) {
        out.push({ indice: d.indice, nomeCurto: d.nomeCurto, risco: 'exige_outra_parte', marcador: rotulo, trecho: trechoEmVolta(d.n3, re) });
        break;
      }
    }
    for (const [rotulo, re] of MARCADORES_TEMPO) {
      if (re.test(alvo)) {
        out.push({ indice: d.indice, nomeCurto: d.nomeCurto, risco: 'exige_tempo', marcador: rotulo, trecho: trechoEmVolta(d.n3, re) });
        break;
      }
    }
  }
  return out;
}

/**
 * O blueprint de uma cena, no formato que o desenho pede — e que hoje NÃO
 * existe em lugar nenhum do módulo: a cena é montada a partir do mapa
 * descritor↔beat da IA3, que diz o que se QUER medir, e nunca o que a cena
 * OFERECE para observar. Os dois foram tratados como a mesma coisa, e é daí
 * que sai a cobrança de 6/6 numa cena que só observa 4.
 */
export interface AlegacaoDoDescritor {
  indice: number;
  /** O que se quer inferir sobre a pessoa. */
  alegacao: string;
  /** A situação que OBRIGA o comportamento a aparecer. Sem ela, não se mede. */
  oportunidade: string;
  /** O que precisa aparecer na fala/ação para sustentar a alegação. */
  observavel: string;
  /** O que PARECE a competência e não é — o que o avaliador deve recusar. */
  evidenciaRival: string;
  /** Quando o descritor sai como lacuna declarada em vez de nota. */
  condicaoSemSinal: string;
  /** Quem precisa estar na cena para a oportunidade existir. */
  partesNecessarias: string[];
}

/**
 * Distingue as três coisas que a cena hoje trata como uma só.
 *
 * O extrator já sabe que "falar sobre o comportamento não é ter o
 * comportamento" — mas só tem dois baldes (fez / não fez). Numa conversa,
 * comprometer-se é um ato real e diferente de executar, e planejar é diferente
 * dos dois. Sem esta distinção, um descritor bilateral só pode produzir
 * compromisso, e compromisso lido como execução malfeita vira N2 por
 * construção — que é exatamente o teto medido em D2 e D4.
 */
export type NaturezaDaEvidencia = 'executada_na_cena' | 'compromisso_assumido' | 'plano_futuro';

/**
 * A cena pode rodar sem o alcance declarado?
 *
 * 🔴 Não, em medição — e a razão está medida. Enquanto isso era só um aviso no
 * script, o resultado foi `foraDoAlcance = []` em **12 de 12** consolidações:
 * a proteção nunca foi exercida uma vez, porque dependia de o operador lembrar
 * de uma flag opcional. Aviso que não bloqueia é aviso que não roda.
 *
 * Está aqui, e não inline no script, para poder ter teste. Guard que vive só
 * dentro de um `if` de CLI não é verificável — e este módulo já registrou
 * duas vezes que garantia sem teste é garantia que ninguém observou funcionar.
 *
 * Em ensaio é permitido: ali não sai nota, então não há o que contaminar.
 */
export function exigeAlcanceDeclarado(
  modo: 'medicao' | 'ensaio' | undefined,
  observaveis: number[] | undefined,
): boolean {
  if ((modo ?? 'medicao') !== 'medicao') return false;
  // Lista VAZIA é declaração ("não observa nada"), não ausência — a mesma
  // distinção que `consolidarCena` faz com `!== undefined`.
  return observaveis === undefined;
}
