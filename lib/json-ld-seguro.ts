/** JSON dentro de <script> precisa escapar '<', inclusive em campos de fontes externas. */
export function serializarJsonLd(valor: Record<string, unknown>): string {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}
