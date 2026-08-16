/**
 * Descritor como a PESSOA deve lê-lo — sem o código interno da matriz.
 *
 * 🔴 POR QUE (medido 16/08/2026, Ibipeba)
 * ──────────────────────────────────────
 * Os descritores de **Coordenação Pedagógica** entraram com o identificador da
 * matriz colado no texto (`COO03_D6 — Busca de apoio`), enquanto os de Gestão
 * Escolar/Educacional, na MESMA competência, não (`Busca de apoio e rede`). São
 * **79 de 648** itens de plano (12%), num tenant só — mas o campo é o assunto da
 * semana, então ele aparece no título da tela, no PDF e no texto do WhatsApp.
 *
 * ⚠️ A limpeza é de EXIBIÇÃO, NUNCA do dado. O `descritor` é a chave que casa o
 * kit por (DISC × cargo) e ancora a seleção de conteúdo — reescrevê-lo para
 * consertar um texto arriscaria quebrar um casamento que funciona (36/36 no dia
 * da medição). Jargão de código que vaza é problema de apresentação; conserte na
 * camada de apresentação.
 *
 * ⚠️ Módulo PURO e sem imports de propósito: ele é usado por Server Component,
 * Client Component, gerador de PDF e caminho de envio. Qualquer dependência aqui
 * viraria dependência de todos eles.
 *
 * ℹ️ Telas de ADMIN não usam isto: lá o código desambigua descritores de nome
 * parecido, e quem lê é quem opera a matriz.
 */

/** `COO03_D6 — `, `GES12_D3 – `, `DIR7_D10-` … */
const CODIGO_DA_MATRIZ = /^[A-Z]{2,5}\d{1,3}_[A-Z]\d+\s*[—–-]\s*/;

export function descritorParaHumano(bruto: string | null | undefined): string {
  const s = String(bruto ?? '').trim();
  if (!s) return '';
  const limpo = s.replace(CODIGO_DA_MATRIZ, '').trim();
  // Se o descritor era SÓ o código, texto vazio é pior que o código: devolve o
  // original e deixa alguém perceber.
  return limpo || s;
}

/** Versão para listas (`descritores_cobertos`), preservando ordem e vazios. */
export function descritoresParaHumano(brutos: unknown): string[] {
  if (!Array.isArray(brutos)) return [];
  return brutos.map((d) => descritorParaHumano(typeof d === 'string' ? d : String(d ?? '')));
}
