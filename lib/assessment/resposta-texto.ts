/** Pontuação, números e emojis sozinhos não são uma resposta em texto. */
export function respostaDiagnosticoTemTexto(valor: unknown): boolean {
  return typeof valor === 'string' && /\p{L}/u.test(valor);
}
