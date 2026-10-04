/**
 * SAÍDA DE IA SEM TRAVESSÃO (R-57, 04/10/2026).
 *
 * A regra de voz da Vertho é "sem travessão". Só o prompt de redação do
 * fechamento a declarava; os demais prompts de texto ao cliente traziam o
 * caractere em exemplos e em frases de molde, e o modelo copia o exemplo mais
 * do que obedece à prosa. Aqui moram as duas peças que faltavam:
 *
 *   1. UM sanitizador (`tirarTravessao`), puro e determinístico, que troca o
 *      travessão usado como pausa por vírgula, dois-pontos ou ponto, sem tocar
 *      em hífen, em intervalo numérico ("3-5", "N1-N4"), em citação entre aspas
 *      nem em bloco estruturado ([META]...[/META]);
 *   2. o REGISTRO das tarefas cujo texto chega ao cliente (`SAIDAS_AO_CLIENTE`),
 *      lido pelo wrapper de IA (`actions/ai-client.ts`): para essas tarefas o
 *      wrapper acrescenta a regra ao system e passa a resposta pelo sanitizador.
 *      Ponto único: call-site novo com a mesma `taskKey` já nasce coberto.
 *
 * 🔴 O QUE FICA DE FORA, DE PROPÓSITO (cada uma com a causa medida):
 *   · Tarefa que ecoa nome ou trecho da entrada e depois o COMPARA com a fonte.
 *     `sem14_scorer` devolve o `descritor` e o código o casa por nome
 *     (`normDescritor`), e 2 dos 2.151 descritores da base se chamam
 *     "Feedback <travessão> receber e aplicar": trocar a pontuação do eco quebraria o
 *     casamento. O texto do scorer que a pessoa lê é limpo na LEITURA
 *     (`resumoSemTravessao`). Simuladores e IA4 conferem citação literal por
 *     código e ficam fora pelo mesmo motivo.
 *   · Geração em lote (`lib/ai-batch.ts`: kit, conteúdos, roteiros): não passa
 *     pelo wrapper.
 *
 * Em JSON, o sanitizador percorre só os VALORES de texto (a chave nunca muda) e
 * preserva o string que for ECO exato da entrada: nome de cargo, de pessoa ou de
 * descritor que a IA devolveu como veio.
 */

/** Travessão longo, travessão médio e barra horizontal: o que um modelo usa como pausa. */
const D = '[\\u2013\\u2014\\u2015]';
const TEM_TRAVESSAO = new RegExp(D);
/** Mesmo caractere escrito como escape JSON (`\u2014`), que o modelo às vezes emite. */
const TEM_TRAVESSAO_OU_ESCAPE = /[\u2013\u2014\u2015]|\\u201[345]/i;

/**
 * Trechos que o sanitizador NÃO toca: bloco estruturado `[TAG]...[/TAG]` (o [META]
 * das conversas é JSON lido por código), código inline, citação entre aspas (a
 * fala literal da pessoa; a mesma regra de `redacao-sem-genero`) e linhas de
 * citação em bloco (`> ...`).
 */
const TRECHO_PROTEGIDO = /\[([A-Z][A-Z0-9_]*)\][\s\S]*?\[\/\1\]|"[^"\n]*"|“[^”\n]*”|«[^»\n]*»|`[^`\n]*`|^[ \t]*>[^\n]*(?:\n[ \t]*>[^\n]*)*/gm;

/** Área de uso privado do Unicode: guarda o lugar de cada trecho protegido. */
const PUA_INICIO = 0xE000;
const PUA_FIM = 0xF8FF;
const TEM_PUA = /[-]/;

