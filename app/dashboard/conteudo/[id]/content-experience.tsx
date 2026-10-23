'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, FileText, Headphones, Play } from 'lucide-react';
import { BunnyVideoPlayer } from '@/components/bunny-video-player';
import InAppPdfDocument from '@/components/pdf/in-app-pdf-document';

export type ContentExperienceData = {
  id: string;
  title: string;
  description: string | null;
  format: 'video' | 'audio' | 'texto' | 'case' | 'pdf';
  durationMinutes: number | null;
  url: string | null;
  bunnyVideoId: string | null;
};

const FORMAT_LABEL_KEY: Record<ContentExperienceData['format'], string> = {
  video: 'video',
  audio: 'audio',
  texto: 'text',
  case: 'case',
  pdf: 'pdf',
};

function AudioArtwork({ title }: { title: string }) {
  return (
    <div
      className="relative mx-auto grid aspect-square w-full max-w-[270px] place-items-center overflow-hidden rounded-[34px] border border-white/10"
      style={{
        background: 'radial-gradient(circle at 26% 18%, rgba(154,226,230,0.28), transparent 34%), linear-gradient(145deg, #12385a 0%, #071727 72%)',
        boxShadow: '0 28px 70px rgba(0,0,0,0.34)',
      }}
    >
      <div className="absolute inset-5 rounded-full border border-cyan-100/10" />
      <div className="absolute inset-10 rounded-full border border-cyan-100/[0.07]" />
      <div className="relative grid h-24 w-24 place-items-center rounded-full border border-cyan-100/20 bg-cyan-100/[0.08] text-cyan-100 shadow-[0_0_45px_rgba(154,226,230,0.15)]">
        <Headphones size={38} strokeWidth={1.5} />
      </div>
      <p className="absolute bottom-6 left-6 right-6 line-clamp-2 text-center text-sm font-semibold leading-snug text-white/80">
        {title}
      </p>
    </div>
  );
}

export default function ContentExperience({
  content,
  bunnyLibraryId,
  colaboradorId,
}: {
  content: ContentExperienceData;
  bunnyLibraryId: string | number;
  colaboradorId: string | null;
}) {
  const router = useRouter();
  const common = useTranslations('Common');
  const home = useTranslations('DashboardHome');

  const formatLabel = home(`contentFormats.${FORMAT_LABEL_KEY[content.format]}`);
  const duration = content.durationMinutes && content.durationMinutes > 0
    ? `${Math.max(1, Math.round(content.durationMinutes))} min`
    : null;
  const pdfSource = content.format === 'texto' || content.format === 'case'
    ? `/api/conteudo/${encodeURIComponent(content.id)}/pdf`
    : content.url;
  const audioSource = `/api/conteudo/${encodeURIComponent(content.id)}/podcast`;

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/dashboard');
  }

  return (
    <section className="mx-auto flex h-[calc(100dvh-var(--header-height)-var(--nav-height))] w-full max-w-[1180px] flex-col overflow-hidden md:h-dvh">
      <header className="relative z-10 flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#081a2d]/90 px-4 py-3 backdrop-blur-xl md:px-8 md:py-5">
        <button
          type="button"
          onClick={goBack}
          aria-label={common('actions.back')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.09] hover:text-white"
        >
          <ArrowLeft size={19} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--phase-accent,#9ae2e6)]">
              {home('recommended.title')}
            </span>
            {duration ? <span className="text-[10px] text-white/35">· {duration}</span> : null}
          </div>
          <h1
            className="line-clamp-2 text-[19px] leading-tight text-white md:text-2xl"
            style={{ fontFamily: 'var(--vh-font-display)', fontStyle: 'italic' }}
          >
            {content.title}
          </h1>
        </div>

        <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50 sm:inline-flex">
          {formatLabel}
        </span>
      </header>

      {content.format === 'video' && content.bunnyVideoId ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-5 md:justify-center md:px-10 md:py-8">
          <div className="mx-auto w-full max-w-[980px]">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              <Play size={13} className="text-[var(--phase-accent,#9ae2e6)]" fill="currentColor" />
              {formatLabel}
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-[20px] border border-white/10 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.38)] md:rounded-[28px]">
              <BunnyVideoPlayer
                libraryId={bunnyLibraryId}
                videoId={content.bunnyVideoId}
                title={content.title}
                colaboradorId={colaboradorId}
                autoplay
              />
            </div>
            {content.description ? (
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/55 md:text-center">
                {content.description}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {content.format === 'audio' ? (
        <div className="flex min-h-0 flex-1 overflow-y-auto px-6 py-7 md:items-center md:justify-center">
          <div className="mx-auto w-full max-w-[520px]">
            <AudioArtwork title={content.title} />
            {content.description ? (
              <p className="mx-auto mt-5 max-w-md text-center text-sm leading-relaxed text-white/55">
                {content.description}
              </p>
            ) : null}
            <audio
              controls
              preload="metadata"
              src={audioSource}
              onLoadedMetadata={(event) => { event.currentTarget.currentTime = 0; }}
              className="mt-6 w-full [color-scheme:dark]"
            >
              Seu navegador não suporta reprodução de áudio.
            </audio>
          </div>
        </div>
      ) : null}

      {(content.format === 'texto' || content.format === 'case' || content.format === 'pdf') && pdfSource ? (
        // Leitor do app, não quadro: no iPhone o Safari desenha só a 1ª página de um PDF num
        // iframe (23/10/2026, ver a semana). A rolagem é desta caixa.
        <div className="relative min-h-0 flex-1 overflow-y-auto bg-[#020811] p-2 md:p-4">
          <InAppPdfDocument
            src={pdfSource}
            title={`${formatLabel}: ${content.title}`}
            loadingLabel={formatLabel}
            errorLabel={home('contentReader.error')}
            retryLabel={home('contentReader.retry')}
            exploracao={null}
          />
        </div>
      ) : null}
    </section>
  );
}
