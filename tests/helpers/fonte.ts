/**
 * Remove comentários antes de procurar sinal no código-fonte.
 *
 * ⚠️ Existe porque um guard que casa regex no TEXTO pode ser silenciado por uma
 * frase em português. Descoberto por mutação em 10/08/2026 no `ownership-guard`:
 * removi de propósito o gate de posse de `salvarCheckpointGestor` para ver o
 * guard acusar, e ele ficou VERDE — um comentário logo acima citava
 * `canViewColabJourney`. Depois o mesmo furo apareceu no `routes-require-auth`:
 * uma rota mutativa cujo único "gate" era `// chama requireUser(request)`
 * passava batido.
 *
 * Está em UM lugar de propósito: dois guards com a mesma necessidade e cópias
 * separadas da mesma função é como um deles conserta e o outro não.
 */
export function semComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')       // /* … */ e /** … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');  // // …  (o `[^:]` poupa "https://")
}
