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
  // `url` é montada a partir de um `t` que já passou por `lerParametroAcesso`
  // (slug `[a-z0-9-]`, token `[A-Za-z0-9_-]`), mas escapar `<` fecha a porta de
  // vez: sem isso um `</script` dentro da string encerraria a tag.
  const destino = JSON.stringify(url).replace(/</g, '\\u003C');
  return `(function(){try{
var k=${JSON.stringify(CHAVE_AUTO_ENTRAR)},agora=Date.now(),ultimo=0;
try{ultimo=parseInt(sessionStorage.getItem(k)||'0',10)||0}catch(e){}
if(agora-ultimo<${JANELA_ANTI_REPETICAO_MS})return;
try{sessionStorage.setItem(k,String(agora))}catch(e){}
location.replace(${destino});
}catch(e){}})();`;
}
