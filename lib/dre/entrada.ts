/**
 * Leitura do que a pessoa DIGITA nos formulários da DRE (client-safe, pura).
 *
 * O campo é texto de propósito: `<input type="number">` aceita vírgula ou ponto
 * conforme o navegador e devolve string vazia para "1.500,50". Quem lê é esta
 * função, com a convenção brasileira: vírgula é decimal, ponto é milhar.
 *
 * O caso que morde é o ponto SEM vírgula: "1.500" é mil e quinhentos em pt-BR,
 * mas "1.5" é um e meio. Distinguimos pelo formato: ponto seguido de exatamente
 * três dígitos, repetido, é milhar; qualquer outro ponto é decimal.
 */

/** Devolve o número ou `null` se o texto não for um número claro (nunca NaN). */
export function lerNumeroBR(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  let t = String(texto).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!t) return null;

  let negativo = false;
  if (t.startsWith('-')) {
    negativo = true;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;

  let normalizado: string;
  if (t.includes(',')) {
    // Vírgula = decimal; todo ponto antes dela é milhar. Mais de uma vírgula é lixo.
    if ((t.match(/,/g) || []).length > 1) return null;
    const [parteInteira, decimal] = t.split(',');
    // ",5" é meio; "," sozinha não é nada.
    const inteira = parteInteira === '' && decimal !== '' ? '0' : parteInteira;
    if (!/^[1-9]\d{0,2}(\.\d{3})*$|^\d+$/.test(inteira) || !/^\d*$/.test(decimal)) return null;
    normalizado = `${inteira.replace(/\./g, '')}.${decimal || '0'}`;
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    // 1.500 e 1.234.567: milhar. O 1º grupo não começa em 0: "0.500" é meio, não 500.
    normalizado = t.replace(/\./g, '');
  } else if ((t.match(/\./g) || []).length <= 1 && /^\d*\.?\d*$/.test(t)) {
    normalizado = t; // 1.5 e 1500: decimal com ponto
  } else {
    return null;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Número para o campo de texto, no formato brasileiro, sem milhar (fácil de editar). */
export function paraCampoBR(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  return valor.toFixed(casas).replace('.', ',');
}
