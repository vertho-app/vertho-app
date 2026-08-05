import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Lock } from 'lucide-react';
import { resolveTenantFromHeaders } from '@/lib/tenant-resolver';
import { resolveTheme } from '@/lib/ui-resolver';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { isVideoPublico, resolverSlugPublico } from '@/lib/videos-publicos';
import LoginRedirect from './LoginRedirect';

export const dynamic = 'force-dynamic';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mesma limpeza de título usada na listagem (/api/bunny-videos).
function cleanTitle(raw?: string) {
  if (!raw) return 'Vídeo';
  let t = String(raw).replace(/\.(mp4|mov|webm|m4v|mkv)$/i, '').replace(/_/g, ' ').trim();
  if (/^[\d\sx]+(?:hd|fps)?[\d\s]*$/i.test(t) || /^\d+ hd \d+ \d+ \d+fps$/i.test(t)) return 'Vídeo';
  return t;
}

async function baseUrl() {
  const h = await headers();
  const host = h.get('host') || '';
  const proto = h.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}

// Título real do vídeo no Bunny (para o preview do WhatsApp).
async function fetchTitle(videoId: string): Promise<string> {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!lib || !key) return 'Vídeo';
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${lib}/videos/${videoId}`, {
      headers: { AccessKey: key, Accept: 'application/json' },
      next: { revalidate: 300 },
    } as any);
    if (!res.ok) return 'Vídeo';
    const v = await res.json();
    return cleanTitle(v?.title);
  } catch {
    return 'Vídeo';
  }
}

// generateMetadata roda também para o crawler (sem login) → o preview do
// WhatsApp sai com título + thumbnail mesmo a reprodução exigindo login.
export async function generateMetadata({ params }: { params: Promise<{ videoId: string }> }): Promise<Metadata> {
  const { videoId: param } = await params;

  const base = await baseUrl();
  const tenant = await resolveTenantFromHeaders(await headers());
  // O apelido curto tem que resolver AQUI também: é o endereço que a pessoa
  // recebe, e é dele que sai o preview do WhatsApp.
  const videoId = resolverSlugPublico(param, tenant?.slug) || param;
  if (!GUID_RE.test(videoId)) return { title: 'Vídeo' };

  const tenantName = tenant?.nome || 'Vertho';
  const title = await fetchTitle(videoId);
  const thumb = `${base}/api/bunny-thumb/${videoId}`;
  const url = `${base}/v/${param}`; // canônica = a que foi compartilhada
  const description = isVideoPublico(videoId)
    ? `Assista antes de começar — ${tenantName}.`
    : `Assista no painel ${tenantName}.`;

  return {
    title: `${title} · ${tenantName}`,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: tenantName,
      type: 'video.other',
      images: [{ url: thumb, width: 1280, height: 720, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [thumb] },
  };
}

async function getSessionUser() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export default async function VideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId: param } = await params;

  const tenant = await resolveTenantFromHeaders(await headers());
  const theme = resolveTheme(tenant?.ui_config);
  const lib = process.env.BUNNY_LIBRARY_ID;

  // Apelido curto (/v/boas-vindas) → GUID, dentro do tenant. O GUID continua
  // funcionando direto; o slug é só um endereço mais amigável pro convite.
  const videoId = resolverSlugPublico(param, tenant?.slug) || param;
  const valid = GUID_RE.test(videoId);

  // Vídeo de convite/boas-vindas: quem recebe ainda NÃO tem acesso, então o
  // gate de sessão não se aplica (allowlist explícita em lib/videos-publicos).
  const publico = valid && isVideoPublico(videoId);
  const user = valid && !publico ? await getSessionUser() : null;
  const loginHref = `/login?redirect=/v/${param}`;
  const bg = `linear-gradient(180deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)`;
  const src = `https://iframe.mediadelivery.net/embed/${lib}/${videoId}?autoplay=true&responsive=true&preload=true`;

  return (
    <div className="flex flex-col" style={{ minHeight: '100dvh', background: bg, color: '#fff' }}>
      <header className="flex items-center px-5 md:px-8 h-16 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <img src={theme.logoUrl} alt="" style={{ height: 22, opacity: 0.95 }} />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[1100px]">
          {!valid ? (
            <div className="rounded-2xl border border-white/10 p-10 text-center" style={{ background: 'rgba(255,255,255,.03)' }}>
              <p className="text-sm text-white/70">Vídeo não encontrado.</p>
            </div>
          ) : user || publico ? (
            <div className="rounded-2xl overflow-hidden border border-white/10" style={{ background: '#0A1D35', boxShadow: '0 0 60px rgba(0,180,216,0.12)' }}>
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <iframe
                  src={src}
                  loading="lazy"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full border-0"
                  title="Vídeo"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Humanos deslogados → login; bots ficam e pegam o preview. */}
              <LoginRedirect target={loginHref} />
              <div className="rounded-2xl border border-white/10 p-10 text-center flex flex-col items-center gap-4" style={{ background: 'rgba(255,255,255,.03)' }}>
                <Lock size={28} className="opacity-60" />
                <p className="text-sm text-white/80">Entre para assistir este vídeo.</p>
                <a
                  href={loginHref}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: theme.accent, color: '#0C1829' }}
                >
                  Entrar
                </a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
