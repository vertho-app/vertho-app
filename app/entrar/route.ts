import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantUrl } from '@/lib/domain';
import { lerParametroAcesso, caminhoCallback } from '@/lib/auth/magic-link-whatsapp';
import { ehNavegadorEmbutido, ehAndroid, intentChrome } from '@/lib/auth/navegador-embutido';

/**
 * Despacho do magic link recebido por WhatsApp.
 *
 * `GET /entrar?t=<slug>~<token_hash>`      → tela de confirmação (NÃO consome)
 * `GET /entrar?t=<slug>~<token_hash>&ir=1` → 302 para o `/auth/callback` do tenant
 *
 * POR QUE UM SALTO A MAIS
 * ───────────────────────
 * O botão de URL de um template da Meta tem base FIXA — não dá para variar o
 * subdomínio por tenant. E logar em `app.vertho.ai` não serve: `app` é
 * subdomínio reservado (tenant `null`) e o cookie de sessão fica preso ao host
 * exato, então a pessoa terminaria autenticada num domínio onde o app dela não
 * existe. Esta rota existe para o navegador chegar ao subdomínio CERTO antes de
 * a sessão ser criada.
 *
 * A alternativa seria um template por cliente, com aprovação da Meta a cada
 * cliente novo. Um salto de redirecionamento é mais barato que isso.
 *
 * 🔴 POR QUE ELA NÃO REDIRECIONA SOZINHA (medido em 15/08/2026)
 * ─────────────────────────────────────────────────────────────
 * O `/auth/callback` chama `verifyOtp`, que **consome o token de uso único**.
 * Dentro do navegador embutido do WhatsApp isso produz um beco sem saída:
 *
 *   1. o token é gasto e a sessão nasce no cookie jar do WebView, isolado do
 *      navegador e do app instalado;
 *   2. a pessoa pede "abrir no navegador" — e o WhatsApp transfere a **URL
 *      ATUAL**, que depois do redirect já é `<tenant>/dashboard`, sem token
 *      nenhum;
 *   3. no navegador de verdade ela cai no login, com o link já queimado.
 *
 * O passo 2 é o que mata a ideia de resolver isso detectando o navegador: mesmo
 * com detecção perfeita, redirecionar automaticamente **destrói a única URL que
 * valia a pena transferir**. Por isso esta rota nunca aponta para o callback sem
 * `ir=1`: o `t` chega inteiro numa tela, e não num redirecionamento.
 *
 * Efeito que virou a defesa principal: robô de preview de link (a Meta busca a
 * URL para montar o cartão) lê HTML em vez de seguir para o callback.
 *
 * ⚠️ ATUALIZADO EM 18/08/2026 — O QUE MUDOU LÁ NA FRENTE
 * ─────────────────────────────────────────────────────
 * A tela **deixou de esperar um toque**: ela entra sozinha por JavaScript
 * (`app/entrar/abrir/AutoEntrar.tsx`), e o fluxo inteiro voltou a ser um toque
 * só — o botão da mensagem. O que o toque comprava era a chance de TROCAR de
 * navegador antes de entrar, e isso servia ao PWA instalado, fora de escopo
 * desde 16/08: custo em todo mundo, benefício em quase ninguém.
 *
 * **Esta rota não mudou de comportamento**, e é de propósito. A fronteira do
 * consumo deixou de ser um TOQUE e passou a ser a EXECUÇÃO DE JS — o robô
 * continua do lado de fora porque o servidor continua não redirecionando
 * sozinho. Se um dia alguém "simplificar" isto para um 302 direto, o preview da
 * Meta passa a queimar o token de todo link enviado.
 *
 * ⚠️ ROTA PÚBLICA E PRÉ-SESSÃO, por definição: quem clica ainda não está logado.
 * Ela não autentica ninguém — quem valida o token é o `/auth/callback` do
 * tenant, via `verifyOtp`. O que esta rota decide é PARA ONDE mandar, e é aí que
 * mora o risco: montar a URL com o valor cru da query seria open redirect no
 * canal de login. Daí a dupla checagem — forma (regex) e EXISTÊNCIA do slug.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const dados = lerParametroAcesso(t);
  // `ir=1` é o toque explícito em "Entrar" na tela de confirmação. É o ÚNICO
  // caminho que consome o token.
  const consumir = req.nextUrl.searchParams.get('ir') === '1';
  const ua = req.headers.get('user-agent');

  // Sem parâmetro utilizável → login, sem detalhe. Dizer "token inválido" versus
  // "tenant inexistente" entregaria a quem testa a informação de quais slugs
  // existem.
  if (!dados || !t) return NextResponse.redirect(new URL('/login?error=link-invalido', req.url));

  // O slug PRECISA existir. A regex garante só a forma; sem esta consulta,
  // qualquer string bem-formada viraria um subdomínio de destino.
  const sb = createSupabaseAdmin();
  const { data: empresa, error } = await sb
    .from('empresas')
    .select('slug')
    .eq('slug', dados.slug)
    .maybeSingle();

  // supabase-js RETORNA `{ error }`. Sem este check, uma falha de banco viraria
  // "empresa não encontrada" e o link do usuário morreria em erro de login — com
  // a causa real invisível.
  if (error) {
    console.error('[entrar] falha ao resolver tenant:', error.message);
    return NextResponse.redirect(new URL('/login?error=indisponivel', req.url));
  }
  if (!empresa) {
    console.warn('[entrar] slug inexistente no parâmetro de acesso');
    return NextResponse.redirect(new URL('/login?error=link-invalido', req.url));
  }

  if (!consumir) {
    // O User-Agent do WebView é a única pista que temos de onde o clique nasceu,
    // e ela erra: em 15/08 um iPhone real passou pela heurística sem ser
    // detectado. Registrar o UA aqui é o que permite corrigir a régua com dado
    // em vez de palpite — e o volume é baixo (um por clique em link de acesso).
    console.log(`[entrar] ua=${JSON.stringify(ua)} embutido=${ehNavegadorEmbutido(ua)} android=${ehAndroid(ua)}`);

    const meuLink = new URL('/entrar', req.url);
    meuLink.searchParams.set('t', t);

    // ANDROID: dá para sair do WebView sem pedir nada a ninguém. O `intent://`
    // entrega a navegação ao Chrome, que reabre este mesmo endereço — com o
    // token INTACTO, porque nada foi consumido até aqui. O fallback vai para a
    // tela de confirmação, nunca de volta para cá (viraria laço).
    if (ehNavegadorEmbutido(ua) && ehAndroid(ua)) {
      const abrir = new URL('/entrar/abrir', req.url);
      abrir.searchParams.set('t', t);
      return NextResponse.redirect(intentChrome(meuLink.toString(), abrir.toString()), 302);
    }

    // Todo o resto — inclusive navegador de verdade — vai para a confirmação. É
    // um toque a mais, e é o preço de a URL continuar redimível quando a pessoa
    // troca de navegador. No iOS não existe alternativa: nenhum caminho
    // programático sai do WKWebView.
    const abrir = new URL('/entrar/abrir', req.url);
    abrir.searchParams.set('t', t);
    return NextResponse.redirect(abrir, 302);
  }

  // ONDE a pessoa efetivamente entrou.
  //
  // 🔑 Isto não é curiosidade: a saída do WebView no iOS depende de um esquema
  // NÃO SUPORTADO (`x-safari-https://`, ver `SairDoWebView.tsx`). Funciona hoje
  // porque o WhatsApp repassa esquemas desconhecidos ao sistema — e pode parar
  // numa atualização do app, sem aviso e sem erro. O sintoma seria silencioso:
  // as pessoas voltariam a entrar dentro do WhatsApp e ninguém saberia.
  //
  // Com esta linha, `embutido=true` no CONSUMO é o alarme: significa que o
  // truque não funcionou e a pessoa entrou no WebView.
  console.log(`[entrar] consumido ua=${JSON.stringify(ua)} embutido=${ehNavegadorEmbutido(ua)}`);

  // `tenantUrl` monta a partir do slug JÁ validado contra o banco — a URL nunca
  // é concatenada com texto vindo da query.
  const destino = new URL(caminhoCallback(dados.tokenHash), tenantUrl(empresa.slug));
  return NextResponse.redirect(destino, 302);
}
