/**
 * O script que entra sozinho na tela do link de acesso — a lógica, sem a JSX.
 *
 * Vive em `lib/` porque é o que a suíte exercita: a tela é só a moldura, este
 * texto é o que decide se o token é consumido. Quem renderiza é
 * `app/entrar/abrir/AutoEntrar.tsx`, e o porquê da mudança está lá.
 *
 * 🔑 A fronteira do consumo é a EXECUÇÃO DE JS, não mais um toque. Pessoa entra
 * sozinha (um toque no fluxo inteiro: o botão da mensagem); robô de preview da
 * Meta baixa o HTML, não executa script, e o token continua intacto — o servidor
 * segue sem redirecionar por conta própria (`app/entrar/route.ts`).
 */

/** Quanto tempo depois de uma tentativa a tela se recusa a tentar de novo. */
export const JANELA_ANTI_REPETICAO_MS = 60_000;

/** Chave da trava. Guarda TIMESTAMP — nunca o `t`, que carrega o `token_hash`. */
export const CHAVE_AUTO_ENTRAR = 'vertho:auto-entrar';

/**
 * Três decisões que não são estilo:
 *
 * 1. **`location.replace`, não `href`.** Ele SUBSTITUI a entrada no histórico.
 *    Sem isso, o "voltar" do navegador cai nesta tela de novo e reentraria com
 *    um token já gasto — a pessoa logada seria jogada num `/login?error=…`.
 * 2. **Trava de 60 s em `sessionStorage`.** Segunda linha para o mesmo caso
 *    (bfcache, recarga manual): se acabou de tentar, mostra a tela com o botão
 *    em vez de reentrar num laço.
 * 3. **Nada de `<meta http-equiv="refresh">`.** Robô de preview SEGUE meta
 *    refresh; foi justamente ele que precisamos deixar do lado de fora.
 *
 * ⚠️ Todo acesso a `sessionStorage` vai em `try` — no WebView com storage
 * bloqueado ele LANÇA, e um throw aqui deixaria a pessoa parada na tela.
 */
export function scriptAutoEntrar(url: string): string {
  return montarScript(url, 'replace');
}

/**
 * A tentativa de SAIR do WebView, no iPhone — o mesmo script, outro destino.
 *
 * 🔴 LEIA ANTES DE MEXER (18/08/2026)
 * ──────────────────────────────────
 * A URL aqui não é `https:`, é `x-safari-https://…` — um esquema que a Apple
 * **não** documenta como saída do WKWebView. O que existe é um efeito colateral:
 * app bem-comportado que recebe um esquema desconhecido repassa a URL ao sistema.
 * Medido funcionando no WhatsApp 2.26.31 (iPhone, 15/08/2026); **pode sumir numa
 * atualização do app, sem aviso e sem erro**.
 *
 * Por isso duas diferenças em relação ao `scriptAutoEntrar`:
 *
 * 1. **`location.href`, não `replace`.** Se o esquema não for repassado, o
 *    WKWebView apenas CANCELA a navegação e a pessoa continua aqui — nada foi
 *    consumido, e a tela por baixo já traz os botões para ela seguir com um
 *    toque. Um `replace` não ajudaria em nada neste caso e atrapalharia o
 *    "voltar".
 * 2. **A tela por baixo nasce visível, com os botões.** Nada é revelado por
 *    JavaScript: se o truque falhar — ou se o JS não rodar —, a pessoa vê o
 *    caminho manual, que sempre funciona. Esconder o fallback atrás de um timer
 *    seria construir a falha silenciosa que o resto deste fluxo evita.
 */
export function scriptSairParaNavegador(urlComEsquema: string): string {
  return montarScript(urlComEsquema, 'href');
}

function montarScript(url: string, como: 'replace' | 'href'): string {
  // `url` é montada a partir de um `t` que já passou por `lerParametroAcesso`
  // (slug `[a-z0-9-]`, token `[A-Za-z0-9_-]`), mas escapar `<` fecha a porta de
  // vez: sem isso um `</script` dentro da string encerraria a tag.
  const destino = JSON.stringify(url).replace(/</g, '\\u003C');
  const navegar = como === 'replace' ? `location.replace(${destino})` : `location.href=${destino}`;
  return `(function(){try{
var k=${JSON.stringify(CHAVE_AUTO_ENTRAR)},agora=Date.now(),ultimo=0;
try{ultimo=parseInt(sessionStorage.getItem(k)||'0',10)||0}catch(e){}
if(agora-ultimo<${JANELA_ANTI_REPETICAO_MS})return;
try{sessionStorage.setItem(k,String(agora))}catch(e){}
${navegar};
}catch(e){}})();`;
}
