import { scriptAutoEntrar } from '@/lib/auth/auto-entrar';

/**
 * O toque em "Entrar agora" que a pessoa não precisa mais dar.
 *
 * 🔴 O QUE ESTE ARQUIVO MUDA, E O QUE ELE NÃO MUDA (18/08/2026)
 * ────────────────────────────────────────────────────────────
 * O fluxo do link de acesso por WhatsApp custava DOIS toques: o botão da
 * mensagem e, dentro do navegador embutido, o "Entrar agora" desta tela. O
 * segundo existia por um motivo real (ver `app/entrar/route.ts`): enquanto
 * ninguém entra, a URL da barra continua sendo a **redimível**, e trocar de
 * navegador antes de entrar funciona.
 *
 * O que sustentava esse pedágio era o PWA instalado — e ele saiu do escopo em
 * 16/08 ("pouquíssimas pessoas vão usar desta forma"). Sem o PWA, entrar dentro
 * do WhatsApp é o caminho certo para praticamente todo mundo, e o pedágio passou
 * a ser cobrado de todos para servir quase ninguém.
 *
 * 🔑 O INVARIANTE DE SEGURANÇA CONTINUA DE PÉ, e é por isso que a saída é esta.
 * O servidor **não** voltou a redirecionar sozinho: `/entrar` sem `ir=1` segue
 * apontando para esta tela, nunca para o `/auth/callback`. Quem entra é este
 * script, que só roda em navegador de verdade. A diferença entre "consome" e
 * "não consome" deixou de ser um TOQUE e passou a ser a execução de JS:
 *
 *   - pessoa (WebView do WhatsApp, Safari, Chrome) → entra sozinha, 1 toque no total;
 *   - robô de preview da Meta → baixa o HTML, não executa script, token intacto;
 *   - navegador com JS desligado → vê a tela com o botão, exatamente como antes.
 *
 * ⚠️ O QUE SE PERDE: o desvio "prefere entrar pelo navegador?" deixa de ser
 * alcançável na prática, porque a tela não fica parada esperando. Quem também usa
 * a Vertho no computador pede o link de lá — é onde a sessão precisa nascer de
 * qualquer jeito.
 *
 * A lógica do script (e o porquê de cada decisão dele) fica em
 * `lib/auth/auto-entrar.ts`, que é o que a suíte exercita.
 */
export default function AutoEntrar({ url }: { url: string }) {
  // Emitido no HTML servido — roda antes de qualquer hidratação do React, que no
  // 4G do celular chega segundos depois.
  return <script dangerouslySetInnerHTML={{ __html: scriptAutoEntrar(url) }} />;
}
