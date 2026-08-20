/**
 * O GUID do vídeo dentro da URL de embed do Bunny.
 *
 * Módulo PURO e separado do resto de `lib/conteudo/` de propósito: quem chama é
 * uma tela `'use client'`, e `download.ts` importa `next/server` — arrastar isso
 * para o bundle do browser seria pagar servidor no cliente por uma função de
 * quatro linhas.
 *
 * 🔴 POR QUE NÃO É `split('/').pop()` (19/08/2026)
 * ───────────────────────────────────────────────
 * O embed montado por `listarTemporadasEmpresa` termina com querystring:
 *
 *   https://iframe.mediadelivery.net/embed/{lib}/{guid}?autoplay=false&responsive=true
 *
 * O último segmento é `{guid}?autoplay=false&responsive=true` — e a validação
 * de UUID (que existe para não mandar o admin a um 400) recusava, então **o
 * botão de baixar vídeo simplesmente não aparecia**, enquanto os outros
 * formatos apareciam. Falha silenciosa de um jeito específico: nada quebra,
 * nada avisa, só falta uma opção na tela.
 *
 * A lição vale além daqui: a primeira versão desta função morava dentro do
 * componente, e por isso ficou fora da suíte. Regra da casa — lógica que pode
 * errar sai da tela e vira função com teste.
 */

/** `/embed/{library}/{guid}` — o guid é UUID; query e hash são ignorados. */
const EMBED = /\/embed\/[^/]+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

export function guidDoEmbedBunny(embed: string | null | undefined): string | null {
  const m = String(embed || '').match(EMBED);
  return m ? m[1].toLowerCase() : null;
}
