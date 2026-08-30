import { notFound, redirect } from 'next/navigation';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUserAction } from '@/lib/auth/action-context';
import { guidDoEmbedBunny } from '@/lib/conteudo/bunny-embed';
import ContentExperience, { type ContentExperienceData } from './content-experience';

export const dynamic = 'force-dynamic';

const SUPPORTED_FORMATS = new Set(['video', 'audio', 'texto', 'case', 'pdf']);

function safeHttpUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function RecommendedContentPage({ params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireUserAction>>;
  try {
    auth = await requireUserAction();
  } catch {
    redirect('/login');
  }

  const { id } = await params;
  const sb = createSupabaseAdmin();
  const { data: content, error } = await sb.from('micro_conteudos')
    .select('id,empresa_id,titulo,descricao,formato,duracao_min,url,bunny_video_id,ativo')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar conteúdo: ${error.message}`);
  if (!content || content.ativo !== true || !SUPPORTED_FORMATS.has(content.formato)) notFound();

  // Catálogo global (empresa_id nulo) é compartilhado. Conteúdo de empresa só
  // pode ser aberto pelo próprio tenant; o id da URL nunca concede o acesso.
  if (content.empresa_id && !auth.isPlatformAdmin && content.empresa_id !== auth.empresaId) {
    notFound();
  }

  const url = safeHttpUrl(content.url);
  const bunnyVideoId = content.formato === 'video'
    ? String(content.bunny_video_id || '').trim() || guidDoEmbedBunny(url)
    : null;

  const hasSource = content.formato === 'texto'
    || content.formato === 'case'
    || content.formato === 'audio'
    || (content.formato === 'video' && Boolean(bunnyVideoId))
    || (content.formato === 'pdf' && Boolean(url));
  if (!hasSource) notFound();

  const viewerData: ContentExperienceData = {
    id: content.id,
    title: content.titulo,
    description: content.descricao,
    format: content.formato as ContentExperienceData['format'],
    durationMinutes: content.duracao_min == null ? null : Number(content.duracao_min),
    url,
    bunnyVideoId,
  };

  return (
    <ContentExperience
      content={viewerData}
      bunnyLibraryId={process.env.BUNNY_LIBRARY_ID || 636615}
      colaboradorId={auth.colaborador?.id || null}
    />
  );
}
