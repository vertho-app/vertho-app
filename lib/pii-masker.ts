/**
 * Anonimização de PII antes de mandar pra IAs externas (Claude/Gemini/OpenAI).
 *
 * Estratégia "shift-left": o prompt recebe IDs opacos (COLAB_A3F2, EMPRESA_X) em
 * vez de nomes reais. O de-para fica local e serve para devolver o nome real à
 * saída da IA antes de a pessoa ler.
 *
 * 🔴 IDA e VOLTA são mapas SEPARADOS (R-05, 03/10/2026). Até aqui o mesmo mapa
 * servia aos dois sentidos (`{ [alias]: primeiroNome, [nomeCompleto]: alias }`),
 * e `maskTextPII` aplicava TODAS as entradas: trocava o nome completo pelo alias
 * e, em seguida, o alias pelo primeiro nome. O texto saía para a IA com o nome
 * da pessoa, e o primeiro nome sozinho ("Ana, você...") nunca era mascarado.
 * Agora `maskTextPII` lê só `ida` e `unmaskPII` lê só `volta`, então o mesmo
 * objeto pode ser passado aos dois sem que um desfaça o outro.
 */

export type PIIMap = Record<string, string>;

/** Os dois sentidos da máscara. Cada função lê só o seu. */
export interface PIIMapas {
  /** Texto real → identificador. Lido por `maskTextPII`. */
  ida: PIIMap;
  /** Identificador → texto real. Lido por `unmaskPII`. */
  volta: PIIMap;
}

export interface ColaboradorInput {
  id?: string;
  nome?: string;
  nome_completo?: string;
  email?: string;
  cargo?: string;
  [k: string]: unknown;
}

export interface EmpresaInput {
  id?: string;
  nome?: string;
  slug?: string;
  [k: string]: unknown;
}

export interface MaskedColaborador extends ColaboradorInput {
  nome: string;
  nome_completo: string;
  email: string | null;
}

export interface MaskedEmpresa extends EmpresaInput {
  nome: string;
  slug: string;
}

const MAPAS_VAZIOS = (): PIIMapas => ({ ida: {}, volta: {} });

/** Domínio dos e-mails-alias: o filtro genérico de e-mail não pode apagá-los. */
const DOMINIO_ALIAS = '@masked.local';

function hashStable(input: unknown): string {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Partículas que não formam, sozinhas, um "segundo nome" (Maria DO Socorro). */
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'del', 'la', 'di', 'van', 'von', 'y']);

/**
 * Primeiros nomes que também são palavras comuns no texto de trabalho (pt, es,
 * en). Para eles, o primeiro nome ISOLADO só é mascarado com inicial maiúscula:
 * "Clara, você..." vira alias, "uma comunicação clara" fica. Sem isto, quem se
 * chama Clara teria "comunicação COLAB_1A2B" na evidência avaliada, e a IA lê a
 * frase errada. O nome completo e as combinações de dois nomes continuam sem
 * restrição de caixa. Lista conservadora e explícita, conferida pela forma sem
 * acento; não é dicionário.
 */
const NOMES_QUE_SAO_PALAVRAS = new Set([
  // pt
  'clara', 'rosa', 'luz', 'paz', 'vitoria', 'gloria', 'graca', 'pilar', 'socorro', 'dores', 'aparecida',
  'amparo', 'mel', 'flor', 'celeste', 'franco', 'clemente', 'serena', 'bela', 'branca', 'lia', 'caio',
  'aurora', 'esperanca', 'fe', 'cruz', 'mar', 'sol', 'lua', 'estrela', 'neve', 'iris', 'justo', 'amado',
  // es
  'luna', 'rocio', 'soledad', 'consuelo', 'esperanza', 'dolores', 'mercedes', 'remedios', 'blanca',
  'victoria', 'paloma', 'cielo', 'alegria', 'rosario', 'angeles', 'milagros', 'pura', 'nieves',
  // en
  'will', 'mark', 'grace', 'hope', 'joy', 'faith', 'rose', 'may', 'june', 'dawn', 'ruby', 'pearl', 'sky',
  'bill', 'art', 'pat', 'holly', 'ivy', 'lily', 'daisy', 'violet', 'crystal', 'summer', 'amber', 'august',
]);

/** Letras-base e suas variantes acentuadas: "Joao" digitado casa com "João". */
const VARIANTES: Record<string, string> = {
  a: 'aáàâãä', e: 'eéèêë', i: 'iíìîï', o: 'oóòôõö', u: 'uúùûü', c: 'cç', n: 'nñ',
};

/** Classe de caracteres de UMA letra do nome: sem acento e sem caixa, salvo `soMaiuscula`. */
function classeDaLetra(ch: string, soMaiuscula: boolean): string {
  if (/\s/.test(ch)) return '\\s+';
  if (!/\p{L}/u.test(ch)) return escaparRegex(ch);
  const base = semAcento(ch).toLowerCase();
  const minusculas = VARIANTES[base] ?? ch.toLowerCase();
  const maiusculas = minusculas.toUpperCase();
  return `[${soMaiuscula ? maiusculas : minusculas + maiusculas}]`;
}

