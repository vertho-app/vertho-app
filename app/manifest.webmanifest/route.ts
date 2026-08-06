/**
 * Manifest do PWA, POR TENANT.
 *
 * Era um arquivo estático em `public/`, servido igual para todo mundo — então
 * uma pessoa de um cliente white-label instalaria na tela de início dela um app
 * chamado "Vertho Mentor IA", com a marca do fornecedor. Não é risco de dado, é
 * incoerência de marca, e bloqueia sair do tenant de teste.
 *
 * O tenant vem do header `x-tenant-slug` (mesmo caminho do resto do app). O
 * browser busca o manifest same-origin, então o header chega aqui normalmente.
 *
 * ⚠️ Os ÍCONES continuam sendo os do Vertho, de propósito. Um ícone de manifest
 * precisa ser PNG quadrado, com padding para as máscaras, nos tamanhos
 * DECLARADOS — e `ui_config.logo_url` é um logo qualquer, de aspecto e formato
 * desconhecidos. Declarar `512x512` apontando para ele seria mentir para o
 * prompt de instalação, e o sintoma (ícone esticado ou install prompt recusado)
 * apareceria longe da causa. Ícone por tenant é trabalho de UPLOAD, não de
 * request: gerar quadrado + padding + 192/512 quando o logo é salvo, guardar as
 * URLs no `ui_config`, e só então referenciá-las aqui.
 */
import { headers } from 'next/headers';
import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { resolveTheme } from '@/lib/ui-resolver';
import { derivarNomeCurto } from '@/lib/tenant-nome-curto';

export const runtime = 'nodejs';
// Depende do header do tenant: renderizar estaticamente serviria o manifest de
// um tenant para todos — que é exatamente o bug que esta rota corrige.
export const dynamic = 'force-dynamic';

const NOME_PADRAO = 'Vertho Mentor IA';

export async function GET() {
  const h = await headers();
  const tenant = await resolveTenantFromHeaders(h);
  const tema = resolveTheme(tenant?.ui_config);

  const nome = tenant?.nome?.trim() || NOME_PADRAO;

  const manifest = {
    name: nome,
    short_name: derivarNomeCurto(tenant?.nome),
    description: 'Sua trilha de desenvolvimento de competências.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: tema.bgStart,
    theme_color: tema.bgStart,
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // Curto de propósito: o branding do tenant é editável e "salvo e atualiza"
      // é o comportamento esperado no resto do app (ver lib/tenant-resolver).
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