function tirarDaLinha(linha: string): string {
  if (!TEM_TRAVESSAO.test(linha)) return linha;
  // Linha só de traços: é uma régua horizontal do markdown.
  if (new RegExp(`^\\s*${D}{2,}\\s*$`).test(linha)) return linha.replace(new RegExp(`${D}+`), '---');
  // Valor que é só um traço ("sem dado"): vira hífen e continua não vazio.
  if (new RegExp(`^\\s*${D}\\s*$`).test(linha)) return linha.replace(new RegExp(D), '-');

  let s = linha;
  // Intervalo numérico colado ("10\u201315", "2020\u20142024") e faixa com letra ("N1\u2013N4").
  s = s.replace(new RegExp(`(\\p{N})${D}(?=\\p{N})`, 'gu'), '$1-');
  s = s.replace(/([\p{L}\p{N}])[\u2013\u2015](?=[\p{L}\p{N}])/gu, '$1-');
  // Faixa com espaços só no travessão médio ("N1 \u2013 N4", "3 \u2013 5"); o longo é pausa.
  s = s.replace(/(?<![\p{L}\p{N}])(\p{L}{0,3}\p{N}+)[ \t]+\u2013[ \t]+(?=\p{L}{0,3}\p{N})/gu, '$1-');
  // Código da matriz seguido de travessão ("COO03_D5 <t> Busca de apoio"): hífen, que
  // é o separador que `normDescritor` e `semCodigoDaMatriz` também aceitam.
  s = s.replace(new RegExp(`(?<![\\p{L}\\p{N}_])([A-Z]{2,5}\\d{1,3}_[A-Z]\\d+)[ \\t]*${D}[ \\t]*`, 'gu'), '$1 - ');
  // Início de linha: marcador de lista ou de fala. Fica como hífen, que o
  // markdown ainda lê como item.
  s = s.replace(new RegExp(`^([ \\t]*)${D}[ \\t]*(?=\\S)`, 'u'), '$1- ');
  // Rótulo: título "## A <t> B" e negrito de abertura "**A** <t> B" viram "A: B".
  if (/^[ \t]*#{1,6}[ \t]/.test(s)) s = s.replace(new RegExp(`[ \\t]*${D}[ \\t]*`, 'u'), ': ');
  s = s.replace(new RegExp(`^([ \\t]*(?:[-*+][ \\t]+|\\d+[.)][ \\t]+)?\\*\\*[^*\\n]+\\*\\*)[ \\t]*${D}[ \\t]*`, 'u'), '$1: ');
  // Depois de abre-parêntese ou abre-aspas: some.
  s = s.replace(new RegExp(`([(\\[\\u201C\\u00AB])[ \\t]*${D}[ \\t]*`, 'gu'), '$1');
  // No fim da linha ou antes de pontuação de fecho: some.
  s = s.replace(new RegExp(`[ \\t]*${D}[ \\t]*(?=[)\\]\\u201D\\u00BB.,;:!?]|$)`, 'gu'), '');
  // Depois de pontuação ("fim. <t> Começo"): a pontuação já faz a pausa.
  s = s.replace(new RegExp(`([.!?:;,\\u2026])[ \\t]*${D}[ \\t]*`, 'gu'), '$1 ');
  // Célula de tabela markdown vazia.
  s = s.replace(new RegExp(`(\\|[ \\t]*)${D}(?=[ \\t]*\\|)`, 'gu'), '$1-');
  // O resto é pausa no meio da frase: vírgula. Cobre o par "A <t> e só A <t> resolve".
  s = s.replace(new RegExp(`[ \\t]*${D}[ \\t]*`, 'gu'), ', ');
  // Arrumação do que a troca pode ter deixado: ", ," e " ,".
  return s.replace(/,(?:[ \t]*,)+/g, ',').replace(/[ \t]+,/g, ',');
}

/**
 * Troca o travessão usado como pausa. Intervalos e hífen ficam; citação entre
 * aspas e bloco `[TAG]...[/TAG]` ficam exatamente como vieram. Idempotente.
 */
export function tirarTravessao(texto: string, opcoes: { semProtecao?: boolean } = {}): string {
  if (typeof texto !== 'string' || !TEM_TRAVESSAO.test(texto)) return texto;
  // Sem área privada livre não dá para guardar lugar de trecho protegido: não protege.
  const protegidos: string[] = [];
  const usaProtecao = !opcoes.semProtecao && !TEM_PUA.test(texto);
  const guardado = usaProtecao
    ? texto.replace(TRECHO_PROTEGIDO, (trecho) => {
        if (PUA_INICIO + protegidos.length > PUA_FIM) return trecho;
        protegidos.push(trecho);
        return String.fromCharCode(PUA_INICIO + protegidos.length - 1);
      })
    : texto;
  const limpo = guardado.split(/(\r\n|\n|\r)/).map((p, i) => (i % 2 ? p : tirarDaLinha(p))).join('');
  return usaProtecao
    ? limpo.replace(/[-]/g, (c) => protegidos[c.charCodeAt(0) - PUA_INICIO] ?? c)
    : limpo;
}

export interface OpcoesTravessao {
  /** `true` para o texto que é eco da entrada e tem de ficar como veio. */
  eco?: (texto: string) => boolean;
}

/** Percorre objetos e listas e limpa só os valores de texto. A chave nunca muda. */
export function tirarTravessaoDeValor<T>(valor: T, opcoes: OpcoesTravessao = {}): T {
  if (typeof valor === 'string') {
    if (!TEM_TRAVESSAO.test(valor)) return valor;
    // Só um traço é "sem dado", não é eco de nada: vira hífen.
    if (new RegExp(`^\\s*${D}+\\s*$`).test(valor)) return tirarTravessao(valor) as unknown as T;
    if (opcoes.eco?.(valor)) return valor;
    return tirarTravessao(valor) as unknown as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => tirarTravessaoDeValor(v, opcoes)) as unknown as T;
  if (valor && typeof valor === 'object') {
    const proto = Object.getPrototypeOf(valor);
    if (proto !== Object.prototype && proto !== null) return valor;
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, tirarTravessaoDeValor(v, opcoes)]),
    ) as T;
  }
  return valor;
}

