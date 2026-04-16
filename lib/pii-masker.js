/**
 * Anonimização de PII antes de mandar pra IAs externas (Claude/Gemini/OpenAI).
 *
 * Estratégia "shift-left": o prompt recebe IDs opacos (COLAB_A3F2, CLIENTE_X) em
 * vez de nomes reais. O "de-para" (map) fica local e pode ser usado pra
 * despersonalizar a saída da IA antes de exibir ao usuário.
 *
 * Uso:
 *   const { masked, map } = maskPII({ colaborador: { nome: 'Rodrigo Naves', email: 'rodrigo@x.com' } });
 *   // masked = { colaborador: { nome: 'COLAB_A3F2', email: 'email@masked.local' } }
 *   // map = { 'COLAB_A3F2': 'Rodrigo', 'email@masked.local': 'rodrigo@x.com' }
 *   const respostaIA = await callAI(system, user.replace(/RODRIGO/g, masked.nome));
 *   const despersonalizada = unmaskPII(respostaIA, map);
 *
 * Também expõe `maskTextPII(texto)` — detecta e substitui emails/telefones/
 * nomes próprios em texto livre (transcripts, relatos).
 */

function hashStable(input) {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h).toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
}

/**
 * Mascara PII de um colaborador pra uso no prompt.
 * Mantém cargo/perfil (contextuais, não identificáveis).
 *
 * @param {Object} colab - { id?, nome, nome_completo?, email, cargo?, ... }
 * @returns {{ masked: Object, map: Object<string,string> }}
 */
export function maskColaborador(colab) {
  if (!colab) return { masked: null, map: {} };
  const idBase = colab.id || colab.email || colab.nome_completo || colab.nome || 'unknown';
  const alias = `COLAB_${hashStable(idBase)}`;
  const emailAlias = colab.email ? `${alias.toLowerCase()}@masked.local` : null;
  const nome = colab.nome_completo || colab.nome;
  const primeiroNome = (nome || '').split(' ')[0] || alias;

  const map = { [alias]: primeiroNome };
  if (colab.email) map[emailAlias] = colab.email;
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
export function maskEmpresa(empresa) {
  if (!empresa) return { masked: null, map: {} };
  const alias = `EMPRESA_${hashStable(empresa.id || empresa.nome || 'x')}`;
  const map = { [alias]: empresa.nome };
  return {
    masked: { ...empresa, nome: alias, slug: alias.toLowerCase() },
    map,
  };
}

/**
 * Sanitiza texto livre (transcripts, relatos) substituindo emails e telefones.
 * NÃO tenta detectar nomes próprios por NER (muito falso-positivo sem modelo);
 * use maskColaborador pra cobrir menções ao próprio colab.
 *
 * @param {string} texto
 * @param {Object} [extraMap] - substituições adicionais (nome → alias)
 */
export function maskTextPII(texto, extraMap = {}) {
  if (!texto) return texto;
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
export function unmaskPII(texto, map) {
  if (!texto || !map) return texto;
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
 * Útil em rotas que passam colab + empresa pra IA.
 */
export function prepararPayloadMascarado({ colaborador, empresa, textos = {} }) {
  const { masked: mColab, map: mapColab } = maskColaborador(colaborador);
  const { masked: mEmp, map: mapEmp } = maskEmpresa(empresa);
  const mapGlobal = { ...mapColab, ...mapEmp };
  const textosMascarados = {};
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
