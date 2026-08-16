import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantUrl } from '@/lib/domain';
import { lerParametroAcesso, caminhoCallback } from '@/lib/auth/magic-link-whatsapp';
import { ehNavegadorEmbutido, ehAndroid, intentChrome } from '@/lib/auth/navegador-embutido';

/**
 * Despacho do magic link recebido por WhatsApp.
 *
 * `GET /entrar?t=<slug>~<token_hash>` → 302 para
 * `https://<slug>.vertho.ai/auth/callback?type=email&token_hash=…`
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

  // 🔴 ANTES DE QUALQUER REDIRECT QUE CONSUMA O TOKEN.
  //
  // O link chega por WhatsApp e o app abre no navegador EMBUTIDO. Seguir dali
  // para o `/auth/callback` gasta o token de uso único e cria a sessão num
  // cookie jar isolado: a pessoa fecha o WhatsApp, abre o app instalado e não
  // está logada — com o link já queimado. Medido em 15/08/2026.
  //
  // A tela de despacho não consome nada: ela devolve o mesmo link para ser
  // aberto no navegador de verdade.
  const ua = req.headers.get('user-agent');
  if (t && ehNavegadorEmbutido(ua)) {
    const meuLink = new URL('/entrar', req.url);
    meuLink.searchParams.set('t', t);

    // Tela de despacho: explica o caminho e NÃO consome o token.
    const abrir = new URL('/entrar/abrir', req.url);
    abrir.searchParams.set('t', t);

    // ANDROID: sai do WebView SEM tela intermediária. O `intent://` entrega a
    // navegação ao Chrome, que reabre este mesmo endereço — aí o UA já é de
    // navegador de verdade e o fluxo segue normal. Se o Chrome não resolver, o
    // fallback cai na tela de despacho (nunca de volta no link, que reiniciaria
    // o laço dentro do WhatsApp).
    if (ehAndroid(ua)) {
      return NextResponse.redirect(intentChrome(meuLink.toString(), abrir.toString()), 302);
    }

    // iOS: não existe caminho programático para sair do WKWebView.
    return NextResponse.redirect(abrir, 302);
  }

  // Sem parâmetro utilizável → login, sem detalhe. Dizer "token inválido" versus
  // "tenant inexistente" entregaria a quem testa a informação de quais slugs
  // existem.
  if (!dados) return NextResponse.redirect(new URL('/login?error=link-invalido', req.url));

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

  // `tenantUrl` monta a partir do slug JÁ validado contra o banco — a URL nunca
  // é concatenada com texto vindo da query.
  const destino = new URL(caminhoCallback(dados.tokenHash), tenantUrl(empresa.slug));
  return NextResponse.redirect(destino, 302);
}