/**
 * Resposta em JSON (com ou sem cerca de código e preâmbulo): limpa os valores de
 * texto e devolve o MESMO texto de entrada com o JSON reescrito. Se nada mudou,
 * devolve o original byte a byte. JSON que não fecha (resposta cortada) cai no
 * sanitizador de texto, que nunca emite aspas nem barra invertida.
 */
export function tirarTravessaoDeJson(bruto: string, opcoes: OpcoesTravessao = {}): string {
  if (typeof bruto !== 'string' || !TEM_TRAVESSAO_OU_ESCAPE.test(bruto)) return bruto;
  const ini = bruto.search(/[{[]/);
  const fim = Math.max(bruto.lastIndexOf('}'), bruto.lastIndexOf(']'));
  if (ini >= 0 && fim > ini) {
    try {
      const antes = JSON.parse(bruto.slice(ini, fim + 1));
      const depois = tirarTravessaoDeValor(antes, opcoes);
      const novo = JSON.stringify(depois);
      if (novo === JSON.stringify(antes)) return bruto;
      return tirarTravessao(bruto.slice(0, ini)) + novo + tirarTravessao(bruto.slice(fim + 1));
    } catch {
      // cai no texto
    }
  }
  // Aqui as aspas são delimitador de string JSON, e não fala citada: sem proteção.
  return tirarTravessao(bruto, { semProtecao: true });
}

// ── Registro: quais tarefas escrevem texto que o cliente lê ─────────────────

export type FormaDaSaida = 'texto' | 'json';

/**
 * `taskKey` → forma da resposta do modelo. As conversas devolvem texto corrido
 * (alguns turnos trazem um [META] que fica intocado); as demais devolvem JSON.
 * Entrar aqui é decisão com critério (ver o cabeçalho): a tarefa não pode
 * conferir o que ecoa contra uma fonte nem pedir citação literal.
 *
 * Fora, de propósito: `sem14_scorer`, `ia4_avaliacao`, `arguicao_avaliacao`,
 * extratores de evidência e os simuladores (citação literal conferida por código).
 */
export const SAIDAS_AO_CLIENTE: Readonly<Record<string, FormaDaSaida>> = {
  // Conversas da jornada e do mapeamento (texto corrido)
  evidencias_socratic: 'texto',
  evidencias_analytic: 'texto',
  missao_feedback: 'texto',
  sem13_qualitativa: 'texto',
  conversa_fase3: 'texto',
  arguicao_turno: 'texto',
  // Apoio da semana e Beto no aplicativo
  tira_duvidas: 'texto',
  beto: 'texto',
  // Roteiro de áudio da devolutiva comportamental (vai para a voz)
  devolutiva_comportamental: 'texto',
  // Documentos e mensagens em JSON
  sem14_redacao: 'json',
  pdi_individual: 'json',
  relatorio_gestor: 'json',
  relatorio_rh: 'json',
  relatorio_comportamental: 'json',
  suporte_whatsapp: 'json',
};

export function formaDaSaidaAoCliente(taskKey?: string | null): FormaDaSaida | null {
  if (!taskKey || !Object.prototype.hasOwnProperty.call(SAIDAS_AO_CLIENTE, taskKey)) return null;
  return SAIDAS_AO_CLIENTE[taskKey];
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Eco = o texto inteiro aparece na entrada (sem acento, caixa nem espaço extra). */
function ecoDe(referencias: ReadonlyArray<string | null | undefined>): (texto: string) => boolean {
  const entrada = semAcento(referencias.filter((r): r is string => typeof r === 'string').join('\n'));
  return (texto) => {
    const alvo = semAcento(texto);
    return alvo.length >= 3 && entrada.includes(alvo);
  };
}

/**
 * Aplica ao que o wrapper devolveu a regra da tarefa. Tarefa fora do registro:
 * a resposta passa intacta. `referencias` é a ENTRADA de dados da chamada (user e
 * prefixo cacheado), contra a qual o JSON confere o que é eco.
 */
export function sanitizarSaidaDaTarefa(
  taskKey: string | null | undefined,
  bruto: string,
  referencias: ReadonlyArray<string | null | undefined> = [],
): string {
  const forma = formaDaSaidaAoCliente(taskKey);
  if (!forma || typeof bruto !== 'string') return bruto;
  if (forma === 'texto') return tirarTravessao(bruto);
  return tirarTravessaoDeJson(bruto, { eco: ecoDe(referencias) });
}

// ── Leitura: texto novo e antigo que a pessoa lê, sem mexer na nota ──────────

/**
 * O `resumo_avaliacao` do fechamento com os textos AUTORAIS sem travessão:
 * devolutiva, avanço, atenção, fecho e próximos passos. `evidencias_citadas` são
 * a fala da própria pessoa e passam intactas. Vale para o texto já gravado, e é
 * por aqui, e não pelo wrapper, que o scorer é coberto (ver o cabeçalho).
 */
export function resumoSemTravessao<T>(resumo: T): T {
  if (typeof resumo === 'string') return tirarTravessao(resumo) as unknown as T;
  if (!resumo || typeof resumo !== 'object' || Array.isArray(resumo)) return resumo;
  const r = resumo as Record<string, unknown>;
  const autorais = ['mensagem_geral', 'principal_avanco', 'principal_ponto_de_atencao', 'mensagem_final'];
  return {
    ...r,
    ...Object.fromEntries(autorais.filter((c) => c in r).map((c) => [c, typeof r[c] === 'string' ? tirarTravessao(r[c] as string) : r[c]])),
    ...('proximos_passos' in r && Array.isArray(r.proximos_passos)
      ? { proximos_passos: r.proximos_passos.map((p) => (typeof p === 'string' ? tirarTravessao(p) : p)) }
      : {}),
  } as T;
}