/**
 * Fronteira de palavra que funciona com acento. `\b` do JavaScript só conhece
 * `[A-Za-z0-9_]`: "Ana" casaria dentro de "Análise" pela esquerda e "Lúcia"
 * nunca teria fronteira à direita do "ú". A da esquerda também aceita um escape
 * de JSON (`\n`, `\t`...): texto serializado com `JSON.stringify` traz o nome
 * colado no "n" do `\n`, e sem isto ele passaria sem máscara.
 */
const ANTES = '(?:(?<=\\\\[nrtbf])|(?<![\\p{L}\\p{N}_]))';
const DEPOIS = '(?![\\p{L}\\p{N}_])';

function regexDoReal(real: string): RegExp {
  const texto = real.normalize('NFC').trim();
  const umaPalavra = !/\s/.test(texto);
  const soMaiuscula = umaPalavra && NOMES_QUE_SAO_PALAVRAS.has(semAcento(texto).toLowerCase());
  const corpo = [...texto].map((ch, i) => classeDaLetra(ch, soMaiuscula && i === 0)).join('');
  return new RegExp(`${ANTES}${corpo}${DEPOIS}`, 'gu');
}

/** O alias volta mesmo se a IA trocar o `_` por espaço ou hífen, ou mudar a caixa. */
function regexDoAlias(alias: string): RegExp {
  return new RegExp(escaparRegex(alias).replace(/_/g, '[_\\s-]?'), 'gi');
}

/** Do mais longo ao mais curto: o nome completo sai antes do primeiro nome que ele contém. */
const doMaisLongo = (m: PIIMap) =>
  Object.entries(m).filter(([k, v]) => k && v).sort((a, b) => b[0].length - a[0].length);

/**
 * Formas do nome que identificam a pessoa sozinhas: o nome completo, o nome
 * composto ("Ana Beatriz", "Maria do Socorro"), primeiro + último ("Ana Souza")
 * e o primeiro nome. Inicial solta não entra.
 */
function formasDoNome(nome: string): string[] {
  const partes = nome.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return [];
  const formas = new Set<string>([partes.join(' ')]);
  if (partes.length >= 2) {
    let fim = 1;
    while (fim < partes.length && PARTICULAS.has(partes[fim].toLowerCase())) fim++;
    if (fim < partes.length) formas.add(partes.slice(0, fim + 1).join(' '));
    formas.add(`${partes[0]} ${partes[partes.length - 1]}`);
  }
  if (partes[0].length >= 2) formas.add(partes[0]);
  return [...formas];
}

/**
 * Mascara PII de um colaborador pra uso no prompt.
 * Mantém cargo/perfil (contextuais, não identificáveis).
 *
 * `map.volta` devolve o PRIMEIRO nome: a IA escreve para a pessoa ("COLAB_1A2B,
 * você...") e é o primeiro nome que ela deve ler.
 */
export function maskColaborador(
  colab: ColaboradorInput | null | undefined,
): { masked: MaskedColaborador | null; map: PIIMapas } {
  if (!colab) return { masked: null, map: MAPAS_VAZIOS() };
  const idBase = colab.id || colab.email || colab.nome_completo || colab.nome || 'unknown';
  const alias = `COLAB_${hashStable(idBase)}`;
  const email = typeof colab.email === 'string' ? colab.email.trim() : '';
  const emailAlias = email ? `${alias.toLowerCase()}${DOMINIO_ALIAS}` : null;
  const nome = String(colab.nome_completo || colab.nome || '').trim();
  const primeiroNome = nome.split(/\s+/)[0] || '';

  const ida: PIIMap = {};
  if (email && emailAlias) ida[email] = emailAlias;
  for (const forma of formasDoNome(nome)) ida[forma] = alias;

  const volta: PIIMap = {};
  if (primeiroNome) volta[alias] = primeiroNome;
  if (email && emailAlias) volta[emailAlias] = email;

  return {
    masked: {
      ...colab,
      nome: alias,
      nome_completo: alias,
      email: emailAlias,
    },
    map: { ida, volta },
  };
}

/**
 * Mascara PII de uma empresa.
 */
export function maskEmpresa(
  empresa: EmpresaInput | null | undefined,
): { masked: MaskedEmpresa | null; map: PIIMapas } {
  if (!empresa) return { masked: null, map: MAPAS_VAZIOS() };
  const alias = `EMPRESA_${hashStable(empresa.id || empresa.nome || 'x')}`;
  const nome = String(empresa.nome || '').trim();
  return {
    masked: { ...empresa, nome: alias, slug: alias.toLowerCase() },
    map: { ida: nome ? { [nome]: alias } : {}, volta: nome ? { [alias]: nome } : {} },
  };
}

