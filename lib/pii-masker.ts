/**
 * Anonimização de PII antes de mandar pra IAs externas (Claude/Gemini/OpenAI).
 *
 * Estratégia "shift-left": o prompt recebe IDs opacos (COLAB_A3F2, CLIENTE_X) em
 * vez de nomes reais. O "de-para" (map) fica local e pode ser usado pra
 * despersonalizar a saída da IA antes de exibir ao usuário.
 */

export type PIIMap = Record<string, string>;

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

function hashStable(input: unknown): string {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
}

/**
 * Mascara PII de um colaborador pra uso no prompt.
 * Mantém cargo/perfil (contextuais, não identificáveis).
 */
export function maskColaborador(
  colab: ColaboradorInput | null | undefined,
): { masked: MaskedColaborador | null; map: PIIMap } {
  if (!colab) return { masked: null, map: {} };
  const idBase = colab.id || colab.email || colab.nome_completo || colab.nome || 'unknown';
  const alias = `COLAB_${hashStable(idBase)}`;
  const emailAlias = colab.email ? `${alias.toLowerCase()}@masked.local` : null;
  const nome = colab.nome_completo || colab.nome;
  const primeiroNome = (nome || '').split(' ')[0] || alias;

  const map: PIIMap = { [alias]: primeiroNome };
  if (colab.email && emailAlias) map[emailAlias] = colab.email;
  if (nome) map[nome] = alias;

  return {
    masked: {
      ...colab,
      nome: alias,
      nome_completo: alias,
      email: emailAlias,
    },
    map,
  };
}

/**
 * Mascara PII de uma empresa.
 */
export function maskEmpresa(
  empresa: EmpresaInput | null | undefined,
): { masked: MaskedEmpresa | null; map: PIIMap } {
  if (!empresa) return { masked: null, map: {} };
  const alias = `EMPRESA_${hashStable(empresa.id || empresa.nome || 'x')}`;
  const map: PIIMap = { [alias]: empresa.nome || '' };
  return {
    masked: { ...empresa, nome: alias, slug: alias.toLowerCase() },
    map,
  };
}

/**
 * Sanitiza texto livre (transcripts, relatos) substituindo emails e telefones.
 * NÃO tenta detectar nomes próprios por NER (muito falso-positivo sem modelo);
 * use maskColaborador pra cobrir menções ao próprio colab.
 */
export function maskTextPII(texto: string | null | undefined, extraMap: PIIMap = {}): string {
  if (!texto) return texto || '';
  let out = String(texto);

  // Emails
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  // Telefones BR (com/sem DDD, com/sem traço)
  out = out.replace(/\(?\d{2,3}\)?\s?9?\d{4,5}[-\s]?\d{4}/g, '[telefone]');
  // CPF
  out = out.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[cpf]');
  // Substituições customizadas (nome → alias)
  for (const [real, alias] of Object.entries(extraMap)) {
    if (!real) continue;
    const re = new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, alias);
  }
  return out;
}

/**
 * Inverte mascaramento em resposta da IA antes de exibir ao usuário.
 * Troca aliases pelos valores reais.
 */
export function unmaskPII(texto: string | null | undefined, map: PIIMap | null | undefined): string {
  if (!texto || !map) return texto || '';
  let out = String(texto);
  for (const [alias, real] of Object.entries(map)) {
    if (!alias || !real) continue;
    const re = new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, real);
  }
  return out;
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
  map: PIIMap;
} {
  const { masked: mColab, map: mapColab } = maskColaborador(colaborador);
  const { masked: mEmp, map: mapEmp } = maskEmpresa(empresa);
  const mapGlobal: PIIMap = { ...mapColab, ...mapEmp };
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
