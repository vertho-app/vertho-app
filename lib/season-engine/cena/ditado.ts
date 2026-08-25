/**
 * DITAÇÃO — o interlocutor entregou o elemento, ou só o cobrou?
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * A cena mede liderança fazendo alguém resistir do outro lado. Só que um modelo
 * treinado para ajudar não resiste — ele ENSINA. E ensinar aqui tem uma forma
 * específica e cara: dizer qual é o elemento que falta. "Me dá um nome, um
 * prazo e um indicador" é uma aula de como responder; quem preenche o molde
 * depois disso não demonstrou o hábito, demonstrou saber preencher molde.
 *
 * A régua da casa é "prompt pede, código garante". O prompt do interlocutor
 * proíbe ditar; ESTE arquivo é a parte que garante — sem IA, sem banco.
 *
 * ═══ A DISTINÇÃO QUE CUSTOU CARO ═══
 *
 * 🔴 Medido em 25/08/2026, auditando as 134 evidências da fase 0c contra a
 * transcrição: das 69 marcadas `provocado` pelo extrator, o elemento concreto
 * estava na fala anterior do interlocutor em **ZERO**. A flag tinha sido
 * definida como "PEDIDO **ou** entregue pronto", e *pedido* engoliu tudo — 76%
 * das evidências n2/n3 vinham marcadas.
 *
 * O que ela pegava era resposta a COBRANÇA:
 *
 *   > "Eu vou te encontrar toda sexta-feira, quinze minutos, pra você me contar
 *   >  como o Marcos tá"
 *
 * O interlocutor havia exigido acompanhamento — que é o beat 2 fazendo
 * exatamente o trabalho dele. O rito, o dia e a duração foram inventados pelo
 * avaliado. **Isso é o nível-meta da régua**, não o eco dele: ninguém define
 * meta e prazo no vácuo, define sob a pressão do cargo, e a cena É essa pressão.
 *
 * Por isso o teste aqui é LITERAL e não interpretativo: o elemento concreto da
 * citação já aparece na fala imediatamente anterior do interlocutor? Cobrar não
 * conta. Entregar conta.
 */

/**
 * Dias da semana saem da lista de nomes próprios: "Segunda" no começo da frase
 * é dia, não pessoa — e já entra pela via dos prazos.
 */
const DIAS = new Set(['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo']);

const semAcento = (t: string) =>
  String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Os "elementos concretos" que a régua chama de evidência: número, prazo, nome
 * de gente. Palavra comum NÃO entra — o teste é se o CONTEÚDO veio pronto, não
 * se as duas falas usam as mesmas preposições.
 */
export function elementosConcretos(texto: string): string[] {
  const s = String(texto ?? '');
  const numeros = s.match(/\b\d+([.,]\d+)?\b/g) ?? [];
  const porExtenso = semAcento(s).match(
    /\b(um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta)\b/g,
  ) ?? [];
  const dias = semAcento(s).match(/\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/g) ?? [];
  // Nome próprio: capitalizada que NÃO abre a frase (senão toda frase vira nome).
  const nomes = (s.match(/(?<![.!?]\s|^)\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}\b/g) ?? [])
    .map(semAcento)
    .filter((n) => !DIAS.has(n));
  return [...new Set([...numeros, ...porExtenso, ...dias, ...nomes])];
}

export type Veredito = 'ditado' | 'proprio' | 'sem_elemento';

/**
 * `ditado` — o elemento concreto da citação já estava na fala anterior do
 * interlocutor. É o único caso que limita a nota.
 *
 * `proprio` — o avaliado produziu o elemento. Vale integralmente, mesmo que
 * tenha sido sob cobrança.
 *
 * `sem_elemento` — a citação não tem número, prazo nem nome. Indecidível por
 * este teste, e é o que ele devolve: contar como "próprio" faria a taxa mentir
 * para baixo, e contar como "ditado" reprovaria cena boa.
 */
export function classificarCitacao(citacao: string, falaAnteriorDoInterlocutor: string | null): Veredito {
  const elementos = elementosConcretos(citacao);
  if (!elementos.length) return 'sem_elemento';
  if (!falaAnteriorDoInterlocutor) return 'proprio';
  const anterior = semAcento(falaAnteriorDoInterlocutor);
  return elementos.some((e) => anterior.includes(semAcento(e))) ? 'ditado' : 'proprio';
}

export interface FalaDaCena {
  role: 'user' | 'assistant';
  content: string;
  turno?: number;
}

/**
 * A última fala do INTERLOCUTOR antes do turno em que o avaliado falou.
 *
 * Casa pelo `turno` da mensagem do avaliado. Quando o histórico não carimba
 * turno (artefato antigo, debrief), devolve `null` — e `classificarCitacao`
 * trata isso como `proprio`, que é o lado seguro: sem a fala anterior não há
 * como acusar ditação, e acusar sem prova é pior do que não acusar.
 */
export function falaAnteriorDoInterlocutor(historico: FalaDaCena[], turnoDoAvaliado?: number | null): string | null {
  if (turnoDoAvaliado == null) return null;
  const i = historico.findIndex((m) => m.role === 'user' && m.turno === turnoDoAvaliado);
  if (i <= 0) return null;
  const anterior = historico.slice(0, i).reverse().find((m) => m.role === 'assistant');
  return anterior?.content ?? null;
}

export interface TaxaDeDitado {
  ditadas: number;
  proprias: number;
  semElemento: number;
  /** ditadas / (ditadas + próprias). `null` quando nada era decidível. */
  taxa: number | null;
}

export function medirDitado(
  evidencias: Array<{ citacao?: string; turno?: number | null }>,
  historico: FalaDaCena[],
): TaxaDeDitado {
  let ditadas = 0, proprias = 0, semElemento = 0;
  for (const ev of evidencias) {
    const v = classificarCitacao(ev.citacao ?? '', falaAnteriorDoInterlocutor(historico, ev.turno));
    if (v === 'ditado') ditadas++;
    else if (v === 'proprio') proprias++;
    else semElemento++;
  }
  const decidiveis = ditadas + proprias;
  return { ditadas, proprias, semElemento, taxa: decidiveis ? ditadas / decidiveis : null };
}

/**
 * Teto de ditação para uma cena de MEDIÇÃO.
 *
 * 0,20 e não 0,30: o teto de 0,30 tinha sido proposto contra a flag ANTIGA, que
 * marcava 76% das evidências — nesse denominador, qualquer teto abaixo de 0,76
 * invalidaria toda cena que já existiu, inclusive as boas. Sobre a definição
 * literal a linha de base medida é **0 de 59**, então 0,20 deixa folga real e
 * ainda assim pode disparar: basta o interlocutor voltar a entregar nomes e
 * números, que é exatamente o modo de falha que ele existe para não ter.
 *
 * Cena de ENSAIO não tem teto — lá ditar é o produto.
 */
export const TETO_DITADO = 0.2;
