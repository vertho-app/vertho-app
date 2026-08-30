import { notFound, redirect } from 'next/navigation';
import { requireUserAction } from '@/lib/auth/action-context';
import { tenantDb } from '@/lib/tenant-db';
import { guidDoEmbedBunny } from '@/lib/conteudo/bunny-embed';
import { findReadyPersonalizedVideo, personalizedGreetingCopy } from '@/lib/video/personalized-ready';
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
  if (!auth.empresaId) notFound();
  const sb = tenantDb(auth.empresaId).raw;
  const { data: content, error } = await sb.from('micro_conteudos')
    .select('id,empresa_id,titulo,descricao,formato,duracao_min,url,bunny_video_id,modulo_base_id,ativo')
    .eq('id', id)
    // A consulta já nasce no alcance da sessão: catálogo global OU tenant
    // atual. O teste posterior permanece como defesa em profundidade.
    .or(`empresa_id.is.null,empresa_id.eq.${auth.empresaId}`)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar conteúdo: ${error.message}`);
  if (!content || content.ativo !== true || !SUPPORTED_FORMATS.has(content.formato)) notFound();

  // Catálogo global (empresa_id nulo) é compartilhado. Conteúdo de empresa só
  // pode ser aberto pelo próprio tenant; o id da URL nunca concede o acesso.
  if (content.empresa_id && !auth.isPlatformAdmin && content.empresa_id !== auth.empresaId) {
    notFound();
  }

  const url = safeHttpUrl(content.url);
  let bunnyVideoId = content.formato === 'video'
    ? String(content.bunny_video_id || '').trim() || guidDoEmbedBunny(url)
    : null;
  let bunnyLibraryId: string | number = process.env.BUNNY_LIBRARY_ID || 636615;
  let title = content.titulo;
  let description = content.descricao;

  // O catálogo guarda o deck editorial da célula. Na ENTREGA, uma versão já
  // pronta com “Olá, {nome}” substitui esse deck para a pessoa autenticada.
  // Falha ou ausência preserva o genérico; esta tela nunca gera vídeo.
  if (content.formato === 'video' && content.modulo_base_id && auth.colaborador?.id) {
    const personalized = await findReadyPersonalizedVideo(sb, {
      empresaId: auth.empresaId,
      colaboradorId: auth.colaborador.id,
      cargo: auth.colaborador.cargo,
      perfilDominante: auth.colaborador.perfil_dominante,
      moduloBaseId: content.modulo_base_id,
    });
    if (personalized) {
      const greeting = personalizedGreetingCopy(auth.colaborador.nome_completo);
      bunnyVideoId = personalized.bunnyVideoId;
      bunnyLibraryId = personalized.bunnyLibrary;
      title = greeting.title;
      description = greeting.description;
    }
  }

  const hasSource = content.formato === 'texto'
    || content.formato === 'case'
    || content.formato === 'audio'
    || (content.formato === 'video' && Boolean(bunnyVideoId))
    || (content.formato === 'pdf' && Boolean(url));
  if (!hasSource) notFound();

  const viewerData: ContentExperienceData = {
    id: content.id,
    title,
    description,
    format: content.formato as ContentExperienceData['format'],
    durationMinutes: content.duracao_min == null ? null : Number(content.duracao_min),
    url,
    bunnyVideoId,
  };

  return (
    <ContentExperience
      content={viewerData}
      bunnyLibraryId={bunnyLibraryId}
      colaboradorId={auth.colaborador?.id || null}
    />
  );
}
