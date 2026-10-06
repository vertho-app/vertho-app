/**
 * O gate do Radar na PÁGINA, e não só no layout (reanálise de 06/10/2026).
 *
 * 🔴 Layout não protege página. Numa navegação o Next NÃO refaz os layouts que o cliente já tem: um pedido RSC
 * com `Next-Router-State-Tree` de quem "está em `/radar`" e `Next-Url` apontando para `/radar/metodologia`
 * devolve a página (200, `text/x-component`) sem executar o `redirect` do layout. Medido em 06/10 contra o build
 * local, sem sessão: o mesmo caminho dava 307 para o login na navegação normal e 200 com o conteúdo no pedido RSC.
 * O mesmo vale para `generateMetadata`, que roda fora do layout e lia o banco. Por isso toda página (e todo
 * `generateMetadata`) das duas superfícies chama um destes helpers no TOPO, antes de ler qualquer dado.
 *
 * NÃO é `'use server'` de propósito: é função de biblioteca chamada por Server Component. Marcar `'use server'`
 * a transformaria em endpoint HTTP.
 */
import { notFound, redirect } from 'next/navigation';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { blocoEstaOffline } from '@/lib/blocos-offline';

/**
 * `/radar/*` (ferramenta INTERNA da plataforma, desde 10/08/2026): mesma régua do layout e das Server Actions
 * (`checarAcessoPlataforma`). Sem sessão, vai ao login; logado sem acesso de plataforma, recebe 404 (a página
 * não confirma que existe).
 */
export async function exigirAcessoRadarNaPagina(): Promise<void> {
  const acesso = await checarAcessoPlataforma();
  if (acesso.reason === 'unauthenticated') redirect('/login?redirect=/radar');
  if (!acesso.authorized) notFound();
}

/**
 * `/radarbett/*` e `/radar/bett`: bloco OFF-LINE (`lib/blocos-offline.ts`). O `notFound()` do layout não alcança
 * a página no pedido RSC, e a página do `radarbett` lê o banco e gera narrativa com IA paga. Enquanto o bloco
 * estiver na lista, a página responde 404; religar continua sendo remover a entrada do registro (e apagar os
 * dois layouts).
 */
export function exigirRadarBettOnline(): void {
  if (blocoEstaOffline('radarbett')) notFound();
}
