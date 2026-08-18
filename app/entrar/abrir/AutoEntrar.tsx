import { scriptAutoEntrar, scriptSairParaNavegador } from '@/lib/auth/auto-entrar';

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
 * 🔑 PARA ONDE ela entra sozinha (ajustado no mesmo dia, a pedido do dono)
 * ──────────────────────────────────────────────────────────────────────
 * A primeira versão entrava ONDE a pessoa estava — e no iPhone isso é o WebView
 * do WhatsApp. O pedido veio no teste: *"foi direto, mas para o navegador
 * interno"*. Hoje o destino depende de onde dá para chegar:
 *
 *   - **Android no WhatsApp** → já saiu antes desta tela: o `/entrar` responde
 *     `intent://…package=com.android.chrome`, e a pessoa chega aqui já no Chrome.
 *   - **iPhone no WhatsApp** → esta tela tenta `x-safari-https://` (modo
 *     `navegador`), para a sessão nascer no Safari. **Não é API suportada**;
 *     falhando, a navegação é cancelada, nada é consumido, e a tela — que nasce
 *     com os botões visíveis — vira o caminho manual de um toque.
 *   - **navegador de verdade** → `location.replace` direto (modo `direto`).
 *
 * A lógica do script (e o porquê de cada decisão dele) fica em
 * `lib/auth/auto-entrar.ts`, que é o que a suíte exercita.
 */
export default function AutoEntrar({
  url,
  modo = 'direto',
}: {
  url: string;
  /**
   * `direto` — entra onde a pessoa está (navegador de verdade, ou o WebView
   * quando não há saída). `navegador` — tenta ENTREGAR a navegação ao navegador
   * do aparelho (iPhone: `x-safari-https://`), para a sessão nascer lá.
   */
  modo?: 'direto' | 'navegador';
}) {
  // Emitido no HTML servido — roda antes de qualquer hidratação do React, que no
  // 4G do celular chega segundos depois.
  const js = modo === 'navegador' ? scriptSairParaNavegador(url) : scriptAutoEntrar(url);
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