/** Junta mapas de origens diferentes (colaborador + empresa). */
export function juntarMapas(...mapas: Array<PIIMapas | null | undefined>): PIIMapas {
  const out = MAPAS_VAZIOS();
  for (const m of mapas) {
    if (!m) continue;
    Object.assign(out.ida, m.ida);
    Object.assign(out.volta, m.volta);
  }
  return out;
}

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Telefones BR (com/sem DDD, com/sem traço).
// Não consumir apenas um pedaço de CNPJ/identificador de 14 dígitos.
const RE_TELEFONE = /(?<!\d)(?:\+?55[\s.-]?)?\(?[1-9]\d\)?[\s.-]?(?:9\d{4}|\d{4})[-\s]?\d{4}(?!\d)/g;
const RE_CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;

/**
 * Sanitiza texto livre (transcripts, relatos) antes de ir à IA.
 *
 * Ordem: (1) o e-mail cadastrado da pessoa vira o e-mail-alias; (2) qualquer
 * outro e-mail, telefone e CPF viram marcadores genéricos; (3) as formas do
 * nome viram o alias, da mais longa à mais curta, com fronteira de palavra que
 * entende acento. NÃO detecta nomes próprios de terceiros (NER sem modelo dá
 * falso positivo demais).
 *
 * Sem `mapas`, só o passo (2).
 */
export function maskTextPII(texto: string | null | undefined, mapas?: PIIMapas | null): string {
  if (!texto) return texto || '';
  let out = String(texto).normalize('NFC');
  const ida = doMaisLongo(mapas?.ida ?? {});
  const emails = ida.filter(([real]) => real.includes('@'));
  const nomes = ida.filter(([real]) => !real.includes('@'));

  for (const [real, alias] of emails) {
    // Só o e-mail inteiro: "xana@exemplo.com" é outro endereço, e cai no genérico.
    out = out.replace(new RegExp(`(?<![\\w.+-])${escaparRegex(real)}(?![\\w-])`, 'gi'), () => alias);
  }
  out = out.replace(RE_EMAIL, (m) => (m.toLowerCase().endsWith(DOMINIO_ALIAS) ? m : '[email]'));
  out = out.replace(RE_TELEFONE, '[telefone]');
  out = out.replace(RE_CPF, '[cpf]');
  for (const [real, alias] of nomes) {
    out = out.replace(regexDoReal(real), () => alias);
  }
  return out;
}

/**
 * Inverte o mascaramento na resposta da IA antes de exibir ou gravar o que a
 * pessoa lê. Troca cada identificador pelo valor real (`map.volta`).
 */
export function unmaskPII(texto: string | null | undefined, mapas?: PIIMapas | null): string {
  if (!texto || !mapas) return texto || '';
  let out = String(texto);
  for (const [alias, real] of doMaisLongo(mapas.volta ?? {})) {
    out = out.replace(regexDoAlias(alias), () => real);
  }
  return out;
}

function mapearTextos(valor: unknown, fn: (s: string) => string): unknown {
  if (typeof valor === 'string') return fn(valor);
  if (Array.isArray(valor)) return valor.map((v) => mapearTextos(v, fn));
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) out[k] = mapearTextos(v, fn);
    return out;
  }
  return valor;
}

/**
 * Cópia com TODO texto do objeto mascarado (chaves intactas). Para JSON que vai
 * ao prompt: mascarar o `JSON.stringify` inteiro funciona, mas esta é a forma
 * que não depende de como o serializador escapa o texto.
 */
export function maskDeepPII<T>(valor: T, mapas?: PIIMapas | null): T {
  return mapearTextos(valor, (s) => maskTextPII(s, mapas)) as T;
}

/** Cópia com todo texto do objeto desmascarado. Para JSON que a IA devolve. */
export function unmaskDeepPII<T>(valor: T, mapas?: PIIMapas | null): T {
  if (!mapas) return valor;
  return mapearTextos(valor, (s) => unmaskPII(s, mapas)) as T;
}

/**
 * Wrapper helper: prepara payload mascarado pra prompt.
 */
export function prepararPayloadMascarado({
  colaborador,
  empresa,
  textos = {},
}: {
  colaborador: ColaboradorInput | null;
  empresa: EmpresaInput | null;
  textos?: Record<string, string>;
}): {
  colaborador: MaskedColaborador | null;
  empresa: MaskedEmpresa | null;
  textos: Record<string, string>;
  map: PIIMapas;
} {
  const { masked: mColab, map: mapColab } = maskColaborador(colaborador);
  const { masked: mEmp, map: mapEmp } = maskEmpresa(empresa);
  const mapGlobal = juntarMapas(mapColab, mapEmp);
  const textosMascarados: Record<string, string> = {};
  for (const [k, v] of Object.entries(textos)) {
    textosMascarados[k] = maskTextPII(v, mapGlobal);
  }
  return {
    colaborador: mColab,
    empresa: mEmp,
    textos: textosMascarados,
    map: mapGlobal,
  };
}
